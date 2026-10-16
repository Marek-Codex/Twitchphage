/* Twitchphage logic test — proves the core ad-strip works before we trust it.
   Run: node tools/test-logic.js
   No browser, no Twitch. Just the pure logic, in a vm sandbox. ------------------

   NOTE: this used to also unit-test the token playerType swap. We deleted the
   swap (live testing showed it reloaded the player onto a capped stream at
   every ad break). Now the strip in adblock.js IS the whole mechanism, and
   page.js is just the worker-hijack — so the tests below focus there. -------- */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name); } };

const adblockSrc = fs.readFileSync(path.join(root, 'src', 'adblock.js'), 'utf8');
const pageSrc = fs.readFileSync(path.join(root, 'src', 'page.js'), 'utf8');

const AD_PLAYLIST = [
  '#EXTM3U',
  '#EXT-X-TARGETDURATION:2',
  '#STITCH-stitched-ad',
  '#EXTINF:30.000,',
  'https://video-weaver.example/ad-segment-0.ts',
  '#EXT-X-TWITCH-PREFETCH:https://video-weaver.example/ad-segment-1.ts',
  '#EXTINF:2.000,live',
  'https://video-weaver.example/content-segment-0.ts',
  '#EXT-X-TV-TWITCH-AD-URL="https://adserver.example/click"',
  '#EXTINF:15.000,',
  'https://video-weaver.example/ad-segment-2.ts',
  '#EXTINF:2.000,live',
  'https://video-weaver.example/content-segment-1.ts',
  '#EXT-X-ENDLIST'
].join('\n');

const CLEAN_PLAYLIST = [
  '#EXTM3U',
  '#EXT-X-TARGETDURATION:2',
  '#EXTINF:2.000,live',
  'https://video-weaver.example/content-segment-0.ts',
  '#EXTINF:2.000,live',
  'https://video-weaver.example/content-segment-1.ts',
  '#EXT-X-ENDLIST'
].join('\n');

function makeResponseClass() {
  return class Response {
    constructor(b, o){ this._b = b; this.status = (o||{}).status; this.headers = (o||{}).headers || {}; }
    async text(){ return this._b; }
  };
}

function runAdblock(playlist) {
  const Response = makeResponseClass();
  const sb = { self: {}, Request: class { constructor(u){ this.url = u; } }, Response };
  sb.self.fetch = () => Promise.resolve(new Response(playlist, { status: 200 }));
  vm.createContext(sb);
  vm.runInContext(adblockSrc, sb);
  return sb.self.fetch('https://video-weaver.example/index.m3u8');
}

(async () => {
  /* ---- TEST 1: strip removes ad segments, keeps content ------------------- */
  const res = await runAdblock(AD_PLAYLIST);
  const out = await res.text();

  ok('ad segments blanked (no ad-segment URLs survive)',
     !out.includes('ad-segment-0.ts') && !out.includes('ad-segment-2.ts'));
  ok('content segments preserved',
     out.includes('content-segment-0.ts') && out.includes('content-segment-1.ts'));
  ok('prefetch hint stripped', !out.includes('ad-segment-1.ts'));
  ok('ad tracking URL neutered to twitch.tv',
     out.includes('X-TV-TWITCH-AD-URL="https://twitch.tv"'));
  ok('content-type set to HLS mime', res.headers['Content-Type'] === 'application/vnd.apple.mpegurl');

  /* ---- TEST 2: a clean playlist passes through untouched (no lies injected) - */
  const cres = await runAdblock(CLEAN_PLAYLIST);
  const cout = await cres.text();
  ok('clean playlist: content preserved', cout.includes('content-segment-0.ts') && cout.includes('content-segment-1.ts'));
  ok('clean playlist: no blank clip injected (no fabrication)', !cout.includes('data:video/mp4;base64'));

  /* ---- TEST 3: page.js hijacks window.Worker (the injection still happens) -- */
  const Native = class Worker { constructor(u, o){ this.url = u; } };
  const sb3 = {
    console,
    URL: { createObjectURL: () => 'blob:fake' },
    Blob: class Blob { constructor(parts){ this.parts = parts; } },
    XMLHttpRequest: class { open(){} overrideMimeType(){} send(){ this.responseText = ''; } },
    document: { currentScript: { dataset: { adblock: 'chrome-ext://adblock.js' } } }
  };
  sb3.window = sb3;
  sb3.window.Worker = Native;
  vm.createContext(sb3);
  vm.runInContext(pageSrc, sb3);
  ok('page.js wraps window.Worker', sb3.window.Worker !== Native);

  /* ---- TEST 4: without an adblock URL, page.js bails safely --------------- */
  const Native4 = class Worker { constructor(u, o){ this.url = u; } };
  const sb4 = {
    console,
    URL: { createObjectURL: () => 'blob:fake' },
    Blob: class Blob { constructor(parts){ this.parts = parts; } },
    XMLHttpRequest: class { open(){} overrideMimeType(){} send(){ this.responseText = ''; } },
    document: { currentScript: { dataset: {} } }   // no adblock URL -> should not touch Worker
  };
  sb4.window = sb4;
  sb4.window.Worker = Native4;
  vm.createContext(sb4);
  vm.runInContext(pageSrc, sb4);
  ok('page.js no-ops (leaves Worker alone) without adblock URL', sb4.window.Worker === Native4);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('test harness error:', e); process.exit(1); });
