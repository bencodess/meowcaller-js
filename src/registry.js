export class CallRegistry {
  constructor() {
    this._calls = new Map();
  }

  Insert(session) {
    if (this._calls.has(session.CallID)) return false;
    this._calls.set(session.CallID, { session, mediaTask: null });
    return true;
  }

  SetMediaTask(callID, cancel) {
    const entry = this._calls.get(callID);
    if (!entry) { cancel(); return; }
    const old = entry.mediaTask;
    entry.mediaTask = cancel;
    if (old) old();
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
