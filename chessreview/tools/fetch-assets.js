#!/usr/bin/env node
/* Regenerates the assets in src/vendor/ that don't come from npm, from pinned
   commits of their GitHub repositories:
   - pieces/<set>.css: Lichess piece sets as Chessground stylesheets with the
     SVGs embedded (the same shape as chessground.cburnett.css). Only sets
     whose licences are compatible with GPL-3.0 are included; see
     pieces/LICENSES.md.
   - openings.js: the Lichess opening table (CC0), keyed by position so that
     transpositions are named too.

   Usage: npm run fetch-assets */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from '../src/vendor/chess.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendorDir = path.join(root, 'src', 'vendor');
const NOTE = 'Do not edit by hand — run `npm run fetch-assets` in chessreview/ instead.';

const LILA = 'lichess-org/lila@eaaee2ac2ff62a6c600ed65c60bb01410631e6aa';
const OPENINGS = 'lichess-org/chess-openings@a6189a30dc273ccb21fc2536a9a2fefd5592a67a';

// cburnett ships with Chessground and is vendored by sync-vendor.js.
const PIECE_SETS = {
  merida:   { author: 'Armando Hernandez Marroquin', license: 'GPL-2.0-or-later' },
  chessnut: { author: 'Alexis Luengas', license: 'Apache-2.0' },
  mpchess:  { author: 'Maxime Chupin', license: 'GPL-3.0-or-later' },
  fantasy:  { author: 'Maurizio Monge', license: 'MIT' },
  celtic:   { author: 'Maurizio Monge', license: 'MIT' },
  spatial:  { author: 'Maurizio Monge', license: 'MIT' },
  papercut: { author: 'Nikolay Anzarov', license: 'CC-BY-4.0' },
  rhosgfx:  { author: 'RhosGFX', license: 'CC0-1.0' },
};

const ROLES = { P: 'pawn', N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king' };

function raw(ref, file) {
  const [repo, sha] = ref.split('@');
  return `https://raw.githubusercontent.com/${repo}/${sha}/${file}`;
}

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function write(rel, text) {
  const out = path.join(vendorDir, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, text);
  console.log('Wrote ' + path.relative(root, out));
}

async function pieces() {
  const licenses = ['# Piece sets', '', `Fetched from ${LILA} (public/piece/). ${NOTE}`, '',
    '| Set | Author | License |', '|---|---|---|',
    '| cburnett (bundled with Chessground) | Colin M.L. Burnett | GPL-2.0-or-later |'];
  for (const [set, { author, license }] of Object.entries(PIECE_SETS)) {
    let css = `/* Vendored from ${LILA} (public/piece/${set}), by ${author}, ${license}. ${NOTE} */\n`;
    for (const color of ['w', 'b']) {
      for (const [letter, role] of Object.entries(ROLES)) {
        const svg = await get(raw(LILA, `public/piece/${set}/${color}${letter}.svg`));
        css += `.cg-wrap piece.${role}.${color === 'w' ? 'white' : 'black'} {\n` +
          `  background-image: url('data:image/svg+xml;base64,${svg.toString('base64')}');\n}\n`;
      }
    }
    write(`pieces/${set}.css`, css);
    licenses.push(`| ${set} | ${author} | ${license} |`);
  }
  write('pieces/LICENSES.md', licenses.join('\n') + '\n');
}

// Position key: placement, side to move, castling and en passant, without
// the move counters, so transpositions match.
const epd = (fen) => fen.split(' ').slice(0, 4).join(' ');

async function openings() {
  const table = {};
  // How many listed lines pass through each position: a rough measure of how
  // much theory, and so how much play, a move leads into.
  const through = {};
  for (const f of ['a', 'b', 'c', 'd', 'e']) {
    const tsv = (await get(raw(OPENINGS, f + '.tsv'))).toString('utf8');
    for (const row of tsv.split('\n').slice(1)) {
      if (!row.trim()) continue;
      const [eco, name, pgn] = row.split('\t');
      const chess = new Chess();
      chess.loadPgn(pgn);
      const seen = new Set(chess.history({ verbose: true }).map((m) => epd(m.after)));
      for (const k of seen) through[k] = (through[k] || 0) + 1;
      const key = epd(chess.fen());
      // A position reached by several listed lines keeps its first name, as
      // on Lichess.
      if (!table[key]) table[key] = [eco, name];
    }
  }
  for (const k in table) table[k].push(through[k]);
  write('openings.js',
    `// Vendored from ${OPENINGS} (a–e.tsv, CC0-1.0). ${NOTE}\n` +
    '// Position (FEN without the move counters) → [ECO code, opening name,\n' +
    '// number of listed lines through it].\n' +
    'export default ' + JSON.stringify(table).replace(/\],"/g, '],\n"') + ';\n');
}

await pieces();
await openings();
