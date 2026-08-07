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

The fantasy: *a long, unpredictable, consequence-heavy overland journey.*

---

## 2. Non-negotiable architectural rules

These have caused real damage in similar projects when broken. Do not "improve" them without asking.

1. **Events never reference other events by ID as a required next step.**
   The narrative graph is emergent, not authored. Events declare `requires` (a predicate over world
   state) and a `weight`. The director picks from the eligible pool. If you find yourself wanting
   `nextEventId`, use a **flag** plus a `requires` on the target event, or the **consequence queue**.
   The single exception is `scheduleEvent`, which is a *soft* pointer resolved by the director.

2. **`packages/engine` must never import React, React Native, Expo, or any DOM/native API.**
   It is pure TypeScript. It must run under plain Node so it can be simulated 20,000 times.
   No `Date.now()`, no `Math.random()`, no `fetch` inside the engine — all injected.

3. **`Math.random()` and `Date.now()` are banned repo-wide** (enforced by ESLint `no-restricted-globals`).
   Randomness comes from the seeded `Rng` service. Time comes from the injected `Clock`.
   Everything about a run must be reproducible from `(seed, choiceSequence, contentVersion)`.

4. **No user-visible string literals in code or content data.** Only i18n keys.
   `title: "You lost your passport"` is a bug. `titleKey: "events.passport_lost.title"` is correct.
   Enforced by the content linter.

5. **No text rendered inside generated images.** Ever. The game ships in 4 languages.

6. **Content is data, not code.** Events live in `packages/content/events/**.yaml`, validated by Zod
   at build time and in tests. Never hardcode an event in a `.ts` file.

7. **Every state mutation goes through an `Effect`.** No direct mutation of `RunState` from UI code.
   The UI dispatches a choice; the engine returns a new state plus a list of applied effects.

8. **The engine is deterministic and pure.** `resolve(state, input) -> { state, log }`.
   Side effects (persistence, audio, haptics, analytics) happen in the app layer by observing the log.

---

## 3. Repository layout

```
apps/mobile/                Expo app (UI only — no game rules here)
  app/                      expo-router routes
  src/features/             map, preparation, journey, journal, settings
  src/design/               tokens, theme, mood system, primitives
  src/audio/                ambience + sfx manager
packages/engine/            Pure TS game engine
  src/state/                RunState, reducers, effects
  src/director/             event selection, pacing, tension curve
  src/rng/                  seeded PRNG + named substreams
  src/predicate/            requires-DSL evaluator
  src/effects/              effect-DSL applier
  src/route/                route graph traversal, k-shortest paths
packages/content/
  events/                   *.yaml event definitions (grouped by category)
  geo/                      nodes.json, edges.json, world.simplified.geojson
  i18n/                     en/, tr/, ru/, de/
  images/manifest.json      image spec -> asset mapping
  schema/                   Zod schemas (single source of truth)
packages/tools/
  sim/                      headless simulation harness + balance reports
  content-lint/             structural + semantic content validation
  imagegen/                 build-time AI image pipeline
  i18n-check/               key coverage, pseudo-loc, length audit
docs/                       ADRs, design docs, content style guide
```

---

## 4. Stack (verify versions before install)

- Expo SDK 56+ / React Native 0.85+ / React 19.2+ / TypeScript 5.x **strict**
- State: Zustand + Immer · Persistence: `react-native-mmkv`
- Animation: `react-native-reanimated` + `react-native-gesture-handler`
- Lists: `@shopify/flash-list` · Images: `expo-image` · Map: `react-native-svg`
- Validation: Zod · i18n: `i18next` + `react-i18next` + `expo-localization`
- Tests: Vitest (engine, content, tools) + Jest + `@testing-library/react-native` (UI)
- Package manager: pnpm workspaces

> **Version rule:** My training data has a cutoff. Before adding or upgrading any dependency,
> check the actual current version (`npm view <pkg> version`, `npx expo install --check`,
> or the Expo SDK docs) rather than writing a version number from memory. If a version I
> suggest conflicts with the installed Expo SDK, the SDK wins — use `npx expo install`.

---

## 5. Commands

