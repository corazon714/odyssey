# CLAUDE.md — Project Odyssey

> Repo root file. Read at the start of every session. Keep it under ~400 lines: this is a
> **constitution**, not documentation. Detailed docs live in `docs/` and are linked from here.

---

## 1. What this project is

**Odyssey** is a text-based, RNG-driven road-trip narrative game for iOS and Android.

Loop:

1. Player picks a **start** and **destination** on a stylized world map.
2. The route engine generates 3–5 **candidate routes** (fastest / cheapest / safest / scenic / illicit).
3. Player picks one route — the first meaningful decision.
4. Player makes **preparation choices** (budget allocation, gear, documents, companion, cover story).
5. The journey runs as a sequence of **legs**. On each leg the director selects **events** from a
   pool filtered by world state, location, time of day, and transport mode.
6. Each event offers **choices**; each choice resolves to a **weighted outcome** that mutates state.
7. State has **memory**: lost documents, debts, injuries, wanted level, and burned bridges resurface
   later. The run ends in arrival, failure, or one of many endings — then produces a **journal**.

The fantasy: _a long, unpredictable, consequence-heavy overland journey._

> # Status: Phases 1, 2A, 2B and **3** are CLOSED. Phase 3 closed with gate 9 red; **GATE 9 IS NOW GREEN.**
>
> **`docs/phase-3-closeout.md` is the closing artefact — read it before starting Phase 4**, and read
> **`docs/adr/0046`** beside it. Phase 3 closed with **gate 9 FAILING** on `route.illicit.r1dlxpt5`
> (2.32%, −4.5 SE) and `route.illicit.r16kyujq` (2.81%, −1.1 SE) — a scheduling decision, not a
> pass. **Carry-forward item #1, the montage spacing constraint, landed on 2026-08-20 and all nine
> gates now pass**: no route is below the 3% floor, and the two that were read **6.95% (+15.5 SE)**
> and **12.26% (+28.2 SE)**. The corpus baseline was regenerated with it; the fixture baseline and
> every golden run were untouched, and that null result is the evidence the change was
> route-generation-only.
>
> **It is a GATE fix, not a route fix, and one route got WORSE.** `r1dlxpt5` is still the worst in
> the corpus at roughly half its healthiest comparable, and `route.illicit.r1gjd3s6` regressed
> 16.51% → 11.32% by a mechanism ADR 0046 records as unresolved. **Carry-forward item #2 (path
> granularity / the ADR 0043 generator collapse) has NOT landed**, so the fix is still validated on
> n = 1 — the two breaching routes share 88.9% of their edges.
>
> Phase 3 covered M3.1–M3.12a plus the un-numbered recovery milestone (2026-08-14) and an
> adversarial verification pass. **The milestone-by-milestone history is `docs/PROGRESS.md`; it
> is not repeated here.** Two of its outputs bind current work: `BASE_EVENT_ODDS` is fenced at
> `1:0` (M3.12a), and the wear curve ships at `SAVE_VERSION` 6 (ADR 0040/0041).
>
> Steps **5-7 RUN** against a real corpus — 17 events, 137 modifiers, 25 complications,
> 16 universal choices, a complete `en` locale, `content:lint` clean (1 warning,
> `MISSING_IMAGE_MANIFEST`). **Every one of the six beat types is fillable** as of C3, so
> `pack.unfillableBeatTypes` is empty and beat fill is **48.5%** against a structural ceiling of
> 100%, rather than 28.2% against 55.8%. **Step 2 routes on real geography** (ADR 0033) and its
> diversity gate exits 0 at **median 53% (n = 747), p90 87%** — **but the median is not the
> finding**: **one** named pair still breaches the ceiling (Chongjin–Jeju City 80%, and it is
> **structural** — a degree-1 endpoint whose floor alone is 71%). The genuine filter defect that
> sat beside it, Valencia–Palermo, **was closed at C2** and now passes at 63%. Generation is
> COMPLETE and **the corpus sim runs on generated routes** (ADR 0034) — six endpoint pairs, five
> profiles, **28 routes** (ADR 0043); the APP still supplies `RunInit.route`. Steps 1, 3 and 4 do
> not exist. Three of §9's registries are live.
>
> **Every one of `docs/phase-3-dod.md`'s nine gates RUNS and PASSES.** Gate 9's failure was
> explained by **ADR 0044** — drain per HOUR, recovery per LEG, so a contiguous montage WALL (232
> of 509 hours in nine consecutive legs) is lethal at a total the same route survives when spread —
> and closed by **ADR 0046**, which caps montage runs at two. The fix converts COLLAPSE into
> ARRIVAL (`failure_collapsed` −4.65pp, `arrival_quiet` +4.05pp on `r1dlxpt5`) and leaves morale
> attrition untouched. Gate 9 and ADR 0043's generator collapse were **one bug**; only half of it
> is fixed, and item #2 is still open.
>
> **`peak` on `--by-route` is RETIRED (ADR 0046).** ADR 0044's addendum had already killed it as a
> dial; re-measured on the routes the spacing constraint produces it also failed its charter as a
> flag, ordering its own four comparables wrongly while `hours` — already printed — dominates it
> corpus-wide (ρ −0.956 against −0.940 at the best window). **No acceptance test may be written as
> a `peak` threshold, and there is no longer a column to write one against.** The criterion for any
> montage change is three parts: completion with its SE, the morale-floor share, and the ending
> histogram against a healthy comparable — and `--by-route` now prints all three.
>
> **The carry-forward items are ENGINE debt and are NOT Phase 4. Item #1 is DONE; item #2 is not.**
> Phase 4 is **the design system, mood, and motion foundation** — the app layer, §2 rules 9/10,
> pillar 7, and `docs/motion-inventory.md`. The sequencing question the closeout raised is now
> settled for the montage screen: item #1 landed first, and montage on `r1dlxpt5` is **seven
> isolated legs (5, 13, 17, 22, 26, 35, 40)** rather than one nine-leg block, so the montage screen
> is a short interlude and not a long summary sequence. Mood calibration reads the state
> distribution this fix moved, so calibrate against the CURRENT corpus baseline.
>
> **`docs/PROGRESS.md` is the authority on current state and this paragraph is not.**
> `docs/engine-spec.md` Part II is the authority on what the engine does, written from the code.
> **`docs/phase-3-dod.md` is the authority on what closing Phase 3 requires.**

