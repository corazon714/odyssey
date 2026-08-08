# PROGRESS

> Updated at the end of every session (`CLAUDE.md` §12). Assume the next session starts
> with zero memory of this one.

---

## Current state: Phase 1 in progress — M0–M4 shipped, M5 next.

The engine can now read and write state deterministically. `src/rng/` (seeded RNG),
`src/state/` (`RunState`, `createRunState`, `stateDigest`), `src/predicate/` (27 kinds + reason
trace) and `src/effects/` (12 ops + applier) are done; 548 of the repo's 561 tests are engine
tests (558 Vitest + 3 Jest). Still missing: the content model, the director, the turn loop,
and all content.

**Both Phase 2 seams are in place and tested as seams:** `ModifierSource` (M4) and the
complication hook (M7, pending). Neither is decorative — each has a test that appends a stub
source and asserts it reaches the output.

The Phase 1 plan is approved, with review gates after **M0** (done) and **M6** (the walking
skeleton, where `pnpm sim -- --runs=1000` first runs end to end). Milestones: M0 prerequisites
· **M1 RNG** · M2 state · M3 predicate · M4 effects · M5 content model · M6 walking skeleton ·
M7 scoring · M8 queue · M9 beat consumption · M10 sim report + goldens · M11 versioning.

---

## Shipped this session (2026-08-08, session 2) — Phase 1 M0

M0's entire job was to settle the module-specifier question **before** ~115 engine files
depend on the answer, and to widen the determinism guard to cover cross-engine hazards.

### The module-specifier decision

`allowImportingTsExtensions: true` is now set in `tsconfig.base.json`, and engine sources
import each other with explicit `.ts` specifiers. This was forced, not chosen: CI runs
`node packages/engine/src/index.ts` to prove rule 2.2 executably, Node ESM requires an
explicit extension, and a `.js` specifier fails with `ERR_MODULE_NOT_FOUND` (verified
against `packages/tools/shared/__tests__/`, which only passes today because Vitest — not
Node — resolves it). The flag is legal because every project sets `noEmit`.

It lives in the shared base rather than in `packages/engine` because `@odyssey/engine`'s
`types` field points at raw `src/*.ts`, and TypeScript realpaths the workspace link — so
engine sources land in a **consumer's** program as ordinary project files that
`skipLibCheck` does not cover. `apps/mobile` extends `expo/tsconfig.base`, not this file,
and will need its own copy the first time the app imports the engine.

### The four gate checks, all green

| Check                                    | Command                                                     | Result                                        |
| ---------------------------------------- | ----------------------------------------------------------- | --------------------------------------------- |
| Bare-Node import by package name         | `node -e "import('@odyssey/engine')"` from `packages/tools` | **pass** — `OK: resolved. exports = []`       |
| Two-file engine module under bare Node   | `node packages/engine/src/index.ts` with a probe re-export  | **pass** — exit 0; `exports = ["M0_PROBE"]`   |
| Typecheck, all projects, probes in place | `pnpm typecheck`                                            | **pass** — 4 projects + root                  |
| Metro still starts                       | `expo start --port 8083`                                    | **pass** — `Waiting on http://localhost:8083` |

**The risk flagged in the plan is closed.** Node refuses type-stripping for files under
`node_modules`, and pnpm puts the link at `packages/tools/node_modules/@odyssey/engine`
(package-local, not hoisted). It works because ESM resolution realpaths by default, so the
junction resolves to `packages/engine` — outside `node_modules` — before stripping. The
relative-path fallback named in the plan is **not needed** and is withdrawn.

Both probe files were removed after the checks (`git clean -f`; `rm` is denied).

### `purity.test.ts` extended — cross-engine hazards

New `CROSS_ENGINE_PATTERNS` block bans `Math.pow/exp/log/sqrt/cbrt/hypot`, all trig, the
exponent operator, `localeCompare`, the `toLocale*` family and `Intl`. These are
deterministic on one machine but **implementation-approximated or locale-dependent**, so
two conforming engines may disagree on the last bit or on sort order — and a golden run is
only worth something if it reproduces on Linux, Windows and Hermes alike.

