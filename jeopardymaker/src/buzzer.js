export const Phase = { IDLE: 'idle', BUZZED: 'buzzed' };

export function createBuzzer() {
  let phase = Phase.IDLE;
  let _player = null;
  const subs = new Set();

  const notify = () => subs.forEach(fn => fn(phase));

  return {
    get phase() { return phase; },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    buzz(player) {
      if (phase !== Phase.IDLE) return false;
      phase = Phase.BUZZED;
      _player = player;
      notify();
      return true;
    },
    reset() { phase = Phase.IDLE; _player = null; notify(); },
    buzzedPlayer() { return _player; },
  };
}