---

## 2. Non-negotiable architectural rules

These have caused real damage in similar projects when broken. Do not "improve" them without asking.

> **All ten rules are binding now** — they govern code as it is written, not only once the
> subsystems exist. What varies is whether a rule is **mechanically enforced** today or rests
> on review, and each rule says which in one line. **`(planned)` means nothing will catch you
> breaking it, not that you may.**
>
> **The evidence for every rule — what enforces it, and that the guard was verified failing on
> a deliberate violation — is `docs/enforcement.md`.** It lives there because it had grown to
> ~90 lines of a file that argues for a ~400-line cap. Nothing was lost in the move.

1. **Events never reference other events by ID as a required next step.**
   The narrative graph is emergent, not authored. Events declare `requires` (a predicate over world
   state) and a `weight`. The director picks from the eligible pool. If you find yourself wanting
   `nextEventId`, use a **flag** plus a `requires` on the target event, or the **consequence queue**.
   The single exception is `scheduleEvent`, which is a _soft_ pointer resolved by the director.
   _Enforcement: **live** — `z.strictObject` + no successor field on `GameEvent`. `adr/0001`._

2. **`packages/engine` must never import React, React Native, Expo, or any DOM/native API.**
   It is pure TypeScript. It must run under plain Node so it can be simulated 20,000 times.
   No `Date.now()`, no `Math.random()`, no `fetch` inside the engine — all injected.
   _Enforcement: **live, four independent layers** — ESLint, tsconfig, a purity test, and a CI
   job that runs the engine under bare Node._

