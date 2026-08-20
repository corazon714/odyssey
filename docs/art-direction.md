# Art direction

> **STATUS: E — MANIFEST chosen provisionally on 2026-08-20, pending the frame-budget
> measurement in §4. Round 2's comparison is `docs/art-direction-bakeoff.html`.**
>
> This file is the durable record: the brief, the stack findings the brief has to live inside, the
> directions that were rejected and why, and — once one is chosen — the direction in full. It is
> written so that a later session cannot accidentally revive a rejected constraint.

---

## 1. THE BRIEF — read this before proposing anything

**The space is modern, kinetic and spatial.** Sliding and layered navigation rather than static
stacked screens. Depth where it earns its place. Glass and light rather than ink and paper. Motion
as the primary affordance.

The reasoning is design pillar 7's, taken seriously rather than hedged: this is a game of text and
stills, so **movement and depth are the only tactility available**, and the engineering budget is
better spent there than on surface texture.

### Two constraints from an earlier draft of this brief are RETIRED. Do not reintroduce them.

1. **The reference list "1970s road atlas · worn passport stamps · Polaroid · smuggler's ledger ·
   expedition field journal · cold-war travel poster" is WITHDRAWN.** It is six variations on retro
   print, and a faithful application of it produces six variations on the same answer. Round 1 did
   exactly that and all three directions inherited the same constraint. **The failure was the list,
   not the directions.**
2. **"A road-trip game about weight and distance probably should not feel bouncy" is WITHDRAWN, and
   it is the opposite of the direction wanted.** Do not argue for weighted, settling motion on the
   grounds that weight is the theme. Round 1's recommendation was built on that sentence.

### What did NOT change, and what a kinetic direction does not get to trade away

- **Design pillar 5 — readable in 15 seconds.** Body ≤ 60 words, choices ≤ 8 words. Motion that
  delays reading is a regression however good it looks.
- **CLAUDE.md rule 10 — every animation skippable and speed-scaled.** A fifth-run player skips all
  of it and loses nothing.
- **Reduce motion is a DESIGNED alternative, not disabled animation.** A direction whose
  reduce-motion fallback is unusable is disqualified, and each candidate must state what that
  fallback is.
- **60fps floor on a low-end Android profile during the busiest sequence.** A kinetic UI that drops
  frames is worse than a printed one, not better.
- **CLAUDE.md rule 9 — animation is presentation, never mechanics.** The die lands on a face the
  engine already rolled. **A 3D die with a pre-computed landing curve is right; a physics
  simulation forced onto a predetermined face is not, and always reads as fake.**
- **Four languages, Cyrillic and German compounds included.** Measured, not asserted — see §5.

---

## 2. DOES THIS CHANGE THE STACK? Yes, and the size of the change depends on which kind of depth

**Every version below is checked against the registry and the shipped type definitions on
2026-08-20, not recalled.** There are three tiers and they are genuinely different decisions.

### Tier 1 — 2.5D with NO new dependency

React Native's own `transform` style takes `perspective`, `rotateX`, `rotateY` and `translateZ`, and
Reanimated animates transforms **on the UI thread**. Layered navigation, parallax stacks, card
flips, receding/advancing panels and depth-ordered slide transitions are all reachable today with
`react-native-reanimated@4.5.1` and `react-native-gesture-handler@~2.32.0`, both already installed.

**This is where most of what the brief describes actually lives.** "Sliding and layered navigation
with spatial depth" is a perspective-projected 2D compositing problem, not a scene-graph problem.

### Tier 2 — Skia, and it is more 3D-capable than its reputation

`@shopify/react-native-skia` at the SDK 57 pin **`2.6.2`** (npm latest is 2.11.0; take the pin).
Peers `react >=19`, `react-native >=0.78`, `react-native-reanimated >=3.19.1` — all satisfied. Runs
in Expo Go.

