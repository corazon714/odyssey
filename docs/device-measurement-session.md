# The device measurement session

> **THE AVAILABLE HARDWARE IS ONE iPhone SE 3, AND THE DEV MACHINE IS WINDOWS.** Both facts shape
> every threshold in this document. They are not caveats attached to a general plan; there is no
> general plan, because a plan that assumed a representative device would produce a verdict this
> hardware cannot support.
>
> **This is the first time anything in this project will run on a physical device.** Nothing in
> `packages/engine/` has ever executed on Hermes (ADR 0012 §3), and `apps/mobile/` has only ever
> run in a browser. The session is worth running for that alone, independently of the art
> direction.
>
> Read `docs/web-preview-traps.md` first. This document actions the entries there marked
> "hardware", and adds the ones that need an Android and cannot be actioned at all.

---

## 1. THE ASYMMETRY — the load-bearing idea, stated before any threshold

**An iPhone SE 3 is not a low-end Android, and the ways it differs all point the same direction for
the one measurement that matters.**

The A15 is a flagship-class 2021 SoC. The SE 3's constraints are 4 GB of RAM and a small, low
resolution 60 Hz screen — and **for blur, a small screen is an advantage, not a handicap.** Blur
cost is dominated by sampling and re-sampling the framebuffer behind each translucent surface, so
it scales with pixel count. The SE 3 has roughly **1,000,500 physical pixels** (750 × 1334). A
budget 2026 Android at FHD+ has about **2,592,000** (1080 × 2400). **Same blur, ~2.6× the pixels,
on a far weaker GPU.**

Therefore:

> ### A FAILURE ON SE 3 IS STRONG EVIDENCE. A PASS ON SE 3 IS WEAK EVIDENCE.
>
> If the strongest phone in the comparison, with the fewest pixels to blur, cannot do it, nothing
> in the target class will. That inference is sound and it is the only sound one available.
>
> The reverse does not hold and must never be written down as though it did. **"E passed on SE 3"
> is not a result. The result it is allowed to produce is "not disproven on the one device
> available."**

This asymmetry is why the session is worth running despite the wrong device: **it can kill E, and
killing E early is worth more than confirming it late.**

---

## 2. WHAT THIS SESSION CAN DECIDE, AND WHAT IT CANNOT

### Can be decided outright — no Android required

| question                                                                       | why SE 3 settles it                                 |
| ------------------------------------------------------------------------------ | --------------------------------------------------- |
| **Does the engine run correctly on Hermes?** (ADR 0012 §3, open since Phase 1) | Hermes is Hermes. Not a GPU question.               |
| **Do the golden runs replay bit-identically on Hermes?**                       | The determinism defences are proven on V8 only.     |
| **Does `Intl.PluralRules` exist on Hermes?** (`stack-notes.md`)                | Absent or present; nothing device-specific.         |
| **Is the frame meter's WIRING correct?** (trap 2)                              | The arithmetic already has tests; this is plumbing. |
| **Are Reanimated worklets genuinely off the JS thread?** (trap 8)              | Block JS for 500 ms and watch. Binary outcome.      |
| **Is E DEAD?**                                                                 | Section 1's asymmetry. A failure here is final.     |
| **Do the transitions read well at 440 ms on a real small screen?**             | A design judgement, and SE 3 is a real phone.       |
| **Is the reduce-motion form legible and informative?**                         | Ditto. Nothing about it is GPU-bound.               |
| **Do 44 pt touch targets and the type sizes work in the hand?**                | The bake-off measured at 375 px; SE 3 IS 375 pt.    |

**The Hermes group is the single highest-value output of this session and has nothing to do with
the art direction.** It closes a gap that has been open and named since Phase 1.

### Cannot be decided — needs an Android, full stop

| question                                                    | why                                                                                                    |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **E's actual blur-layer ceiling**                           | §1. A pass here does not transfer.                                                                     |
| **The 60 fps floor sign-off** (CLAUDE.md rule 10, pillar 7) | The floor is defined against a low-end Android.                                                        |
| **The shuffle's shadow ramp** (trap 5)                      | `elevation` is `@platform android` and cannot express an animated offset/radius ramp. iOS flatters it. |
| **`elevation` vs the newer cross-platform `boxShadow`**     | Only observable where they differ.                                                                     |
| **Whether a 120 Hz budget phone halves the budget**         | SE 3 is 60 Hz. See §4.                                                                                 |

---

## 3. A REQUIRED INSTRUMENT CHANGE — measure a SLOPE, not a verdict

