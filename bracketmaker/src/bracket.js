// Bracket Maker — single-elimination bracket generator.
//
// Renders a printable single-elimination bracket using a recursive flexbox
// layout. The recursion guarantees that every connector line is vertically
// centered between the two slots that feed it, for any power-of-two size,
// with no magic-number spacing.
//
// First-round slots are free-text inputs. Every later round (and the champion)
// is a <select> that picks the winner from its two feeding competitors; it
// stores *which side* advanced, so a name typed upstream propagates forward.

const VALID_SIZES = [2, 4, 8, 16, 32, 64];

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

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

// First-round entrant: a free-text input. Returns { node, output }, where
// `output` is the value-holding element the winner above reads from.
function leafSlot() {
  const s = el('div', 'slot entry');
  const input = el('input', 'line');
  input.type = 'text';
  input.autocomplete = 'off';
  input.setAttribute('aria-label', 'Participant');
  s.append(input);
  return { node: s, output: input };
}

// Winner of a match: a <select> that picks between its two feeders. The chosen
// option's value is the feeder index ("0"/"1"); the displayed name resolves
// live from that feeder, so upstream edits flow forward.
function winnerSelect(feeders, className, label) {
  const sel = el('select', className);
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

function winnerSlot(feeders) {
  const s = el('div', 'slot out');
  const sel = winnerSelect(feeders, 'line winner', 'Round winner');
  s.append(sel);
  return { node: s, output: sel };
}

// Wildcard play-in entrant: the lowest seed's slot is decided by a two-way
// play-in. The seed line becomes a winner <select>; two competitor inputs feed
// it, drawn as a small fork that extends into the bracket's outer margin.
function playinLeaf() {
  const seedSlot = el('div', 'slot entry playin-seed');

  const compA = el('input', 'line');
  compA.type = 'text';
  compA.autocomplete = 'off';
  compA.setAttribute('aria-label', 'Play-in competitor');
  const compB = el('input', 'line');
  compB.type = 'text';
  compB.autocomplete = 'off';
  compB.setAttribute('aria-label', 'Play-in competitor');

  const seedSel = winnerSelect([compA, compB], 'line winner', 'Play-in winner');
  seedSlot.append(seedSel);

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
  if (rounds === 0) {
    const playin = ctx.playins.has(ctx.index);
    ctx.index += 1;
    return playin ? playinLeaf() : leafSlot();
  }

  const top = build(rounds - 1, ctx);
  const bottom = build(rounds - 1, ctx);

  const feeders = el('div', 'feeders');
  feeders.append(top.node, bottom.node);

  const connector = el('div', 'connector');

  const win = winnerSlot([top.output, bottom.output]);
  const outcol = el('div', 'outcol');
  outcol.append(win.node);

  const match = el('div', 'match');
  match.append(feeders, connector, outcol);
  return { node: match, output: win.output };
}

// The centre column: the champion is picked from the two finalists.
function championCenter(feeders) {
  const center = el('div', 'final-center');
  const box = el('div', 'champion-box');
  const label = el('div', 'champion-label');
  label.textContent = 'Champion';
  const sel = winnerSelect(feeders, 'champion-line winner', 'Champion');
  box.append(label, sel);
  center.append(box);
  return center;
}

// Resolve the live name behind a value-holder (text input or winner select).
function resolveValue(holder) {
  if (holder.tagName === 'INPUT') return holder.value.trim();
  if (holder.value === '') return '';
  const feeder = holder.__feeders[Number(holder.value)];
  return feeder ? resolveValue(feeder) : '';
}

// Refresh every winner <select>'s option labels to its feeders' current names.
export function syncWinners(root) {
  root.querySelectorAll('select.winner').forEach((sel) => {
    const [f0, f1] = sel.__feeders;
    sel.options[1].textContent = resolveValue(f0) || '(top)';
    sel.options[2].textContent = resolveValue(f1) || '(bottom)';
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

// Render a two-sided ("March Madness") bracket into `container`.
// Each half is a single-elimination sub-bracket of size/2 that produces one
// finalist; the left half flows rightward, the right half mirrors it, and the
// champion sits in the centre between the two finalists.
export function renderBracket(container, { size, wildcard = false }) {
  if (!VALID_SIZES.includes(size)) {
    throw new Error(`Unsupported bracket size: ${size}`);
  }

  const halfRounds = Math.log2(size) - 1; // rounds within one half
  container.innerHTML = '';
  container.style.setProperty('--participants', String(size));

  // When wildcards are on, the lowest seed in each quadrant (always index 1 of
  // a quadrant in standard seeding) is decided by a play-in.
  const ctx = { index: 0, playins: new Set() };
  if (wildcard) {
    const regions = Math.min(4, size / 2);
    const regionSize = size / regions;
    for (let r = 0; r < regions; r += 1) ctx.playins.add(r * regionSize + 1);
  }

  const bracket = el('div', wildcard ? 'bracket wildcard' : 'bracket');

  const left = build(halfRounds, ctx);
  const right = build(halfRounds, ctx);

  const leftHalf = el('div', 'half left');
  leftHalf.append(left.node);
  const rightHalf = el('div', 'half right');
  rightHalf.append(right.node);

  bracket.append(leftHalf, championCenter([left.output, right.output]), rightHalf);

  assignSeeds(bracket, size);

  // Keep winner choices in sync as names are typed or picks change.
  const update = () => syncWinners(bracket);
  bracket.addEventListener('input', update);
  bracket.addEventListener('change', update);
  update();

  container.append(bracket);
}

export { VALID_SIZES };
