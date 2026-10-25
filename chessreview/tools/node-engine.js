import { createRequire } from 'node:module';
import { Engine } from '../src/engine.js';

const require = createRequire(import.meta.url);

// The npm Stockfish engine behind the same Engine wrapper the page uses.
export function nodeEngine() {
  let listener = () => {};
  const sf = require('stockfish')('lite-single', (line) => listener(line));
  const engine = new Engine({ send: (c) => sf.processCommand(c), onLine: (fn) => { listener = fn; } });
  engine.quit = () => sf.terminate();
  return engine;
}