**Verified failing on a deliberate violation before being trusted**, per the standard the
other three layers were held to: injecting `Math.pow(2, 8)`, `2 ** 8` and `localeCompare`
into a real engine source file failed the suite with all three labels reported.

**Also fixed, unplanned:** the existing `Math['random']` pattern was **silently dead**.
`stripCommentsAndLiterals` blanks the quoted key before the regex runs, so
`Math['random']` had already become `Math['']` and could never match. Replaced with
`Math[`, `Date[`, `crypto[`, `performance[` — engine source has no legitimate reason to
index those dynamically, so the broader form is both correct and stricter. ESLint's AST
selector was catching this case, so nothing slipped through; the backstop was just not
backing anything up.

Vitest count 15 → 17.

### Dependency added

`packages/tools` now declares `@odyssey/engine: workspace:*`. Justification per CLAUDE.md
§8: the sim harness executes the engine headlessly and there is no other route to its
exports; `packages/tools` declared no workspace dependencies at all before this. **New
Architecture compatibility: N/A** — an internal workspace package of pure TypeScript with
zero runtime dependencies, which runs under Node and never reaches a device bundle.

---

## Shipped in session 1 (2026-08-08)

Everything here is verified. The command that proves each claim is next to it.

### Workspace and toolchain

pnpm 11.20.0 workspace, 5 projects (`apps/mobile`, `packages/{engine,content,tools}`, root).
All shared versions live in one `catalog:` block in `pnpm-workspace.yaml`, so packages
cannot drift.

```bash
pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm test:engine && pnpm format:check
```

All six exit 0. Tests: **15 Vitest** (3 projects) + **3 Jest** (apps/mobile).

**Every one of the 9 scripts in `package.json` has been executed**, not just the six above:

| Script         | Result                                           |
| -------------- | ------------------------------------------------ |
| `dev`          | Metro starts, `Waiting on http://localhost:8081` |
| `typecheck`    | exit 0 — 4 projects                              |
| `lint`         | exit 0                                           |
| `lint:fix`     | exit 0, **0 files changed**                      |
| `format`       | exit 0, **0 files changed**                      |
| `format:check` | exit 0                                           |
| `test`         | exit 0 — 15 Vitest + 3 Jest                      |
| `test:engine`  | exit 0 — 5 tests                                 |
| `prepare`      | exit 0, `core.hooksPath = .husky/_`              |

`format` and `lint:fix` changing zero files is the meaningful assertion — it means the
committed tree is already canonical, not merely that the commands exit 0.

### Versions pinned deliberately BEHIND npm latest

Read `docs/adr/0002` before "upgrading" any of these. Each was pinned because latest is
broken here, not out of caution.

| Package    | Pinned    | npm latest | Why                                                                                                |
| ---------- | --------- | ---------- | -------------------------------------------------------------------------------------------------- |
| typescript | `~6.0.3`  | 7.0.2      | TS 7 ships no stable compiler API; typescript-eslint peers `<6.1.0`                                |
| eslint     | `~9.39.5` | 10.8.0     | Expo's plugin tree caps at `^9`; ESLint 10 per-file config lookup silently shadows the root config |
| jest       | `^29.7.0` | 30.4.2     | jest-expo 57 + `@react-native/jest-preset` are on the Jest 29 family                               |

### Determinism guardrails — three independent layers

All three were verified **failing on a deliberate violation** before being trusted.

1. `eslint.config.mjs` — `no-restricted-properties` + `no-restricted-syntax` +
   `no-restricted-globals`. Catches `Math.random()`, `Math['random']`,
   `const { random } = Math`, `Date.now()`, `Date['now']`, `new Date()`, `Date()`.
   (`no-restricted-globals` alone _cannot_ ban `Math.random()` — see `docs/adr/0002`.)
2. `packages/engine/tsconfig.src.json` — `types: []`, no `DOM` in `lib`, so `document` and
   `process` do not typecheck in the engine.
3. `packages/engine/src/__tests__/purity.test.ts` — scans engine source and manifest for
   forbidden imports and nondeterministic APIs.

Plus `scripts/check-no-nested-eslint-config.mjs`, which fails `pnpm lint` if any
`eslint.config.*` appears outside the root — the failure mode that would silently disable
layer 1 for a whole subtree.

