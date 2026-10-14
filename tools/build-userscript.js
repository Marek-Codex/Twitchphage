/* ============================================================================
 * build-userscript.js  —  regenerates Twitchphage.user.js from source.
 *
 * Why this exists: the userscript has to inline adblock.js as a STRING (a
 * userscript has no chrome-extension:// resource URLs). Rather than hand-copy
 * it and let it drift, this reads the real src/ file and splices it in with
 * JSON.stringify (which escapes backticks, ${...}, backslashes — all the nasty
 * stuff — correctly, unlike doing it by hand at 3am).
 *
 * Usage:   node tools/build-userscript.js
 * Node only. End users never run this — Twitchphage.user.js is committed
 * ready-to-install. This is for US, the maintainer, so the extension build and
 * the userscript build can't silently diverge. Which they would. They always do.
 * ==========================================================================*/
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''); // strip BOM if any

const template = read(path.join(__dirname, 'Twitchphage.user.template.js'));
const adblock = read(path.join(root, 'src', 'adblock.js'));

const ADBLOCK_TOKEN = '"__ADBLOCK_JS__"';

if (!template.includes(ADBLOCK_TOKEN)) {
  console.error('Template marker missing — refusing to build a broken userscript.');
  process.exit(1);
}

const out = template.replace(ADBLOCK_TOKEN, JSON.stringify(adblock));

const dest = path.join(root, 'userscript', 'Twitchphage.user.js');
fs.mkdirSync(path.dirname(dest), { recursive: true }); // in case userscript/ doesn't exist yet
fs.writeFileSync(dest, out);

console.log(
  `Built Twitchphage.user.js — ${Buffer.byteLength(out)} bytes ` +
  `(adblock ${Buffer.byteLength(adblock)}B inlined)`
);
