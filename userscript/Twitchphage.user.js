// ==UserScript==
// @name         Twitchphage
// @namespace    https://github.com/Marek-Codex/Twitchphage
// @version      1.0.0
// @description  Block Twitch ads without a proxy or a backend. Lightweight, no build step, runs entirely client-side. It eats the ads. nyaa~
// @author       Marek-Codex
// @match        *://*.twitch.tv/*
// @icon         https://raw.githubusercontent.com/Marek-Codex/Twitchphage/main/icons/icon128.png
// @grant        none
// @inject-into  page
// @run-at       document-start
// @all-frames   true
// @license      Apache-2.0
// ==/UserScript==

/* ============================================================================
 * Twitchphage :: userscript build (page context).
 * Same trick as the extension, minus the manifest and the content-script
 * bridge — a userscript already lives in the real page world, so we can hook
 * window.fetch and wrap window.Worker directly.
 *
 *   - The playerType swap happens right here in the page (the future-proof bit:
 *     we ride Twitch's own live token request and just ask for a clean stream).
 *   - adblock.js is inlined below as a string and concatenated into the player
 *     worker, because a userscript has no chrome-extension:// resource URL to
 *     importScripts(). Same result, one self-contained file.
 *
 * GENERATED FILE. Don't hand-edit: change src/adblock.js or the ported logic
 * here, then run `node tools/build-userscript.js`. It's basically a cat
 * copy-pasting itself into a worker and hoping Twitch doesn't notice. It notices.
 * ==========================================================================*/
