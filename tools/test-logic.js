/* Twitchphage logic test — proves the two load-bearing pieces before we trust them.
   Run: node tools/test-logic.js
   No browser, no Twitch. Just the pure logic, in a vm sandbox. ------------------ */
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

function makeResponseClass() {
  return class Response {
    constructor(b, o){ this._b = b; this.status = (o||{}).status; this.headers = (o||{}).headers || {}; }
    async text(){ return this._b; }
  };
}

(async () => {
  /* ---- TEST 1: stripAds removes ad segments, keeps content ----------------- */
  const Response = makeResponseClass();
  const sb2 = { self: {}, Request: class { constructor(u){ this.url = u; } }, Response };
  sb2.self.fetch = () => Promise.resolve(new Response(AD_PLAYLIST, { status: 200 }));
  vm.createContext(sb2);
  vm.runInContext(adblockSrc, sb2);

  const res = await sb2.self.fetch('https://video-weaver.example/index.m3u8');
  const out = await res.text();

  ok('ad segments blanked (no ad-segment URLs survive)',
     !out.includes('ad-segment-0.ts') && !out.includes('ad-segment-2.ts'));
  ok('content segments preserved',
     out.includes('content-segment-0.ts') && out.includes('content-segment-1.ts'));
  ok('prefetch hint stripped', !out.includes('ad-segment-1.ts'));
  ok('ad tracking URL neutered to twitch.tv',
     out.includes('X-TV-TWITCH-AD-URL="https://twitch.tv"'));
  ok('content-type set to HLS mime', res.headers['Content-Type'] === 'application/vnd.apple.mpegurl');

  /* ---- TEST 2: playerType swap rewrites Twitch's token request ------------- */
  const Response2 = makeResponseClass();
  const sb3 = {
    console,
    URL: { createObjectURL: () => 'blob:fake' },
    Blob: class Blob { constructor(parts){ this.parts = parts; } },
    XMLHttpRequest: class { open(){} overrideMimeType(){} send(){ this.responseText=''; } },
    document: { currentScript: { dataset: { adblock: 'chrome-ext://adblock.js' } } },
    Response: Response2
  };
  sb3.window = sb3;
  let sentInit = null;
  sb3.window.fetch = function(url, init){ sentInit = init; return Promise.resolve(new Response2('{}', {status:200})); };
  sb3.window.Worker = class Worker { constructor(u,o){ this.url=u; } addEventListener(){} };
  vm.createContext(sb3);
  vm.runInContext(pageSrc, sb3);

  const tokenBody = JSON.stringify({
    operationName: 'PlaybackAccessToken',
    variables: { isLive: true, login: 'somechannel', isVod: false, vodID: '', playerType: 'site', platform: 'web' },
    extensions: { persistedQuery: { version: 1, sha256Hash: 'deadbeef' } }
  });
  await sb3.window.fetch('https://gql.twitch.tv/gql', { method: 'POST', headers: { 'Client-Id': 'x', 'Client-Integrity': 'tok' }, body: tokenBody });

  const sent = JSON.parse(sentInit.body);
  ok('playerType swapped site -> popout', sent.variables.playerType === 'popout');
  ok('persistedQuery hash preserved (we did NOT overwrite it)', sent.extensions.persistedQuery.sha256Hash === 'deadbeef');
  ok('operationName preserved', sent.operationName === 'PlaybackAccessToken');

  /* ---- TEST 3: non-token GQL requests pass through untouched --------------- */
  let passthroughBody = null;
  sb3.window.fetch = function(url, init){ passthroughBody = init.body; return Promise.resolve(new Response2('{}', {status:200})); };
  vm.runInContext(pageSrc, sb3);
  const otherBody = JSON.stringify({ operationName: 'SomeOtherQuery', variables: { playerType: 'site' } });
  await sb3.window.fetch('https://gql.twitch.tv/gql', { method:'POST', headers:{}, body: otherBody });
  ok('non-PlaybackAccessToken body untouched', passthroughBody === otherBody);

  /* ---- TEST 4: live auth headers harvested + forwarded to worker ----------- */
  const Response4 = makeResponseClass();
  const s4 = {
    console, URL: { createObjectURL: () => 'blob:fake' },
    Blob: class Blob { constructor(p){ this.parts=p; } },
    XMLHttpRequest: class { open(){} overrideMimeType(){} send(){ this.responseText=''; } },
    document: { currentScript: { dataset: { adblock: 'x' } } },
    Response: Response4
  };
  s4.window = s4;
  const posted = [];
  s4.window.fetch = () => Promise.resolve(new Response4('{}', {status:200}));
  s4.window.Worker = class Worker {
    constructor(u,o){ this.url=u; }
    addEventListener(){}
    postMessage(m){ posted.push(m); }
  };
  vm.createContext(s4);
  vm.runInContext(pageSrc, s4);
  // Construct a Twitch worker FIRST so it's registered in the `workers` set and
  // will actually receive the forwarded live values. (blob: URL = inline path.)
  new s4.window.Worker('blob:https://player.twitch.tv/worker');
  await s4.window.fetch('https://gql.twitch.tv/gql', {
    method:'POST',
    headers: { 'Client-Integrity': 'integrity-abc', 'Client-Version': '1.2.3', 'X-Device-Id': 'dev-123' },
    body: JSON.stringify({ operationName: 'PlaybackAccessToken', variables: { playerType: 'site' } })
  });
  const keys = posted.map(p => p.key);
  ok('harvests Client-Integrity', keys.includes('clientIntegrity'));
  ok('harvests Client-Version', keys.includes('clientVersion'));
  ok('harvests X-Device-Id', keys.includes('deviceId'));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('test harness error:', e); process.exit(1); });

