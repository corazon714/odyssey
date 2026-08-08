# 0004 — Animation layer: Reanimated 4 built-ins, not moti

- **Status:** Accepted
- **Date:** 2026-08-08

## Context

`CLAUDE.md` §4 originally listed `moti` as the declarative animation layer over
Reanimated, plus `rive-react-native` for parameterised set pieces. Design pillar 7 makes
motion load-bearing for this game — "movement is the only tactility we have" — so the
animation stack is not a detail that can be settled later.

Verified against the npm registry and vendor docs on 2026-08-08. Nothing here is recalled.

## Decision 1 — moti is banned

`moti@0.30.0` declares `peerDependencies: { "react-native-reanimated": "*" }`. A wildcard
peer is the _absence_ of a compatibility claim, so it installs silently and fails at
runtime. It is not usable here for three independent reasons, in order of severity:

1. **React 19 incompatibility, via framer-motion.** moti has a runtime dependency on
   `framer-motion@^6.5.1`, and it is a value import, not a type import — the shipped
   `build/core/motify.js` line 2 reads
   `import { usePresence, PresenceContext } from 'framer-motion';`, inside the HOC behind
   every moti component. `framer-motion@6.5.1` peers
   `react: ">=16.8 || ^17.0.0 || ^18.0.0"`. **React 19.2.3 satisfies none of them.**
2. **It drags in a DOM engine.** `framer-motion@6.5.1` depends on `@motionone/dom@10.12.0`
   — the engine that became web `motion`, which `CLAUDE.md` §4 explicitly bans on the line
   directly above. Adopting moti would import the exact thing the constitution forbids.
3. **It is unmaintained relative to Reanimated 4.** moti describes itself as "powered by
   Reanimated 3", pins `react-native-reanimated: 3.11.0` in its devDependencies, and last
   published 2025-01-29. Issue #391 ("Expo 54 and Reanimated 4 support") has been open and
   unanswered since 2025-09-11, reporting that animations "happened strangely or not worked
   at all".

**Replacement: Reanimated 4's own CSS animations and transitions API** —
`animationName`, `animationDuration`, `animationDelay`, `animationTimingFunction`,
`animationIterationCount`, `transitionProperty`, and friends. It is first-party, ships in
the version Expo SDK 57 already pins (4.5.1), needs no extra dependency, and covers moti's
entire purpose. moti existed because Reanimated 3 had no declarative layer; Reanimated 4
does.

**Revisit when:** moti publishes a release whose framer-motion dependency admits React 19,
or drops it. Both are required, not either.

## Decision 2 — Prefer Lottie over Rive, unless Rive earns its cost

Neither is installed yet; this records the comparison so it is not redone.

- `rive-react-native@9.8.5` is actively maintained (published 2026-07-17) but is **not in
  Expo SDK 57's `bundledNativeModules.json`**, so `npx expo install` will not version-manage
  it and it needs a dev client.
- Its successor `@rive-app/react-native@0.4.19` peers
  `react-native-nitro-modules: ">=0.35.10 <0.36"`. `react-native-mmkv@4.3.2` peers nitro
  `"*"`, which resolves to **0.36.5** by default — outside Rive's range. Under
  `nodeLinker: hoisted` there is exactly one copy of nitro, so **using both MMKV and Rive
  means hand-pinning nitro to 0.35.10** and maintaining that pin forever.
- `lottie-react-native` **is** in SDK 57 `bundledNativeModules` at `~7.3.8`, so it is
  version-managed like every other Expo dependency and carries no nitro constraint.

Rive's advantage is genuine — state-machine-driven, parameterised animation is a better fit
for "the world reacts" than a fixed Lottie timeline. But that advantage has to be worth a
manual nitro pin and a dev client. Default to Lottie; choose Rive deliberately, with this
paragraph in hand, if a set piece actually needs state machines.

## Decision 3 — Skia and FlashList take the SDK pin, not npm latest

Both are compatible; the trap is the version. Expo SDK 57 pins
`@shopify/react-native-skia` to **2.6.2** (npm latest is 2.11.0) and `@shopify/flash-list`
to **2.0.2** (npm latest is 2.3.2). `CLAUDE.md` §4's version rule already says the SDK
wins — install with `npx expo install`, not `pnpm add`.

Skia 2.11.0 peers `react-native-reanimated >=4.0.0` and `react-native-worklets >=0.7.0`,
which this repo satisfies at 4.5.1 / 0.10.1, so the Reanimated-4 direction in Decision 1 is
consistent with the canvas layer.

## Consequences

- Rules 9 and 10 in `CLAUDE.md` §2 (animation never gates state; every animation skippable
  and speed-scaled) are unaffected by this choice — they constrain how the layer is used,
  not which library provides it.
- Rule 10's motion tokens and speed scale still do not exist, and the lint rule banning
  hardcoded durations still does not exist. Both are `(planned)` and belong to the phase
  that introduces motion tokens.
- A false alarm worth not re-raising: Reanimated's published compatibility table lists
  4.5.x against RN 0.83–0.85 only, which would exclude this repo's RN 0.86.2. The package
  metadata overrides the doc — `react-native-reanimated@4.5.1` peers
  `react-native: "0.83 - 0.86"`. The table is stale; there is no conflict.
