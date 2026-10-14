/* ============================================================================
 * Twitchphage :: content.js  —  the "isolated world" courier.
 * Same trick as Twitchphobe: content scripts live in the kiddie-table sandbox
 * and can't touch window.Worker, so I yeet a real <script> at the page and let
 * page.js do the actual cosplay. I just carry the address. Like a cat dropping
 * a mouse on your porch and leaving. nyaa~
 * ==========================================================================*/
(() => {
  'use strict';

  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('src/page.js');
  script.dataset.adblock = chrome.runtime.getURL('src/adblock.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
})();
