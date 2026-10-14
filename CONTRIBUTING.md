# Contributing to Twitchphage

First off: **thank you.** This is arms-race software. Twitch changes something
server-side, ad-block extensions go dark, and somebody has to re-sync it. That
somebody used to be one very tired maintainer who eventually walked away (see
pixeltris/TwitchAdSolutions). The whole design of this repo exists so it *doesn't*
have to be one person's problem. Your PR is the point.

## "It stopped working" — the 2-minute fix

Almost every break is Twitch renaming or rotating one of a handful of values.
They're all isolated on purpose. Here's the order to check them:

### 1. Ads are showing again → check the playerType swap
Open DevTools → Network, filter for `gql`. Watch a stream and find the
`PlaybackAccessToken` request. In `src/page.js`, the `CONFIG.cleanPlayerType`
value is what we swap the request to. If Twitch started stitching ads into
`popout` streams too, try a backup from `CONFIG.backupPlayerTypes`
(`embed`, `autoplay`). Change one string, reload, test.

### 2. Ad segments aren't being detected → check the signifier
In `src/adblock.js`, `AD_SIGNIFIER` is the marker Twitch drops into an
ad-stitched `.m3u8`. Grab a live ad-stitched playlist from DevTools and see what
marker it carries now. If Twitch renamed it, update that one string.

### 3. Something more fundamental changed → open an issue first
Don't guess. Paste the relevant DevTools output (redact nothing sensitive — it's
all public playback data) into an issue so we can look together.

## Before you open a PR

```bash
node tools/test-logic.js
```

This is a `vm`-sandbox test — no browser, no Twitch, no network. It proves the
two core pieces of logic still work: the token `playerType` swap and the ad-
segment stripping. **If it passes and your change is small, you're basically
done.** If you add logic, add a test case the same way the existing ones work.

## Ground rules

- **Keep the volatile stuff in `CONFIG` / `AD_SIGNIFIER`.** Don't scatter magic
  strings through the code. That isolation is the repo's whole superpower.
- **Don't add dependencies.** No build step, no npm packages in the extension.
  Plain JS or it doesn't ship.
- **Fail safe.** If any hook can't parse something, it should hand Twitch its
  original request and move on — never break playback to win an ad battle.
- **Voice is loose but the code is serious.** Comments are allowed to be tired
  and funny; the logic is not allowed to be sloppy.

## What we're NOT doing

- **No proxy / no backend.** That's a different project with real hosting costs
  and a much bigger blast radius. Twitchphage stays 100% client-side.
- **No vendoring Twitch's player.** We wrap the worker, we don't ship a copy.

Thanks again. Go eat some ads. nyaa~
