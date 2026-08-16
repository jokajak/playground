// Bracket Maker — single-elimination bracket generator.
//
// Renders a printable single-elimination bracket using a recursive flexbox
// layout. The recursion guarantees that every connector line is centered
// between the two slots that feed it, for any power-of-two size, with no
// magic-number spacing.
//
// First-round slots are free-text inputs. Every later round (and the champion)
// is a <select> that picks the winner from its two feeding competitors; it
// stores *which side* advanced, so a name typed upstream propagates forward.
//
// Every value-holding field carries a stable `data-key` describing its position
// in the tree rather than its position in the document (see KEYS below). The
// page saves and restores state by those keys, so redrawing the bracket — after
// a resize, a layout flip or a toggle — keeps whatever is still meaningful
// instead of starting over.

const VALID_SIZES = [2, 4, 8, 16, 32, 64, 128];

// Two ways to arrange the same tree. 'horizontal' is the two-sided ("March
// Madness") layout: two halves mirror inward from the edges to a champion in
// the centre. 'vertical' is a single, non-mirrored flow: round 1 is listed
// straight down the left edge and every round narrows rightward to one
// champion at the right — the classic single-column bracket sheet.
const ORIENTATIONS = ['horizontal', 'vertical'];

// A 3rd-place match needs two beaten semifinalists, so it only exists once each
// half plays a semifinal — i.e. from 4 participants up.
const THIRD_PLACE_MIN_SIZE = 4;

export function supportsThirdPlace(size) {
  return size >= THIRD_PLACE_MIN_SIZE;
}

// Standard tournament seeding order (top-to-bottom) within one region/quadrant.
// Each pair of adjacent entries is a first-round matchup, so the top seed meets
// the lowest seed, and the seed sums stay constant each round. The 16 ordering
// matches the traditional NCAA region layout (1 at the top, 2 at the bottom).
const SEED_ORDERS = {
  2: [1, 2],
  4: [1, 4, 2, 3],
  8: [1, 8, 4, 5, 2, 7, 3, 6],
  16: [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15],
};

// A 128-bracket splits into quadrants of 32, which extend the 16 layout the
// standard way: every seed is immediately followed by its opening opponent, so
// the pair sums to 33 and the existing shape is preserved one round deeper.
SEED_ORDERS[32] = SEED_ORDERS[16].flatMap((seed) => [seed, 33 - seed]);

// KEYS — the `data-key` naming scheme. Each key names a position in the
// tournament tree, so the same slot keeps its key across a redraw:
//
//   e3          first-round entrant, leaf 3 (leaves count 0..size-1)
//   e3a / e3b   the two competitors of leaf 3's play-in fork
//   p3          leaf 3's play-in winner
//   w2:8        winner of the 2-round match covering leaves 8..11
//   champion    the champion, third — the 3rd place match
//   <key>#s0    that match's top score,  <key>#s1 its bottom score
//   <key>#t     that match's date & time
//
// Round-winner keys are (rounds, first leaf) rather than a running counter, so
// a match keeps its key whichever layout it is assembled into — the two
// orientations build the same tree — and a leaf keeps its key when the bracket
// grows or a toggle changes the field mix.
function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

// First-round entrant: a free-text input. Returns { node, output }, where
// `output` is the value-holding element the winner above reads from.
function leafSlot(idx) {
  const s = el('div', 'slot entry');
  const input = el('input', 'line');
  input.type = 'text';
  input.autocomplete = 'off';
  input.dataset.key = `e${idx}`;
  input.setAttribute('aria-label', 'Participant');
  s.append(input);
  return { node: s, output: input };
}

// Winner of a match: a <select> that picks between its two feeders. The chosen
// option's value is the feeder index ("0"/"1"); the displayed name resolves
// live from that feeder, so upstream edits flow forward.
function winnerSelect(feeders, className, label, key) {
  const sel = el('select', className);
  sel.dataset.key = key;
  sel.setAttribute('aria-label', label);
  const blank = el('option');
  blank.value = '';
  const top = el('option');
  top.value = '0';
  const bottom = el('option');
  bottom.value = '1';
  sel.append(blank, top, bottom);
  sel.__feeders = feeders;
  return sel;
}

// A pair of small number inputs recording each feeder's score for a match.
// Purely a note attached to the match — it never drives the winner <select>.
function scorePair(key, label) {
  const wrap = el('div', 'score-pair');
  const top = el('input', 'score');
  top.type = 'number';
  top.inputMode = 'numeric';
  top.min = '0';
  top.dataset.key = `${key}#s0`;
  top.setAttribute('aria-label', `${label} — top score`);
  const sep = el('span', 'score-sep');
  sep.textContent = '–';
  const bottom = el('input', 'score');
  bottom.type = 'number';
  bottom.inputMode = 'numeric';
  bottom.min = '0';
  bottom.dataset.key = `${key}#s1`;
  bottom.setAttribute('aria-label', `${label} — bottom score`);
  wrap.append(top, sep, bottom);
  return wrap;
}

