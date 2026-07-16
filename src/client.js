import { Engine } from './engine.js';
import { CallRegistry } from './registry.js';
import { resolveConfig } from './logging.js';

export class Client {
  constructor(wa, opts = {}) {
    const cfg = resolveConfig([].concat(opts));
    this.wa = wa;
    this.log = cfg.logger || null;
    this.diag = cfg.diag || null;
    this.eng = new Engine(this);
    this.registry = new CallRegistry();
    this._onIncomingCall = null;
  }

  async Call(ctx, target) {
    const call = await this.eng.placeCall(ctx, target);
    return call;
  }

  OnIncomingCall(fn) {
    this._onIncomingCall = fn;
  }

  Connect() {
    this.eng.install(this.wa);
    return this;
  }

  ListCalls() {
    return this.registry.List();
  }

  GetCall(callID) {
    const entry = this.registry.Get(callID);
    return entry ? entry.call || entry.session : null;
  }
}