3. **`Math.random()` and `Date.now()` are banned repo-wide.** Randomness comes from the seeded
   `Rng`; time from the injected `Clock`, whose only sanctioned wall-clock read is
   `apps/mobile/src/clock/system-clock.ts`. Everything about a run must be reproducible from
   `(seed, choiceSequence, contentVersion)`.
   _Enforcement: **live** — a three-rule ESLint stack (`docs/adr/0002`), backstopped by
   golden-run replay, which is what catches nondeterminism a regex cannot see. **Proven on V8
   only; Hermes is untested (ADR 0012).** The `Clock` port is **(planned)**._

4. **No user-visible string literals in code or content data.** Only i18n keys.
   `title: "You lost your passport"` is a bug. `titleKey: "events.passport_lost.title"` is correct.
   _Enforcement: **live, by construction** — an event file has no text fields at all; keys are
   derived from ids. `content:lint` errors on a key missing from `en/`._
   **Exactly three exemptions, enumerated so none spreads:** `name` on a geo node, a real place's
   proper noun (`adr/0028`); the attribution block, which ships in English in every locale because
   a translated licence is a modified one (`adr/0024`); and **`apps/mobile/app/dev/**` plus
   `apps/mobile/src/dev/**`, the developer tools.** `GEO_NAME_FIELD_MISPLACED` enforces the first.
   The third is narrow and load-bearing in one direction only: `app/dev/_layout.tsx` returns `null`
   outside `__DEV__`, so Metro strips the subtree from a production bundle and no player can reach
   it — and an FPS meter labelled `dev.motionLab.worstFrame` is a worse diagnostic tool, not a
   better-localised one. **A dev surface that ever becomes player-reachable loses the exemption.**

5. **No text rendered inside generated images.** Ever. The game ships in 4 languages.
   _Enforcement: **(planned)** — `imagegen/` is empty and no images exist._

6. **Content is data, not code.** Events live in `packages/content/events/**.yaml`, validated by Zod
   at build time and in tests. Never hardcode an event in a `.ts` file.
   _Enforcement: **live** — Zod schemas held identical to the engine's types (ADR 0009/0019),
   `content:lint` in CI, and a round-trip test against the JSON fixture._

7. **Every state mutation goes through an `Effect`.** No direct mutation of `RunState` from UI code.
   The UI dispatches a choice; the engine returns a new state plus a list of applied effects.
   _Enforcement: **live** — `applyEffects` is the only writer and `RunState` is deeply readonly._

8. **The engine is deterministic and pure.** Shipped as two functions rather than one
   `resolve`: `advanceLeg(state, pack)` and `resolveChoice(state, pack, choiceId)`, each
   returning a new state plus a log. Side effects (persistence, audio, haptics, analytics)
   happen in the app layer by observing the log.
   _Enforcement: **live** — both entry points RETURN a typed `EngineError` and never throw; the
   RNG is derived from state and drained back, never injected._

9. **Animation is presentation, never mechanics.** The engine resolves the outcome and the
   state is persisted _before_ any animation starts. A die is shown landing on a number the
   engine already rolled. No animation may gate, delay, or influence a state change, and
   killing an animation mid-play must never corrupt state.
   _Enforcement: **(planned)** — no animation code exists._

10. **Every animation is skippable and speed-scaled.** All durations derive from motion
    tokens passed through the global speed scale. Any information conveyed only through
    movement must also survive Instant mode and reduce-motion as a static presentation.
    _Enforcement: **(planned)** — the "hardcoded duration is a lint error" clause is aspirational;
    no such rule exists yet. Review-only._

---

## 3. Repository layout

**Target** layout. `(planned)` = does not exist on disk; `(empty)` = only a `.gitkeep`. Do not
assume a `(planned)` path exists — create it in the phase that needs it. Verified 2026-08-14.

