import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGame } from '../src/review.js';
import { openingAt, bookMoves, analyseOpening, openingNote, MIN_OPENING_PLIES } from '../src/openings.js';

const FRIED_LIVER = '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7 Kxf7 7. Qf3+ Ke6 8. Nc3 Ncb4 9. a3 Nxc2+ *';

test('openings are named by position, so transpositions match', () => {
  const nimzo = (pgn) => openingAt(parseGame(pgn).plies.at(-1).fenAfter);
  assert.deepEqual(nimzo('1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 *'), nimzo('1. c4 e6 2. Nc3 Nf6 3. d4 Bb4 *'));
  assert.equal(nimzo('1. c4 e6 2. Nc3 Nf6 3. d4 Bb4 *').name, 'Nimzo-Indian Defense');
});

test('book moves put main lines first', () => {
  const afterE4 = parseGame('1. e4 *').plies[0].fenAfter;
  const top = bookMoves(afterE4).slice(0, 3).map((b) => b.san);
  assert.ok(top.includes('c5') && top.includes('e5'), top.join(' '));
});

test('the opening is followed move by move until the game leaves the book', () => {
  const o = analyseOpening(parseGame(FRIED_LIVER));
  assert.equal(o.name, 'Italian Game: Two Knights Defense, Fried Liver Attack');
  assert.equal(o.eco, 'C57');
  assert.equal(o.bookPly, 11);
  // The phase runs through the move that leaves the book.
  assert.equal(o.endPly, 12);
  assert.deepEqual(o.steps.map((s) => s.ply), [...Array(12)].map((_, i) => i + 1));
  assert.equal(openingNote(o.steps[4], o.steps[3].opening), 'This is the Italian Game (C50).');
  assert.match(openingNote(o.steps[5], o.steps[4].opening), /^That makes it the Italian Game: Two Knights Defense/);
  assert.ok(o.steps[11].leftBook);
  // At 3. Bc4, the Ruy Lopez and Scotch were the other main options.
  const alts = o.steps[4].alternatives.map((a) => a.san);
  assert.ok(alts.includes('Bb5') && alts.includes('d4') && !alts.includes('Bc4'));
});

test('the first moves are part of the opening even when it ends early', () => {
  const o = analyseOpening(parseGame('1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0'));
  assert.equal(o.bookPly, 3);
  assert.equal(o.endPly, MIN_OPENING_PLIES);
  assert.equal(analyseOpening(parseGame('1. e4 e5 *')).endPly, 2);
});

test('a set-up position has no opening name', () => {
  const o = analyseOpening(parseGame('[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]\n\n1. e4 Kd7 2. Kd2 Kd6 3. Kd3 Ke5 *'));
  assert.equal(o.name, null);
  assert.equal(o.endPly, MIN_OPENING_PLIES);
  assert.ok(o.steps.every((s) => !s.opening && !s.leftBook && !s.alternatives.length));
});
