#!/usr/bin/env node
/* Regenerates src/vendor/qrcode.js from the installed qrcode-generator
   package: the core library plus the UTF-8 addon (which makes UTF-8 the
   default text encoding), concatenated into one classic script.

   Usage: npm install && npm run sync-vendor */
'use strict';

const fs = require('fs');
const path = require('path');

const core = require.resolve('qrcode-generator'); // …/dist/qrcode.js
const utf8 = path.join(path.dirname(core), 'qrcode_UTF8.js');
const out = path.join(__dirname, '..', 'src', 'vendor', 'qrcode.js');

for (const f of [core, utf8]) {
  if (!fs.existsSync(f)) {
    console.error('Expected file missing from qrcode-generator package: ' + f);
    process.exit(1);
  }
}

const pkgJson = path.join(path.dirname(core), '..', 'package.json');
const version = JSON.parse(fs.readFileSync(pkgJson, 'utf8')).version;
const banner = '// Vendored from qrcode-generator@' + version +
  ' (dist/qrcode.js + dist/qrcode_UTF8.js).\n' +
  '// Do not edit by hand — run `npm run sync-vendor` in qrcodemaker/ instead.\n\n';

fs.writeFileSync(out, banner + fs.readFileSync(core, 'utf8') + '\n' + fs.readFileSync(utf8, 'utf8'));
console.log('Wrote ' + path.relative(process.cwd(), out) + ' from qrcode-generator@' + version);
