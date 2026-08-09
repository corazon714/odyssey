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

> **Status: Phase 1, 2A and 2B complete (2026-08-09).** Steps **5-7 RUN** against a real
> corpus — 13 events, 137 modifiers, 25 complications, 15 universal choices, a complete `en`
> locale, `content:lint` clean, and `--pack=corpus` completing 44.1% inside engine-spec 6's
> 30-50% band. **Steps 1-4 do NOT**: no map, no route generation, no preparation screen; the
> route is caller-supplied via `RunInit.route`. Three of §9's four registries are live —
> `quirks.yaml` is not.
>
> **`docs/PROGRESS.md` is the authority on current state and this paragraph is not** — it is a
> pointer with a date on it. `docs/engine-spec.md` Part II is the authority on what the engine
> does, written from the code.

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
assume a `(planned)` path exists — create it in the phase that needs it. Verified 2026-08-09.

```
apps/mobile/                Expo app (UI only — no game rules here)
  app/                      expo-router routes                       ✅ _layout.tsx, index.tsx
  src/clock/                the ONE sanctioned wall-clock read       ✅
  src/{features,design,audio}/  map · prep · journey · journal · tokens · sfx   (planned)
packages/engine/            Pure TS game engine                      ✅
  src/index.ts              public barrel                            ✅
  src/{ids,errors,rng}/     Brand<> ids · EngineError (returned) · PRNG + 8 substreams   ✅
  src/state/                RunState, clamping, digest, containers   ✅ ADR 0017
  src/predicate/            requires-DSL, 28 kinds + reason trace     ✅
  src/effects/              effect-DSL applier, 15 ops               ✅
  src/content/              GameEvent, ContentPack, the 2 registries ✅ ADR 0021/0022
  src/director/             filters, scoring, ladder, beats, tension ✅
  src/{queue,loop,migrate}/ consequence queue · advanceLeg/resolveChoice/replayRun · saves  ✅
  src/modifiers/            check tags, registry, resolution pipeline ✅ ADR 0015
  src/route/                route graph, k-shortest paths               (planned — NEXT)
packages/content/                                                    ✅
  events/                   13 seed events, grouped by category      ✅
  __fixtures__/events/      the 9 Phase 1 fixtures, frozen, UNLINTED ✅ ADR 0022
  modifiers · complications · universal-choices .yaml   137 · 25 · 15   ✅
  flags/items/npcs/traits/endings.yaml   declaration registries      ✅
  schema/ · loader/         Zod + terse->canonical · YAML w/ file:line:col   ✅ ADR 0009
  i18n/en/                  complete — 157 event keys + 146 chip keys ✅
  i18n/{tr,ru,de}/ · geo/ · images/                                     (empty)
  images/manifest.json      image spec -> asset mapping                 (planned)
packages/tools/                                                      ✅
  shared/ · sim/            helpers · headless sim + engine-spec 6 report  ✅
  content-lint/             15 rules, file:line:col, --fix           ✅ CI job
  content-stats/            counts + 4-axis coverage report          ✅
  imagegen/ · i18n-check/                                              (empty)
docs/                       adr/0001-0022 · engine-spec · PROGRESS   ✅
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
- State: Zustand + Immer **(planned)** · Persistence: `react-native-mmkv` **(planned)**
- Animation: `react-native-reanimated` (v4+, foundation) ✅ 4.5.1 + `react-native-worklets` ✅ 0.10.1
  · `react-native-gesture-handler` ✅ ~2.32.0
  - **`moti` — DO NOT ADD** (verified incompatible; use Reanimated 4's built-in CSS
    animations API). `@shopify/react-native-skia` **(planned** — SDK pin `2.6.2`**)**.
    `rive-react-native` **(planned, has a nitro-modules collision with mmkv)**;
    `lottie-react-native` is the cheaper alternative. **Not usable: `anime.js`, web `motion`.**
    **The reasoning for every one of those is `docs/stack-notes.md` — read it before adopting
    or rejecting any of them.**
- Lists: `@shopify/flash-list` **(planned** — SDK pin `2.0.2`**)** ·
  Images: `expo-image` ✅ · Map: `react-native-svg` **(planned** — SDK pin `15.15.4`**)**
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

> **Version rule:** My training data has a cutoff. Before adding or upgrading any dependency,
> check the actual current version (`npm view <pkg> version`, `npx expo install --check`,
> or the Expo SDK docs) rather than writing a version number from memory. If a version I
> suggest conflicts with the installed Expo SDK, the SDK wins — use `npx expo install`.

---

## 5. Commands

Commands marked ✅ exist today and are verified working. Everything marked `(planned)` does
**not** exist — running it fails with "command not found". Do not stub these to make them
pass. See `docs/PROGRESS.md`.

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
pnpm sim:diff                 # compare latest sim to its pack's baseline                ✅
pnpm golden:update            # regenerate golden-runs.json from the engine — REVIEW the diff ✅

pnpm images:{plan,gen,sheet}  # build-time AI image pipeline                           (planned)
pnpm i18n:{check,pseudo}      # key coverage, length audit, pseudo-localization        (planned)
```