**`/dev/motion-lab` as built answers "does it pass at N layers". That is the wrong question for
this device**, because its pass does not transfer. The question that does transfer, at least
partially, is **"what does one blur layer cost, in milliseconds?"** — a slope can be multiplied by
a penalty factor; a pass/fail cannot.

**ALL THREE LANDED ON 2026-08-20.** What follows is what they are and why, kept because the
reasoning is what a later reader needs.

Three changes, all small, all required before the session:

1. **A zero-layer setting.** The dial starts at 1, so there is no no-blur baseline to subtract.
   Zero is also exactly the flat-fill mode §7 proposes, so this setting earns its place twice.
2. **Report the mean as well as the worst frame, per setting**, so `cost_per_layer ≈ (mean at N −
mean at 0) / N` is readable without arithmetic in your head on a phone screen.
3. **An auto-sweep mode**: run 0 → 5 layers unattended, hold each for a fixed frame count, and
   print a result table. This removes human timing variance, and — see §5 — **it is what makes a
   free automated Android farm viable later.** Without it, every Android option requires a human
   interactively driving a remote device.

**Do not run the session before these land.** A session that produces the wrong statistic on the
only hardware available is worse than no session, because the number gets quoted afterwards.

> **AS BUILT.** `RUN SWEEP` walks 0 → 5 layers at 120 frames each (~12 s), then prints a
> fixed-width table and **the verdict in this document's own words** — `src/dev/sweep.ts` holds §4's
> thresholds as code, so nothing has to be divided by hand on a phone or off a video stream. The
> per-layer cost and the verdict are pure functions with their own tests, including one asserting
> the vocabulary contains **no `pass`**.
>
> **The sweep's frame loop is unverified.** On Expo web it starts, renders, and holds at step 1/6
> forever, because `useFrameCallback` never fires there — `docs/web-preview-traps.md` trap 2,
> confirmed rather than assumed. The React wiring, the loop, the layer dial and cancel all work.
> **§9 step 4 exists to catch a frame loop that does not run**, and it is now doing real work
> rather than being a formality.

---

## 4. THE THRESHOLDS, DERIVED FROM §1

The frame budget is **16.7 ms** (SE 3 is 60 Hz — **confirm on the device; §9 step 1 records it** rather than trusting the spec I quoted).

### The safe verdict: when E is dead

> **If blur costs more than ~4.2 ms per frame at 2 layers on SE 3 — a quarter of the budget — E is
> dead as specified. Fall back to F, and that verdict is safe.**

Also fatal, and simpler to read: **if `worst frame` exceeds 16.7 ms at 1 or 2 layers on SE 3, stop.**
That is your own rule from the brief and it needs no multiplier to justify it.

### The unsafe verdict: when E is merely not disproven

> **If blur costs less than ~0.83 ms per frame at 2 layers — 5% of the budget — record
> "NOT DISPROVEN ON SE 3". Do not write "pass" in any document.**

### Between the two: inconclusive, and it has consequences

Between 5% and 25% of budget, the session has not decided anything. **The consequence is not
"proceed cautiously" — it is that §7's flat-fill architecture stops being a recommendation and
becomes mandatory, and an Android measurement becomes a release blocker rather than a nice-to-have.**

### The multiplier behind those numbers — **THIS IS A GUESS, AND HERE IS ITS BASIS**

I am assuming a **10× penalty** from SE 3 to a mid-range Android, and I believe 10× is the
_optimistic_ end. It is built from four factors, of which only the first is arithmetic:

| factor                 | value        | status                                                                                                                                     |
| ---------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Pixels to sample       | **2.6×**     | **Arithmetic**, once both resolutions are confirmed.                                                                                       |
| GPU fill and bandwidth | **4–8×**     | **Estimate.** A15 is a 2021 flagship part; budget 2026 SoCs use GPUs in the class of 2017–18 mid-range. I have not benchmarked either.     |
| Thermal throttling     | **1.2–1.5×** | **Estimate**, and only over a sustained session. SE 3 will not throttle in a 60-second test; a budget phone under continuous GPU load may. |
| Refresh rate           | **1× or 2×** | **Conditional.** Many 2026 budget Androids ship 120 Hz panels, which halves the budget to 8.3 ms. SE 3 cannot observe this at all.         |

Compounded, ignoring refresh: **2.6 × 4 = ~10× optimistic; 2.6 × 8 × 1.5 = ~31× pessimistic.**

**Two honest caveats against my own number.** Platform blur implementations usually downsample
before blurring, which partially absorbs the pixel factor — so the true multiplier is probably
below the naive product. And a meaningful share of per-layer cost is fixed overhead rather than
fill, which does not scale with pixels at all. **I would not defend 10× as precise. I would defend
it as the right order of magnitude, and I would not use anything below 10× for a go decision.**

