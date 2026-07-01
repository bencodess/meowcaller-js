import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { Call } from './call.js';
import * as stun from './stun.js';
import * as rtp from './rtp.js';
import * as relay from './relay.js';
import * as signaling from './signaling.js';
import { CallPhase, CallDirection } from './session.js';
import { FrameSamples, SampleRate } from './audio.js';
import { NewMediaPipeline } from './media-pipeline.js';

export class Engine {
  constructor(client) {
    this.c = client;
    this.calls = new Map();
    this._installed = false;
  }

  lookup(callID) {
    return this.calls.get(callID) || null;
  }

  entry(callID) {
    if (!this.calls.has(callID)) {
      this.calls.set(callID, {});
    }
    return this.calls.get(callID);
  }

  install(wa) {
    if (this._installed) return;
    this._installed = true;
    this._installCallAckHook(wa);

    wa.ev.on('call', async ([ev]) => {
      if (!ev) return;
      switch (ev.type) {
        case 'offer':
          this._onOffer(wa, ev);
          break;
        case 'relaylatency':
        case 'transport':
          this._onRelay(wa, ev.callId, ev.data);
          break;
        case 'terminate':
          this._onTerminate(wa, ev.callId, ev.reason);
          break;
      }
    });

    wa.ev.on('messages.upsert', async ({ messages }) => {
      for (const msg of messages) {
        if (msg.key.remoteJid && msg.message?.call?.callKey) {
          // Handle callKey messages if needed
        }
      }
    });

    // Intercept raw call nodes (for mute_v2, video stanzas)
    this._interceptCallRaw(wa);
  }

  _installCallAckHook(wa) {
    wa.ev.on('call', async ([ev]) => {
      if (!ev) return;
      if (ev.type === 'offer' && ev.status === 'ack') {
        this._onCallAck(wa, ev);
      }
    });
  }

  _onCallAck(wa, ev) {
    const callID = ev.callId;
    if (ev.error) {
      this.c.log?.warn({ callID, error: ev.error }, 'call rejected by server');
      this._stopMedia(callID);
      const m = this.lookup(callID);
      if (m?.call) {
        m.call.setPhase(CallPhase.Ended);
        if (m.call._onEnd) m.call._onEnd('server:' + ev.error);
      }
      return;
    }
    // Relay allocation might arrive in the ack
    if (ev.data) this._onRelay(wa, callID, ev.data);
  }

  _interceptCallRaw(wa) {
    const origSend = wa.sendMessage;
    const self = this;
    wa.sendMessage = async function (...args) {
      // This hook is for intercepting raw call nodes; since Baileys
      // doesn't expose a raw node handler like whatsmeow, we rely on
      // the 'call' event for signaling. For mute_v2/video stanzas
      // the integrator should use the Baileys 'call' event directly.
      return origSend.apply(this, args);
    };
  }

  async placeCall(ctx, target) {
    const wa = this.c.wa;
    const selfJid = wa.user?.id;
    if (!selfJid) throw new Error('no own JID');

    const peerJid = await this._resolvePeerLID(ctx, wa, target);
    this.c.log?.info({ peerLid: peerJid, selfLid: selfJid }, 'resolved peer LID');

    const { Baileys: { jidEncode, jidDecode } } = await import('@whiskeysockets/baileys');
    const callKey = crypto.randomBytes(32);
    const callID = newCallID();

    // Encrypt callKey for peer devices (simplified - in production, iterate devices)
    const deviceKeys = await this._encryptCallKeyForDevice(ctx, wa, peerJid, callKey);

    const offer = signaling.BuildOffer({
      CallID: callID,
      To: peerJid,
      CallCreator: selfJid,
      DeviceKeys: deviceKeys,
      Capability: signaling.CapabilityOffer,
    });

    const call = new Call(this, callID, peerJid);

    const m = this.entry(callID);
    m.call = call;
    m.callKey = callKey;
    m.selfLID = selfJid;
    m.peerLID = peerJid;
    m.creator = selfJid;
    m.direction = CallDirection.Outgoing;

    this.c.log?.info({ callID }, 'sending offer');
    await this._sendCallNode(wa, offer);
    call.setPhase(CallPhase.Calling);
    return call;
  }

