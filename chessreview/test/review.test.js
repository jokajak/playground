import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { parseInfo } from '../src/engine.js';
import { parseGameRef } from '../src/lichess.js';
import { parseGame, analyseGame, buildReview, keyMoments, gradeAttempt, winPct } from '../src/review.js';
import { nodeEngine } from '../tools/node-engine.js';

const engine = nodeEngine();
after(() => engine.quit());

async function review(pgn, perspective = 'w') {
  const game = parseGame(pgn);
  const evals = await analyseGame(game, engine, { depth: 12 });
  return buildReview(game, evals, { perspective });
}

test('parseInfo reads scores and principal variations', () => {
  assert.deepEqual(parseInfo('info depth 14 seldepth 19 multipv 2 score cp 256 nodes 1 pv c4f7 e8e7'),
    { depth: 14, multipv: 2, cp: 256, mate: null, pv: ['c4f7', 'e8e7'] });
  assert.equal(parseInfo('info depth 3 multipv 1 score mate -2 nodes 9 pv e1e2').mate, -2);
  assert.equal(parseInfo('info depth 9 score cp 30 lowerbound nodes 1 pv e2e4'), null);
  assert.equal(parseInfo('info string NNUE evaluation enabled'), null);
});

test('parseGameRef accepts links, IDs and player IDs', () => {
  assert.deepEqual(parseGameRef('https://lichess.org/q7ZvsdUF'), { id: 'q7ZvsdUF', color: null });
  assert.deepEqual(parseGameRef('lichess.org/q7ZvsdUF/black'), { id: 'q7ZvsdUF', color: 'b' });
  assert.deepEqual(parseGameRef('https://lichess.org/q7ZvsdUFab12#40'), { id: 'q7ZvsdUF', color: null });
  assert.deepEqual(parseGameRef(' q7ZvsdUF '), { id: 'q7ZvsdUF', color: null });
  assert.equal(parseGameRef('https://example.com/q7ZvsdUF'), null);
  assert.equal(parseGameRef('not a game'), null);
});

test('winPct is symmetric and saturates for mates', () => {
  assert.equal(winPct({ cp: 0 }, 'w'), 50);
  assert.ok(Math.abs(winPct({ cp: 300 }, 'w') + winPct({ cp: 300 }, 'b') - 100) < 1e-9);
  assert.ok(winPct({ mate: 1 }, 'w') > 99);
  assert.ok(winPct({ mate: 0, winner: 'b' }, 'w') < 1);
});

test("scholar's mate: the losing move is a blunder that allows mate", async () => {
  const r = await review('1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0', 'b');
  const nf6 = r.moves[5];
  assert.equal(nf6.cls, 'blunder');
  assert.match(nf6.explanation, /^This is a blunder\. It allows White a forced checkmate in 1: 4\. Qxf7#\./);
  assert.equal(r.moves[6].explanation, 'Checkmate! That ends the game.');
  assert.ok(keyMoments(r, 'b').includes(5));
  // Retrying with a defence is graded as at least an improvement.
  const g6 = gradeAttempt(nf6, 'g7g6', { cp: 30 });
  assert.ok(['best', 'good', 'better'].includes(g6.verdict));
  assert.equal(gradeAttempt(nf6, nf6.uci, nf6.after.eval).verdict, 'same');
});

test('fried liver: forks are named, and the opponent is "they"', async () => {
  const r = await review('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7 Kxf7 7. Qf3+ Ke6 8. Nc3 Ncb4 9. a3 Nxc2+ *');
  const nxd5 = r.moves[9];
  assert.ok(!/\byour\b/i.test(nxd5.explanation));
  assert.match(nxd5.explanation, /It allows Nxf7, and their position goes from/);
  // The knight on f7 can be taken, so the sacrifice isn't praised as a fork.
  assert.equal(r.moves[10].cls, 'brilliant');
  assert.doesNotMatch(r.moves[10].explanation, /fork/);
  assert.match(r.moves[16].explanation, /It allows Nxc2\+, forking your king and rook\./);
  assert.ok(['mistake', 'blunder'].includes(r.moves[16].cls));
});