```
apps/mobile/                Expo app (UI only — no game rules here)
  app/                      expo-router routes                       ✅ _layout.tsx, index.tsx
  app/dev/                  dev tools — `null` outside __DEV__       ✅ 4 screens, session §9
  src/clock/                the ONE sanctioned wall-clock read       ✅
  src/design/               motion tokens + speed scale              ✅ motion.ts (tokens only)
  src/dev/                  frame meter · transitions · sweep · Hermes fixture ✅
  src/{features,audio}/     map · prep · journey · journal · sfx        (planned)
packages/engine/            Pure TS game engine                      ✅
  src/index.ts              public barrel                            ✅
  src/{ids,errors,rng}/     Brand<> ids · EngineError (returned) · PRNG + 8 substreams   ✅
  src/state/                RunState, clamping, digest, containers   ✅ ADR 0017
  src/predicate/            requires-DSL, 28 kinds + reason trace     ✅
  src/effects/              effect-DSL applier, 15 ops               ✅
  src/content/              GameEvent, ContentPack, the 2 registries ✅ ADR 0021/0022
  src/presentation/         moodFromState — derived, never set by UI      ✅ engine-spec II.1a
  src/director/             filters · scoring · ladder · beats · tension · quiet gate ✅ ADR 0029
  src/{queue,loop,migrate}/ consequence queue · advanceLeg/resolveChoice/replayRun · saves  ✅
  src/modifiers/            check tags, registry, resolution pipeline ✅ ADR 0015
  src/route/                graph · Dijkstra · Yen · legs · beats · gen ✅ 0025/0026/0027
packages/content/                                                    ✅
  events/                   17 seed events, grouped by category      ✅
  __fixtures__/events/      the 9 Phase 1 fixtures, frozen, UNLINTED ✅ ADR 0022
  modifiers · complications · universal-choices .yaml   137 · 25 · 16   ✅
  flags/items/npcs/traits/endings.yaml   declaration registries      ✅
  schema/ · loader/         Zod + terse->canonical · YAML w/ file:line:col   ✅ ADR 0009/0033
  i18n/en/                  complete — 157 event keys + 146 chip keys ✅
  geo/{nodes,edges}.gen.json   692 nodes · 1,215 edges · 1 component ✅ `pnpm geo:build`
  geo/overlay.yaml          the ONE hand-edited geo file — 8 rows    ✅ ADR 0033
  geo/sources.lock.json     source URLs · licences · hash pin        ✅ ADR 0024
  i18n/{tr,ru,de}/ · images/                                            (empty)
  images/manifest.json      image spec -> asset mapping                 (planned)
packages/tools/                                                      ✅
  shared/ · sim/            helpers · headless sim                  ✅
  geo-build/                derive · borders · rail · verify · audit ✅ ADR 0024/0030/0031
  content-lint/             19 rules inc. 10 GEO_*, file:line:col    ✅ CI job
  content-stats/            counts + 4-axis coverage report          ✅
  imagegen/ · i18n-check/                                              (empty)
docs/                       adr/0001-0045 · engine-spec · PROGRESS   ✅
  phase-3-dod.md            the NINE phase gates, runnable           ✅ §7
  phase-3-closeout.md       PHASE 3 CLOSED, GATE 9 RED — read first  ✅
  phase-3-verification.md   the measured handoff — 4 findings, 0 fixed ✅
  geo-data-licensing.md     source licences and attribution          ✅ ADR 0024
  enforcement.md            what enforces each §2 rule               ✅
  stack-notes.md            the dependency traps, in full            ✅
  content-style-guide.md    how to author; registry-vs-event         ✅
  sim-baseline{,-corpus}.md one balance baseline PER PACK            ✅
.claude/                    settings · 4 hooks · skills · agents     ✅ ADR 0003
```

> **`.claude/` is committed on purpose** so the guardrails are shared, not per-developer.
> Personal overrides go in `.claude/settings.local.json`, which is not tracked.
> **Hooks load at session start** — editing `settings.json` mid-session does not arm them.

---

## 4. Stack (verify versions before install)

✅ = installed and verified in the repo today. **(planned)** = named here as the intended
choice but **not installed** — do not `import` it and do not assume it exists. Compatibility
re-verified against Expo SDK 57.0.11 on 2026-08-07; SDK 57.0.11 is still npm `latest`.

- Expo SDK 57 / React Native 0.86.2 / React 19.2.3 / TypeScript **~6.0.3** strict ✅ all installed
  (TS 7 is npm `latest` but unusable here — no stable compiler API, and typescript-eslint
  caps at `<6.1.0`. ESLint is likewise pinned to `~9.39.5`, and Jest to `^29.7.0`, to match
  what Expo SDK 57 ships. **Read `docs/adr/0002` before changing any of those three.**)