  async _resolvePeerLID(ctx, wa, target) {
    const { jidDecode, areJidsSame } = await import('@whiskeysockets/baileys');
    if (target.includes('@')) return target;
    const pn = target.startsWith('+') ? target.slice(1) : target;
    return `${pn}@s.whatsapp.net`;
  }

  async _encryptCallKeyForDevice(ctx, wa, deviceJid, callKey) {
    const ct = callKey; // Simplified: in production, actually encrypt via Signal session
    return [{ DeviceJid: deviceJid, Ciphertext: ct, EncType: 'pkmsg' }];
  }

  async _sendCallNode(wa, node) {
    const { generateMessageID } = await import('@whiskeysockets/baileys');
    const id = generateMessageID();
    node.attrs = { ...node.attrs, id };
    const stanza = this._buildCallStanza(node);
    // Send via WebSocket
    if (wa.ws && wa.ws.readyState === 1) {
      wa.ws.send(JSON.stringify(stanza));
    }
  }

  _buildCallStanza(node) {
    return { tag: 'call', attrs: node.attrs, content: node.content };
  }

  async answer(callObj) {
    const m = this.lookup(callObj.id);
    if (!m) throw new Error(`unknown call ${callObj.id}`);
    m.acceptPending = true;
    callObj.setPhase(CallPhase.Connecting);
    this._maybeStartMedia(callObj.id);
  }

  async reject(callObj) {
    const m = this.lookup(callObj.id);
    const to = m?.from || callObj.peer;
    const creator = m?.creator || callObj.peer;
    const rej = signaling.BuildReject(callObj.id, to, creator);
    await this._sendCallNode(this.c.wa, rej);
    this._stopMedia(callObj.id);
    callObj.setPhase(CallPhase.Ended);
    if (callObj._onEnd) callObj._onEnd('rejected');
  }

  async hangup(callObj) {
    const m = this.lookup(callObj.id);
    const to = m?.from || callObj.peer;
    const creator = m?.creator || callObj.peer;
    const term = signaling.BuildTerminate({ CallID: callObj.id, To: to, CallCreator: creator });
    await this._sendCallNode(this.c.wa, term);
    this._stopMedia(callObj.id);
    callObj.setPhase(CallPhase.Ended);
    if (callObj._onEnd) callObj._onEnd('hangup');
  }

  _onOffer(wa, ev) {
    const callID = ev.callId;
    const callKey = crypto.randomBytes(32); // Simplified: decrypt from enc node
    const peer = ev.callCreator || ev.from;

    this.c.log?.info({ callID, peer }, 'incoming offer');
    const call = new Call(this, callID, peer);

    const m = this.entry(callID);
    m.call = call;
    m.callKey = callKey;
    m.from = ev.from;
    m.creator = ev.callCreator || ev.from;
    m.direction = CallDirection.Incoming;
    m.isVideo = signaling.OfferHasVideo(ev.data);

    call.setPhase(CallPhase.Ringing);

    // Send preaccept
    this._sendPreaccept(wa, callID, ev.from, ev.callCreator || ev.from);

    if (this.c._onIncomingCall) {
      this.c._onIncomingCall(call);
    }
  }

  async _sendPreaccept(wa, callID, to, creator) {
    const pre = {
      tag: 'call',
      attrs: { to: to.toString(), id: wa.generateMessageID?.() || crypto.randomUUID() },
      content: [{
        tag: 'preaccept',
        attrs: { 'call-id': callID, 'call-creator': creator.toString() },
        content: [
          { tag: 'audio', attrs: { enc: 'opus', rate: '16000' } },
          { tag: 'encopt', attrs: { keygen: '2' } },
          { tag: 'capability', attrs: { ver: '1' }, content: Array.from(signaling.CapabilityOffer) },
        ],
      }],
    };
    if (wa.ws?.readyState === 1) {
      wa.ws.send(JSON.stringify(pre));
    }
  }

