export class CallRegistry {
  constructor() {
    this._calls = new Map();
  }

  Insert(session, call = null) {
    if (this._calls.has(session.CallID)) return false;
    this._calls.set(session.CallID, { session, call, mediaTask: null });
    return true;
  }

  SetMediaTask(callID, cancel) {
    const entry = this._calls.get(callID);
    if (!entry) { if (typeof cancel === 'function') cancel(); return; }
    const old = entry.mediaTask;
    entry.mediaTask = cancel;
    if (old) old();
  }

  Has(callID) {
    return this._calls.has(callID);
  }

  Get(callID) {
    const entry = this._calls.get(callID);
    return entry ? entry : null;
  }

  List() {
    return Array.from(this._calls.values(), (entry) => entry.call || entry.session);
  }

  Phase(callID) {
    const entry = this._calls.get(callID);
    return entry ? [entry.session.Phase(), true] : [null, false];
  }

  Transition(callID, next) {
    const entry = this._calls.get(callID);
    return entry ? entry.session.TransitionTo(next) : false;
  }

  Snapshot(callID) {
    const entry = this._calls.get(callID);
    return entry ? [{ ...entry.session }, true] : [null, false];
  }

  ActiveCount() { return this._calls.size; }

  Remove(callID) {
    const entry = this._calls.get(callID);
    if (!entry) return false;
    this._calls.delete(callID);
    if (entry.mediaTask) entry.mediaTask();
    return true;
  }

  AbortAll() {
    const entries = [...this._calls.values()];
    this._calls.clear();
    for (const e of entries) { if (e.mediaTask) e.mediaTask(); }
    return entries.length;
  }
}