// When a match is played: a datetime-local input below the winner line. Like
// the score pair it is purely a note attached to the match. Left empty it
// prints as a blank line to write a time on by hand (index.html blanks the
// browser's mm/dd/yyyy placeholder for printing).
function whenInput(key, label) {
  const input = el('input', 'when');
  input.type = 'datetime-local';
  input.dataset.key = `${key}#t`;
  input.setAttribute('aria-label', `${label} — date and time`);
  return input;
}

// Wrap a winner <select> together with the optional notes attached to its match
// (scores above, date & time below) in a plain container. The container is
// unstyled/unpositioned, so each child's own absolute positioning still
// resolves against the slot.
function matchFields(sel, ctx, key, label) {
  if (!ctx.scores && !ctx.times) return sel;
  const wrap = el('div', 'winner-wrap');
  if (ctx.scores) wrap.append(scorePair(key, label));
  wrap.append(sel);
  if (ctx.times) wrap.append(whenInput(key, label));
  return wrap;
}

function winnerSlot(feeders, ctx, key) {
  const s = el('div', 'slot out');
  const sel = winnerSelect(feeders, 'line winner', 'Round winner', key);
  s.append(matchFields(sel, ctx, key, 'Match'));
  return { node: s, output: sel };
}

// Wildcard play-in entrant: the lowest seed's slot is decided by a two-way
// play-in. The seed line becomes a winner <select>; two competitor inputs feed
// it, drawn as a small fork that extends into the bracket's outer margin.
function playinLeaf(ctx, idx) {
  const seedSlot = el('div', 'slot entry playin-seed');

  const compA = el('input', 'line');
  compA.type = 'text';
  compA.autocomplete = 'off';
  compA.dataset.key = `e${idx}a`;
  compA.setAttribute('aria-label', 'Play-in competitor');
  const compB = el('input', 'line');
  compB.type = 'text';
  compB.autocomplete = 'off';
  compB.dataset.key = `e${idx}b`;
  compB.setAttribute('aria-label', 'Play-in competitor');

  const seedSel = winnerSelect([compA, compB], 'line winner', 'Play-in winner', `p${idx}`);
  seedSlot.append(matchFields(seedSel, ctx, `p${idx}`, 'Play-in'));

  const slotA = el('div', 'slot playin-comp');
  slotA.append(compA);
  const slotB = el('div', 'slot playin-comp');
  slotB.append(compB);
  const feeders = el('div', 'feeders');
  feeders.append(slotA, slotB);
  const fork = el('div', 'playin');
  fork.append(feeders, el('div', 'connector'));
  seedSlot.append(fork);

  return { node: seedSlot, output: seedSel };
}

// Build the subtree for `rounds` rounds. Returns { node, output } where output
// is the value-holder (input or select) representing this subtree's winner.
// `ctx` tracks the running leaf index and which leaves are play-ins.
function build(rounds, ctx) {
  const start = ctx.index; // first leaf under this subtree — half of its key
  if (rounds === 0) {
    const playin = ctx.playins.has(start);
    ctx.index += 1;
    return playin ? playinLeaf(ctx, start) : leafSlot(start);
  }

  const top = build(rounds - 1, ctx);
  const bottom = build(rounds - 1, ctx);

  const feeders = el('div', 'feeders');
  feeders.append(top.node, bottom.node);

  const connector = el('div', 'connector');

  const win = winnerSlot([top.output, bottom.output], ctx, `w${rounds}:${start}`);
  const outcol = el('div', 'outcol');
  outcol.append(win.node);

  const match = el('div', 'match');
  match.append(feeders, connector, outcol);
  return { node: match, output: win.output };
}

// A labelled line in the centre column (the champion, or 3rd place).
function placeBox(label, sel) {
  const box = el('div', 'champion-box');
  const caption = el('div', 'champion-label');
  caption.textContent = label;
  box.append(caption, sel);
  return box;
}

// A pseudo value-holder standing for the *loser* of a match: whichever feeder
// its winner <select> did not pick. The 3rd-place match is fed by two of these.
function loserOf(sel) {
  return { __loserOf: sel };
}

// The centre column: the champion is picked from the two finalists, with an
// optional 3rd-place match between the two beaten semifinalists below it.
// `left`/`right` are each half's value-holder — for a 3rd-place match they are
// the semifinal winner selects, whose unchosen side is the beaten semifinalist.
function finalCenter(left, right, thirdPlace, ctx) {
  const center = el('div', thirdPlace ? 'final-center with-third' : 'final-center');
  const championSel = winnerSelect(
    [left, right],
    'champion-line winner',
    'Champion',
    'champion',
  );
  center.append(placeBox('Champion', matchFields(championSel, ctx, 'champion', 'Championship')));

  if (thirdPlace) {
    const sel = winnerSelect(
      [loserOf(left), loserOf(right)],
      'champion-line winner',
      'Third place',
      'third',
    );
    sel.__placeholders = ['(left semifinal loser)', '(right semifinal loser)'];
    const box = placeBox('3rd Place', matchFields(sel, ctx, 'third', '3rd place'));
    box.classList.add('third');
    center.append(box);
  }

  return center;
}

