// MLow codec stub — the actual MLow codec implementation is a pure-Go
// audio codec. In JavaScript, this would need to be ported or provided
// via WebAssembly. For now, this is a passthrough that preserves the API.
//
// The full MLow codec is defined in the meowcaller/mlow package:
//   https://github.com/purpshell/meowcaller/tree/main/mlow
//
// MLow operates on 16 kHz mono float32 PCM frames of 960 samples (60 ms).

export class MlowEncoder {
  constructor(opts = {}) {
    this.log = opts.logger || null;
  }

  Encode(frame) {
    // Placeholder: convert float32 PCM to bytes
    const buf = Buffer.alloc(frame.length * 4);
    for (let i = 0; i < frame.length; i++) {
      buf.writeFloatLE(frame[i], i * 4);
    }
    return buf;
  }
}

export class MlowDecoder {
  constructor(opts = {}) {
    this.log = opts.logger || null;
  }

  Decode(payload) {
    // Placeholder: convert bytes back to float32 PCM
    const sampleCount = Math.floor(payload.length / 4);
    const frame = new Float32Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      frame[i] = payload.readFloatLE(i * 4);
    }
    return frame;
  }
}

export function NewMlowEncoder(opts) { return new MlowEncoder(opts); }
export function NewMlowDecoder(opts) { return new MlowDecoder(opts); }
