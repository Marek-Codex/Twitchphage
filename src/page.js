/* ============================================================================
 * Twitchphage :: page.js  —  the "MAIN world" hook. Runs as a real page script.
 *
 * Two jobs, and neither one hardcodes anything fragile. That's the whole point.
 *
 *   1. THE CLEAN-STREAM SWAP. Twitch stitches ads server-side, but some player
 *      types (popout/embed/autoplay) historically get UNSTITCHED streams. So we
 *      hook window.fetch, and the instant Twitch's own frontend asks for a
 *      PlaybackAccessToken, we quietly swap its `playerType` to `popout`. Twitch
 *      then hands back a clean token using ITS OWN current sha256Hash, integrity
 *      token, device-id — all of which rotate on their schedule, not ours. We
 *      never paste in a hash that goes stale. Twitch keeps us current for free.
 *      It's not a hack, it's a strongly-worded suggestion to their own API.
 *
 *   2. THE WORKER HIJACK. Same cosplay as Twitchphobe: subclass window.Worker,
 *      slip adblock.js into the IVS player worker. That's the fallback — if any
 *      ad segments still sneak through, adblock.js strips them from the m3u8.
 *
 * The bits that actually break when Twitch changes things are ALL up here in
 * CONFIG. When it rots, a contributor updates two or three strings and nothing
 * else. That's the deal. nyaa~
 * ==========================================================================*/
(() => {
  'use strict';

  const script = document.currentScript;
  const adblockUrl = script && script.dataset ? script.dataset.adblock : null;
  if (!adblockUrl) return;

  /* --------------------------------------------------------------------------
     THE ARMS-RACE SURFACE. Everything volatile lives here. If Twitch shifts
     and Twitchphage dies, it's almost certainly one of these three lines.
     Update them, ship, go back to your coffee. --------------------------------- */
  const CONFIG = {
    /* Which playerType gets an ad-free stream. 'popout' is the reliable one;
       'embed' and 'autoplay' are backups if popout ever gets ads stitched in. */
    cleanPlayerType: 'popout',
    backupPlayerTypes: ['embed', 'autoplay'],

    /* The signifier Twitch drops into an ad-stitched m3u8. If they rename the
       marker, this is the string that needs the new name. */
    adSignifier: 'stitched'
  };

  // Live values we sniff off Twitch's OWN requests and hand to the worker, so
  // the worker can make authenticated token requests without us storing a thing.
  let live = {
    deviceId: null,
    clientVersion: null,
    clientSession: null,
    clientIntegrity: null,
    authorization: undefined
  };

  const workers = new Set();

  const toWorker = (key, value) => {
    live[key] = value;
    // Fan out to every Twitch worker we've spawned. Best-effort; if one's gone,
    // it's gone. We are not in the business of grieving dead workers.
    workers.forEach((w) => { try { w.postMessage({ key, value }); } catch {} });
  };

  /* ---- JOB 1: hook window.fetch --------------------------------------------
     We watch for Twitch's GQL traffic. Two things happen when we see it:
       (a) harvest the live auth headers (so the worker can reuse them), and
       (b) rewrite the playerType on any PlaybackAccessToken request to 'popout'. */
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

        // The clean-stream swap. Parse Twitch's own body, flip the playerType,
        // re-serialize. If parsing ever fails we just... don't. Twitch keeps
        // its original request and we fall back to segment-stripping instead.
        if (init.body.includes('PlaybackAccessToken')) {
          const body = JSON.parse(init.body);
          const flip = (op) => {
            if (op && op.variables && op.variables.playerType &&
                op.variables.playerType !== CONFIG.cleanPlayerType) {
              op.variables.playerType = CONFIG.cleanPlayerType;
            }
          };
          if (Array.isArray(body)) body.forEach(flip); else flip(body);
          init = { ...init, body: JSON.stringify(body) };
        }
      }
    } catch (err) {
      // Any parse hiccup -> hand Twitch its original request, untouched.
      // Failing closed to "do nothing" is the safe failure mode here.
    }
    return realFetch.apply(this, [url, init, ...rest]);
  };

  /* ---- JOB 2: hijack the player worker -------------------------------------
     Identical bones to Twitchphobe's page.js, because it's the proven way to
     get code inside the IVS player's blob: worker. Blocking synchronous read,
     prepend importScripts, rebuild the blob. Gross. Works. Don't touch. ------- */
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
          target = URL.createObjectURL(
            new Blob(
              [`importScripts(${JSON.stringify(adblockUrl)});\n`, source],
              { type: 'text/javascript' }
            )
          );
        } catch (err) {
          target = url;
        }
      }

      const worker = super(target, options);
      workers.add(worker);
      // The worker pings for fresh live values (e.g. after a reload). Answer.
      worker.addEventListener('message', (e) => {
        if (e.data && e.data.__twitchphage_wants_live) {
          try { worker.postMessage({ key: 'LiveValues', value: live }); } catch {}
        }
      });
      return worker;
    }
  };
})();