- State: Zustand + Immer **(planned)** · Persistence: **`expo-sqlite/kv-store`** (SDK pin
  `~57.0.1`), **not** `react-native-mmkv` — MMKV pulls `react-native-nitro-modules`, which ends
  Expo Go and permanently blocks Rive. kv-store has the synchronous read the speed scale needs
  before first paint. See `docs/art-direction.md` §2.
- Animation: `react-native-reanimated` (v4+, foundation) ✅ 4.5.1 + `react-native-worklets` ✅ 0.10.1
  · `react-native-gesture-handler` ✅ ~2.32.0
  - **`moti` — DO NOT ADD** (verified incompatible; use Reanimated 4's built-in CSS
    animations API). `@shopify/react-native-skia` **(planned** — SDK pin `2.6.2`**)**.
    `rive-react-native` **(planned, has a nitro-modules collision with mmkv)**;
    `lottie-react-native` is the cheaper alternative. **Not usable: `anime.js`, web `motion`.**
  - **Real 3D (`expo-gl` + `three` + `@react-three/fiber`) is COMPATIBLE and deliberately unused.**
    r3f 9.7.0 peers `react >=19 <19.3` (satisfied), and `expo-gl` is SDK-pinned at `~57.0.2`. The
    disqualifier is not compatibility: r3f renders through `GLView` and calls `endFrameEXP()` per
    frame from the **JS thread**, with no worklet in the path — the same thread as the engine and
    every `resolveChoice`. Skia's `Matrix4`/`perspective`/`rotateX/Y` helpers are all `@worklet`,
    so perspective depth is reachable on the UI thread instead. `docs/art-direction.md` §2.
    **The reasoning for every one of those is `docs/stack-notes.md` — read it before adopting
    or rejecting any of them.**
- Lists: `@shopify/flash-list` **(planned** — SDK pin `2.0.2`**)** ·
  Images: `expo-image` ✅ · Map: `react-native-svg` **(planned** — SDK pin `15.15.4`**)**
- Canvas/glass: `@shopify/react-native-skia` ✅ **2.6.2** (SDK pin, installed) · `expo-blur` ✅
  `~57.0.2` · `expo-mesh-gradient`, `expo-glass-effect`, `expo-linear-gradient` **(planned,
  SDK-pinned)**
- Validation: Zod ✅ 4.4.3 (`packages/content/schema/` — 8 modules; see `docs/adr/0009`) ·
  i18n: `i18next` + `react-i18next` + `expo-localization` **(planned)**
- Tests: Vitest (engine, content, tools) ✅ + Jest ✅ **29.x, not 30** +
  `@testing-library/react-native` ✅ 14.x (**`render()` is async in v14 — `await render(...)`**)
- Package manager: pnpm workspaces ✅ 11.20.0

> **New Architecture is not optional** (RN 0.82 removed Paper; this repo is on 0.86.2), and
> **a wildcard peer (`"*"`) is the ABSENCE of a compatibility claim, not a promise of one** —
> moti, rive and mmkv all declare one and all three install silently regardless of whether they
> work. Prefer the Expo SDK pin over npm-latest. **`docs/stack-notes.md` has the detail, plus
> the open Hermes `Intl.PluralRules` risk that will bite the first translated plural key.**

> **pnpm 11 REFUSES to run a dependency's install script unless it is named in
> `pnpm-workspace.yaml`'s `onlyBuiltDependencies`, and it FAILS the install rather than warning.**
> `@shopify/react-native-skia` is there because its `postinstall` fetches the prebuilt native
> libraries; without it the module typechecks and then fails at native compile time, a long way
> from the cause. Keep that list an explicit allowlist with a reason per line — an install script
> is arbitrary code.

> **Version rule:** my training data has a cutoff, so check the real current version
> (`npm view <pkg> version`, `npx expo install --check`) before adding or upgrading anything
> rather than writing one from memory. Where it conflicts with the installed SDK, the SDK wins.

---

## 5. Commands