If a command in this list does not exist yet, that means the corresponding phase has not shipped.
Do not invent an alternative — say so.

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
6. If engine behavior changed: `pnpm sim -- --runs=5000` run and the report delta explained.
   ✅ **the harness exists** — it has since Phase 1 M10, and this item said otherwise for four
   sessions. Two packs, two baselines: `--pack=fixture` (default) against `docs/sim-baseline.md`
   is the stable control the golden runs are built on; `--pack=corpus` against
   `docs/sim-baseline-corpus.md` is the real content. **Diff both** — a change can move one and
   not the other, and which one it moves is the finding.
7. If a decision was non-obvious: an ADR added to `docs/adr/NNNN-title.md`.
8. `CLAUDE.md` updated if a command, rule, or layout changed.

State the DoD results explicitly at the end of your response. Do not claim something passes
without having actually run it.

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

> **A summary, not a specification.** Where this disagrees with the code, the code wins and
> `docs/engine-spec.md` Part II is the written authority. The sketch is kept because it reads
> as one page.

```
RunState
├─ seed, rngCursors            deterministic randomness
├─ clock  { day, hour, weekday }
├─ route  { nodes[], edges[], legIndex, legCount, progressKm, montageLegs[] }
│                              leg count scales SUB-linearly with distance, capped 22-48
│                              (10-16 for short-trip mode); overflow becomes montage legs
├─ transport { mode, vehicleId?, condition, fuel }
├─ resources { cash, bank, energy, health, morale, hunger, hygiene, heat, reputation }
├─ skills   { negotiation, stealth, mechanics, streetwise, languages[] }
├─ traits[]                    from preparation choices; permanent modifiers
├─ inventory { person, bag|null, vehicle|null, stash|null }  slots + searchDC each
├─ documents { passport, visas{}, tickets[] }  each records its carrying container
├─ flags    { id -> { value, setAtLeg, expiresAtLeg? } }     ← memory
├─ relationships { npcId -> { trust, met, lastSeenLeg } }    ← memory
├─ eventMemory   { eventId -> { count, lastLeg } }           ← memory
├─ pendingEvents []            consequence queue              ← memory
├─ history[]                   journal entries + ending inputs
└─ tension                     director pacing signal
```

An **Event** = `{ id, weight, requires, context, cooldown, priority, textKeys, imageRef, choices[] }`
A **Choice** = `{ id, labelKey, requires?, hiddenUnless?, costs?, skillCheck? | search?, outcomes[] }`
An **Outcome** = `{ weight, requires?, textKey|textVariants[], effects[], schedule?[] }`

**Diversity is combinatorial, not authored.** Four registries multiply a small corpus into a
large play space, declared once rather than per event: **`modifiers.yaml`** ✅ 137 (check
modifiers, injected by check tag) · **`complications.yaml`** ✅ 25 (situational layers on a
selected event) · **`universal-choices.yaml`** ✅ 15 (choices injected by tag match) ·
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

When in doubt, flag the event for human review with `review: needed` instead of guessing.

---

## 12. Session ritual

**At session start:** read this file, run `pnpm typecheck && pnpm test` if the last session ended
mid-task, then state (a) what you understand the current task to be, (b) what you will touch,
(c) anything in the repo that contradicts this file.

**At session end:** update `docs/PROGRESS.md` with what shipped, what is half-done, and the exact
next step. Assume the next session starts with zero memory of this one.
