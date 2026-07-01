import { Engine } from './engine.js';
import { Recorder } from './diag.js';
import { resolveConfig } from './logging.js';

export class Client {
  constructor(wa, opts = {}) {
    const cfg = resolveConfig([].concat(opts));
    this.wa = wa;
    this.log = cfg.logger || null;
    this.diag = cfg.diag || null;
    this.eng = new Engine(this);
    this._onIncomingCall = null;
  }

  async Call(ctx, target) {
    return this.eng.placeCall(ctx, target);
  }

  OnIncomingCall(fn) {
    this._onIncomingCall = fn;
  }

  Connect() {
    this.eng.install(this.wa);
  }
}
