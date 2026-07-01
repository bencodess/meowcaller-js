export const CallDirection = Object.freeze({
  Outgoing: Symbol('outgoing'),
  Incoming: Symbol('incoming'),
});

export const CallPhase = Object.freeze({
  Idle: Symbol('idle'),
  Calling: Symbol('calling'),
  Ringing: Symbol('ringing'),
  Connecting: Symbol('connecting'),
  Active: Symbol('active'),
  Ended: Symbol('ended'),
});

const phaseName = (p) => {
  switch (p) {
    case CallPhase.Idle: return 'idle';
    case CallPhase.Calling: return 'calling';
    case CallPhase.Ringing: return 'ringing';
    case CallPhase.Connecting: return 'connecting';
    case CallPhase.Active: return 'active';
    case CallPhase.Ended: return 'ended';
    default: return 'unknown';
  }
};

export class CallSession {
  constructor(callID, peerJID, callCreator, direction, opts = {}) {
    this.CallID = callID;
    this.PeerJID = peerJID;
    this.CallCreator = callCreator;
    this.Direction = direction;
    this.IsVideo = false;
    this.phase = direction === CallDirection.Incoming ? CallPhase.Ringing : CallPhase.Idle;
    this.log = opts.logger || null;
  }

  Phase() { return this.phase; }
  IsActive() { return this.phase === CallPhase.Active; }
  IsEnded() { return this.phase === CallPhase.Ended; }

  TransitionTo(next) {
    const prev = this.phase;
    let ok = false;
    if (this.phase === CallPhase.Ended) {
      ok = false;
    } else if (next === CallPhase.Ended) {
      ok = true;
    } else if (this.phase === CallPhase.Idle && next === CallPhase.Calling) {
      ok = this.Direction === CallDirection.Outgoing;
    } else if (this.phase === CallPhase.Calling && next === CallPhase.Ringing) {
      ok = true;
    } else if (this.phase === CallPhase.Ringing && next === CallPhase.Connecting) {
      ok = true;
    } else if (this.phase === CallPhase.Connecting && next === CallPhase.Active) {
      ok = true;
    } else if (this.phase === next) {
      ok = true;
    }
    if (ok) {
      this.phase = next;
      if (this.log) this.log.debug({ call_id: this.CallID, from: phaseName(prev), to: phaseName(next) }, 'phase transition');
    }
    return ok;
  }
}