Reading its shipped `Matrix4.d.ts` at 2.6.2 rather than trusting the docs: it exports **`Matrix4`,
`perspective`, `rotateX`, `rotateY`, `translateZ` and `processTransform3d`, and every one of them
is annotated `@worklet`.** Its `Transforms3d` type accepts the same transform list RN does. So Skia
gives **true perspective projection driven from the UI thread by Reanimated shared values, with no
JS work per frame** — plus the painting power the brief's "glass and light" needs: runtime shaders,
blurs, gradients, masks, and `Atlas` for particles.

**What Skia does not give: a scene graph.** No meshes, no lights, no depth buffer, no occlusion, no
geometry-cast shadows. It projects flat things convincingly; it does not simulate a space.

**First-party "glass and light" primitives are already SDK-pinned**: `expo-blur ~57.0.2`,
`expo-mesh-gradient ~57.0.1`, `expo-linear-gradient ~57.0.1`.

> **`expo-glass-effect ~57.0.1` is iOS-ONLY** — its own description is "a component that renders a
> native glass effect view **on iOS**". It was listed here as a cross-platform primitive and that
> was wrong. It is no help at all for direction E's actual risk, which is low-end **Android**, and
> reaching for it would produce a direction that looks right on the review device and is unbuilt on
> half the target platform.

### Tailwind / NativeWind: `backdrop-blur` does NOT work on native

Asked and checked, because the answer is counter-intuitive and the failure is silent.

- **Tailwind alone is out by construction** — it emits CSS, and React Native does not consume CSS.
- **NativeWind** (`4.2.6`, the Tailwind-for-RN compiler) does translate most utilities to RN styles.
  **But the string `backdrop` does not appear anywhere in its engine** — not in
  `react-native-css-interop@0.2.6`'s source and not in its `dist`. There is nothing for it to
  compile to: **React Native 0.86 has no `backdropFilter` style prop** (the only hit in the whole
  package is `flow/cssom.js.flow`, which types the browser CSSOM). So `backdrop-blur-md` is
  silently dropped.
- **And it WOULD appear to work on Expo web**, where it becomes real CSS in a real browser. That is
  the trap: it would look perfect in the exact preview used to develop, and do nothing on a phone.
- RN 0.86 **does** have `filter: [{ blur }]` — but `filter` blurs the element's OWN pixels, i.e.
  the card's text. `backdropFilter` blurs what is BEHIND. Frosted glass needs the second one.

**`expo-blur` remains the only route to real backdrop blur on native, and none of this moves the
gate in §4.** The cost of glass is the GPU sampling and blurring the framebuffer behind each sheet;
which API expresses that — a utility class, `BlurView`, or a raw native view — does not change what
the GPU does. The layer-count measurement is unchanged.

### Tier 3 — real 3D: `expo-gl` + `three` + `@react-three/fiber`

**It is viable, and unlike moti I could not find a reason it fails.** `@react-three/fiber@9.7.0`
was published 2026-08-11 and peers `react: >=19 <19.3` (this repo is 19.2.3 ✅),
`react-native: >=0.78` (0.86.2 ✅), `expo: >=43.0` ✅, `expo-gl: >=11.0` — and **`expo-gl` is in SDK
57's `bundledNativeModules` at `~57.0.2`**, so it is version-managed by `npx expo install`. `three`
is at 0.185.1 and r3f peers `>=0.156`.

(`expo-three` is **not** needed and should not be added: at 8.0.0 it peers `three: ^0.166.0` against
a current 0.185.1, so it would pin you behind. r3f talks to `expo-gl` directly.)

**The cost that decides it is not compatibility — it is which thread renders.**

I read r3f 9.7.0's native bundle. It renders into an `expo-gl` `GLView` and, per frame, calls
`context.endFrameEXP()` under a comment that reads _"Bind render to RN bridge"_. There is **no
worklet anywhere in that path**. Every frame of a three.js scene is scheduled and executed on the
**JS thread**, which is the same thread that runs the engine, the store, i18n and every
`resolveChoice`. Reanimated and Skia both deliberately avoid that thread; a GL scene cannot.

