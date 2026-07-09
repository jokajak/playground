#!/usr/bin/env node
/* Regenerates the files in src/vendor/ from the installed npm packages:
   - qrcode.js: qrcode-generator core plus the UTF-8 addon (which makes
     UTF-8 the default text encoding), concatenated into one classic script.
   - jsqr.js: the jsQR decoder, used for the live scannability badge.

   Usage: npm install && npm run sync-vendor */
'use strict';

const fs = require('fs');
const path = require('path');

const NOTE = '// Do not edit by hand — run `npm run sync-vendor` in qrcodemaker/ instead.\n\n';

function packageVersion(resolvedFile) {
  let dir = path.dirname(resolvedFile);
  while (!fs.existsSync(path.join(dir, 'package.json'))) dir = path.dirname(dir);
  return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
}

function write(out, banner, files) {
  for (const f of files) {
    if (!fs.existsSync(f)) {
      console.error('Expected vendor source missing: ' + f);
      process.exit(1);
    }
  }
  const body = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  fs.writeFileSync(out, banner + NOTE + body);
  console.log('Wrote ' + path.relative(process.cwd(), out));
}

const vendorDir = path.join(__dirname, '..', 'src', 'vendor');

const qrCore = require.resolve('qrcode-generator'); // …/dist/qrcode.js
write(
  path.join(vendorDir, 'qrcode.js'),
  '// Vendored from qrcode-generator@' + packageVersion(qrCore) +
    ' (dist/qrcode.js + dist/qrcode_UTF8.js).\n',
  [qrCore, path.join(path.dirname(qrCore), 'qrcode_UTF8.js')]
);

const jsqr = require.resolve('jsqr'); // …/dist/jsQR.js
write(
  path.join(vendorDir, 'jsqr.js'),
  '// Vendored from jsqr@' + packageVersion(jsqr) + ' (dist/jsQR.js).\n',
  [jsqr]
);
