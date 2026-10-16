/* ============================================================================
 * Twitchphage :: page.js  —  the "MAIN world" hook. Runs as a real page script.
 *
 * One job: get adblock.js inside Twitch's IVS player worker. That's the whole
 * file. Same cosplay as Twitchphobe's page.js — subclass window.Worker, slip
 * our script in before the real worker boots. It's less "hacking" and more
 * "standing subtly behind someone in a group photo." nyaa~
 *
 * A NOTE ON WHAT USED TO BE HERE (a lesson, so nobody re-adds it): we used to
 * also hook window.fetch and swap the PlaybackAccessToken `playerType` to
 * 'popout' to try to get an unstitched "clean stream." Live testing proved that
 * was actively HARMFUL: every time Twitch re-issued the token at an ad break,
 * the swap flipped the stream identity, and the player RELOADED onto the capped
 * 'popout' rendition — potato quality, a few seconds of spinner, a volume
 * reset. The cleanroom principle (straight from Twitchphobe's patch.js): DON'T
 * replace the whole stream, just surgically remove the bad parts. So we deleted
 * the swap. We stay on Twitch's OWN full-quality source stream and let
 * adblock.js strip the stitched ad segments out of the playlist. No stream
 * swap, no reload, no potato. Rest in peace, clever idea. You were too much.
 * ==========================================================================*/
(() => {
  'use strict';

  const script = document.currentScript;
  const adblockUrl = script && script.dataset ? script.dataset.adblock : null;
  if (!adblockUrl) return;

  // Keep a leash on the REAL Worker so we can still summon the real thing.
  const NativeWorker = window.Worker;

  // Blocking synchronous read — yes, a sync XHR, the thing they warn you about.
  // But we NEED the worker's full source in hand before it constructs, and
  // there's no `await` in a constructor. Gross. Deprecated-adjacent. The only
  // way. We're all making choices. Twitchphobe taught us this one. -----------
  const readSync = (url) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, false);
    xhr.overrideMimeType('text/javascript');
    xhr.send();
    return xhr.responseText;
  };

  // We subclass the native Worker. Same face, different brain. *ear flick*
  window.Worker = class Worker extends NativeWorker {
    constructor(url, options) {
      let target = url;

      // Only INLINE blob:/data: workers that aren't modules. Twitch's IVS
      // player is exactly that. Narrow scope, minimal mischief.
      const isModule = !!(options && options.type === 'module');
      const isInline = typeof url === 'string' && /^(blob|data):/.test(url);

      if (isInline && !isModule) {
        try {
          const source = readSync(url);
          // Prepend adblock.js, then Twitch's original source. The worker runs
          // adblock FIRST — so fetch is already politely hooked when Twitch's
          // code asks for the stitched playlist. Order is everything.
          target = URL.createObjectURL(
            new Blob(
              [`importScripts(${JSON.stringify(adblockUrl)});\n`, source],
              { type: 'text/javascript' }
            )
          );
        } catch (err) {
          target = url; // anything goes wrong -> hand back the boring original
        }
      }

      super(target, options);
    }
  };
})();
