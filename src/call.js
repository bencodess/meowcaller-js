import { NewPlayer } from './player.js';

export class Call {
  constructor(engine, id, peer) {
    this.eng = engine;
    this.id = id;
    this.peer = peer;
    this._phase = null;
    this._player = null;
    this._sink = null;
    this._onReady = null;
    this._onEnd = null;
    this._onState = null;
    this._videoSink = null;
    this._onVideoState = null;
  }

  ID() { return this.id; }
  Peer() { return this.peer; }
  State() { return this._phase; }

  IsVideo() {
    const m = this.eng.lookup(this.id);
    return m ? m.isVideo : false;
  }

  Answer() { return this.eng.answer(this); }
  Reject() { return this.eng.reject(this); }
  Hangup() { return this.eng.hangup(this); }

  Subscribe(p) { this._player = p; }

  Play(src) {
    const p = NewPlayer();
    this.Subscribe(p);
    p.Play(src);
    return p;
  }

  Receive(sink) { this._sink = sink; }
  ReceiveVideo(sink) { this._videoSink = sink; }

  SendVideo(accessUnit) { return this.eng.sendVideoFrame(this.id, accessUnit); }

  OnReady(fn) { this._onReady = fn; }
  OnEnd(fn) { this._onEnd = fn; }
  OnStateChange(fn) { this._onState = fn; }
  OnVideoState(fn) { this._onVideoState = fn; }

  setPhase(next) {
    if (this._phase === next) return;
    this._phase = next;
    if (this._onState) this._onState(next);
  }
}