  _onRelay(wa, callID, data) {
    const r = findRelay(data);
    if (!r) return;
    const m = this.entry(callID);
    m.relay = parseRelayData(r);
    this._maybeStartMedia(callID);
  }

  _onTerminate(wa, callID, reason) {
    this.c.log?.info({ callID, reason }, 'call terminated');
    this._stopMedia(callID);
    const m = this.lookup(callID);
    if (m?.call) {
      m.call.setPhase(CallPhase.Ended);
      if (m.call._onEnd) m.call._onEnd(reason || 'remote_ended');
    }
  }

  _maybeStartMedia(callID) {
    const m = this.calls.get(callID);
    if (!m || m.started || !m.callKey || !m.relay) return;
    m.started = true;
    const { call, callKey, selfLID, peerLID, relay: rd } = m;

    this.c.log?.info({ callID }, 'starting media');
    const abort = new AbortController();
    m.mediaTask = () => abort.abort();

    this._runMedia(abort.signal, callID, call, callKey, selfLID, peerLID, rd).catch((err) => {
      this.c.log?.warn({ callID, err: err.message }, 'media ended');
    });
  }

  async _runMedia(signal, callID, callObj, callKey, selfLID, peerLID, rd) {
    const log = this.c.log;
    const ep = getMediaRelayEndpoint(rd);
    if (!ep || ep.addresses.length === 0) throw new Error('no relay endpoint');

    const addr = { address: ep.addresses[0].ipv4, port: ep.addresses[0].port };
    log?.info({ relayName: ep.relayName, addr }, 'connecting to relay');

    const ch = await relay.ConnectRelayMedia(addr, { logger: log, timeout: 12000 });

    // Send allocate
    const tx = crypto.randomBytes(12);
    const endpointXor = stun.EncodeXorRelayEndpoint(ep.addresses[0].ipv4, ep.addresses[0].port);
    const allocate = stun.BuildWasmStunAllocateRequest(tx, rd.relayTokens[ep.tokenID],
      endpointXor, rd.relayKeyASCII, log);
    await ch.Send(allocate);

    // Consent ping
    const ptx = crypto.randomBytes(12);
    const initPing = stun.BuildWhatsappPing(ptx, log);
    await ch.Send(initPing);

    const ssrc = rtp.DeriveWasmParticipantSsrc(callID, rtp.FormatE2ESrtpParticipantID(selfLID), 0, log);
    log?.info({ ssrc: '0x' + ssrc.toString(16).padStart(8, '0') }, 'media SSRC');

    const txPipe = new NewMediaPipeline(callKey, selfLID, peerLID, ssrc, FrameSamples);
    const rxPipe = new NewMediaPipeline(callKey, selfLID, peerLID, ssrc, FrameSamples);

    // Keepalive ticker
    const keepaliveTimer = setInterval(async () => {
      if (signal.aborted) { clearInterval(keepaliveTimer); return; }
      try {
        const ktx = crypto.randomBytes(12);
        await ch.Send(allocate);
        await ch.Send(stun.BuildWhatsappPing(ktx, log));
      } catch {}
    }, 1000);

    // Send loop
    const frameInterval = (FrameSamples / SampleRate) * 1000;
    const sendTimer = setInterval(async () => {
      if (signal.aborted) { clearInterval(sendTimer); return; }
      try {
        const player = callObj._player;
        let frame = null;
        if (player) frame = await player.nextFrame();
        if (!frame) frame = new Float32Array(FrameSamples);

        const payload = Buffer.from(frame.buffer); // Simplified: actual MLow encode
        const packet = await txPipe.ProtectAudio(payload);
        await ch.Send(packet);
      } catch {}
    }, frameInterval);

    // Receive loop
    const recvBuf = Buffer.alloc(1500);
    signal.addEventListener('abort', () => {
      clearInterval(keepaliveTimer);
      clearInterval(sendTimer);
      ch.Close();
    });

    try {
      let rtpIn = 0;
      while (!signal.aborted) {
        const n = await ch.Recv(recvBuf);
        if (signal.aborted) break;
        const pkt = recvBuf.subarray(0, n);
        const isRTP = relay.ClassifyRelayPacket(pkt) === relay.RelayPacketRtp;
        if (!isRTP) {
          const [mt, isStun] = stun.StunMessageType(pkt);
          if (isStun && mt === stun.MsgBindingRequest) {
            const [txId] = stun.StunTransactionID(pkt);
            if (txId) {
              const resp = stun.EncodeStunRequest(stun.MsgBindingSuccess, txId, null, rd.relayKeyASCII, true, log);
              await ch.Send(resp);
            }
          }
          continue;
        }

        // Parse and unprotect RTP
        const [result, payload] = this._unprotectAndDecode(rxPipe, pkt);
        if (!result) continue;

        const [hdr, plain] = result;
        const sink = callObj._sink;
        if (sink) {
          const frame = new Float32Array(plain.buffer, plain.byteOffset, plain.byteLength / 4);
          await sink.writeFrame(frame);
        }

        rtpIn++;
        if (rtpIn === 1) {
          log?.info('first RTP decoded, inbound audio flowing');
          callObj.setPhase(CallPhase.Active);
          if (callObj._onReady) callObj._onReady();
        }
      }
    } catch (err) {
      if (!signal.aborted) throw err;
    }
  }

