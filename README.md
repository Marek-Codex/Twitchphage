<div align="center">

# Twitchphage

**Twitch ads, eaten. No proxy, no server, no subscription. nyaa~**

![README visits](https://count.getloli.com/@marek-codex.twitchphage?theme=booru-lewd)

![Manifest](https://img.shields.io/badge/Manifest-V3-3CA0FF?style=flat-square)
![Chromium](https://img.shields.io/badge/Chromium-Brave%20%7C%20Chrome%20%7C%20Edge%20%7C%20Opera-07111C?style=flat-square&logo=googlechrome&logoColor=white)
![Firefox](https://img.shields.io/badge/Firefox-115%2B-A03CFF?style=flat-square&logo=firefox&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-no%20build%20step-3CA0FF?style=flat-square&logo=javascript&logoColor=white)
![License](https://img.shields.io/badge/license-Apache--2.0-A03CFF?style=flat-square&logo=apache&logoColor=white)

**Block Twitch ads without a proxy or a backend.** Lightweight, no build step,
runs entirely client-side. It's aggressive re-upholstery. nyaa~

</div>

---

## The government says to use an ad blocker

Not kidding. Blocking ads is standard security hygiene — recommended, on the
record, by the United States government:

> **"Use an ad blocking extension when performing Internet searches."**
> — FBI, Internet Crime Complaint Center (IC3) public service announcement,
> December 2022

The alert was about cybercriminals buying search ads to impersonate brands and
slip malware past people. The FBI's prescription was blunt: block the ads.
TechCrunch ran it under the headline *"Even the FBI says you should use an ad
blocker."*

It wasn't a one-off. The **NSA** publishes its own guidance on blocking
advertising web content, and the broader **Intelligence Community** runs
ad-blockers at scale — a congressional letter obtained by reporters showed
agencies treat online advertising as a security risk in its own right (*"The NSA
and CIA Use Ad Blockers Because Online Advertising Is So Dangerous,"* Joseph
Cox). When the FBI's Denver field office posted its own reminder to install an
ad blocker in 2024, it made national news.

So no — this isn't a spite project or a tantrum. Blocking ads on your own machine
is recommended hygiene from the same agencies people trust for security advice.
Twitchphage just aims that well-established practice at Twitch's server-side
stitched ads: the one place off-the-shelf ad blockers can't reach.

<sub>Sources:
[TechCrunch](https://techcrunch.com/2022/12/22/fbi-ad-blocker/) ·
[SecurityWeek](https://www.securityweek.com/fbi-recommends-ad-blockers-cybercriminals-impersonate-brands-search-engine-ads/) ·
[IC3 alert, archived](https://blog.zgp.org/fbi-update/) ·
[FBI Denver, 2024](https://www.pcmag.com/news/fbi-recommends-installing-an-ad-blocker-to-dodge-scammers)</sub>

*Slightly cheeky. Also, technically, correct. nyaa~*

---

## What it does

Twitch stitches ads **into the video stream itself** (server-side ad insertion),
so uBlock Origin, AdGuard, and friends are blind to them — the ad and the
content arrive from the same CDN URL. Twitchphage works around it two ways:

1. **Clean-stream swap (primary).** The moment Twitch's own player asks for a
   playback token, we quietly change the requested `playerType` to `popout` —
   a player type that historically gets an **unstitched** (ad-free) stream.
   Twitch hands back a clean token using *its own* current credentials. No ad
   segments ever enter the playlist.
2. **Segment stripping (fallback).** If any ad still sneaks through (midrolls
   are the usual suspects), the player worker's `fetch` is hooked and the ad
   segments are surgically removed from the HLS playlist before the player
   parses them.

No proxy. No server. No Twitch Turbo. It runs in your browser and nowhere else.

---

## Works on (basically) everything

The code is plain MV3 + standard APIs, so it runs on whole *families* of
browsers with no changes. Same bytes, different wrappers:

| Family | Examples | Load via | Stays after restart? |
|---|---|---|---|
| **Chromium** | Chrome, Edge, **Brave**, Opera, Opera GX, Vivaldi, Arc, Yandex, Samsung Internet, Chromium, Thorium, **Kiwi (Android)** | `-dragdrop.zip` or `-unpacked.zip` | ✅ Yes |
| **Firefox** | Firefox, LibreWolf, Waterfox, Floorp | `.xpi` (see below) | ⚠️ Temporary unless signed |
| **Userscript** | Tampermonkey, ScriptCat, Violentmonkey | `Twitchphage.user.js` | ✅ Yes |
| **Safari** | Safari 15+ (macOS/iOS) | needs a Mac — `safari-web-extension-converter` | Depends on packaging |

**Safari is the only real gap**, and it's blocked by tooling, not code: converting
a WebExtension to a Safari Web Extension needs macOS + Xcode (`xcrun
safari-web-extension-converter`). The code is WebKit-compatible as-is; it just
needs a Mac (or a macOS CI runner) to wrap and sign it. A job for another day.

**Mobile note:** Chrome and Edge don't run extensions on Android at all, so
phones get Kiwi (works with the unpacked zip), Firefox for Android (via an AMO
listing, though its add-on set is curated), or Safari iOS (converted). Limited by
the platforms, not by us.

## Install

**From Releases** (canonical): grab a build from
[Releases](../../releases) and load it yourself.

| Family | How |
|---|---|
| **Chromium** (Brave / Chrome / Edge / Opera) | Drag `Twitchphage-*-dragdrop.zip` onto `chrome://extensions` (Developer mode on), or unzip → Load unpacked |
| **Firefox** | `about:debugging` → Load Temporary Add-on → pick the `.xpi` (temporary = gone on restart unless signed) |
| **Userscript** (Tampermonkey / ScriptCat / Violentmonkey) | One-click install below, or grab `Twitchphage.user.js` from Releases |

No store listings — the browser stores don't allow extensions that touch the
ad-revenue stream, so GitHub Releases is where this lives.

## Userscript (one-click)

No store, no manifest, no dev mode — just a userscript manager.

[![Install userscript](https://img.shields.io/badge/One--click%20install-Twitchphage.user.js-A03CFF?style=for-the-badge&logo=javascript&logoColor=white)](https://raw.githubusercontent.com/Marek-Codex/Twitchphage/main/userscript/Twitchphage.user.js)

Click the button with a userscript manager installed and it'll offer to install.
Same trick as the extension — swap the token `playerType` to a clean stream, and
strip any ad segments that sneak through — just packaged as one self-contained
file with `adblock.js` inlined. The header declares `@inject-into page` so it can
touch `window.Worker`; ScriptCat users, set injection mode to **Page** if it
defaults to a sandboxed context.

---

## How it works (the short version)

```
page.js (MAIN world)
  ├─ hooks window.fetch
  │    └─ on Twitch's PlaybackAccessToken request: flip playerType -> popout
  │       (Twitch returns a clean, unstitched stream with ITS OWN live creds)
  └─ subclasses window.Worker
       └─ slips adblock.js into the IVS player worker before it boots

adblock.js (worker world)
  └─ hooks the worker's fetch
       └─ on any .m3u8 carrying the ad signifier: strip ad segments,
          kill prefetch hints, neuter tracking URLs
```

The whole trick is that we **never hardcode Twitch's fragile GQL hash or
integrity token** — we ride Twitch's own frontend and reuse the live values it's
already sending. When Twitch rotates things on their schedule, we stay current
for free. That's what makes this maintainable by a community instead of one
burned-out dev.

---

## This is arms-race software — and that's the point

Let's be honest, because the repo that came before this one
([pixeltris/TwitchAdSolutions](https://github.com/pixeltris/TwitchAdSolutions),
archived March 2026) died of exactly this: Twitch changes something server-side
and every ad-block extension goes dark until a human re-syncs it. That maintainer
stepped away. Twitchphage is built so that **doesn't have to be one person's
full-time job.**

The design isolates everything volatile into a tiny, obvious surface:

- **`src/page.js` → `CONFIG`** at the top. Three values: `cleanPlayerType`,
  `backupPlayerTypes`, `adSignifier`. If Twitchphage breaks, it's almost
  certainly one of these.
- **`src/adblock.js` → `AD_SIGNIFIER`** near the top. The marker Twitch drops
  into ad-stitched playlists.

When it rots, a contributor updates two or three strings and nothing else. That's
the entire deal. **Contributions aren't just welcome here — they're the plan.**

---

## When it breaks (and it will)

This is arms-race software — Twitch changes something, ads come back. Here's how
to tell what happened, in plain English. No code reading required.

**Open DevTools** (`F12`, or `Ctrl+Shift+I` / `Cmd+Option+I`) → **Console** tab.
Filter the box for `Twitchphage`.

- **You see `[Twitchphage] ad segments detected — stripping them`** → the fallback
  is doing its job; ads are being removed live. Working as intended.
- **Nothing from Twitchphage, but ads still play** → the clean-stream swap stopped
  landing. Twitch probably quit serving ad-free streams to the `popout` player
  type. **What to change:** `cleanPlayerType` at the top of `src/page.js` — try
  `embed`, then `autoplay`. Reload, test.
- **Nothing from Twitchphage, and the stream won't load at all** → the swap is
  getting rejected. Set `cleanPlayerType` back to a known-good value, and check
  whether Twitch renamed its request shape (below).

**Open the Network tab**, filter for `gql`, and watch a stream start. Find the
`PlaybackAccessToken` request:

- **Payload tab** — did `playerType` actually get rewritten to `popout`? If not,
  the fetch hook isn't matching Twitch's request shape anymore.
- **Response tab** — is the token coming back clean, or is it stitched?

**If ads play but you never see the `[Twitchphage]` stripping line:** Twitch
renamed the marker it drops into ad-stitched playlists. Open a live ad-stitched
`.m3u8` from the Network tab, look for the tag, and update `AD_SIGNIFIER` at the
top of `src/adblock.js` to match.

Nine times out of ten it's one of those two values. Change it, rebuild the
userscript (`node tools/build-userscript.js`), and open a PR — the full workflow
is in [CONTRIBUTING.md](CONTRIBUTING.md).

---

## For maintainers

---

## For maintainers

```bash
node tools/test-logic.js       # prove the ad-strip + token-swap logic still works
node tools/build-userscript.js # regenerate userscript/Twitchphage.user.js (adblock inlined)
```

Run the test after editing `src/page.js` or `src/adblock.js` — it's a
`vm`-sandbox test, no browser, no Twitch, no network, fails loudly if logic
drifts. After editing `src/adblock.js`, also rebuild the userscript so the
committed one-click file stays in sync. The `.user.js` is committed
ready-to-install; the zips are git-ignored and ship via Releases.

---

## Credit

The technique follows
[pixeltris/TwitchAdSolutions](https://github.com/pixeltris/TwitchAdSolutions)
(MIT), specifically the `vaft` script's approach: swap the PlaybackAccessToken
`playerType` and strip stitched ad segments from the HLS playlist. Twitchphage is
an independent, leaner reimplementation with no vendored player and no
dependencies. Full respect to pixeltris for mapping the territory.

Sibling project: [Twitchphobe](https://github.com/Marek-Codex/Twitchphobe) — same
caffeinated energy, but for subscriber-only **VODs** instead of live ads.

Released under the [Apache License 2.0](LICENSE) — fork it, tweak it, ship it
wherever. Just keep the credit intact: Section 4 requires redistributors to carry
the [NOTICE](NOTICE). Credit stays, forks stay open, everyone wins.

## Support

If Twitchphage saved you from a midroll and you're feeling generous, the
sleep-deprived cat who forged it runs on caffeine and validation:

[![Ko-fi](https://img.shields.io/badge/Support_me_on_Ko--fi-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/MarekCodex)

No pressure — go watch your stream. nyaa~

