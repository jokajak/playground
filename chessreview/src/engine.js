/* UCI wrapper around Stockfish. The transport is injected so the same parser
   drives a Web Worker in the browser and the npm engine in tests:
     transport = { send(cmd), onLine(fn) }  */

export const MULTIPV = 3;

// Parse one "info ... score ... pv ..." line. Returns null for lines without
// a principal variation (currmove updates, strings, etc.).
export function parseInfo(line) {
  if (!line.startsWith('info ') || line.indexOf(' pv ') < 0) return null;
  const t = line.split(' ');
  const info = { depth: 0, multipv: 1, cp: null, mate: null, pv: [] };
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case 'depth': info.depth = +t[++i]; break;
      case 'multipv': info.multipv = +t[++i]; break;
      case 'score':
        if (t[i + 1] === 'cp') info.cp = +t[i + 2];
        else if (t[i + 1] === 'mate') info.mate = +t[i + 2];
        i += 2;
        // A bound score is a fail-high/low estimate; skip it.
        if (t[i + 1] === 'lowerbound' || t[i + 1] === 'upperbound') return null;
        break;
      case 'pv': info.pv = t.slice(i + 1); i = t.length; break;
    }
  }
  return info;
}

export class Engine {
  constructor(transport) {
    this.transport = transport;
    this.queue = Promise.resolve();
    this.listener = null;
    transport.onLine((line) => this.listener && this.listener(line));
    this.ready = this.command(['uci', 'setoption name MultiPV value ' + MULTIPV,
      'setoption name Hash value 32', 'isready'], (l) => l === 'readyok');
  }

  // Send commands, then resolve with every line seen up to the one `done`
  // accepts. Commands are serialized so searches never interleave.
  command(cmds, done) {
    const run = () => new Promise((resolve) => {
      const lines = [];
      this.listener = (line) => {
        lines.push(line);
        if (done(line)) { this.listener = null; resolve(lines); }
      };
      for (const c of cmds) this.transport.send(c);
    });
    this.queue = this.queue.then(run, run);
    return this.queue;
  }

  // Search `fen` and return up to MULTIPV lines, best first. Scores are from
  // the side to move's point of view, as UCI reports them.
  async analyse(fen, { depth = 14, multipv = MULTIPV } = {}) {
    await this.ready;
    const lines = await this.command([
      'setoption name MultiPV value ' + multipv,
      'position fen ' + fen,
      'go depth ' + depth,
    ], (l) => l.startsWith('bestmove'));
    const best = [];
    for (const l of lines) {
      const info = parseInfo(l);
      if (!info) continue;
      const k = info.multipv - 1;
      if (!best[k] || info.depth >= best[k].depth) best[k] = info;
    }
    return best.filter(Boolean);
  }

  newGame() {
    return this.command(['ucinewgame', 'isready'], (l) => l === 'readyok');
  }
}

export function workerEngine(url) {
  const worker = new Worker(url);
  const engine = new Engine({
    send: (c) => worker.postMessage(c),
    onLine: (fn) => { worker.onmessage = (e) => fn(String(e.data)); },
  });
  // Abandons any search in flight; the engine can't be used afterwards.
  engine.quit = () => worker.terminate();
  return engine;
}
