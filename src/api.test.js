import test from 'node:test';
import assert from 'node:assert/strict';

import { Client } from './client.js';
import { CallRegistry } from './registry.js';
import { CallSession, CallDirection, CallPhase } from './session.js';
import { NewPlayer, PlayerState } from './player.js';
import { SourceFunc, SinkFunc } from './audio.js';

class FakeWA {
  constructor() {
    this.ev = { on() {} };
    this.user = { id: 'me@whatsapp.net' };
    this.ws = { readyState: 1, send() {} };
  }
}

test('call session transitions follow the expected lifecycle', () => {
  const session = new CallSession('call-1', 'peer@whatsapp.net', 'me@whatsapp.net', CallDirection.Outgoing);

  assert.equal(session.Description(), 'outgoing call call-1 to peer@whatsapp.net');
  assert.equal(session.Phase(), CallPhase.Idle);
  assert.equal(session.TransitionTo(CallPhase.Calling), true);
  assert.equal(session.TransitionTo(CallPhase.Ringing), true);
  assert.equal(session.TransitionTo(CallPhase.Connecting), true);
  assert.equal(session.TransitionTo(CallPhase.Active), true);
  assert.equal(session.TransitionTo(CallPhase.Ended), true);
  assert.equal(session.IsEnded(), true);
});

test('registry tracks calls and aborts media tasks', () => {
  const registry = new CallRegistry();
  const session = new CallSession('call-2', 'peer@whatsapp.net', 'me@whatsapp.net', CallDirection.Incoming);
  const aborted = [];

  assert.equal(registry.Insert(session), true);
  registry.SetMediaTask('call-2', () => aborted.push('task'));
  assert.equal(registry.Has('call-2'), true);
  registry.Remove('call-2');
  assert.deepEqual(aborted, ['task']);
  assert.equal(registry.Has('call-2'), false);
});

test('player advances through source frames and reports finish', async () => {
  const frames = [new Float32Array([1, 2]), new Float32Array([3, 4])];
  const source = SourceFunc(async () => {
    if (frames.length === 0) return null;
    return frames.shift();
  });
  const player = NewPlayer();
  let finished = false;
  player.OnFinish(() => { finished = true; });
  player.Play(source);

  const first = await player.nextFrame();
  const second = await player.nextFrame();
  const third = await player.nextFrame();

  assert.deepEqual(Array.from(first), [1, 2]);
  assert.deepEqual(Array.from(second), [3, 4]);
  assert.equal(third, null);
  assert.equal(player.State(), PlayerState.Idle);
  assert.equal(finished, true);
});

test('client exposes a registry and installs handlers', () => {
  const client = new Client(new FakeWA());
  const self = client.Connect();
  assert.equal(self, client);
  assert.ok(client.registry instanceof CallRegistry);
  assert.equal(client.ListCalls().length, 0);
});

test('sink adapters pass frames through cleanly', async () => {
  const received = [];
  const sink = SinkFunc((frame) => received.push(Array.from(frame)));

  await sink.writeFrame(new Float32Array([0.1, 0.2]));
  assert.equal(received.length, 1);
  assert.equal(received[0][0].toFixed(6), '0.100000');
  assert.equal(received[0][1].toFixed(6), '0.200000');
});
