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

> **Status as of 2026-08-08 — Phase 1 complete.** Steps 5, 6 and 7 RUN: the leg loop, event
> selection from a filtered and scored pool, choices resolving to weighted outcomes, and all
> four memory mechanisms. `pnpm sim -- --runs=20000` completes twenty thousand journeys.
>
> Steps 1-4 do NOT: no map, no route generation, no preparation screen. The route is
> caller-supplied via `RunInit.route`. There is no content — the nine events under
> `packages/engine/src/__tests__/__fixtures__/` are test fixtures, not the seed corpus.
>
> `docs/PROGRESS.md` is the authority on current state; `docs/engine-spec.md` Part II is the
> authority on what the engine actually does, written from the code.

---

## 2. Non-negotiable architectural rules

These have caused real damage in similar projects when broken. Do not "improve" them without asking.

> **All ten rules are binding now** — they govern code as it is written, not only once the
> subsystems exist. What varies is whether a rule is **mechanically enforced** today or rests
> on review. Each rule below states which. `(planned)` on an enforcement mechanism means the
> rule still applies; nothing will catch you breaking it. Verified 2026-08-07.

1. **Events never reference other events by ID as a required next step.**
   The narrative graph is emergent, not authored. Events declare `requires` (a predicate over world
   state) and a `weight`. The director picks from the eligible pool. If you find yourself wanting
   `nextEventId`, use a **flag** plus a `requires` on the target event, or the **consequence queue**.
   The single exception is `scheduleEvent`, which is a _soft_ pointer resolved by the director.
   _Enforcement: **partial.** The content linter (which must reject `nextEventId`) is still
   Phase 2. But the engine now has NO field an event could point with: `GameEvent` has no
   successor, and `scheduleEvent` is a queue entry the director may decline. The sim reports
   scheduled-vs-fired, so a soft pointer that never resolves is visible. Rationale: `adr/0001`._

2. **`packages/engine` must never import React, React Native, Expo, or any DOM/native API.**
   It is pure TypeScript. It must run under plain Node so it can be simulated 20,000 times.
   No `Date.now()`, no `Math.random()`, no `fetch` inside the engine — all injected.
   _Enforcement: **live, four independent layers.** ESLint `no-restricted-imports` +
   `no-restricted-globals` scoped to `packages/engine/**`; `tsconfig.src.json` with
   `types: []` and no `DOM` in `lib` (so `document`/`process` do not typecheck);
   `src/__tests__/purity.test.ts` scanning source and manifest; and the CI job
   `engine-under-plain-node`, which executes the engine entry under bare Node. All verified
   failing on a deliberate violation before being trusted._

3. **`Math.random()` and `Date.now()` are banned repo-wide**, enforced by a three-rule ESLint
   stack: `no-restricted-properties` (dot access and destructuring), `no-restricted-syntax`
   (argless `new Date()`, computed `Math['random']`), and `no-restricted-globals` (DOM/native
   globals inside the engine). `no-restricted-globals` alone cannot express this — it matches
   bare global identifiers, so it could only ban all of `Math`. See `docs/adr/0002`.
   Randomness comes from the seeded `Rng` service. Time comes from the injected `Clock`; the
   only sanctioned wall-clock read is `apps/mobile/src/clock/system-clock.ts`.
   Everything about a run must be reproducible from `(seed, choiceSequence, contentVersion)`.
   _Enforcement: **live** — verified catching `Math.random()`, `Math['random']`,
   `const { random } = Math`, `Date.now()`, `Date['now']`, `new Date()` and `Date()`.
   The `Rng` service and golden-run replay are now **live** — `replayRun` reproduces a run
   byte-for-byte from `(seed, choiceSequence, contentVersion)`, which is the backstop that
   catches obfuscated nondeterminism. `purity.test.ts` additionally bans implementation-
   approximated and locale-dependent APIs. **Proven on V8 only; Hermes is untested — ADR 0012.**
   The `Clock` port remains **(planned)**: the engine takes no clock, it advances its own._

4. **No user-visible string literals in code or content data.** Only i18n keys.
   `title: "You lost your passport"` is a bug. `titleKey: "events.passport_lost.title"` is correct.
   _Enforcement: **(planned)** — "enforced by the content linter" describes an intent, not a
   fact: `packages/tools/content-lint/` is empty. Today this rests on review. The rule is
   already being honoured in app code — `apps/mobile/app/index.tsx` renders the key
   `app.placeholder.title` rather than copy._

5. **No text rendered inside generated images.** Ever. The game ships in 4 languages.
   _Enforcement: **(planned)** — `packages/tools/imagegen/` is empty and no images exist.
   Human review of the contact sheet is the intended mechanism._

