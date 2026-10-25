#!/usr/bin/env node
/* Regenerates the files in src/vendor/ from the installed npm packages:
   - chess.js: move generation, SAN and PGN parsing (ES module build).
   - chessground.js + chessground.*.css: the Lichess board UI and pieces.
   - stockfish.js + stockfish.wasm: the single-threaded Stockfish 19 lite build,
     which runs in a plain Web Worker (no cross-origin isolation needed, so it
     works on GitHub Pages). The loader finds the .wasm by swapping the
     worker script's extension, so the two must keep matching names.

   Usage: npm install && npm run sync-vendor */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendorDir = path.join(root, 'src', 'vendor');
const NOTE = 'Do not edit by hand — run `npm run sync-vendor` in chessreview/ instead.';

function pkgDir(name) {
  return path.join(root, 'node_modules', ...name.split('/'));
}

function version(name) {
  return JSON.parse(fs.readFileSync(path.join(pkgDir(name), 'package.json'), 'utf8')).version;
}

function copy(name, from, to, comment) {
  const src = path.join(pkgDir(name), from);
  if (!fs.existsSync(src)) {
    console.error('Expected vendor source missing: ' + src);
    process.exit(1);
  }
  const out = path.join(vendorDir, to);
  if (comment) {
    const banner = comment('Vendored from ' + name + '@' + version(name) + ' (' + from + '). ' + NOTE);
    // Source maps aren't vendored, so drop the comment pointing at them.
    const body = fs.readFileSync(src, 'utf8').replace(/^\/\/# sourceMappingURL=.*$/m, '');
    fs.writeFileSync(out, banner + '\n' + body);
  } else {
    fs.copyFileSync(src, out);
  }
  console.log('Wrote ' + path.relative(root, out));
}

const js = (s) => '// ' + s;
const css = (s) => '/* ' + s + ' */';

fs.mkdirSync(vendorDir, { recursive: true });
copy('chess.js', 'dist/esm/chess.js', 'chess.js', js);
copy('@lichess-org/chessground', 'dist/chessground.min.js', 'chessground.js', js);
for (const f of ['base', 'brown', 'cburnett']) {
  copy('@lichess-org/chessground', 'assets/chessground.' + f + '.css', 'chessground.' + f + '.css', css);
}
copy('stockfish', 'bin/stockfish-19-lite-single.js', 'stockfish.js', js);
copy('stockfish', 'bin/stockfish-19-lite-single.wasm', 'stockfish.wasm');
// chess.js is BSD-licensed, which asks for its notice to travel with it.
// (Chessground and Stockfish are GPL-3.0, the same as this utility.)
copy('chess.js', 'LICENSE', 'LICENSE.chess.js');