### CI

`.github/workflows/ci.yml`: `typecheck`, `lint`, `test`, `engine-under-plain-node`
(executes the engine entry under bare Node — `node packages/engine/src/index.ts`), and a
Windows `typecheck` + `test` job. Actions pinned to `checkout@v7`, `setup-node@v7`,
`pnpm/action-setup@v6`, with action-setup **before** setup-node (the cache footgun).

**CI is green on a real runner.** `dev` was pushed and
[PR #1](https://github.com/corazon714/odyssey/pull/1) opened; all 5 jobs passed on both the
`push` and `pull_request` runs (10 checks total). Run
[31242944764](https://github.com/corazon714/odyssey/actions/runs/31242944764).

| Job                       | Result       |
| ------------------------- | ------------ |
| `typecheck`               | pass (30s)   |
| `lint`                    | pass (37s)   |
| `test`                    | pass (29s)   |
| `engine-under-plain-node` | pass (38s)   |
| `typecheck-windows`       | pass (1m23s) |

Notably `typecheck-windows` and `engine-under-plain-node` both passed first time — the
Windows job proves no path-separator or CRLF assumptions leaked in, and the plain-Node job
is the executable proof of `CLAUDE.md` rule 2.2. `--frozen-lockfile` also held, so the
lockfile is not drifting.

### Claude Code extension layer (`.claude/`)

See `docs/adr/0003`. Four hooks, all proven by driving them with the documented stdin
contract and asserting exit codes:

| Hook                        | Event                      | Proven                                                                                                                                 |
| --------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `guard-protected-paths.mjs` | PreToolUse Write/Edit      | blocks `reports/`, `.env`, both generated-asset dirs; allows `.env.example` and engine source                                          |
| `guard-git-push.mjs`        | PreToolUse Bash/PowerShell | blocks `--force`, `--force-with-lease`, `origin main`, `HEAD:main`, and `git status && git push -f`                                    |
| `gate-commit.mjs`           | PreToolUse Bash/PowerShell | blocks a commit with a failing test, printing the real assertion error; passes when fixed; **fails closed** if its own plumbing breaks |
| `warn-new-dependency.mjs`   | PostToolUse Write/Edit     | exit 2 feedback naming each added dependency                                                                                           |

Timings: docs-only commit **113ms**, `packages/engine` commit **5.9s**, full monorepo
**11.9s** (which the scoping avoids). Bash guards **~162ms** per call.

Also `.claude/skills/handoff/SKILL.md` (`/handoff`) and
`.claude/agents/code-reviewer.md` (reviews a diff against `CLAUDE.md` §2).

### Fixed during verification: `expo-env.d.ts` was tracked and shouldn't be

Running `pnpm dev` for the first time exposed a real defect in the Phase 0 scaffold.
`expo start` **regenerates** `apps/mobile/expo-env.d.ts` (without a trailing newline) and
writes its own `apps/mobile/.gitignore` listing that file. Because the hand-written version
was committed, `pnpm format:check` failed for anyone who had ever started the dev server —
a check that passed in CI and failed on every developer machine.

Fix: untracked the file, committed Expo's generated `.gitignore`, and added the path to
`.prettierignore` (Prettier does **not** read `.gitignore`, verified). Confirmed first that
`apps/mobile` still typechecks with the file absent, which is the fresh-CI-checkout case.

### The permission layer fired live

While cleaning up a probe file, `rm` was **denied** by the `Bash(rm *)` deny rule in
`.claude/settings.json`. Removal went through `git clean -f <path>` (an `ask` rule) instead
of being routed around with a node one-liner. First live confirmation that the permission
layer works, as opposed to the hook scripts, which were proven by contract.

### CLAUDE.md audit

Every claim checked against the repo; aspirational sections marked `(planned)` (42
markers). Stack re-verified against Expo SDK 57.0.11 — see `docs/adr/0004`: **moti is
banned** (value-imports framer-motion 6, which peers React ≤18 and pulls in `@motionone/dom`,
the DOM engine §4 already bans). Use Reanimated 4's built-in CSS animations API.

---

## Half-done

**Nothing is half-done.** No file is in a broken or partial state, no `TODO(handoff)`
markers exist, and the working tree is clean apart from the commits made this session.

The honest gaps are _unverified_, not _broken_:

- ~~CI has never executed.~~ **Resolved** — all 5 jobs green on GitHub Actions, including
  the Windows and plain-Node jobs. See the CI section above.
- **The app has never run on a device or simulator.** `expo export` bundles cleanly on both
  platforms (android 1226 modules, ios 1097) and `pnpm dev` starts Metro on port 8081 — that
  is the real test of pnpm's hoisted `node_modules` against Metro resolution. But no
  `expo prebuild`, no Gradle/Xcode build, and nothing has ever rendered on a screen.
- **Hooks proven by contract, not by live firing.** They were driven with the exact stdin
  JSON Claude Code sends. Hooks load at session start, so they were not armed in the session
  that wrote them — verified by writing to `reports/` and watching it succeed.

---

## Next step (ONE task, start here)

**M5 — build the content model: engine `src/content/` types + `createContentPack`.**

M4 shipped (below). M5 is the last piece before the walking skeleton, and it is where the
type-ownership decision from the plan review becomes code.

Deliver:

1. **Engine-owned TypeScript types** in `src/content/`: `GameEvent`, `Choice`, `Outcome`,
   `SkillCheck` (extend M4's `SkillCheckSpec`), `EventContext`, `EventPriority`,
   `LocationType`. `BeatType` and `TimeOfDay` already exist. **Hand-written, not `z.infer`** —
   see the CLAUDE.md §9 amendment below.
2. **`createContentPack(events)`** — sorts **once, at construction**, into canonical id order
   using `<`/`>` on strings, and builds lookup indices. Sorting per leg is both wasteful and
   an invitation to "optimise" the sort away later. `ContentPack` is not `RunState`, so it may
   legally hold `Map`s.
3. **`contentVersion(events)`** — a stable hash over the sorted pack, reusing `digestOf`.
4. **`ContentRefs` implementation** so `PredicateContext` can stop using `ALL_REFS_KNOWN`.
5. **The fixture pack**: `src/__tests__/__fixtures__/mini-pack.json` — 9 events as JSON DATA,
   not `.ts` (rule 2.6 honoured rather than bent). Plus `routes.json` carrying `legCount` and
   `beatSchedule`, which the sim reads by path via `findWorkspaceRoot`.
6. **Amend `CLAUDE.md` §9** (DoD item 8). It currently says the Zod schemas are the single
   source of truth, implying engine types are inferred from them. That cannot hold: `z.infer`
   types are owned by whichever package declares the schema, so the engine would become a
   consumer of `packages/content` and would need a Zod dependency. The amendment: the schema
   is authoritative over _content semantics_, and Phase 2 holds schema and type identical with
   a **bidirectional** compile-time assertion (mutual-extends, so narrower _or_ wider fails).

`packages/content` is still NOT touched — no schemas, no YAML, no seed events.
`shuffled-pack-invariance` is the test that matters: an identical run digest from a shuffled
event array, proven end to end rather than by inspecting a sort.

---

## M4 shipped — the Effect DSL and applier

10 files under `src/effects/`, plus `src/text-params.ts`. Engine tests 487 → 548.
`docs/adr/0008` records the decisions.

- **12 ops** (the spec's 11 plus `clearFlag`). Exhaustiveness verified by injecting a
  `teleport` op: two errors, one at the dispatcher's `never` guard and one at `EffectOp`,
  because `EFFECT_OPS` and the union cross-check each other.
- **`AppliedEffect` records what happened, not what was asked.** Spending 40 when you hold 12
  logs `applied: -12` plus a `ClampEvent`. `applied.length === effects.length` is an
  invariant, so an effect can never be silently dropped.
- **Structural sharing, with identity as the no-op signal.** A resource change leaves `flags`,
  `route`, `history` as the _same objects_; a no-op returns the identical state.
- **Purity is enforced by deep-freezing** the input and applying all 12 ops — module code is
  strict, so an in-place write throws. The freeze is itself guarded by a test.
- **Compound ops carry a nested tagged `field` union**, not a bag of nullables, because
  `{ vehicleId: string | null }` cannot distinguish "leave alone" from "set to none".
- **`ModifierSource` seam is live.** `runSkillCheck` (M6) will never read `check.modifiers`
  directly. Phase 1 passes one source; Phase 2 appends the registry and quirk sources with no
  call-site change.

---

## M4 brief (delivered) — the Effect DSL and its applier

M3 shipped (below). Effects are the other half of the same contract: predicates read state,
effects write it, and CLAUDE.md 2.7 says every mutation goes through one.

Deliver:

1. **The 11 ops from engine-spec §2**: `resource` · `flag` · `relationship` · `advanceTime` ·
   `scheduleEvent` · `unlockEnding` · `item` · `skill` · `transport` · `document` · `route`.
   `op` is already a proper discriminant, so no terse→canonical normalisation is needed —
   unlike predicates.
2. **`applyEffects(state, effects, ctx) -> { state, applied }`**, pure, with **structural
   sharing**: untouched branches keep object identity. A full clone per effect is ~30 legs ×
   many effects of needless allocation in a 20k-run sim.
3. **`AppliedEffect` records what actually happened**, not what was asked for — including
   **clamp reporting** (reuse `ClampEvent` from M2) and a `noop` case. `{ requested: -40,
applied: -12, clampedAt: 'floor' }` is what makes "money floors at 0 after leg 15" visible
   to the sim rather than absorbed by a silent `Math.max`.
4. **`ModifierSource` seam** (`effects/modifier-source.ts`) — ships **empty, not absent**.
   `runSkillCheck` (M6) never reads `check.modifiers` directly; it collects from an ordered
   list of sources. Phase 1 passes one (`choiceModifierSource`, filtering by each modifier's
   `when` predicate); Phase 2 appends the registry and quirk sources **with no call-site
   change**. A test must prove an empty source list is inert and a stub source's output
   reaches the result.
5. **`scheduleEvent` appends naively.** Caps, per-eventId limits, deterministic eviction and
   rebasing all land in M8 — do not build them here.

Tests that matter: one per op; `frozen-input-purity` (deep-freeze the input, apply all 11,
assert no throw and an unchanged digest); `structural-sharing` (untouched branches keep
identity); `applied-length-invariant` (`applied.length === effects.length`, so a silently
dropped effect is impossible).

---

## M3 shipped — the predicate DSL and the reason trace

10 files under `src/predicate/`, plus `state/flag-access.ts`. Engine tests 350 → 487.
`docs/adr/0007` records the decisions. Worth knowing:

- **27 predicate kinds**, canonical `kind`-tagged. **Exhaustiveness verified, not asserted**:
  injecting a `moonPhase` kind failed with `TS2345 … not assignable to parameter of type
'never'` at the evaluator's guard, then was reverted.
- **`ReasonNode` / `ReasonLine` are frozen** (ADR 0007 §2). Two user-facing consumers depend
  on the shape — the result screen and Phase 7's MO2 chips — and they are built in different
  phases. Changing either type needs an ADR.
- **`all`/`any` do not short-circuit**, and the trace is built eagerly. Short-circuiting would
  show one reason where three applied, which is the opposite of design pillar 2.
- **`chance` consumes no cursor.** `chance-gate.test.ts` asserts all eight cursors stay at
  zero across 50 evaluations, and that two gates in one predicate get independent answers.
- **A missing content id is `unknown-ref`; a missing flag is not.** Content ids are a bug the
  sim must count; flags are runtime data with no registry to be missing from.
- **Flag TTL is applied at read time**, and `isSet` does not mean truthy — a flag set to
  `false` or `0` is still set.

---

## M3 brief (delivered) — the `requires` DSL and its evaluator

M2 shipped (below), so state exists to evaluate predicates against. `predicate/predicate.ts`
currently holds a two-member placeholder union; M3 expands it. Growing a union is additive,
so nothing written against it needs rework.

Deliver:

1. **~20 kind-tagged node types**: `all` · `any` · `not` · `always` · `never` · `flag` ·
   `resource` · `skill` · `trait` · `item` · `document` · `visa` · `relationship` ·
   `eventMemory` · `transport` · `weather` · `timeOfDay` · `leg` · `tension` · `chance` ·
   plus `unknown-ref` as an evaluation _result_, not an authored node.
2. **`evaluatePredicate(p, ctx): { value, trace }`.** The trace is not debug output — Phase 7
   (MOTION MO2) renders it as the dice modifier chips, and design pillar 2 requires the
   player be able to reconstruct why. **`ReasonNode` and `ReasonLine` are contract-frozen
   from M3; changing either needs an ADR.** Shape:

   ```ts
   type ReasonNode = {
     readonly kind: PredicateKind | 'unknown-ref';
     readonly value: boolean;
     readonly labelKey: string; // i18n key, never prose
     readonly params: Readonly<Record<string, string | number | boolean>>;
     readonly children: readonly ReasonNode[]; // EMPTY_REASONS for leaves
   };
   ```

3. **`describeReason(node): readonly ReasonLine[]`** — flattens to
   `{ labelKey, params, polarity: 'pro' | 'con' }`, the chip list the result screen renders.
4. **`{ chance: p }` draws from `chanceGate` and advances NO cursor.** It is addressed by
   `deriveKey(keys.chanceGate, '<eventId>:<legIndex>:<nodePath>')`. Drawing from `eventPick`
   would make the draw _count_ depend on pool size, so adding one event would shift every
   later draw. See ADR 0005 §2. This also makes re-evaluation within a leg idempotent, which
   the director needs to explain itself.
5. **A missing content id resolves to `false` with a distinct `{ kind: 'unknown-ref' }`
   reason node**, so the sim can count them instead of them vanishing into a generic false.
   A missing _flag_ is not this case — an unset flag is ordinary runtime data.

Tests that matter: every kind exercised; `reason-trace-consistency` (`reason.value` matches
the evaluator at every node, recursively); `i18n-keys-only` (rule 2.4, mechanised);
exhaustiveness (adding a kind must fail to compile at every site that must handle it).

---

## M2 shipped — RunState, the serialisable core

23 files under `src/state/`, `src/ids/`, `src/errors/`, plus placeholder `src/content/` and
`src/predicate/`. Engine tests 224 → 350. `docs/adr/0006` records the six decisions; the ones
that will bite if forgotten:

- **No optional properties in engine state — `| null` instead.** `exactOptionalPropertyTypes`
  makes `{ ...state, x: maybeUndefined }` an error wherever `x?: T`, which is exactly what a
  structural-sharing effect applier does every leg; and `undefined` does not survive
  `JSON.stringify` while `null` does. Authored content types keep `?`.
- **Clamps are recorded, not silent.** `clampResources`/`clampSkills` return the clamp events
  so the sim can count them. A silent `Math.min` hides a balance finding.
- **`stateDigest` canonicalises first.** `JSON.stringify` emits string keys in insertion
  order, so two `toEqual` states can serialise differently depending on the order their flags
  were set. 128 bits (4 murmur passes), because 32 collides by birthday inside a 20k-run sim.
- **`RunState.presentation` was added** — not in engine-spec §1. Without it `resolveChoice`
  needs the caller to pass the event id back, putting engine state in the app layer.
- **The route is validated, not generated**, and `legIndex`/`progressKm` are normalised so a
  reused `RunInit` cannot start a run halfway along.

`json-serializable.test.ts` is the load-bearing one: it round-trips a _fully populated_ state
— every memory mechanism, every branded id — and compares digests, because `toEqual` alone
would not notice a `Map` collapsing to `{}` on both sides.

---

## M2 brief (delivered) — `RunState`, `RunInit` and `createRunState`

M1 shipped (see below), so randomness is settled and every later subsystem can draw from it.

Deliver, per `docs/engine-spec.md` §1 and the Phase 1 plan:

1. `RunState` as a fully JSON-serialisable type — **no optional properties: use `| null`**.
   `exactOptionalPropertyTypes` makes `{ ...state, x: maybeUndefined }` an error wherever
   `x?: T`, which is what a structural-sharing effect applier does constantly; and
   `undefined` does not survive `JSON.stringify` while `null` does. Authored content types
   keep `?`, because YAML omission is natural there.
2. `RunInit` — what the app supplies to start a run. **It carries the route**, including
   `nodes`, `edges`, `legCount`, `totalKm` and `beatSchedule`: route generation, `legCountFor`
   and beat-schedule generation are all out of Phase 1. The engine validates what it is
   given and returns a typed error if the route is incoherent.
3. `createRunState(init)`, resource/skill clamping with **clamp events recorded, not
   silently applied** (a clamp is a balance signal the sim must count), and clock arithmetic.
4. `stateDigest(state)` — a stable hash with **explicitly sorted keys**, because `Object.keys`
   hoists integer-like keys ahead of string keys.
5. `state/__tests__/json-serializable.test.ts` — round-trip a fresh state and a state after
   30 simulated legs; digests must match. This is the only place engine-spec §1's
   no-`Map`/`Set`/`Date` rule can actually be enforced.

`ids/` (branded `EventId`, `FlagId`, …) lands here rather than in M1, where nothing used it.

Constraints that will bite if ignored:

- `packages/engine` may not import React/RN/Expo, and `tsconfig.src.json` sets `types: []`
  with no `DOM` in `lib` — so no `process`, no `Buffer`, no `crypto` global. Pure TS only.
- **No `enum`, `namespace`, or parameter properties**: CI runs the engine under Node's
  strip-only type stripping, which rejects all three. Use `const` objects + union types.
- Relative imports need an explicit `.ts` extension.
- No transcendental math, no `**`, no `localeCompare`/`Intl` — `purity.test.ts` enforces it.
- Files stay readable end-to-end under ~200 lines (`CLAUDE.md` §6); split otherwise.
- One exported concept per file. No default exports.

Start with:

```bash
pnpm typecheck && pnpm lint && pnpm test
```

---

## M1 shipped — the seeded RNG

19 files under `packages/engine/src/rng/`, 224 engine tests (was 5). `docs/adr/0005` records
the reasoning; the summary is that a draw is a **pure function of `(streamKey, counter)`**,
so there is no generator state to serialise and stream isolation holds by construction
rather than by luck.

All five acceptance criteria met:

| #   | Criterion                                     | Where it is proven                                                                              |
| --- | --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | Same seed → same sequence, across processes   | `rng.test.ts` — including _resumes exactly where a drained Rng stopped_, which is replay itself |
| 2   | Named substreams, `hash(seed + ':' + stream)` | `stream-key.test.ts`; **eight** streams — `chanceGate` added, see ADR 0005 §2                   |
| 3   | Plain `Record<RngStream, number>` cursor      | `rng-cursors.test.ts` — JSON round-trip, no aliasing of the caller's record                     |
| 4   | **Draws on one stream never shift another**   | `stream-isolation.test.ts` — all 56 ordered pairs                                               |
| 5   | `weightedPick` stable for a fixed seed        | `weighted-pick.test.ts` — plus proportions within a few percent of declared weights             |

Two things worth knowing beyond the checklist.

**The isolation test has a negative control.** `it('would expose the additive-offset
generator that was rejected')` builds the rejected `splitmix(streamKey + cursor · GAMMA)`
inline and demonstrates two of its streams being the _same sequence, shifted by one_ — while
that generator still passes the non-interference test trivially. Without this case, an
implementation with that exact flaw would show green.

**The murmur3 vectors are external.** `murmur3.test.ts` checks six published MurmurHash3
x86_32 vectors covering all four tail lengths. They passed first run, which is mutual
confirmation from two independent directions: an implementation written from the algorithm,
and vectors from outside the repo. This is why `utf8Bytes` is hand-rolled — the vectors are
defined over UTF-8, and hashing UTF-16 code units would have left the test comparing the
implementation to itself. `drawWord` (the unrolled hot path) is separately asserted equal to
`murmur3Bytes` over the counter's little-endian bytes across thousands of inputs.

**Open balance parameter:** `CHECK_DIE_SIDES = 20` in `roll-result.ts` is a placeholder.
engine-spec §2 shows `dc: 5` and ±2..3 modifiers but never states the die, and how a skill
enters the total needs simulation to settle. It is deliberately the only place the die
appears. `roll()` knows nothing about skills — M6 passes a skill in as a labelled modifier.

---

## Open questions for the human

1. ~~**PRNG algorithm.**~~ **Resolved** — MurmurHash3 x86_32, counter-based, `Math.imul`
   only, no BigInt. Reasoning and rejected alternatives under "Next step" above; ADR 0005
   is an M1 deliverable.
2. ~~Push and CI.~~ ~~Merge to `main` first?~~ **Both resolved** — PR #1 merged
   2026-08-08T06:00:18Z; `origin/main` is `6ac8a9a`, and `dev` has zero commits not in it.
   Note the **local `main` branch is stale** at `fdd93aa Initial commit`, 13 behind
   `origin/main`, which will mislead any `git diff main`.
3. **Rive vs Lottie.** `docs/adr/0004` defaults to Lottie because it is in Expo SDK 57's
   `bundledNativeModules` and Rive is not — Rive additionally forces a hand-pinned
   `react-native-nitro-modules@0.35.10` if MMKV is also used. Confirm Lottie as the default,
   or say Rive is worth the pin. **Still open; not needed before Phase 3.**
4. **`CLAUDE.md` is 423 lines** (not 424 — the earlier count was off by one), past its own
   "~400 lines" cap, because of the `(planned)` markers and enforcement notes you asked for.
   Leave it, or move the per-rule `_Enforcement:_` notes into `docs/enforcement.md` and keep
   one-word markers in §2? **Note M5 must edit §9 regardless** — see below.

---

## Open items carried into M1

**1. ~~`.claude/settings.json` deny rule~~ — RESOLVED, applied by hand by the human.**

The old rule `Write(~/.claude/**)` / `Edit(~/.claude/**)` was over-broad: it blocked Claude
Code's own plan-mode harness path (`~/.claude/plans/`). It is now replaced by seven narrow
rules covering credentials and the two settings files:

```json
"Read(~/.claude/.credentials.json)",
"Write(~/.claude/.credentials.json)",
"Edit(~/.claude/.credentials.json)",
"Write(~/.claude/settings.json)",
"Edit(~/.claude/settings.json)",
"Write(~/.claude/settings.local.json)",
"Edit(~/.claude/settings.local.json)"
```

Scope: the files whose modification actually changes what the agent may do, leaving
`~/.claude/plans/`, `~/.claude/projects/` and everything else writable.

**This had to be a human edit, and that is the system working, not a limitation.** The
permission classifier blocks the agent from editing the file that governs its own write
access — in the tightening direction as well as the loosening one. Anything that changes
this file is a human action by construction.

**Rules load at session start, so the narrowed set arms next session, not this one.**

Two notes for whoever touches it next. Prettier covers `.claude/settings.json` (it is not
in `.prettierignore`), so hand-pasted rules at the wrong indent fail `pnpm format:check`
and therefore the CI lint job — run `pnpm exec prettier --write .claude/settings.json`
after editing. And there is still no explicit `allow` entry for `~/.claude/plans/**`; with
the broad deny gone it merely prompts rather than being blocked, which is fine, but add an
allow rule if the prompting becomes noise.

**2. `CLAUDE.md` §9 must be amended at M5.** §9 says the Zod schemas are the single source
of truth, implying engine types are inferred from them. That cannot hold: `z.infer` types
are owned by whichever package declares the schema, so the engine would become a consumer
of `packages/content` and would need a Zod dependency. Phase 1 hand-writes the canonical
types in `packages/engine/src/content/`; Phase 2's schemas are held identical to them by a
**bidirectional** compile-time assertion (mutual-extends, so a schema narrower _or_ wider
than the type fails the build). §9 should say the schema is authoritative over _content
semantics_, not that the types are inferred. The twelve types on that conformance surface:
`GameEvent`, `Choice`, `Outcome`, `SkillCheck`, `CheckModifier`, `EventContext`,
`EventPriority`, `BeatType`, `LocationType`, `TimeOfDay`, `Predicate`, `Effect`.

**3. Hermes is unproven.** Determinism is currently demonstrated only on V8 (Linux +
Windows in CI). A Hermes golden-run job is a named Phase 2 gap, not an oversight.