6. **Content is data, not code.** Events live in `packages/content/events/**.yaml`, validated by Zod
   at build time and in tests. Never hardcode an event in a `.ts` file.
   _Enforcement: **(planned)** — `packages/content/events/` is empty, `schema/index.ts` is an
   empty barrel, and Zod is installed but unused (Phase 2). But `createContentPack` DOES
   validate: it reports `danglingRefs`, `duplicateIds` and `unfillableBeatTypes`, and the
   Phase 1 fixtures are JSON DATA files, never `.ts`. See ADR 0009 for who owns the types._

7. **Every state mutation goes through an `Effect`.** No direct mutation of `RunState` from UI code.
   The UI dispatches a choice; the engine returns a new state plus a list of applied effects.
   _Enforcement: **live.** `applyEffects` is the only writer; `RunState` is deeply readonly,
   and `effects/__tests__/purity-and-sharing.test.ts` deep-freezes the input and applies all
   12 ops. Module code is strict, so an in-place write throws. The freeze is itself guarded._

8. **The engine is deterministic and pure.** Shipped as two functions rather than one
   `resolve`: `advanceLeg(state, pack)` and `resolveChoice(state, pack, choiceId)`, each
   returning a new state plus a log. Side effects (persistence, audio, haptics, analytics)
   happen in the app layer by observing the log.
   _Enforcement: **live.** Package purity per rule 2; both entry points RETURN a typed
   `EngineError` and never throw; the RNG is derived from state and drained back, never
   injected, so a caller cannot desynchronise replay. See `docs/engine-spec.md` Part II._

9. **Animation is presentation, never mechanics.** The engine resolves the outcome and the
   state is persisted _before_ any animation starts. A die is shown landing on a number the
   engine already rolled. No animation may gate, delay, or influence a state change, and
   killing an animation mid-play must never corrupt state.
   _Enforcement: **(planned)** — no animation code exists. This is an architectural
   constraint on Phase 3+, not something the toolchain can check._

10. **Every animation is skippable and speed-scaled.** All durations derive from motion
    tokens passed through the global speed scale. A hardcoded duration in a component is a
    lint error. Any information conveyed only through movement must also survive Instant
    mode and reduce-motion as a static presentation.
    _Enforcement: **(planned)** — "a hardcoded duration in a component is a lint error" is
    **not true today**: no such rule exists in `eslint.config.mjs`, and there are no motion
    tokens and no speed scale. Writing that rule is part of the phase that introduces
    motion tokens; until then this is review-only._

---

## 3. Repository layout

This is the **target** layout. `(planned)` marks a path that does not exist on disk today;
`(empty)` marks a directory that exists but holds only a `.gitkeep`. Verified 2026-08-07.
Do not assume a `(planned)` path exists — create it in the phase that needs it.