```bash
pnpm i                        # install
pnpm dev                      # expo start
pnpm typecheck                # tsc --noEmit across all packages
pnpm lint                     # eslint + prettier check
pnpm test                     # vitest + jest
pnpm test:engine              # engine unit + golden-run tests only (fast)

pnpm content:lint             # validate all events, predicates, i18n keys, image refs
pnpm content:stats            # counts by category/region/tag, coverage gaps
pnpm sim -- --runs=20000      # headless balance simulation -> reports/sim-latest.md
pnpm sim:diff                 # compare latest sim to reports/sim-baseline.md

pnpm images:plan              # what would be generated/regenerated (dry run, prints cost)
pnpm images:gen               # generate missing/stale images
pnpm images:sheet             # build reports/contact-sheet.html for human review

pnpm i18n:check               # missing keys, unused keys, length overflow risk
pnpm i18n:pseudo              # run app with pseudo-localized strings
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
- **Comments:** explain *why*, never *what*. Predicate and balance decisions deserve a comment.
- **Commits:** `type(scope): summary` — `feat(director): add tension curve weighting`.
  One logical change per commit. Never commit generated images or `reports/` output.

---

## 7. Definition of Done (applies to every task)

A change is not done until all of these pass:

1. `pnpm typecheck` clean
2. `pnpm lint` clean
3. `pnpm test` green
4. `pnpm content:lint` clean (if content or schema touched)
5. New behavior has a test. Bug fixes have a **regression test that fails before the fix**.
6. If engine behavior changed: `pnpm sim -- --runs=5000` run and the report delta explained.
7. If a decision was non-obvious: an ADR added to `docs/adr/NNNN-title.md`.
8. `CLAUDE.md` updated if a command, rule, or layout changed.

State the DoD results explicitly at the end of your response. Do not claim something passes
without having actually run it.

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

```
RunState
├─ seed, rngCursors            deterministic randomness
├─ clock  { day, hour, weekday }
├─ route  { nodes[], edges[], legIndex, progressKm }
├─ transport { mode, vehicleId?, condition, fuel }
├─ resources { money, energy, health, morale, hunger, hygiene, heat, reputation }
├─ skills   { negotiation, stealth, mechanics, streetwise, languages[] }
├─ traits[]                    from preparation choices; permanent modifiers
├─ inventory[]                 item stacks
├─ documents { passport, visas{}, tickets[] }  each with a condition/validity
├─ flags    { id -> { value, setAtLeg, expiresAtLeg? } }     ← memory
├─ relationships { npcId -> { trust, met, lastSeenLeg } }    ← memory
├─ eventMemory   { eventId -> { count, lastLeg } }           ← memory
├─ pendingEvents []            consequence queue              ← memory
├─ history[]                   journal entries + ending inputs
└─ tension                     director pacing signal
```

An **Event** = `{ id, weight, requires, context, cooldown, priority, textKeys, imageRef, choices[] }`
A **Choice** = `{ id, labelKey, requires?, costs?, skillCheck?, outcomes: Weighted<Outcome>[] }`
An **Outcome** = `{ weight, requires?, textKey, effects[], schedule?[] }`

Full spec: `docs/engine-spec.md`. Zod schemas in `packages/content/schema/` are authoritative —
if the doc and the schema disagree, the schema is right and the doc is a bug.

---

## 10. Design pillars (use these to break ties)

1. **Consequence over difficulty.** A bad outcome should be *interesting*, not just punishing.
   Losing your passport opens a storyline; it does not end the run.
2. **Legible randomness.** The player must be able to reconstruct *why* something happened.
   Surface the reason ("no visa · night crossing · nervous demeanor") in the result screen.
3. **The world reacts.** If the state changed meaningfully, the presentation changes: palette,
   ambience, vignette, event pool. Wanted → sirens. Broke → desaturation. Night desert → warm dark.
4. **No dead ends before the halfway point.** Early failure states must have an escape route.
5. **Readable in 15 seconds.** Event body ≤ 60 words. Choices ≤ 8 words each. This is a phone game.
6. **Tone: grounded, dry, occasionally funny. Never zany.** Think travel journal, not sitcom.

---

## 11. Content and safety guardrails

The game deals with borders, smuggling, theft, police, and poverty. That is fine as fiction.
But content must not:
- provide real-world actionable instructions (document forgery methods, evading specific border
  controls, drug synthesis or concealment techniques, hacking steps),
- target real ethnic, national, or religious groups as villains, or reproduce stereotypes as
  mechanics ("region X = corrupt"). Corruption is a *situation*, not a *people*,
- depict minors in danger, sexual content, or graphic torture,
- name real, living individuals.

Keep locations semi-fictionalized where the content is sensitive. When in doubt, flag the event
for human review with `review: needed` instead of guessing.

---

## 12. Session ritual

**At session start:** read this file, run `pnpm typecheck && pnpm test` if the last session ended
mid-task, then state (a) what you understand the current task to be, (b) what you will touch,
(c) anything in the repo that contradicts this file.

**At session end:** update `docs/PROGRESS.md` with what shipped, what is half-done, and the exact
next step. Assume the next session starts with zero memory of this one.
