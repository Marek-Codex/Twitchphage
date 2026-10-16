/* ============================================================================
 * Twitchphage :: content.js  —  the "isolated world" courier.
 * Same trick as Twitchphobe: content scripts live in the kiddie-table sandbox
 * and can't touch window.Worker, so I yeet a real <script> at the page and let
 * page.js do the actual cosplay. I just carry the address. Like a cat dropping
 * a mouse on your porch and leaving. nyaa~
 *
 * SECOND JOB: I also nudge the player out of ad-break stalls (see the buffering-
 * fix below). Isolated-world DOM work is my department — Twitchphobe taught me that.
 * ==========================================================================*/
(() => {
  'use strict';

  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('src/page.js');
  script.dataset.adblock = chrome.runtime.getURL('src/adblock.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);

  /* --- the buffering-fix: nudge a frozen live player -----------------------
     Ad breaks stall the player at the stitch boundary — we swap the ad segments
     for a blank clip, and the player sits spinning, waiting on bytes that aren't
     arriving in the shape it expected. Learned the move from the field: when a
     LIVE video is frozen mid-playback, a quick pause/play kicks the media engine
     out of the stall far faster than its own backoff. We poke the raw <video>
     element directly instead of walking React internals — the element is a
     stable DOM citizen, the React walk breaks every time Twitch refactors the
     player (and when it breaks it just silently stops, leaving you the stall).
     Self-limiting: only sustained freezes (1.2s), min 4s between nudges, so it
     can't fight real network buffering or loop. nyaa~ ---------------------------- */
  (() => {
    let v = null, last = 0, ticks = 0, lastNudge = 0;
    setInterval(() => {
      // (Re)acquire the video; it mounts late and is replaced on channel change.
      if (!v || !v.isConnected) {
        v = document.querySelector('video');
        ticks = 0;
        last = v ? v.currentTime : 0;
        return;
      }
      if (v.paused || v.seeking) { ticks = 0; last = v.currentTime; return; }

      if (v.currentTime === last) {
        if (++ticks >= 3 && Date.now() - lastNudge > 4000) {
          lastNudge = Date.now();
          ticks = 0;
          v.pause();
          // play() on the next frame so the pause actually registers with the engine.
          requestAnimationFrame(() => { Promise.resolve(v.play()).catch(() => {}); });
        }
      } else {
        ticks = 0;
      }
      last = v.currentTime;
    }, 400);
  })();
})();
