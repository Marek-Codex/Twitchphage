// ==UserScript==
// @name         Twitchphage
// @namespace    https://github.com/Marek-Codex/Twitchphage
// @version      1.3.5
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
 * bridge — a userscript already lives in the real page world, so we wrap
 * window.Worker directly.
 *
 *   - adblock.js is inlined below as a string and concatenated into the player
 *     worker, because a userscript has no chrome-extension:// resource URL to
 *     importScripts(). Same result, one self-contained file.
 *
 * We USED to also swap the token's playerType here; live testing showed it made
 * the player reload onto a capped stream at every ad break, so it's gone. We
 * stay on Twitch's full-quality source stream and surgically strip ad segments.
 * See the note in src/page.js. Don't re-add it. You were too much, clever idea.
 *
 * GENERATED FILE. Don't hand-edit: change src/adblock.js or this template, then
 * run `node tools/build-userscript.js`. It's basically a cat copy-pasting itself
 * into a worker and hoping Twitch doesn't notice. It notices.
 * ==========================================================================*/
(function () {
  'use strict';

  // One install per page. We are not in the business of double-wrapping fetch.
  if (window.__twitchphageUser) return;
  window.__twitchphageUser = true;

  // The worker-context script, inlined verbatim from src/adblock.js. That's the
  // whole payload — it strips stitched ad segments out of the playlist.
  const ADBLOCK = "__ADBLOCK_JS__";

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

      super(target, options);
    }
  };
})();