The 25% line falls out of it: 25% × 10 = 250% of the Android budget, i.e. certainly broken. The 5%
line likewise: 5% × 10 = 50% of budget, which might survive alongside transforms, shadows, text
layout and the JS thread's own work — _might_, which is exactly the strength of claim the evidence
supports.

---

## 5. HOW DO WE EVER TEST ANDROID? Four options, evaluated

### 5.1 Android emulator on this machine — **useless for this measurement. Genuinely useful for others.**

**Say it plainly: the emulator cannot price blur, and offering it as a hedge would be dishonest.**
It renders through the host GPU — a desktop part, faster than any phone — and reproduces neither
mobile memory bandwidth, nor the tile-based deferred rendering architecture mobile GPUs use (on
which blur cost is dominated by bandwidth), nor thermal behaviour. A comfortable emulator reading
is worth **nothing**, and it is more dangerous than the web reading because it looks credible.

**But it is not worthless overall, and it is free.** It runs the real native code path, real
`BlurView`, real Hermes, real Android layout. It can settle:

- **Trap 5's appearance** — how the shuffle's shadow ramp actually looks under `elevation`, and
  whether `boxShadow` fixes it. That is a rendering question, not a cost question, and it is one of
  the Android-only items in §2.
- Android-specific layout and font-fallback divergence, including Cyrillic and the German strings.
- A second Hermes environment for the golden runs.

**Verdict: install it, use it for correctness and appearance, and never quote a frame number from
it.** Cost: free, a few GB of disk.

### 5.2 Cloud device farms — **the cheapest real answer, and the first session is probably free**

**AWS Device Farm** offers interactive Remote Access to real devices at **$0.17 per device-minute**,
after a one-time trial of **1,000 free device-minutes**. Unmetered plans start at **$250 per slot
per month**, which is irrelevant at our volume. **A focused 30-minute session costs about $5.10, and
the first one falls inside the free trial.**

**Can a frame-time reading be taken remotely? Yes — and this is the part worth understanding.**
You interact over a compressed video stream, so you cannot _see_ jank reliably. But our meter does
not require you to: it computes on-device from `useFrameCallback` and displays the result as text.
**You read the number off the stream rather than judging smoothness from it.** Screen capture adds
GPU and encode load, which biases the reading _pessimistic_ — and for a floor gate, pessimistic is
the safe direction. It makes the measurement conservative, not invalid.

**Firebase Test Lab** has a free tier — 5 real-device tests/day, first 30 real-device minutes/day
free, then ~$5/device/hour — but it is **automation-oriented and has no interactive remote access**.
That is precisely why §3's auto-sweep mode matters: with the lab able to run itself and print a
table, a Test Lab run plus a screenshot becomes a viable and free measurement.

**BrowserStack App Live** is interactive on real devices at roughly **$49/month** for an individual
plan. Convenient, and the worst value here for a handful of sessions.

**Verdict: AWS Device Farm remote access for the first Android measurement. It is interactive, it
is real hardware, and it is free the first time.** Build the auto-sweep anyway, because it converts
every future re-measurement into something a free automated tier can do.

### 5.3 Buying a cheap Android — **the honest answer if Android is a real ship target**

You said you are not buying one, and then asked me to evaluate it honestly. So: **if Android ships,
this is the correct answer, and it is cheaper than it sounds.**

**Minimum spec that actually represents the target** — the point is to buy something _slow_, which
is the one purchase where the cheap option is the correct option:

- **1080p, not HD+.** An HD+ (720 × 1600) panel has only 1.15× the SE 3's pixels and would flatter
  blur almost as much as the iPhone does. FHD+ is the honest target.
- **4 GB RAM**, entry SoC — Snapdragon 4-series or Dimensity 6020 class.
- **Prefer 120 Hz if offered**, counter-intuitively: it halves the frame budget and is the harsher,
  more honest target. It is also increasingly the default in this price band.
- Current Android, for Hermes and New Architecture support.

Concretely in this class: **Moto G 5G (2024) at about $130**, or **Galaxy A15 5G at about $179**
(1080p AMOLED). Both are squarely the target profile.

**The comparison that matters:** $130 once, versus $49/month for BrowserStack — it pays for itself
in under three months and then gives unlimited iteration for the life of the project. Against AWS
metered it takes longer to break even, but it removes an _indefinite_ project risk, and the risk is
the expensive part, not the minutes.

**Recommendation, stated as yours to reject:** if Android is in scope for launch, buy the $130 Moto
G and stop paying this tax in planning overhead. If Android is genuinely post-launch or uncertain,
AWS's free tier now is the right call and this decision defers cleanly.