(function () {
  'use strict';

  // One install per page. We are not in the business of double-wrapping fetch.
  if (window.__twitchphageUser) return;
  window.__twitchphageUser = true;

  /* The arms-race surface, ported from page.js. If Twitchphage breaks, it's
     almost certainly one of these. Update here (and in src/page.js), rebuild. */
  const CONFIG = {
    cleanPlayerType: 'popout',
    backupPlayerTypes: ['embed', 'autoplay'],
    adSignifier: 'stitched'
  };

  // The worker-context script, inlined verbatim from src/adblock.js.
  const ADBLOCK = "/* ============================================================================\r\n * Twitchphage :: adblock.js  —  runs INSIDE Twitch's player worker (imported\r\n * by page.js right after the worker boots). This is the FALLBACK layer.\r\n *\r\n * The clean-stream swap in page.js is the star — it asks Twitch for an ad-free\r\n * stream up front. But Twitch is Twitch, and sometimes an ad segment still\r\n * squeaks through (midrolls especially). So we sit on the worker's fetch and,\r\n * whenever an .m3u8 comes back carrying the ad signifier, we surgically remove\r\n * the ad segments before the player ever parses them.\r\n *\r\n * How we tell an ad from content, in one line: Twitch tags real content\r\n * segments with `,live` in their #EXTINF duration line; ad segments don't get\r\n * that tag. So a segment whose #EXTINF lacks `,live` is an ad. We also blank the\r\n * prefetch hints (so the player can't pre-buffer an ad) and neuter the ad\r\n * click-tracking URLs (so the overlay can't phone home). Re-upholstery, again.\r\n * ==========================================================================*/\r\n(() => {\r\n  'use strict';\r\n\r\n  // One brain per worker. importScripts is not shy about running us twice.\r\n  if (self.__twitchphageAdblock) return;\r\n  self.__twitchphageAdblock = true;\r\n\r\n  /* The arms race in ONE string. When Twitch renames the stitched marker, this\r\n     is the line a contributor changes. Everything else here is stable. -------- */\r\n  const AD_SIGNIFIER = 'stitched';\r\n\r\n  // A 1-frame silent black clip, served in place of a stripped ad segment so the\r\n  // player's segment count still adds up and it doesn't stall waiting on bytes\r\n  // that no longer exist. Base64 fMP4, ~200 bytes. Tiny. Effective. nyaa~\r\n  const BLANK_CLIP =\r\n    'data:video/mp4;base64,AAAAKGZ0eXBtcDQyAAAAAWlzb21tcDQyZGFzaGF2YzFpc282aGxzZgAABEltb292' +\r\n    'AAAAbG12aGQAAAAAAAAAAAAAAAAAAYagAAAAAAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEA' +\r\n    'AAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAABqHRyYWsAAABcdGtoZAAA' +\r\n    'AAMAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAA' +\r\n    'AAAAAAEAAAAAAAAAAAAAAAAAAAURtZGlhAAAAIG1kaGQAAAAAAAAAAAAAAAAAALuAAAAAAFXEAAAAAAAtaGRscg' +\r\n    'AAAAAAAAAAc291bgAAAAAAAAAAAAAAAFNvdW5kSGFuZGxlcgAAAADvbWluZgAAABBzbWhkAAAAAAAAAAAAAAAk' +\r\n    'ZGluZgAAABxkcmVmAAAAAAAAAAEAAAAMdXJsIAAAAAEAAACzc3RibAAAAGdzdHNkAAAAAAAAAAEAAABXbXA0YQ' +\r\n    'AAAAAAAAABAAAAAAAAAAAAAgAQAAAAALuAAAAAAAAzZXNkcwAAAAADgICAIgABAASAgIAUQBUAAAAAAAAAAAA' +\r\n    'AAAAWAgIACEZAGgICAAQIAAAAQc3R0cwAAAAAAAAAAAAAAEHN0Y2MAAAAAAAAAAAAAABRzdHN6AAAAAAAAAAAA' +\r\n    'AAAAAAAAEHN0Y28AAAAAAAAAAAAAAeV0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAA' +\r\n    'AAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAoAAAAFoAAAAAAGBbWRpYQAAACBtZGhk' +\r\n    'AAAAAAAAAAAAAAAAAA9CQAAAAABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRs' +\r\n    'ZXIAAAABLG1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAA' +\r\n    'AQAAAOxzdGJsAAAAoHN0c2QAAAAAAAAAAQAAAJBhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAoABaABIAAAAS' +\r\n    'AAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGP//AAAAOmF2Y0MBTUAe/+EAI2dNQB6WUoF' +\r\n    'AX/LgLUBAQFAAAD6AAA6mDgAAHoQAA9CW7y4KAQAEaOuPIAAAABBzdHRzAAAAAAAAAAAAAAAQc3RzYwAAAAAAAA' +\r\n    'AAAAAAFHN0c3oAAAAAAAAAAAAAAAAAAAAQc3RjbwAAAAAAAAAAAAAASG12ZXgAAAAgdHJleAAAAAAAAAABAAAAAQ' +\r\n    'AAAC4AAAAAAoAAAAAAACB0cmV4AAAAAAAAAAIAAAABAACCNQAAAAACQAAA';\r\n\r\n  const nativeFetch = self.fetch.bind(self);\r\n\r\n  /* stripAds: take a raw m3u8 that contains ad segments and return a cleaned\r\n     one. We keep every content segment, blank every ad segment, drop prefetch\r\n     hints, and rewrite tracking URLs to a dead end. --------------------------- */\r\n  const stripAds = (text) => {\r\n    const lines = text.replace(/\\r/g, '').split('\\n');\r\n    let sawAds = false;\r\n\r\n    for (let i = 0; i < lines.length; i++) {\r\n      let line = lines[i];\r\n\r\n      // Neutize the ad overlay's tracking URLs so the ad UI can't phone home.\r\n      line = line\r\n        .replace(/(X-TV-TWITCH-AD-URL=\")[^\"]*(\")/g, '$1https://twitch.tv$2')\r\n        .replace(/(X-TV-TWITCH-AD-CLICK-TRACKING-URL=\")[^\"]*(\")/g, '$1https://twitch.tv$2');\r\n      lines[i] = line;\r\n\r\n      // A segment whose #EXTINF line lacks \",live\" is an ad. Swap the NEXT line\r\n      // (the segment URL) for our blank clip so the player stays in sync.\r\n      if (i < lines.length - 1 && line.startsWith('#EXTINF') && !line.includes(',live')) {\r\n        lines[i + 1] = BLANK_CLIP;\r\n        sawAds = true;\r\n      }\r\n\r\n      if (line.includes(AD_SIGNIFIER)) sawAds = true;\r\n\r\n      // No low-latency prefetch during ads — otherwise the player races ahead\r\n      // and buffers an ad segment before we've had our coffee. Strip the hints.\r\n      if (sawAds && line.startsWith('#EXT-X-TWITCH-PREFETCH:')) lines[i] = '';\r\n    }\r\n\r\n    return lines.join('\\n');\r\n  };\r\n\r\n  /* The vise. Wrap the worker's fetch; when an .m3u8 comes back carrying ads,\r\n     hand the player a cleaned playlist. Everything else passes straight through,\r\n     unbothered, moisturized. --------------------------------------------------- */\r\n  self.fetch = async (input, init) => {\r\n    const url =\r\n      typeof input === 'string' ? input\r\n      : input instanceof Request ? input.url\r\n      : String(input);\r\n\r\n    const response = await nativeFetch(input, init);\r\n\r\n    // Only touch HLS playlists. And only when they actually contain the signifier\r\n    // — no point rewriting a clean playlist and risking a typo breaking playback.\r\n    const cleanUrl = url.split('?')[0];\r\n    if (cleanUrl.endsWith('.m3u8') || cleanUrl.endsWith('m3u8')) {\r\n      try {\r\n        const body = await response.text();\r\n        if (body.includes(AD_SIGNIFIER)) {\r\n          const cleaned = stripAds(body);\r\n          return new Response(cleaned, {\r\n            status: response.status,\r\n            headers: { 'Content-Type': 'application/vnd.apple.mpegurl' }\r\n          });\r\n        }\r\n        // No ads in this one — reconstruct the Response since we consumed the body.\r\n        return new Response(body, {\r\n          status: response.status,\r\n          headers: { 'Content-Type': 'application/vnd.apple.mpegurl' }\r\n        });\r\n      } catch (err) {\r\n        // If reading/rewriting fails, fall back to the original response.\r\n        return response;\r\n      }\r\n    }\r\n\r\n    return response;\r\n  };\r\n})();\r\n";

  // Live values sniffed off Twitch's own GQL requests, forwarded to the worker
  // so it could make authenticated token requests if it ever needs to.
  let live = { deviceId: null, clientVersion: null, clientSession: null, clientIntegrity: null, authorization: undefined };
  const workers = new Set();
  const toWorker = (key, value) => {
    live[key] = value;
    workers.forEach((w) => { try { w.postMessage({ key, value }); } catch {} });
  };

  /* --- hook window.fetch (ported from page.js) ------------------------------
     Two jobs on Twitch's GQL traffic: harvest the live auth headers, and swap
     the playerType on any PlaybackAccessToken request to 'popout' so Twitch
     hands back an unstitched stream using ITS OWN current credentials. -------- */
  const realFetch = window.fetch;
  window.fetch = function (url, init, ...rest) {
    try {
      if (typeof url === 'string' && url.includes('gql') && init && typeof init.body === 'string') {
        const H = init.headers || {};
        const devId = H['X-Device-Id'] || H['Device-ID'];
        if (typeof devId === 'string') toWorker('deviceId', devId);
        if (typeof H['Client-Version'] === 'string') toWorker('clientVersion', H['Client-Version']);
        if (typeof H['Client-Session-Id'] === 'string') toWorker('clientSession', H['Client-Session-Id']);
        if (typeof H['Client-Integrity'] === 'string') toWorker('clientIntegrity', H['Client-Integrity']);
        if (typeof H['Authorization'] === 'string') toWorker('authorization', H['Authorization']);

        if (init.body.includes('PlaybackAccessToken')) {
          const body = JSON.parse(init.body);
          const flip = (op) => {
            if (op && op.variables && op.variables.playerType &&
                op.variables.playerType !== CONFIG.cleanPlayerType) {
              op.variables.playerType = CONFIG.cleanPlayerType;
            }
          };
          if (Array.isArray(body)) body.forEach(flip); else flip(body);
          init = Object.assign({}, init, { body: JSON.stringify(body) });
        }
      }
    } catch (err) {
      // Any parse hiccup -> hand Twitch its original request, untouched.
    }
    return realFetch.apply(this, [url, init, ...rest]);
  };

  /* --- wrap window.Worker (ported from page.js) -----------------------------
     Twitch's player is a blob: worker. We read its source, prepend our inlined
     adblock script, and hand back a NEW blob. No importScripts here because a
     userscript has no chrome-extension:// resource URL — so we concatenate the
     raw adblock source string instead. Same result, fewer moving parts. ------- */
  const NativeWorker = window.Worker;

  const readSync = (url) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, false);
    xhr.overrideMimeType('text/javascript');
    xhr.send();
    return xhr.responseText;
  };

  window.Worker = class Worker extends NativeWorker {
    constructor(url, options) {
      let target = url;

      const isModule = !!(options && options.type === 'module');
      const isInline = typeof url === 'string' && /^(blob|data):/.test(url);

      if (isInline && !isModule) {
        try {
          const source = readSync(url);
          const bootstrap = ADBLOCK + '\n' + source;
          target = URL.createObjectURL(new Blob([bootstrap], { type: 'text/javascript' }));
        } catch (err) {
          target = url; // if anything hiccups, hand back the boring original worker
        }
      }

      const worker = super(target, options);
      workers.add(worker);
      worker.addEventListener('message', (e) => {
        if (e.data && e.data.__twitchphage_wants_live) {
          try { worker.postMessage({ key: 'LiveValues', value: live }); } catch {}
        }
      });
      return worker;
    }
  };
})();