```
apps/mobile/                Expo app (UI only — no game rules here)
  app/                      expo-router routes                          ✅ _layout.tsx, index.tsx
  src/clock/                the ONE sanctioned wall-clock read          ✅ (not in original layout)
  src/features/             map, preparation, journey, journal, settings   (planned)
  src/design/               tokens, theme, mood system, primitives         (planned)
  src/audio/                ambience + sfx manager                         (planned)
packages/engine/            Pure TS game engine                         ✅ package exists
  src/index.ts              public barrel, 159 exports                  ✅ Phase 1 complete
  src/ids/                  Brand<> + 12 branded content id types       ✅
  src/errors/               EngineError — RETURNED, never thrown        ✅ (not in original layout)
  src/rng/                  counter-based PRNG + 8 named substreams     ✅
  src/state/                RunState, clamping, digest, flag access     ✅
  src/predicate/            requires-DSL, 27 kinds + reason trace       ✅
  src/effects/              effect-DSL applier, 12 ops, ModifierSource  ✅
  src/content/              GameEvent types + ContentPack               ✅ (not in original layout)
  src/director/             filters, scoring, ladder, beats, tension    ✅
  src/queue/                consequence queue: caps, eviction, rebase   ✅ (not in original layout)
  src/loop/                 advanceLeg · resolveChoice · replayRun      ✅ (not in original layout)
  src/migrate/              save migration ladder + content reconcile   ✅ (not in original layout)
  src/route/                route graph traversal, k-shortest paths        (planned — Phase 2)
packages/content/                                                       ✅ package exists
  events/                   *.yaml event definitions (grouped by category) (empty)
  geo/                      nodes.json, edges.json, world.simplified.geojson (empty)
  i18n/                     en/, tr/, ru/, de/                             (empty — all four)
  images/                   asset directory                                (empty)
  images/manifest.json      image spec -> asset mapping                    (planned)
  schema/                   Zod schemas (single source of truth)        ✅ empty barrel, no schemas yet
packages/tools/                                                         ✅ package exists
  shared/                   cross-tool helpers (findWorkspaceRoot)      ✅ (not in original layout)
  sim/                      headless sim harness + engine-spec 6 report  ✅ 11 files
  content-lint/             structural + semantic content validation       (empty)
  imagegen/                 build-time AI image pipeline                   (empty)
  i18n-check/               key coverage, pseudo-loc, length audit         (empty)
docs/                       ADRs, design docs, content style guide      ✅ engine-spec, PROGRESS, adr/0001-0004
                            design docs + content style guide              (planned)
.claude/                    Claude Code extension layer                 ✅ (not in original layout)
  settings.json             permissions + hook wiring                   ✅ committed, shared
  hooks/                    4 guard scripts (Node .mjs)                 ✅ see docs/adr/0003
  skills/handoff/           context-reset handoff note                  ✅ /handoff
  agents/code-reviewer.md   reviews a diff against section 2            ✅
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
  - ~~`moti` (declarative layer)~~ — **DO NOT ADD. Verified incompatible 2026-08-07.**
    Use **Reanimated 4's built-in CSS animations/transitions API** instead (`animationName`,
    `animationDuration`, `transitionProperty`, …). It is first-party, needs no extra
    dependency, and covers moti's entire purpose. Reasons moti is out, in order of severity:
    (a) moti value-imports `framer-motion@6` (`import { usePresence, PresenceContext }` in the
    HOC behind every moti component); framer-motion 6 peers `react: >=16.8 || ^17 || ^18`, so
    **React 19.2.3 satisfies none of them**; (b) framer-motion 6 depends on `@motionone/dom` —
    the engine that became web `motion`, which the line below explicitly bans; (c) moti is
    self-described as "powered by Reanimated 3", last published 2025-01-29, with issue #391
    ("Expo 54 and Reanimated 4 support") open and unanswered. Its peer is `*`, so **it installs
    without complaint and fails at runtime** — that is why it needs a hard note here.
  - `@shopify/react-native-skia` (canvas: dice, particles, ambient) **(planned)** — compatible.
    Install the **SDK pin `2.6.2`** via `npx expo install`, not npm-latest 2.11.0. Peers
    `react-native-reanimated >=4.0.0` + `react-native-worklets >=0.7.0`, which this repo
    already satisfies. In Expo Go.
  - `rive-react-native` (parameterised set pieces) **(planned — see caveat before adopting)**.
    Not in SDK 57 `bundledNativeModules`, so `npx expo install` will not pin it and it needs a
    dev client. `rive-react-native@9.8.5` declares only wildcard peers (no RN 0.86 claim
    either way). Its successor `@rive-app/react-native@0.4.19` peers
    `react-native-nitro-modules >=0.35.10 <0.36`, which **collides with `react-native-mmkv`**:
    mmkv peers nitro `*` and resolves to 0.36.5 by default. Using both means pinning nitro to
    `0.35.10` by hand. **Alternative if that is not worth it: `lottie-react-native`, which IS
    in SDK 57 bundledNativeModules (`~7.3.8`)** and is therefore version-managed by
    `npx expo install` like every other Expo dependency.
  - `react-native-gesture-handler` ✅ ~2.32.0
    **Not usable here: `anime.js`, web `motion` — both target the DOM.**
- Lists: `@shopify/flash-list` **(planned** — SDK pin `2.0.2`, not npm-latest 2.3.2**)** ·
  Images: `expo-image` ✅ · Map: `react-native-svg` **(planned** — SDK pin `15.15.4`**)**
- Validation: Zod ✅ 4.4.3 (installed in `packages/content`, not yet used) ·
  i18n: `i18next` + `react-i18next` + `expo-localization` **(planned)**
- Tests: Vitest (engine, content, tools) ✅ + Jest ✅ **29.x, not 30** +
  `@testing-library/react-native` ✅ 14.x (**`render()` is async in v14 — `await render(...)`**)
- Package manager: pnpm workspaces ✅ 11.20.0

> **New Architecture is not optional.** RN 0.82 removed the legacy (Paper) architecture —
> setting `newArchEnabled=false` is ignored. This repo is on RN 0.86.2, so every native
> dependency must support Fabric/TurboModules. There is no fallback to negotiate.

> **Two traps when adding anything from the list above.** (1) Prefer the Expo SDK pin over
> npm-latest — `bundledNativeModules.json` pins Skia to 2.6.2 and FlashList to 2.0.2, both
> well behind latest, and `npx expo install` is what respects that. (2) A wildcard peer
> (`"*"`) is the _absence_ of a compatibility claim, not a promise of one. moti, rive and
> mmkv all declare wildcards; all three install silently regardless of whether they work.

> **Known open risk — i18n plurals (planned work, flag now).** i18next's own docs state the
> Hermes engine does not implement `Intl.PluralRules`. Russian has four plural forms, so
> without a polyfill (`@formatjs/intl-pluralrules`, pure JS) ru and likely de pluralisation
> will silently fall back to English one/other. Not yet measured against the Hermes build in
> RN 0.86 — verify before writing plural keys.

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

pnpm content:lint             # validate all events, predicates, i18n keys, image refs  (planned)
pnpm content:stats            # counts by category/region/tag, coverage gaps            (planned)
pnpm sim -- --runs=20000      # headless balance simulation                                 ✅
pnpm sim:diff                 # compare latest sim to docs/sim-baseline.md                ✅

pnpm images:plan              # what would be generated/regenerated (dry run, cost)     (planned)
pnpm images:gen               # generate missing/stale images                           (planned)
pnpm images:sheet             # build reports/contact-sheet.html for human review       (planned)

pnpm i18n:check               # missing keys, unused keys, length overflow risk          (planned)
pnpm i18n:pseudo              # run app with pseudo-localized strings                    (planned)
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
4. `pnpm content:lint` clean (if content or schema touched) — **(planned)**: the command does
   not exist yet. Until it does, report this item as **N/A**, never as passing.
5. New behavior has a test. Bug fixes have a **regression test that fails before the fix**.
6. If engine behavior changed: `pnpm sim -- --runs=5000` run and the report delta explained.
   — **(planned)**: same as 4. Report **N/A** while the harness does not exist.
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

> **Status: entirely (planned).** No part of this section exists in code. There is no
> `RunState` type, no `Event`/`Choice`/`Outcome` type, no Zod schema, and none of the four
> registry YAML files. `packages/content/schema/index.ts` is an empty barrel. This is the
> **specification to build against** in Phase 1 — treat it as a design contract, and never
> as an API you can import. The sentence below about schemas being authoritative becomes
> true the moment the first schema is written; today there is nothing to disagree with.

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
├─ inventory { person, bag, vehicle, stash }   containers, each with slots + searchDC
├─ documents { passport, visas{}, tickets[] }  each records its carrying container
├─ flags    { id -> { value, setAtLeg, expiresAtLeg? } }     ← memory
├─ relationships { npcId -> { trust, met, lastSeenLeg } }    ← memory
├─ eventMemory   { eventId -> { count, lastLeg } }           ← memory
├─ pendingEvents []            consequence queue              ← memory
├─ history[]                   journal entries + ending inputs
└─ tension                     director pacing signal
```