### 5.4 Deferring — **which decisions genuinely need Android**

Only these, from §2: E's blur-layer ceiling, the 60 fps sign-off, and trap 5's shadow ramp. That is
a short list, and **none of it blocks Phase 4B or 4C** provided §7's architecture is adopted — which
is exactly what makes §7 the important section of this document.

**Everything else — the entire Hermes group, cold start, memory, the UI-thread claim, reduce-motion
legibility, type and touch targets — is available on SE 3 now.** That group is most of the value of
a first hardware run and none of it is waiting on a purchase.

---

## 6. WINDOWS CHANGES WHAT THE SE 3 CAN MEASURE

**The dev machine is Windows 11, so Xcode and Instruments do not exist here.** This is not a minor
inconvenience; it removes the standard iOS profiling toolchain entirely, and it shapes three of the
things you asked to measure.

- **Getting the app onto the phone: use Expo Go first.** `expo-blur` is in SDK 57's
  `bundledNativeModules`, so it should be present in Expo Go, and the spike imports no other native
  module — Skia is installed but the transitions do not use it. **If Expo Go works, the session
  needs no build at all: scan a QR code and go.** If it does not, the fallback is `eas build
--platform ios --profile development`, which runs on EAS's macOS runners rather than locally, and
  which needs an Apple Developer account. **Verify this at step 0, because everything else depends
  on it and it is the one step that can fail before the session starts.**
- **Cold start is only meaningful on a production build.** A Metro dev bundle is large and unminified
  and its start time says nothing about shipping. Measure with `--no-dev --minify`, or accept that
  the dev number is a floor with no ceiling attached to it. Say which one you did.
- **Memory: no Instruments, so measure from inside the app.** Hermes exposes allocation statistics
  via `global.HermesInternal?.getInstrumentedStats?.()` — **verify that it exists on this Hermes
  build before relying on it**, and treat the numbers as relative between screens rather than as
  absolute footprint. 4 GB of RAM is the SE 3's real constraint and the one place it _is_ a
  representative low-end device, so this is worth doing properly.
- **Bundle parse is really bytecode load.** Hermes precompiles, so what you are timing on a release
  build is bytecode loading rather than JS parsing. Do not compare it to a web number.

**Time source:** every timing here must come from `apps/mobile/src/clock/system-clock.ts`, the one
sanctioned wall-clock read (CLAUDE.md rule 2.3). The frame meter already needs no clock at all — it
uses `FrameInfo.timeSincePreviousFrame`. Do not reach for `Date.now()` for a "quick measurement";
the ESLint stack will reject it and it is right to.

---

## 7. BUILD E SO IT DEGRADES — and the degradation target is NOT F

**You asked whether building E to degrade forces it into being F-with-extra-steps. It does not, and
the reason is worth stating precisely: blur is not what makes E E.**

E's identity is **layering, occlusion, a shadow ramp, and the shuffle rotation**. Every one of those
is transform and compositing work, none of it is backdrop sampling. Blur is a _surface finish_ on
top of that structure. Turn every `BlurView` off and you still have stacked translucent sheets that
occlude each other and shuffle on the Y axis — **that is E without frost, and it is nothing like F**,
which is light-led with near-static geometry and a wipe.

So the fallback ladder has three rungs, not two:

| rung           | what changes                                   | when                          |
| -------------- | ---------------------------------------------- | ----------------------------- |
| **E, frosted** | live backdrop blur on up to N sheets           | if Android measurement allows |
| **E, flat**    | flat authored tints, everything else identical | if blur is too expensive      |
| **F**          | a different direction entirely                 | only if E is DEAD per §4      |

### How to build it, concretely

- **`theme.surfaces.liveBlurLayers` is a token**, not a structural assumption. Zero is a legal,
  fully-designed value.
- **A single `<Sheet>` primitive is the only thing in the codebase permitted to import
  `expo-blur`.** It reads the token and renders either a `BlurView` or a flat fill. No screen, card,
  chip or modal ever imports `expo-blur` directly. **This is lint-enforceable** with
  `no-restricted-imports` scoped to everything outside `src/design/`, which is the same mechanism
  the engine boundary already uses.
- **The flat tint must be AUTHORED, not derived.** This is the subtle part and the reason a retrofit
  is expensive: a blurred backdrop and a flat fill need _different alpha_ to read at the same visual
  weight, because one is sampling the busy ground beneath it and the other is not. So each surface
  token carries both values — `{ blurIntensity, flatFill }` — decided by eye at authoring time.