✅ exists and is verified working. `(planned)` does **not** exist — running it fails with
"command not found", and stubbing one to make it pass is not allowed. See `docs/PROGRESS.md`.

```bash
pnpm i                        # install                                            ✅
pnpm dev                      # expo start                                         ✅
pnpm typecheck                # tsc --noEmit across all packages                   ✅
pnpm lint                     # eslint + nested-config guard                       ✅
pnpm format / format:check    # prettier write / check                             ✅
pnpm test                     # vitest (packages) + jest (apps/mobile)             ✅
pnpm test:engine              # engine unit + golden-run tests only (fast)         ✅

pnpm content:lint             # validate events, refs, orphan flags, tags, i18n, safety   ✅
pnpm content:lint -- --fix    # sort registries by id, dedupe list fields (nothing else)  ✅
pnpm content:stats            # counts by category/tag/check-tag + a 4-axis coverage report  ✅
pnpm sim -- --runs=20000      # headless balance simulation (fixture pack)                 ✅
pnpm sim -- --pack=corpus     # sim against packages/content/ — the REAL registries         ✅
pnpm sim -- --json            # per-run TRACE (fired events + picks in order) not the report ✅
pnpm sim -- --by-route        # per-route completion + SE + peak — gate 9. Writes nothing    ✅
pnpm sim -- --moods           # mood occupancy per route — mood calibration. Writes nothing ✅
pnpm sim:diff -- --runs=2000  # vs the pack's baseline. REFUSES another count — see DoD 6  ✅
pnpm golden:update            # regenerate golden-runs.json from the engine — REVIEW the diff ✅
pnpm hermes:fixture           # build the on-device replay fixture; VERIFIES on V8 before writing ✅
pnpm geo:audit [-- --real]    # candidate pool vs the ADR 0024 budget; writes nothing        ✅
pnpm geo:build                # derive the slice at the PINNED bbox and write the artifacts  ✅
pnpm geo:diversity            # the M3.5 go/no-go: median route overlap vs a 70% ceiling     ✅
pnpm geo:verify               # named pairs, diversity, pathologies, benchmark               ✅

pnpm images:{plan,gen,sheet}  # build-time AI image pipeline                           (planned)
pnpm i18n:{check,pseudo}      # key coverage, length audit, pseudo-localization        (planned)
```

If a command in this list does not exist yet, that means the corresponding phase has not shipped.
Do not invent an alternative — say so.

> **`--json`, `--by-route`, `--moods` and the default report are FOUR MUTUALLY EXCLUSIVE output
> modes**, and `parse-args.ts` refuses the combinations rather than silently ranking them. Both
> `--by-route` and `--moods` return before `formatReport` is called, so neither can write
> `reports/` and neither can move either baseline — the whole reason they are modes rather than
> report sections (`docs/adr/0042`). `--moods` has a second reason of its own: **gate 9 needs
> 280,000 runs to resolve a tail and a distributional mean converges in a fraction of that**, so
> the two want different counts and must not share an invocation.

---

## 6. Conventions

- **TypeScript:** strict, `noUncheckedIndexedAccess: true`. No `any`. No non-null `!` assertions
  outside tests. Prefer discriminated unions over optional-field soup.
- **No default exports** except expo-router route files.
- **Naming:** event IDs are `snake_case` and namespaced by category: `border.bribe_attempt`,
  `transit.bus_ejection`, `rest.pickpocket_victim`. IDs are permanent — never rename, deprecate.
- **Files:** one exported concept per file. Engine files should be readable end-to-end without
  scrolling past ~200 lines; split otherwise.
- **Comments:** explain _why_, never _what_. Predicate and balance decisions deserve a comment.
- **Commits:** `type(scope): summary` — `feat(director): add tension curve weighting`.
  One logical change per commit. Never commit generated images or `reports/` output.

---

## 7. Definition of Done (applies to every task)

A change is not done until all of these pass:

1. `pnpm typecheck` clean
2. `pnpm lint` clean
3. `pnpm test` green
4. `pnpm content:lint` clean (if content or schema touched) ✅ **exists since Phase 2A M2A.6**.
   Exits 1 on an error, 0 with warnings — the warnings are real findings, so read them.