**Unpacked sizes**, for scale (unpacked is not bundle size — three tree-shakes substantially — but
the ratios are the point): `three` 23.2 MB · `@shopify/react-native-skia` 10.2 MB · `@react-three/fiber`
2.2 MB · `expo-gl` 1.7 MB · `lottie-react-native` 0.29 MB.

### The plain answer you asked for

**I do not believe a three.js scene should be on the event screen, and I think asking for one there
would fail the 60fps floor on a low-end Android device.** The reason is thread contention, not
polygon count: the busiest sequence in this game is exactly the moment the JS thread is busiest —
`resolveChoice` runs, effects apply, the store commits, the result screen mounts, chips render —
and that is the frame where a JS-driven render loop stutters. A 16.7 ms budget shared with a
garbage-collecting JS thread is where "cinematic" becomes "janky", and it will not show up on a
development iPhone.

**What I would actually do:** build the whole UI on Tier 1 + Tier 2, where every animated value
lives on the UI thread and the JS thread can stall without dropping a frame. Reserve Tier 3 for
**one** self-contained set piece if any earns it — the die is the only real candidate, because it
is a small scene, it plays while nothing else is happening, and a pre-computed landing curve is
already what rule 9 demands. Even there, **Skia can very likely do the die**, and the honest
sequence is to build it in Skia first and adopt r3f only if a measured comparison in
`/dev/motion-lab` on a real low-end device says Skia cannot.

**This is a judgement, not a measurement.** Nobody in this repo has run any of it on a device — ADR
0012 §3 records that the engine has never executed on Hermes at all. The cheap way to convert it
into a measurement is a spike in `/dev/motion-lab` before committing to a direction, and I would
rather do that than have you take my word for it.

---

## 3. WHAT A DEPTH-BASED UI DOES TO PHASE 8 (AMBIENT) AND PHASE 9 (IMAGES)

> The phase numbering here comes from the brief, not from this repo — there is no roadmap file in
> `docs/` that names phases beyond 4. Recorded so a later session does not go looking for one.

### The mismatch is real, and it has a shape

**A still is a window; a spatial UI makes everything else a surface.** If the chrome has depth and
parallax and the art does not, the art stops reading as a view into the world and starts reading as
a sticker on the interface. This gets worse, not better, as the chrome gets more convincing.

Three responses, in increasing cost:

1. **Re-light the still as a plane in the scene.** The image is a texture on a surface that receives
   the same vignette, specular sweep, colour grade and parallax offset as everything else. It costs
   nothing at generation time and is what most premium apps do. **This is the default and it is
   probably sufficient.**
2. **Generate a depth companion.** Phase 9's pipeline emits a depth or layer-separation map beside
   each still, and the UI does a two-or-three-plane parallax. Real "2.5D photo" depth. Costs a
   second asset per image, a generator that can produce or estimate it, and a manifest change.
3. **Render the art in 3D.** Rejected. It contradicts the whole reason the game ships stills, and
   rule 5 (no text in generated images) plus four languages already constrain the pipeline enough.

### What the art direction OWES Phase 9, whichever response is taken

- **Specify the light.** If the UI has a light source, every still must be generated with a stated,
  consistent light direction and colour temperature, or each card fights the chrome. This becomes a
  line in the Phase 9 prompt template, not an afterthought.
- **Specify a re-lightable range.** The mood system drives palette (§4 of this file, once written).
  If it also drives light, the stills have to be **neutral enough to be re-lit** — lower contrast,
  less colour-committed, no baked-in strong directional shadow. That is a real and slightly
  counter-intuitive constraint: **a spatial UI wants blander source art than a print direction
  would.**
- **Specify the safe area.** A still that parallaxes must have margin the parallax can eat. Compose
  for a crop, not for the frame.

### What it does to Phase 8 (ambient)