// Resolve the live name behind a value-holder (text input, winner select, or
// the loser proxy above).
function resolveValue(holder) {
  if (!holder) return '';
  if (holder.__loserOf) {
    const match = holder.__loserOf;
    if (match.value === '') return ''; // no winner picked yet ⇒ no loser either
    return resolveValue(match.__feeders[1 - Number(match.value)]);
  }
  if (holder.tagName === 'INPUT') return holder.value.trim();
  if (holder.value === '') return '';
  return resolveValue(holder.__feeders[Number(holder.value)]);
}

// Refresh every winner <select>'s option labels to its feeders' current names.
export function syncWinners(root) {
  root.querySelectorAll('select.winner').forEach((sel) => {
    const [f0, f1] = sel.__feeders;
    const [p0, p1] = sel.__placeholders ?? ['(top)', '(bottom)'];
    sel.options[1].textContent = resolveValue(f0) || p0;
    sel.options[2].textContent = resolveValue(f1) || p1;
  });
}

// Number the first-round slots within each quadrant (March Madness style).
// The bracket splits into up to four quadrants (top-left, bottom-left,
// top-right, bottom-right); each is seeded 1..quadrantSize in standard order,
// so seeds repeat across quadrants the way regions do in the NCAA bracket.
function assignSeeds(bracket, size) {
  const regions = Math.min(4, size / 2); // quadrants, but never smaller than 2
  const regionSize = size / regions;
  const order = SEED_ORDERS[regionSize];
  if (!order) return;

  // Entry slots in document order are top-to-bottom, left half then right half
  // (play-in competitor slots are excluded — only the seeded entries count).
  bracket.querySelectorAll('.entry').forEach((leaf, i) => {
    const span = el('span', 'seed');
    span.textContent = String(order[i % regionSize]);
    leaf.classList.add('seeded');
    if (leaf.closest('.half.right')) leaf.classList.add('seed-right');
    leaf.append(span);
  });
}

// Render a bracket into `container`. Both orientations build the same two
// size/2 subtrees (`a`, `b`) and the same centre champion/3rd-place box —
// they only differ in how those pieces are assembled and, for horizontal,
// whether the second half is mirrored.
export function renderBracket(container, {
  size,
  wildcard = false,
  thirdPlace = false,
  orientation = 'horizontal',
  trackScores = false,
  trackTimes = false,
} = {}) {
  if (!VALID_SIZES.includes(size)) {
    throw new Error(`Unsupported bracket size: ${size}`);
  }
  if (!ORIENTATIONS.includes(orientation)) {
    throw new Error(`Unsupported orientation: ${orientation}`);
  }

  const halfRounds = Math.log2(size) - 1; // rounds within one half
  container.innerHTML = '';
  container.style.setProperty('--participants', String(size));

  // When wildcards are on, the lowest seed in each quadrant (always index 1 of
  // a quadrant in standard seeding) is decided by a play-in.
  const ctx = { index: 0, playins: new Set(), scores: trackScores, times: trackTimes };
  if (wildcard) {
    const regions = Math.min(4, size / 2);
    const regionSize = size / regions;
    for (let r = 0; r < regions; r += 1) ctx.playins.add(r * regionSize + 1);
  }

  const bracket = el('div', 'bracket');
  if (wildcard) bracket.classList.add('wildcard');
  if (orientation === 'vertical') bracket.classList.add('vertical');
  if (trackScores) bracket.classList.add('scored');
  if (trackTimes) bracket.classList.add('timed');

  const a = build(halfRounds, ctx);
  const b = build(halfRounds, ctx);

  const center = finalCenter(
    a.output,
    b.output,
    thirdPlace && supportsThirdPlace(size),
    ctx,
  );

  if (orientation === 'vertical') {
    // A single, non-mirrored flow: both subtrees run the same direction and
    // stack in one shared feeders column, converging on one final match — so
    // round 1 lists straight down the left edge and the champion sits at the
    // right. This is exactly what `build` assembles one level up, done here
    // by hand only because the champion/3rd-place box (`center`) replaces the
    // plain winner slot `build` would otherwise put in the outcol.
    const feeders = el('div', 'feeders');
    feeders.append(a.node, b.node);
    const connector = el('div', 'connector');
    const outcol = el('div', 'outcol');
    outcol.append(center);
    bracket.append(feeders, connector, outcol);
  } else {
    // Two-sided ("March Madness"): `a` flows rightward, `b` mirrors it
    // (flowing leftward, via CSS), and they meet at the champion in the middle.
    const leftHalf = el('div', 'half left');
    leftHalf.append(a.node);
    const rightHalf = el('div', 'half right');
    rightHalf.append(b.node);
    bracket.append(leftHalf, center, rightHalf);
  }

  assignSeeds(bracket, size);

  // Keep winner choices in sync as names are typed or picks change.
  const update = () => syncWinners(bracket);
  bracket.addEventListener('input', update);
  bracket.addEventListener('change', update);
  update();

  container.append(bracket);
}

export { VALID_SIZES, ORIENTATIONS };