5. New behavior has a test. Bug fixes have a **regression test that fails before the fix**.
6. If engine behavior changed: `pnpm sim:diff -- --runs=2000`, and the delta explained.
   **Diff BOTH packs** — `--pack=fixture` (default, the empty-registry control the golden runs
   are built on) and `--pack=corpus` (the real content). A change can move one and not the other,
   and which one it moves is the finding. **The count is not a suggestion**: both baselines were
   generated at 2,000, and `sim:diff` refuses a mismatched count rather than print sampling noise
   as a regression. ADR 0032.
7. If a decision was non-obvious: an ADR added to `docs/adr/NNNN-title.md`.
8. `CLAUDE.md` updated if a command, rule, or layout changed.

State the DoD results explicitly at the end of your response. Do not claim something passes
without having actually run it.

> **The PHASE gate is `docs/phase-3-dod.md`** — the nine gates Phase 3 must clear before it
> closes, each naming a command that runs today and a pass condition readable off its output.
> The list above is the per-TASK gate and every task still owes it; the phase file is additional,
> not a substitute. It lives in the repo so it can be reviewed in a diff and run in CI, which is
> exactly what the previous copy — in a plan file outside git — could not be.

> **Items 1–3 are enforced at commit time**, not left to good intentions: the PreToolUse
> hook `.claude/hooks/gate-commit.mjs` blocks `git commit` when the checks for the packages
> you actually staged do not pass. It is scoped to those packages (a docs-only commit costs
> ~113ms, a `packages/engine` commit ~5.9s, versus ~11.9s for the whole monorepo), and it
> **fails closed** — if it cannot work out what changed, it refuses. The deliberate escape
> hatch is `ODYSSEY_GATE_SKIP=1`. See `docs/adr/0003`.

---

## 8. How I want you to work

- **Plan before large changes.** For anything touching more than ~3 files, produce a short plan
  (files, order, risks, test strategy) and wait for approval.
- **Small, verifiable steps.** Prefer a working slice over a large unverified one.
- **Read before writing.** Check existing schemas and helpers; this project has strong conventions
  and duplicated logic is the main failure mode.
- **Say "I don't know."** If a library API, an Expo behavior, or a version is uncertain, look it up
  or state the uncertainty. Do not produce plausible-looking API calls from memory.
- **Push back.** If a request conflicts with the rules in section 2, or would create a balance,
  performance, or localization problem, say so before implementing.
- **Never mass-generate content without the linter passing on a sample of 3 first.**
- **Do not add dependencies casually.** Each new dependency needs a one-line justification and a
  note on New Architecture compatibility.

---

## 9. The content model in one page

> **`RunState`'s shape is NOT sketched here any more.** It was, for six sessions, and the sketch
> was wrong in four ways at once — it showed a `montageLegs[]` that did not exist, omitted
> `totalKm`, `beatSchedule`, `legLocations`, `weather`, `presentation` and `status`, and listed
> four skills against `SKILL_KEYS`' five. A duplicate that must be maintained will not be.
> **`packages/engine/src/state/run-state.ts` is the shape; `docs/engine-spec.md` Part II is the
> prose, printed from the built barrel rather than transcribed.** Do not paste a sketch into
> either.

An **Event** = `{ id, weight, requires, context, cooldown, priority, textKeys, imageRef, choices[] }`
A **Choice** = `{ id, labelKey, requires?, hiddenUnless?, costs?, skillCheck? | search?, outcomes[] }`
An **Outcome** = `{ weight, requires?, textKey|textVariants[], effects[], schedule?[] }`

**Diversity is combinatorial, not authored.** Four registries multiply a small corpus into a
large play space, declared once rather than per event: **`modifiers.yaml`** ✅ 137 (check
modifiers, injected by check tag) · **`complications.yaml`** ✅ 25 (situational layers on a
selected event) · **`universal-choices.yaml`** ✅ 16 (choices injected by tag match) ·
`quirks.yaml` **(planned)** (NPC traits that register as modifiers).

Writing a modifier or complication into one event's YAML, when it belongs in a registry, is the
content anti-pattern that caps this game's replayability. `docs/content-style-guide.md` is the
working guide, and its subject is exactly that call.