If the UI reads as spatial, flat stereo ambience will read as flat. **`expo-audio` (SDK-pinned
`~57.0.3`) does not do spatial audio** and nothing in the stack does, so do not promise positional
sound. What is reachable and enough: a **near/far bed pair** per mood, cross-faded on the same
signal that drives the depth-of-field, so "the world recedes" is audible as well as visible. That is
two files per mood instead of one, and it is a Phase 8 decision this file only flags.

---

## 4. THE DIRECTION — **E, MANIFEST. PROVISIONAL, PENDING ONE MEASUREMENT.**

**Chosen 2026-08-20 from round 2.** Material-led: the UI is a stack of glass sheets that lift,
occlude and restack. Depth is **occlusion and shadow**, not distance. Its signature transition is
the **shuffle** — the answered card rotates out on Y as its shadow lengthens while the next rises
from beneath the stack, with the remaining choices restacking on a 40 ms cascade.

> ### IT IS PROVISIONAL, AND THIS IS THE GATE
>
> E's specific risk is **overdraw**: every translucent sheet re-reads the framebuffer behind it,
> and this direction stacks them. `backdrop-filter` does not exist in React Native, so the real
> cost is the platform's own backdrop blur — `expo-blur`'s `BlurView` — and **more than two live
> blur layers at once is where low-end Android GPUs are expected to fall over.** That expectation
> is reasoning, not measurement.
>
> **`/dev/motion-lab` exists to settle it**, and it is built: pick `shuffle`, raise **blur layers**
> one at a time, replay at each step, and read **`worst frame`** rather than `fps`. The layer count
> at which the worst frame crosses ~16.7 ms is the ceiling the entire design system then has to
> live inside — and if that number is **1**, E is not buildable as specified and the fallback is F.
>
> **The measurement has NOT been taken.** No device is attached, and nothing in this repository has
> ever run on hardware (ADR 0012 §3 records that the engine has never executed on Hermes at all).
> **A browser cannot substitute**: react-native-web has no `BlurView`, so E's entire cost
> disappears and the lab reports a comfortable, useless 60. Somebody has to plug in a low-end
> Android phone.

### What E commits the design system to

- **At most two live backdrop-blur layers at any moment**, pending the measurement above. Every
  other translucent surface uses a flat tinted fill, which reads the same at these opacities.
- **The image slot sits ON the glass, not under it.** A generated still behind a frosted panel
  loses exactly the contrast Phase 9 paid to generate. That costs the card layout a layer, and it
  is a constraint on §3's re-lighting answer rather than a detail.
- **Elevation must be re-expressible without shadow**, because the reduce-motion form replaces
  shadow depth with a solid 3px left accent bar. Anything that means something only as a shadow
  has to mean it twice.

### Its named failure mode, kept where it cannot be forgotten

**Glass is the most-copied look in mobile UI right now and this will date fastest.** In two years
it reads as "2020s app" where a committed graphic direction would not. That was known at the point
of choosing; it is recorded so nobody re-discovers it as a surprise.

### Palette and type, as measured in the bake-off

Charcoal ground `#0E0F11`, sheets at `rgba(255,255,255,0.062)` over it with a
`rgba(255,255,255,0.13)` hairline and a white specular top edge, one hot accent `#FF6B35`, good
`#3DDC97`, warn `#FFB020`, danger `#FF4757`. Wanted shifts the ground to `#120B0A` and the accent
to the danger red; night cools the sheets to `rgba(190,215,255,0.05)` on `#08090C`.

Type: **Commissioner** (UI) + **JetBrains Mono** (numerals) — both verified `cyrillic` +
`cyrillic-ext`. Measured body-face width 411px on the reference string against Manrope's 422px and
IBM Plex Sans's 413px, i.e. **the narrowest of the three candidates**, which buys a little of the
German budget back. Body/surface contrast measures **10.0:1** against the composited ground.

---

---

## 5. DECISIONS ALREADY TAKEN, which any direction inherits

