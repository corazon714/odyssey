# Web-preview traps — what a browser tells you that is not true on a phone

> **The development loop for `apps/mobile/` is Expo web, because it is the only surface available
> without hardware. This file is the list of things it will lie to you about.**
>
> Every entry was found by hitting it, not by reading about it. Each names the evidence, the
> platform the truth lives on, and whether a device settles it. **`docs/device-measurement-session.md`
> is the plan for actioning the ones marked "hardware".**
>
> A trap is only worth an entry here if it FAILS SILENTLY. A crash on web is not a trap; it is a
> bug report. What earns a line is something that renders convincingly in the browser and does
> nothing, or something different, on the device.

---

## 1. `BlurView` does not exist on web — and it is the entire cost of direction E

**Evidence:** `/dev/motion-lab` was run on Expo web on 2026-08-20 and reported a comfortable 60fps
at every blur-layer setting.

`expo-blur` renders through CSS `backdrop-filter` on web, which a desktop GPU absorbs without
noticing. On a phone it is a real framebuffer read-and-blur per translucent sheet, and it is the
one thing that could kill the chosen art direction. **The browser reading is not a weak signal, it
is an inverted one**: the layer count that looks free on web is exactly the number under test.

**Settled by:** hardware. Partially by SE 3 — see the session doc's asymmetry rule.

---

## 2. `useFrameCallback` does not drive the frame meter on web

**Evidence:** the three readouts in `src/dev/fps-meter.tsx` stayed at `0`, `0.0 ms`, `0` across a
reload and a replay on web; the DOM `<input>` values never changed.

Either the frame callback does not fire under react-native-web or `animatedProps` does not
propagate to a DOM `value`. **Either way, the instrument that measures everything else in this
list cannot be verified in a browser.**

That is why `src/dev/frame-fold.ts` and `src/dev/sweep.ts` exist: the arithmetic, the per-layer
cost and the verdict are pure functions with their own tests, so a device session cannot be wasted
discovering a bug in them. **What remains unverified until hardware is the wiring, not the maths.**

**Confirmed again on 2026-08-20 with the auto-sweep.** Pressing RUN SWEEP flips the state to
`SWEEPING — 0 layers, step 1/6` and it stays there indefinitely: React-side wiring, the loop, the
layer dial and cancel all work, and the frame-driven stepping never happens because no frame
callback arrives. No console error, no crash — it simply hangs, which is the worst way for an
instrument to fail. The lab now says so on screen rather than sitting mute.

**Settled by:** hardware. Any device — this is not an Android-specific question.

---

## 3. Tailwind's `backdrop-blur` works on web and is silently dropped on native

**Evidence:** the string `backdrop` appears nowhere in `react-native-css-interop@0.2.6` — not in
`src`, not in `dist`. And React Native 0.86 has no `backdropFilter` style prop at all; the only hit
in the whole package is `flow/cssom.js.flow`, which types the browser CSSOM.

So a NativeWind `backdrop-blur-md` compiles to nothing on a phone and to real CSS in a browser.
**This is the worst-shaped trap in the file**: it would look right in the exact preview used to
develop it, ship, and be invisible to every check short of a device.

**The near-miss that makes it convincing:** RN 0.86 _does_ support `filter: [{ blur }]`. But
`filter` blurs the element's OWN pixels — put it on a card and you blur the card's text.
`backdropFilter` blurs what is BEHIND. Only the second one is glass.

**Settled by:** already settled, by reading the shipped source. No device needed. Recorded so it is
not re-proposed.

---

## 4. `expo-glass-effect` is iOS-only, and the only device in the project is an iPhone

**Evidence:** its own package description — "a component that renders a native glass effect view
**on iOS**".

This is a trap about the DEVICE rather than the browser, and it is the most dangerous one currently
live, because it will work beautifully on the one piece of hardware available. **Anything that comes
to depend on it during a measurement session is unbuilt on half the target platform**, and the
session is the moment that mistake is most likely to be made.

**Guard:** it is not installed. It must not become installed as a convenience during a device
session. `docs/device-measurement-session.md` §7 proposes making that a lint rule rather than a
resolution.

---

## 5. Shadow is the most platform-divergent style in React Native, and E's identity leans on it

**Evidence:** `elevation` is annotated `@platform android` in RN 0.86's own type definitions;
`shadowColor` / `shadowOffset` / `shadowOpacity` / `shadowRadius` are the iOS group.
`src/dev/transition-stage.tsx` currently sets both.

Direction E's signature transition is a card lifting **as its shadow lengthens**. On iOS that is an
animatable offset and radius. On Android, `elevation` is a single scalar feeding a material shadow
— it cannot express the same ramp, and it will not look like the bake-off. Web approximates with
`box-shadow` and matches neither.

RN 0.86 ships a cross-platform `boxShadow` which is the modern answer; the spike does not use it
yet. **The shuffle's shadow ramp is the part of E that a browser AND an iPhone will both flatter.**

**Settled by:** Android hardware only. Nothing available today can validate it.

---

## 6. Hermes has never executed this engine — the browser runs V8

**Evidence:** ADR 0012 §3. Every determinism defence in `packages/engine/` (no transcendentals, no
`localeCompare`, integer `weightedPick`, `Math.imul` over BigInt) is preventive and proven on V8
only, across Linux and Windows CI.

Expo web runs the browser's engine. **A golden run replaying correctly in a browser says nothing
about Hermes.** This has been an open, named gap since Phase 1.

**Settled by:** ANY device, including the iPhone SE 3. This is the single highest-value item
available from the first hardware session and it has nothing to do with the art direction.

---

## 7. `Intl.PluralRules` is absent on Hermes, and every browser has it

**Evidence:** `docs/stack-notes.md`, open risk. i18next's own docs state Hermes does not implement
`Intl.PluralRules`. Russian has four plural forms.

Nothing is broken today because the `en` locale contains no plural keys — so this trap is currently
armed rather than firing. The first translated plural key trips it, and a browser will never show
you that.

**Settled by:** any device. Testable now with a single throwaway plural key.

---

## 8. There is no separate UI thread in a browser

Reanimated worklets run on a real second thread on device and are emulated on web. So "this
animation is on the UI thread and cannot be stalled by JS" — the load-bearing claim behind
rejecting a three.js render loop (`docs/art-direction.md` §2) — is **unfalsifiable in a browser**.
Web will look smooth whether or not the claim holds.

**Settled by:** any device, by deliberately blocking the JS thread and confirming the animation
does not stutter. The session doc includes that as an explicit experiment.

---

## Rules of thumb, earned the hard way

1. **If a feature's cost is GPU sampling, a desktop browser cannot measure it.** Blur, overdraw,
   large gradients, shadows.
2. **If a feature does not exist on native, web will not tell you.** It will render it.
3. **If a feature exists only on one native platform, the device you own will not tell you either.**
   That is trap 4, and it is the one that needs a mechanical guard rather than discipline.
4. **A green browser reading on anything in this file is worth nothing.** Not "weak evidence" —
   nothing. Several of these are inverted rather than merely noisy.
