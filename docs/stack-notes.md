# Stack notes — the traps, in full

> Extracted from `CLAUDE.md` §4 on 2026-08-09. The version list stays in the constitution; the
> reasoning behind each rejection lives here. **Nothing was deleted in the move.**
>
> Compatibility verified against Expo SDK 57.0.11 on 2026-08-07. Re-verify before acting on any
> of it: these notes have a shelf life, and the whole point of §4's version rule is that a
> version written from memory is a guess.

---

## The two traps that catch everyone

**1. Prefer the Expo SDK pin over npm-latest.** `bundledNativeModules.json` pins Skia to 2.6.2
and FlashList to 2.0.2, both well behind latest. `npx expo install` is what respects that;
`npm install` is not.

**2. A wildcard peer (`"*"`) is the ABSENCE of a compatibility claim, not a promise of one.**
moti, rive and mmkv all declare wildcards. All three install silently regardless of whether they
work. This is the single most expensive misreading available in this ecosystem.

---

## `moti` — DO NOT ADD. Verified incompatible 2026-08-07

Use **Reanimated 4's built-in CSS animations/transitions API** instead (`animationName`,
`animationDuration`, `transitionProperty`, …). It is first-party, needs no extra dependency, and
covers moti's entire purpose.

Reasons moti is out, in order of severity:

1. moti **value-imports** `framer-motion@6` — `import { usePresence, PresenceContext }` in the
   HOC behind every moti component. framer-motion 6 peers `react: >=16.8 || ^17 || ^18`, so
   **React 19.2.3 satisfies none of them.**
2. framer-motion 6 depends on `@motionone/dom` — the engine that became web `motion`, which is
   banned here for targeting the DOM.
3. moti is self-described as "powered by Reanimated 3", last published 2025-01-29, with issue
   #391 ("Expo 54 and Reanimated 4 support") open and unanswered.

Its peer is `*`, so **it installs without complaint and fails at runtime.** That is why it needs
a hard note rather than a line in a table.

## `@shopify/react-native-skia` — compatible, pin carefully

**(planned.)** Canvas work: dice, particles, ambient. Install the **SDK pin `2.6.2`** via
`npx expo install`, not npm-latest 2.11.0. Peers `react-native-reanimated >=4.0.0` +
`react-native-worklets >=0.7.0`, which this repo already satisfies. Works in Expo Go.

## `rive-react-native` — read this before adopting

**(planned, with a caveat.)** Parameterised set pieces.

Not in SDK 57 `bundledNativeModules`, so `npx expo install` will not pin it and it needs a dev
client. `rive-react-native@9.8.5` declares only wildcard peers — no RN 0.86 claim either way.

Its successor `@rive-app/react-native@0.4.19` peers
`react-native-nitro-modules >=0.35.10 <0.36`, which **collides with `react-native-mmkv`**: mmkv
peers nitro `*` and resolves to 0.36.5 by default. Using both means pinning nitro to `0.35.10`
by hand.

**Alternative if that is not worth it: `lottie-react-native`, which IS in SDK 57
bundledNativeModules (`~7.3.8`)** and is therefore version-managed by `npx expo install` like
every other Expo dependency.

## Not usable here at all

`anime.js` and web `motion` — both target the DOM.

---

## New Architecture is not optional

RN 0.82 removed the legacy (Paper) architecture — setting `newArchEnabled=false` is ignored.
This repo is on RN 0.86.2, so **every native dependency must support Fabric/TurboModules.**
There is no fallback to negotiate.

---

## Open risk — i18n plurals on Hermes

i18next's own docs state the Hermes engine does not implement `Intl.PluralRules`. Russian has
four plural forms, so without a polyfill (`@formatjs/intl-pluralrules`, pure JS) ru and likely de
pluralisation will silently fall back to English one/other.

**Not yet measured against the Hermes build in RN 0.86 — verify before writing plural keys.**
The `en` locale written in Phase 2B contains no plural keys, so nothing is broken yet; the first
translation is where this bites.

Related and separate: ADR 0012 §3 records that the engine's determinism defences are proven on
V8 only and the engine has never executed on Hermes at all.