### The resource strip is ICON + NUMBER, with the label on tap

Eight resources at 375px gives roughly 84px per cell in a four-column grid. **No German compound
fits that, and no palette choice changes it** — measured in round 1's bake-off, where
`Fahndungsdruck` truncated in all three directions. Dropping the text label removes the constraint
by construction and is language-independent.

What it costs, and it is real work rather than a saving:

- **A glyph vocabulary that carries meaning without text**, and that survives colourblindness — so
  the glyph must differ in SHAPE, not only in hue, from every other glyph.
- **The screen-reader label becomes the only text**, so it has to be right rather than an
  afterthought. `accessibilityLabel` is now load-bearing for a primary display.
- **`hunger` and `heat` are PRESSURE gauges** (`RESOURCE_POLARITY` in
  `packages/engine/src/state/resources.ts`): more is worse. A glyph set that does not make that
  legible without a legend has failed, and this is the hardest part of the job.

### Type must be verified for Cyrillic, not assumed

Round 1 killed the first font choice in all three directions. **Newsreader, Archivo, Archivo
Narrow, Courier Prime, Instrument Sans and Special Elite all ship with NO Cyrillic subset** —
checked against the Google Fonts subset API. Verified as having full `cyrillic` + `cyrillic-ext`:
IBM Plex Sans / Serif / Mono, Source Serif 4, Fira Sans Condensed, JetBrains Mono, Roboto
Condensed, Manrope, Commissioner, Spectral, Lora, Bitter, PT Serif, Oswald.

**Check before choosing, every time.** The obvious face for a given mood is very often the one
without Cyrillic.

### Measured language costs, from round 1

Body copy for `border.night_crossing`, at 15.5px/1.52 in a 375px frame, near-identical across three
very different type pairings:

| language | body block height | vs EN    |
| -------- | ----------------: | -------- |
| EN       |             141px | —        |
| RU       |             165px | **+17%** |
| DE       |             212px | **+50%** |

**The overflow budget is a LAYOUT problem, not a palette one.** Design pillar 5's "≤ 60 words" is an
English budget; any layout that only just fits English will break in German. Budget 50%.

---

## 6. NOT CHOSEN — round 2

**D — Transit** (camera-led; dolly transition; depth IS the navigation model) and **F — Signal**
(light-led; wipe transition; geometry near-static) were built in full and are in
`docs/art-direction-bakeoff.html`. Neither is dead:

- **F is E's fallback** if the overdraw measurement in §4 comes back at one layer. It is the only
  direction whose frame budget can be asserted without a prototype — one full-screen gradient plus
  one masked sweep, no animated blur, no overdraw stack — and it has the strongest reduce-motion
  story of the three, because it never used position to carry meaning. Its cost is that it is the
  quietest at rest and makes mood calibration load-bearing: wrong thresholds and the whole UI lies.
- **D was not rejected on looks.** It loses the most identity under reduce-motion, because its
  identity is the camera; a player on Instant speed never sees the direction at all. It is also
  the one that most wants a GL layer and would have to be talked out of it every time.

---

## 7. REJECTED — round 1, and the reason is the brief rather than the work

Three directions were built and rendered in full at `docs/art-direction-bakeoff.html` (round 1,
superseded): **A — Field Journal** (paper and iron-gall ink, ledger columns, weighted motion),
**B — Transit Print** (flat spot inks, legend tabs, sharp motion), **C — Contact Sheet** (dark
table, Polaroid borders, drifting motion).

**All three were rejected together, and not on their merits.** They were faithful applications of a
reference list that was six variations on retro print, plus an instruction to avoid bouncy motion.
Both are retired in §1. Nothing about A, B or C should be revived on the strength of round 1 having
been done — but two findings from it survive and are recorded in §5 because they are facts about
this game rather than about those directions: the resource-strip truncation and the German body
budget.

Kept for the record so the retro-print space is not re-searched by accident.
