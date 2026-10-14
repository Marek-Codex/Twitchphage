<div align="center">

# Twitchphage

**Twitch ads, eaten. No proxy, no server, no subscription. nyaa~**

![Manifest](https://img.shields.io/badge/Manifest-V3-3CA0FF?style=flat-square)
![Chromium](https://img.shields.io/badge/Chromium-Brave%20%7C%20Chrome%20%7C%20Edge%20%7C%20Opera-07111C?style=flat-square&logo=googlechrome&logoColor=white)
![Firefox](https://img.shields.io/badge/Firefox-115%2B-A03CFF?style=flat-square&logo=firefox&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-no%20build%20step-3CA0FF?style=flat-square&logo=javascript&logoColor=white)
![License](https://img.shields.io/badge/license-Apache--2.0-A03CFF?style=flat-square&logo=apache&logoColor=white)

**Block Twitch ads without a proxy or a backend.** Lightweight, no build step,
runs entirely client-side. It just eats the ads. nyaa~

</div>

---

## The government says to use an ad blocker

Not kidding. Blocking ads is standard security hygiene, according to the actual
United States government:

> **"Use an ad blocking extension when performing Internet searches."**
> — FBI, Internet Crime Complaint Center (IC3) public service announcement,
> December 2022

That alert was about cybercriminals buying search ads to impersonate brands and
slip malware past people. The FBI's advice: block the ads. TechCrunch covered it
under the headline *"Even the FBI says you should use an ad blocker."*

And it wasn't a one-off. The **NSA** has its own guidance on blocking
advertising web content, and the broader **Intelligence Community** has deployed
ad-blocking at scale precisely because online advertising is treated as a
security risk, not a nuisance.

Now — were they talking about Twitch prerolls specifically? *Obviously not.*
Twitch ads are, by every honest measure, the least dangerous ads on the internet.
Nobody's crypto wallet is getting drained by a mid-roll for energy drinks.

But the principle they're pointing at is the same one Twitchphobe and Twitchphage
run on: **ads are a vector, and blocking them on your own machine is a
legitimate, recommended, dare-we-say patriotic thing to do.** So when someone
tells you blocking Twitch ads is rude, you can tip your hat and mention that the
FBI and the NSA are, technically, on our side of this one.

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

## Install

**From Releases** (canonical): grab a build from
[Releases](../../releases) and load it yourself.

| Family | How |
|---|---|
| **Chromium** (Brave / Chrome / Edge / Opera) | Drag `Twitchphage-*-dragdrop.zip` onto `chrome://extensions` (Developer mode on), or unzip → Load unpacked |
| **Firefox** | `about:debugging` → Load Temporary Add-on → pick the `.xpi` (temporary = gone on restart unless signed) |

No store listings — the browser stores don't allow extensions that touch the
ad-revenue stream, so GitHub Releases is where this lives.

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
See [CONTRIBUTING.md](CONTRIBUTING.md) for the 2-minute "it broke, here's the
fix" workflow.

---

## For maintainers

```bash
node tools/test-logic.js   # prove the ad-strip + token-swap logic still works
```

Run this after editing `src/page.js` or `src/adblock.js`. It's a `vm`-sandbox
test — no browser, no Twitch, no network. If the logic drifts, it fails loudly.

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