Full spec: `docs/engine-spec.md`.

**Who owns these types.** `packages/engine/src/content/` owns the TypeScript types.
`packages/content/schema/` owns the Zod schemas and is authoritative over _content semantics_ —
which fields a YAML file may have, which values are legal, what an omitted key defaults to. The
two cannot disagree about a field's presence, type or nullability without failing the build.

**The mechanism is not what ADR 0009 originally claimed**, and the difference matters when you
are debugging a conformance failure: it is the builders' `: GameEvent` return annotations that
catch drift, not the `Equals` assertions, most of which are tautologies. **Read `docs/adr/0019`
before touching the harness** — it was measured one deliberate break at a time, and it records
which of eight failure kinds each layer actually catches. Derive a vocabulary rather than assert
it wherever the shape allows (`z.enum(BEAT_TYPES)` cannot drift).

So if `docs/engine-spec.md` and the schema disagree about what content _means_, the schema is
right and the doc is a bug. If the schema and the engine type disagree about _shape_, the build
fails and neither is right.

---

## 10. Design pillars (use these to break ties)

1. **Consequence over difficulty.** A bad outcome should be _interesting_, not just punishing.
   Losing your passport opens a storyline; it does not end the run.
2. **Legible randomness.** The player must be able to reconstruct _why_ something happened.
   Surface the reason ("no visa · night crossing · nervous demeanor") in the result screen.
3. **The world reacts.** If the state changed meaningfully, the presentation changes: palette,
   ambience, vignette, event pool. Wanted → sirens. Broke → desaturation. Night desert → warm dark.
4. **No dead ends before the halfway point.** Early failure states must have an escape route.
5. **Readable in 15 seconds.** Event body ≤ 60 words. Choices ≤ 8 words each. This is a phone game.
6. **Tone: grounded, dry, occasionally funny. Never zany.** Think travel journal, not sitcom.
7. **Motion carries meaning.** This is a game of text and stills; movement is the only
   tactility we have. But a player on their fifth run must be able to skip all of it and
   lose nothing. Animation that only decorates gets cut.
   See `docs/motion-inventory.md` — **(planned)**, that file does not exist yet.

---

## 11. Content and safety guardrails

The game deals with borders, smuggling, theft, police, and poverty. That is fine as fiction.
But content must not:

- provide real-world actionable instructions (document forgery methods, evading specific border
  controls, drug synthesis or concealment techniques, hacking steps),
- target real ethnic, national, or religious groups as villains, or reproduce stereotypes as
  mechanics ("region X = corrupt"). Corruption is a _situation_, not a _people_,
- depict minors in danger, sexual content, or graphic torture,
- name real, living individuals, institutions, or brands.

**Geography is real; character is not.** The map uses real cities, coordinates, distances,
borders and ports — that is a core feature. But no event may attach danger, corruption, or
behaviour to a specific real country or nationality, and no data file may carry a real-world
"danger index" per country. Difficulty comes from the route PROFILE (illicit, night crossing,
missing documents) and the player's STATE (heat, reputation, resources), never from where the
player happens to be. An event fires at "a border crossing", not at a named country's border.

**This binds the geo data too, where it is mechanically checkable.** No file in
`packages/content/geo/` may carry a country code or a per-country risk, danger or corruption field —
a node's `services` and `terrain` are physical facts derived from settlement size and elevation, never
behavioural judgements, and a border-crossing node is typed and never named. `adr/0024` records the
derivations; `GEO_NAMED_BORDER` and `GEO_PLACE_BEHAVIOUR` are errors rather than warnings because
they are structural and admit no false positive.

When in doubt, flag the event for human review with `review: needed` instead of guessing.

---

## 12. Session ritual

**At session start:** read this file, run `pnpm typecheck && pnpm test` if the last session ended
mid-task, then state (a) what you understand the current task to be, (b) what you will touch,
(c) anything in the repo that contradicts this file.

**At session end:** update `docs/PROGRESS.md` with what shipped, what is half-done, and the exact
next step. Assume the next session starts with zero memory of this one.
