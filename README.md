# meowcaller-js

[![npm](https://img.shields.io/npm/v/meowcaller-js)](https://www.npmjs.com/package/meowcaller-js)
[![License](https://img.shields.io/github/license/bencodess/meowcaller-js)](LICENSE)
[![Node](https://img.shields.io/node/v/meowcaller-js)](https://nodejs.org)
[![GitHub stars](https://img.shields.io/github/stars/bencodess/meowcaller-js)](https://github.com/bencodess/meowcaller-js/stargazers)

A JavaScript port of [meowcaller](https://github.com/purpshell/meowcaller) — WhatsApp VoIP library for [Baileys](https://github.com/WhiskeySockets/Baileys). Pure JavaScript, no native bindings, runs wherever Node.js does.

Website: https://benslogs.dev/socials/

## Status

**Experimental.** Signaling works. Media relay (DTLS/UDP → STUN → SRTP) is still waiting on Node.js native DTLS or a WebRTC bridge. Check the [implementation table](#implementation-status) for details.

## Usage

```js
import { makeWASocket, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { Client, CallPhase, SinkFunc, SourceFunc } from 'meowcaller-js';

const { state, saveCreds } = await useMultiFileAuthState('auth_info');
const wa = makeWASocket({ auth: state, printQRInTerminal: true });

const client = new Client(wa);
client.Connect();

client.OnIncomingCall((call) => {
  call.OnStateChange((phase) => console.log('phase:', phase.description));
  call.OnEnd((reason) => console.log('ended:', reason));
  call.Receive(SinkFunc((frame) => console.log('audio frame', frame.length)));
  call.Play(SourceFunc(async () => null));
  call.Answer();
});

// Place an outbound call:
// const call = await client.Call({}, '+15551234567');
// console.log(client.ListCalls());
```

## API

### `Client`
- `new Client(wa, opts?)` — wrap a connected `Baileys` socket
- `client.Connect()` — install call event handlers (call before WA connects)
- `client.Call(ctx, target)` — place an outbound call
- `client.OnIncomingCall(fn)` — handle inbound offers
- `client.ListCalls()` / `client.GetCall(id)` — inspect live calls from the registry

### `Call`
- `call.ID()` / `call.Peer()` / `call.State()`
- `call.Answer()` / `call.Reject()` / `call.Hangup()`
- `call.Subscribe(player)` / `call.Play(source)` / `call.Receive(sink)`
- `call.ReceiveVideo(sink)` / `call.SendVideo(annexB)`
- `call.OnReady(fn)` / `call.OnEnd(fn)` / `call.OnStateChange(fn)`

### Audio
- `PCMStream(readable)` — raw s16le PCM → float32 frames
- `WAVFile(path)` — RIFF/WAV file stream
- `SourceFunc(provider)` — simple audio source adapter for custom frame generators
- `SinkFunc(fn)` — callback-based audio sink

### Video
- `AnnexBRecorder(path)` — record H.264 to .h264 file
- `VideoSinkFunc(fn)` — callback-based video sink

## Implementation Status

| Feature | Status |
|---------|--------|
| Outbound calls | Signal path ported |
| Inbound calls | Signal path ported |
| Audio calls | Signaling done, media relay needs DTLS |
| Video calls | Signaling + depacketizer ported |
| MLow codec | Stub — needs WASM port |
| Opus codec | Planned |
| DTLS → relay | Needs native addon or WebRTC |

## Differences from meowcaller

- **Async/await** instead of goroutines + channels
- **EventEmitter** patterns instead of Go callbacks
- **No unsafe** — no reflection-based monkey-patching
- **No CGO** — pure JavaScript throughout
- Call registry for listing and cleaning up active sessions
- Source/sink adapters for piping audio in and out
- Regression tests, GitHub Actions CI, auto-publish on `v*` tags

## License

MIT
