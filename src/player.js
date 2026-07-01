export const PlayerState = Object.freeze({
  Idle: Symbol('idle'),
  Playing: Symbol('playing'),
  Paused: Symbol('paused'),
});

export function NewPlayer() {
  let src = null;
  let state = PlayerState.Idle;
  let onFinish = null;
  let mu = null; // using closure pattern instead of mutex

  const self = {
    Play(source) {
      const old = src;
      src = source;
      state = PlayerState.Playing;
      if (old && typeof old.close === 'function') old.close().catch(() => {});
    },

    Pause() {
      if (state === PlayerState.Playing) state = PlayerState.Paused;
    },

    Resume() {
      if (state === PlayerState.Paused) state = PlayerState.Playing;
    },

    Stop() {
      const old = src;
      src = null;
      state = PlayerState.Idle;
      if (old && typeof old.close === 'function') old.close().catch(() => {});
    },

    State() { return state; },

    OnFinish(fn) { onFinish = fn; },

    async nextFrame() {
      if (state !== PlayerState.Playing || !src) return null;
      try {
        const frame = await src.readFrame();
        if (frame === null) {
          src = null;
          state = PlayerState.Idle;
          if (onFinish) setTimeout(onFinish, 0);
          return null;
        }
        return frame;
      } catch {
        src = null;
        state = PlayerState.Idle;
        if (onFinish) setTimeout(onFinish, 0);
        return null;
      }
    },
  };

  return self;
}
