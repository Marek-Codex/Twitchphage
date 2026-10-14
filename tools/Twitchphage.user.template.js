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
  const ADBLOCK = "__ADBLOCK_JS__";

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