An **Event** = `{ id, weight, requires, context, cooldown, priority, textKeys, imageRef, choices[] }`
A **Choice** = `{ id, labelKey, requires?, costs?, skillCheck?, outcomes: Weighted<Outcome>[] }`
An **Outcome** = `{ weight, requires?, textKey|textVariants[], effects[], schedule?[] }`

Diversity is combinatorial, not authored. Four registries multiply a small authoring corpus
into a large play space, and they are declared once rather than per event:
`modifiers.yaml` (global check modifiers, auto-injected by check tag),
`complications.yaml` (situational layers attached to a selected event),
`universal-choices.yaml` (choices injected into any event whose tags match),
`quirks.yaml` (NPC personality traits that register as modifiers).
Writing a modifier or complication into a single event's YAML, when it belongs in a
registry, is the content anti-pattern that caps this game's replayability.

Full spec: `docs/engine-spec.md`.

**Who owns these types** — amended 2026-08-08, see `docs/adr/0009`. The earlier wording said
the Zod schemas were authoritative in a way that implied engine types are `z.infer`red from
them. That cannot hold: `z.infer` types are owned by whichever package declares the schema, so
the engine would become a consumer of `packages/content` and would need a Zod dependency —
inverting the layering and making every schema tweak an engine API change. The rule is:

- **`packages/engine/src/content/` owns the TypeScript types.** ✅ shipped in Phase 1 M5.
- **`packages/content/schema/` owns the Zod schemas** and is authoritative over _content
  semantics_: which fields a YAML file may have, which values are legal, what an omitted key
  defaults to. **(planned — Phase 2.)**
- The two are held **identical** by a bidirectional compile-time assertion (mutual-extends, so
  a schema narrower _or_ wider than the type fails the build), not by convention.

So if `docs/engine-spec.md` and the schema disagree about what content _means_, the schema is
right and the doc is a bug. If the schema and the engine type disagree about _shape_, the
build fails and neither is right.

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
