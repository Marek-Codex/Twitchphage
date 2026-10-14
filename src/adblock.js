/* ============================================================================
 * Twitchphage :: adblock.js  —  runs INSIDE Twitch's player worker (imported
 * by page.js right after the worker boots). This is the FALLBACK layer.
 *
 * The clean-stream swap in page.js is the star — it asks Twitch for an ad-free
 * stream up front. But Twitch is Twitch, and sometimes an ad segment still
 * squeaks through (midrolls especially). So we sit on the worker's fetch and,
 * whenever an .m3u8 comes back carrying the ad signifier, we surgically remove
 * the ad segments before the player ever parses them.
 *
 * How we tell an ad from content, in one line: Twitch tags real content
 * segments with `,live` in their #EXTINF duration line; ad segments don't get
 * that tag. So a segment whose #EXTINF lacks `,live` is an ad. We also blank the
 * prefetch hints (so the player can't pre-buffer an ad) and neuter the ad
 * click-tracking URLs (so the overlay can't phone home). Re-upholstery, again.
 * ==========================================================================*/
(() => {
  'use strict';

  // One brain per worker. importScripts is not shy about running us twice.
  if (self.__twitchphageAdblock) return;
  self.__twitchphageAdblock = true;

  /* The arms race in ONE string. When Twitch renames the stitched marker, this
     is the line a contributor changes. Everything else here is stable. -------- */
  const AD_SIGNIFIER = 'stitched';
  const LOG = '[Twitchphage]';   // what to grep for in the console when debugging

  // A 1-frame silent black clip, served in place of a stripped ad segment so the
  // player's segment count still adds up and it doesn't stall waiting on bytes
  // that no longer exist. Base64 fMP4, ~200 bytes. Tiny. Effective. nyaa~
  const BLANK_CLIP =
    'data:video/mp4;base64,AAAAKGZ0eXBtcDQyAAAAAWlzb21tcDQyZGFzaGF2YzFpc282aGxzZgAABEltb292' +
    'AAAAbG12aGQAAAAAAAAAAAAAAAAAAYagAAAAAAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEA' +
    'AAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAABqHRyYWsAAABcdGtoZAAA' +
    'AAMAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAA' +
    'AAAAAAEAAAAAAAAAAAAAAAAAAAURtZGlhAAAAIG1kaGQAAAAAAAAAAAAAAAAAALuAAAAAAFXEAAAAAAAtaGRscg' +
    'AAAAAAAAAAc291bgAAAAAAAAAAAAAAAFNvdW5kSGFuZGxlcgAAAADvbWluZgAAABBzbWhkAAAAAAAAAAAAAAAk' +
    'ZGluZgAAABxkcmVmAAAAAAAAAAEAAAAMdXJsIAAAAAEAAACzc3RibAAAAGdzdHNkAAAAAAAAAAEAAABXbXA0YQ' +
    'AAAAAAAAABAAAAAAAAAAAAAgAQAAAAALuAAAAAAAAzZXNkcwAAAAADgICAIgABAASAgIAUQBUAAAAAAAAAAAA' +
    'AAAAWAgIACEZAGgICAAQIAAAAQc3R0cwAAAAAAAAAAAAAAEHN0Y2MAAAAAAAAAAAAAABRzdHN6AAAAAAAAAAAA' +
    'AAAAAAAAEHN0Y28AAAAAAAAAAAAAAeV0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAoAAAAFoAAAAAAGBbWRpYQAAACBtZGhk' +
    'AAAAAAAAAAAAAAAAAA9CQAAAAABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRs' +
    'ZXIAAAABLG1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAA' +
    'AQAAAOxzdGJsAAAAoHN0c2QAAAAAAAAAAQAAAJBhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAoABaABIAAAAS' +
    'AAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGP//AAAAOmF2Y0MBTUAe/+EAI2dNQB6WUoF' +
    'AX/LgLUBAQFAAAD6AAA6mDgAAHoQAA9CW7y4KAQAEaOuPIAAAABBzdHRzAAAAAAAAAAAAAAAQc3RzYwAAAAAAAA' +
    'AAAAAAFHN0c3oAAAAAAAAAAAAAAAAAAAAQc3RjbwAAAAAAAAAAAAAASG12ZXgAAAAgdHJleAAAAAAAAAABAAAAAQ' +
    'AAAC4AAAAAAoAAAAAAACB0cmV4AAAAAAAAAAIAAAABAACCNQAAAAACQAAA';

  const nativeFetch = self.fetch.bind(self);

  /* stripAds: take a raw m3u8 that contains ad segments and return a cleaned
     one. We keep every content segment, blank every ad segment, drop prefetch
     hints, and rewrite tracking URLs to a dead end. --------------------------- */
  const stripAds = (text) => {
    const lines = text.replace(/\r/g, '').split('\n');
    let sawAds = false;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Neutize the ad overlay's tracking URLs so the ad UI can't phone home.
      line = line
        .replace(/(X-TV-TWITCH-AD-URL=")[^"]*(")/g, '$1https://twitch.tv$2')
        .replace(/(X-TV-TWITCH-AD-CLICK-TRACKING-URL=")[^"]*(")/g, '$1https://twitch.tv$2');
      lines[i] = line;

      // A segment whose #EXTINF line lacks ",live" is an ad. Swap the NEXT line
      // (the segment URL) for our blank clip so the player stays in sync.
      if (i < lines.length - 1 && line.startsWith('#EXTINF') && !line.includes(',live')) {
        lines[i + 1] = BLANK_CLIP;
        sawAds = true;
      }

      if (line.includes(AD_SIGNIFIER)) sawAds = true;

      // No low-latency prefetch during ads — otherwise the player races ahead
      // and buffers an ad segment before we've had our coffee. Strip the hints.
      if (sawAds && line.startsWith('#EXT-X-TWITCH-PREFETCH:')) lines[i] = '';
    }

    return lines.join('\n');
  };

  /* The vise. Wrap the worker's fetch; when an .m3u8 comes back carrying ads,
     hand the player a cleaned playlist. Everything else passes straight through,
     unbothered, moisturized. --------------------------------------------------- */
  self.fetch = async (input, init) => {
    const url =
      typeof input === 'string' ? input
      : input instanceof Request ? input.url
      : String(input);

    const response = await nativeFetch(input, init);

    // Only touch HLS playlists. And only when they actually contain the signifier
    // — no point rewriting a clean playlist and risking a typo breaking playback.
    const cleanUrl = url.split('?')[0];
    if (cleanUrl.endsWith('.m3u8') || cleanUrl.endsWith('m3u8')) {
      try {
        const body = await response.text();
        if (body.includes(AD_SIGNIFIER)) {
          console.info(`${LOG} ad segments detected in playlist — stripping them`);
          const cleaned = stripAds(body);
          return new Response(cleaned, {
            status: response.status,
            headers: { 'Content-Type': 'application/vnd.apple.mpegurl' }
          });
        }
        // No ads in this one — reconstruct the Response since we consumed the body.
        return new Response(body, {
          status: response.status,
          headers: { 'Content-Type': 'application/vnd.apple.mpegurl' }
        });
      } catch (err) {
        // If reading/rewriting fails, fall back to the original response.
        return response;
      }
    }

    return response;
  };
})();