  _unprotectAndDecode(pipe, pkt) {
    try {
      const [result, payload] = pipe.UnprotectAudio(pkt);
      return [result, payload];
    } catch {
      return [null, null];
    }
  }

  _stopMedia(callID) {
    const m = this.calls.get(callID);
    if (m?.mediaTask) {
      m.mediaTask();
      m.mediaTask = null;
    }
  }

  sendVideoFrame(callID, au) {
    const m = this.calls.get(callID);
    if (!m?.videoTx) throw new Error('no active video media');
    m.videoTx.send(au);
  }
}

function findRelay(node) {
  if (!node) return null;
  if (node.tag === 'relay') return node;
  if (node.content) {
    const kids = Array.isArray(node.content) ? node.content : [];
    for (const kid of kids) {
      const r = findRelay(kid);
      if (r) return r;
    }
  }
  return null;
}

function parseRelayData(node) {
  const rd = { relayKeyASCII: null, relayTokens: [], endpoints: [] };
  const kids = Array.isArray(node.content) ? node.content : [];
  for (const kid of kids) {
    if (kid.tag === 'key' && kid.content) {
      rd.relayKeyASCII = Buffer.from(kid.content);
    }
    if (kid.tag === 'token' && kid.content) {
      const id = kid.attrs?.id !== undefined ? parseInt(kid.attrs.id) : rd.relayTokens.length;
      const buf = Buffer.from(kid.content);
      rd.relayTokens[id] = buf;
    }
    if (kid.tag === 'te2' && kid.content) {
      const ab = Buffer.from(kid.content);
      if (ab.length === 6) {
        rd.endpoints.push({
          relayID: parseInt(kid.attrs?.relay_id || '0'),
          relayName: kid.attrs?.relay_name || '',
          tokenID: parseInt(kid.attrs?.token_id || '0'),
          authTokenID: parseInt(kid.attrs?.auth_token_id || '0'),
          isFNA: kid.attrs?.is_fna === '1',
          addresses: [{
            ipv4: `${ab[0]}.${ab[1]}.${ab[2]}.${ab[3]}`,
            port: ab.readUInt16BE(4),
          }],
        });
      }
    }
  }
  return rd;
}

function getMediaRelayEndpoint(rd) {
  for (const ep of rd.endpoints) {
    if (!ep.isFNA && ep.authTokenID !== 0) return ep;
  }
  for (const ep of rd.endpoints) {
    if (!ep.isFNA) return ep;
  }
  return rd.endpoints[0] || null;
}

function newCallID() {
  const b = crypto.randomBytes(16);
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0').toUpperCase()).join('');
}