- **The Phase 4F contrast test runs over BOTH palettes.** A ratio verified against the frosted
  surface says nothing about the flat one; they composite differently.

### Cost now versus retrofit later

**Now: small.** The `<Sheet>` primitive is one you would build regardless — it is the Card of a
glass direction. The genuine additions are one token, a second tint value per surface, one lint
rule, and doubling the contrast test's inputs. Call it half a day inside Phase 4B, most of which is
design judgement on the flat tints rather than code.

**Later: the code is the cheap part and the palette is not.** Finding stray `BlurView` imports is a
grep. **Re-tuning the palette is the expensive half**, because it will have been calibrated against
the frosted look — every surface weight, every contrast reading and every mood override gets
revisited, and that is design work with no shortcut. Worse, it would land _after_ primitives, mood
themes and screens were built against the original values.

> **Recommendation: build it this way. It is cheap now, it converts a possible Android failure from
> a redesign into a one-token change, and it does not cost E any of its identity.**

---

## 8. THE TRAP TO GUARD BEFORE THE SESSION, NOT DURING IT

**`expo-glass-effect` is iOS-only and will work beautifully on the one device available.** That is
exactly the shape of mistake a device session invites: something looks right on the hardware in
front of you, and it is unbuilt on half the target platform.

It is not currently installed. **Do not install it during a measurement session**, and do not reach
for it to "check whether native glass looks better" — that comparison cannot inform a cross-platform
decision, and having seen it will bias the ones that follow.

**Made mechanical rather than a resolution. LANDED 2026-08-20.** Two `no-restricted-imports`
blocks in `eslint.config.mjs`:

- **`expo-glass-effect` banned anywhere under `apps/mobile/`**, message pointing at
  `docs/web-preview-traps.md` trap 4.
- **`expo-blur` banned everywhere under `apps/mobile/` except `src/design/`**, enforcing §7's
  `Sheet` rule.

They are two blocks rather than one because ESLint REPLACES a rule's options rather than merging
them — a second `no-restricted-imports` scoped to the design layer would silently switch the first
one off there.

Per `docs/enforcement.md`'s house rule, **both were verified failing on a deliberate violation**: an
`expo-blur` import planted in `src/dev/fps-meter.tsx` and an `expo-glass-effect` import planted in
`src/design/sheet.tsx`, each rejected with its own message, both then removed. The legitimate
exemption was confirmed in the same pass — `src/design/sheet.tsx` imports `expo-blur` and lints
clean. Recorded in `docs/enforcement.md`.

---

## 9. RUNNING ORDER

Ordered so that the cheapest thing that can invalidate the session happens first, and so that the
irreversible-looking results come before the ones that need judgement and a fresh eye.

| #   | step                                                                              | settles                      |
| --- | --------------------------------------------------------------------------------- | ---------------------------- |
| 0   | **Does it launch in Expo Go?** If not, stop and set up EAS dev build.             | §6 — everything depends      |
| 1   | Record the device's own reported `Dimensions`, `PixelRatio`, refresh rate.        | §4's arithmetic, not my spec |
| 2   | **Golden runs on Hermes.** Replay the fixtures; compare digests to CI.            | ADR 0012 §3 — highest value  |
| 3   | `Intl.PluralRules` present? One throwaway plural key.                             | `stack-notes.md` open risk   |
| 4   | Frame meter wiring: does it report non-zero and plausible?                        | trap 2                       |
| 5   | UI-thread claim: block JS 500 ms mid-transition; does the animation continue?     | trap 8                       |
| 6   | **Blur sweep, auto mode, 0 → 5 layers.** Record mean and worst per setting.       | §4 — the go/no-go            |
| 7   | Compute ms-per-layer; apply §4's thresholds; **write the verdict in §4's words.** | the decision                 |
| 8   | Reduce-motion form: legible? Does a flag change still register?                   | pillar-level requirement     |
| 9   | Type, contrast and 44 pt targets in the hand, EN / DE / RU.                       | the bake-off's claims        |
| 10  | Cold start and memory, per §6's constraints, stating which build type.            | first-ever baseline          |

**Record everything in a new `docs/device-measurement-<date>.md`**, including the failures and the
steps that could not be run. A session that produces "step 6 could not be completed because Expo Go
lacked X" is a successful session; a session that produces an unqualified "E passes" is a failed
one, because §1 says that sentence cannot be true.

---

## 10. THE ONE-LINE SUMMARY

**This session can kill E, and it cannot clear it.** Everything else it produces — the first Hermes
evidence in the project's history, a cold-start baseline, the UI-thread claim tested rather than
asserted — is worth having on its own, and none of it is waiting on an Android.
