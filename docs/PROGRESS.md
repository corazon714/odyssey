# PROGRESS

> Updated at the end of every session (`CLAUDE.md` §12). Assume the next session starts
> with zero memory of this one.

---

## Shipped this session (2026-08-08, session 4) — Phase 2A M2A.0

**Phase 2A is planned and approved** — 8 milestones, plan at
`~/.claude/plans/phase-2a-plan-mode-precious-elephant.md`. Review gates after M2A.2 and M2A.5.
Three questions were settled by the human before planning: rename `money` → `cash` and add
`bank`; skill bypasses the modifier clamp (`d20 + skill + clamp(mods, −8..+6)`); fix `worldTick`
first as its own milestone.

### M2A.0 — the drift curve. `docs/adr/0014`. Two commits.

`worldTick` now charges every drain against the **clock span the leg covers**, not the leg.
Open question 1 is **closed**.

- **The defect, measured:** health first dropped on leg 8 in **1500 of 1500 runs**, distinct=1.
  Identical, not clustered — because every drain was per-leg and unconditional, so a nine-hour
  walk cost the same as a four-hour train ride and nothing read the hour jitter.
- **After:** distinct=**9** (legs 5–14). Completion 30.1% → 31.2%, inside the 30–50% band, so
  this is not a difficulty change. `gave_up` 39.1% → 33.2%, `collapsed` 30.8% → 35.6% — the two
  failure modes are near-balanced where one dominated.
- **`spanPoints(before, hours, per)`** carries the remainder across legs, so summed cost is
  exactly `floor(total / per)` (property test). **No new state** — the clock is already the
  accumulator, so `SAVE_VERSION` is untouched and there is no migration.
- **The finding worth keeping (ADR 0014 §3): grade a penalty on an unbounded meter, never on a
  floored one.** Energy floors at 0 and most runs sit there, so a second harsher morale rung is
  a penalty the whole population takes on the same leg — it _synchronises_ the collapse.
  Measured: it drove leg-15 morale from `0/2/6` to `0/0/0`. Hunger has no ceiling, so grading
  there spreads. This cost the most to learn.
- **`worldTick` had no unit test at all**, which is how a curve that resolves to a constant
  survived to a sim report. It has 12 now, pinning the _shape_ not the constants; verified
  failing on a deliberate violation first.
- **`pnpm golden:update` now exists.** `golden-runs.json`'s header and `golden-run.test.ts` both
  said to regenerate with `ODYSSEY_UPDATE_GOLDEN=1`; **nothing implemented it.** The generator is
  `packages/tools/sim/regenerate-goldens.ts` — outside the engine because the engine may not
  touch `process` or write files, and it derives expectations from `replayRun` rather than the
  simulator so the two cannot drift apart and still look green.

**Still true and not fixed by M2A.0:** the fixture pack contains **no food** — nothing reduces
hunger, one effect grants energy. Health decline is therefore irreversible and every long run
still converges to 0; only the leg it _starts_ varies. A wide p10/p90 at a fixed late leg needs
the seed corpus.

Baseline regenerated; `pnpm sim:diff -- --runs=2000` reports no change. 863 Vitest + 3 Jest.

### Next: M2A.1 — schema foundations

**Run the three experiments first**, before writing eleven schemas against an unproven idiom:
(a) does `Equals<z.infer<z.intersection(A,B)>, A & B>` hold under TS 6.0.3; (b) are
`Awaited<EventId>` / `NoUndefined<EventId>` identity-equal to `EventId`; (c) **the load-bearing
one** — can Zod 4.4.3's getter recursion express the terse→canonical `Predicate` transform
_without_ a `z.ZodType` annotation? If not, the ADR 0009 assertion is **vacuous** for `Predicate`
and `Effect` (and transitively for `GameEvent`/`Choice`/`Outcome`), and the L1' input-side
assertion described in the plan is what has to carry it.

---

## Shipped in session 3 (2026-08-08) — **PHASE 1 COMPLETE**, M0–M11

The engine plays a full run, replays it bit-for-bit, reports on itself, and migrates its own
saves. **[PR #2](https://github.com/corazon714/odyssey/pull/2) is open against `main`, all six
CI jobs green** — including `sim-smoke`, which had never run on a real runner until now.

Every claim below has the command that proves it. All were run at session end.

```bash
pnpm typecheck                      # exit 0 — 4 projects + root
pnpm lint                           # exit 0
pnpm test                           # 851 Vitest + 3 Jest
pnpm format:check                   # exit 0
node packages/engine/src/index.ts   # exit 0 — CI's rule-2.2 proof, run locally
pnpm sim -- --runs=20000            # 4.6 s against a 30 s budget
pnpm sim:diff -- --runs=2000        # "No change vs docs/sim-baseline.md"
pnpm --filter @odyssey/engine run coverage   # 88.51% statements
```

| Milestone | Delivers                                                              | Commit              |
| --------- | --------------------------------------------------------------------- | ------------------- |
| M0        | `.ts` module specifiers; purity guard widened to cross-engine hazards | `998cea1` `9aeed80` |
| M1        | Counter-based RNG, 8 named substreams                                 | `31b731a`           |
| M2        | `RunState`, `createRunState`, `stateDigest`                           | `9c875ee`           |
| M3        | 27 predicate kinds + the reason trace Phase 7 renders                 | `c29a544`           |
| M4        | 12 effect ops, pure applier, `ModifierSource` seam                    | `6db1333`           |
| M5        | Content model, `createContentPack`, JSON fixtures                     | `ff0f981`           |
| M6        | The walking skeleton — a run that runs                                | `b3cb1d7`           |
| M7        | Six scoring factors, seven-rung ladder, tension, complication seam    | `67fd25d`           |
| M8        | Consequence queue: caps, eviction, expiry, rebasing                   | `b8ccf70`           |
| M9        | Beat consumption: fill, slide, expire                                 | `651ccbd`           |
| M10       | Golden replay, engine-spec §6 report, `sim:diff`                      | `2330d07`           |
| M11       | Save migration ladder, shape guard, content reconciliation            | `f92d5a0`           |
| —         | Verification pass, engine-spec Part II, ADR 0012                      | `f9f7b5f`           |

**Bugs found by running the thing, that no unit test saw:** 5 of 9 events unreachable (M6),
a payoff scheduled 20× and fired 0× (M6), two sim policies producing byte-identical runs (M6),
a queue that never released fired promises (M8), beat slots re-fillable forever (M9).

---

## Half-done

**Nothing is broken or partial.** No `TODO(handoff)` markers, working tree clean, all CI green.

Three things are **deliberately inert** — built, tested, and called by nothing. That is by
design, but a fresh agent will find them and should not "fix" them:

| Path                                                             | State                          | Why                                                                                                                                                                         |
| ---------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/engine/src/queue/rebase-pending.ts`                    | Fully tested, **zero callers** | Re-routing is Phase 2. The queue's shape was chosen for it, so the test IS the deliverable (ADR 0011 §3). Wiring is one line when re-routing lands.                         |
| `packages/engine/src/migrate/migrations.ts`                      | **Empty array**                | `SAVE_VERSION` is 1; no save format has been superseded. Inventing a fake migration would put a lie in the ladder (ADR 0012). Machinery is proven against a synthetic list. |
| `effects/modifier-source.ts` · `director/complication-source.ts` | Seams ship **empty**           | Phase 2 registries plug in with no call-site change. Each has a test appending a stub and asserting it reaches the output.                                                  |

**Not started** (still `.gitkeep` only): `packages/content/{events,geo,i18n,images}`,
`packages/content/schema/`, `packages/tools/{content-lint,imagegen,i18n-check}`.

---

### What the sim's instruments found — open findings

Every one of these is a FIXTURE gap, not an engine fault — and none of them errored:

| Finding                                | Detail                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **`wanted` is read but never written** | Three gates reference it, nothing sets it. Those branches are unreachable.                                               |
| 3 flags written but never read         | `bribe_on_record`, `detained`, `took_the_long_way` — dead writes.                                                        |
| 2 choices never picked                 | `bribe_attempt/present_documents` (needs a passport the fixture never grants) and `/turn_back` (`hiddenUnless heat>=6`). |
| Repeat-event rate 62.4%                | Nine events, two of them universal fillers.                                                                              |
| health p50 = 0 by leg 15               | 69.9% of runs end in failure (`gave_up` 39.1%, `collapsed` 30.8%).                                                       |
| Beat fill rate 47.9%                   | Routes schedule three beat types the pack cannot fill.                                                                   |

They are recorded rather than tuned away: the fixture pack exists to exercise the engine, and
balancing against nine events would be fitting to a fixture. Revisit with the Phase 2 seed
corpus.

### ⚠ UNTESTED ENGINE SURFACE — carried into Phase 2 deliberately

Findings 1–3 above are not balance questions. They are **coverage gaps**, and the distinction
was missed when they were first recorded. Four engine mechanisms have **never executed in any
of the 2,000 simulated runs**, because the fixture cannot reach them:

| Mechanism                                   | Why unreachable in the fixture                                |
| ------------------------------------------- | ------------------------------------------------------------- |
| Skill-check modifier gating                 | `check.modifier.wanted` — the flag is never set by any effect |
| Outcome `requires` + `unlockEnding`         | `out.flagged_in_system` gates on `wanted`                     |
| The `passport` predicate (all three fields) | No fixture scenario grants a passport                         |
| **`hiddenUnless`**                          | `turn_back` needs `heat >= 6`; observed runs peak at 3        |

`hiddenUnless` is the sharpest: it has **exactly one instance in the whole pack**, and it is
dead — so engine-spec §2's "reward for state" mechanism has never run inside the loop. Unit
tests cover these paths in isolation; the golden runs and the sim corpus do not touch them.

**Decision (2026-08-08): accepted as a known limitation and carried to Phase 2.** Closing it is
content work — grant a passport on one route, add an effect that sets `wanted`, let heat reach
6 — and belongs with the seed corpus rather than with a fixture built for the engine. **When
that corpus lands, verify these four paths appear in the sim before treating the coverage as
complete.**

---

## Superseded — current state before M10

**The game runs, the director paces it, consequences survive, and beats are consumed.**
776 engine tests; 799 Vitest + 3 Jest total.

---

## Next step (ONE task, start here)

**Build `packages/content/schema/` — the Zod schemas and the terse→canonical transform.**

This is Phase 2's first milestone. It is first because everything else in Phase 2 — the seed
corpus, the four registries, i18n — needs a validated content pipeline, and because it is the
milestone that discharges the promise made in ADR 0009.

### Start here, in this order

```bash
pnpm install && pnpm typecheck && pnpm lint && pnpm test   # must be green before writing
```

Read, in order: `docs/adr/0009` (who owns the types), `docs/adr/0007` §1 (why predicates are
kind-tagged), `CLAUDE.md` §9 (already amended to match), and `docs/engine-spec.md` **Part II**
(what the engine actually accepts — Part I is the original plan and diverges in nine places).

### Deliver

1. **Declare two dependencies by hand** (`pnpm add` is DENIED by `.claude/settings.json`; edit
   the manifests then run `pnpm install`, which is an `ask` rule):
   - `pnpm-workspace.yaml` catalog: `yaml: ^2.9.0` — **it is already in `node_modules` as an
     undeclared phantom via Vite.** Using it without declaring it breaks the day Vite drops it.
   - `packages/content/package.json`: `@odyssey/engine: workspace:*` and `yaml: catalog:`
2. **Zod schemas** in `packages/content/schema/` mirroring the engine's types. The engine owns
   the types; the schema owns _content semantics_ — which YAML fields exist, which values are
   legal, what an omitted key defaults to.
3. **The terse→canonical transform.** Authors write engine-spec §2's
   `{ resource: money, gte: 30 }` and `{ not: { flag: bribed } }`; the engine consumes
   `{ kind: 'resource', key: 'money', cmp: { op: 'gte', value: 30 } }`. Use `z.lazy` for the
   recursive predicate and `.transform()` to normalise. Effects need NO transform — `op` is
   already a proper discriminant.
4. **`.default()` on every optional YAML key**, producing `| null` for scalars and `[]` for
   lists — the engine has no optional properties (ADR 0006 §1).
5. **The conformance test that discharges ADR 0009.** Bidirectional, so a schema narrower _or_
   wider than the type fails the build:
   ```ts
   type Equals<A, B> =
     (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
   const _eventsMatch: Equals<z.infer<typeof gameEventSchema>, GameEvent> = true;
   ```
   Twelve types on the surface: `GameEvent`, `Choice`, `Outcome`, `SkillCheck`, `CheckModifier`,
   `EventContext`, `EventPriority`, `BeatType`, `LocationType`, `TimeOfDay`, `Predicate`,
   `Effect`.
6. **`loadEvents()`** — readdir + parse YAML + validate → `readonly GameEvent[]`, feeding
   `createContentPack`.
7. **Three sample YAML events** proving the transform round-trips. **NOT the seed corpus** —
   that is a later milestone written against the content bible.

### Constraints that will bite

- `packages/content/tsconfig.json` includes only `schema/**` and `__tests__/**`. A new
  top-level dir is invisible to `tsc` **and** to type-aware ESLint until you add the glob.
- Relative imports need an explicit `.ts` extension (ADR 0005 §4).
- No default exports; inline type imports; no `any`; no `!` outside tests.
- Do **not** put Zod in `packages/engine` — `purity.test.ts` asserts its manifest, and ADR 0009
  §1 explains why the layering must not invert.

### Done when

`pnpm typecheck && pnpm lint && pnpm test` green, the conformance assertion compiles, the three
YAML events parse into `createContentPack`, and `pnpm sim:diff -- --runs=2000` still reports
**no change** — the schema layer must not move a single engine number.

---

## M11 shipped — save versioning and content reconciliation

`src/migrate/`. Engine tests 814 → 851. **No sim numbers moved.**

- **`MIGRATIONS` is empty, and that is correct** rather than an omission: `SAVE_VERSION` is 1,
  so no save format has ever been superseded. Inventing a fake schema change to exercise the
  machinery would put a lie in the ladder. It is proven against a SYNTHETIC list instead, which
  tests chaining, ordering and gap detection without pretending history happened.
- **The fixture-completeness meta-test** is what makes the ladder enforceable: it fails the
  moment someone bumps `SAVE_VERSION` without adding a fixture, in CI rather than on a device.
- **A gap in the ladder is a distinct error from a corrupt save** — one is a build defect, the
  other is a bad file, and they need different fixes.
- **`isRunStateShape` checks the rng cursors exhaustively** and everything else shallowly,
  because a missing cursor is silently catastrophic (every draw reads `undefined` → NaN) while
  a malformed history entry is merely wrong.
- **`reconcileContent` TOLERATES a `contentVersion` mismatch where `replayRun` REFUSES one.**
  Both are correct: content ships in every app update, so refusing would delete in-progress
  runs; but a tolerant replay would prove nothing about determinism.

---

## Superseded — M11 brief

The two version axes from ADR 0006 §Consequences, with opposite policies:

1. **`migrate/` — the save-schema axis.** An ordered list of pure
   `migrate_N_to_N+1(unknown) -> unknown` functions. **Never edit a shipped migration.** Every
   new `SAVE_VERSION` adds one function AND one checked-in fixture save.
2. **The meta-test that makes it work**: `it('has a fixture for every version below
SAVE_VERSION')`. It is the only thing that makes writing a migration without a fixture
   impossible, and it fails the moment someone bumps the constant and forgets.
3. **`isRunStateShape`** — a shallow hand-written guard, not Zod. Deep save validation belongs
   with the persistence layer in Phase 2; the engine needs enough to refuse a corrupt save.
   A future `version` returns a typed `save/version-too-new`, never a throw.
4. **`reconcileContent` — the content axis, which CANNOT migrate.** Tolerant read:
   - dangling `pendingEvents` dropped and each drop reported
   - `eventMemory` for removed events **kept** — dropping loses "seen" if the event returns
   - `history` retained verbatim (i18n keys; `i18n-check` catches the rest)
   - flags with unrecognised ids evaluate normally — flags are runtime data, not content
   - a predicate over a missing CONTENT id resolves false with `unknown-ref` (already true)

Note the asymmetry M10 made concrete: **replay refuses a `contentVersion` mismatch, while
reconciliation tolerates one.** Both are correct — a content update must not delete an
in-progress run, and a tolerant replay would prove nothing.

Diff the sim against `docs/sim-baseline.md`; M11 should not move a single number.

---

## M9 shipped — beat consumption

`src/director/beat-slots.ts` plus a beat-fill metric in the sim. Engine tests 733 → 776.

**Sim delta from the M8 baseline:**

```
Completion rate             29.9%   (was 30.0%)
Beat fill rate              47.8%   (1132 filled, 1236 missed)  ← NEW
Unresolved threads              0
Queue departures               18
20,000 runs                 4.8 s
```

- **`legIndex` never moves.** A slot is open over `[legIndex, legIndex + slackLegs]`, and
  sliding is a STATUS, not a mutation of the leg. Advancing the leg and decrementing slack
  reads more naturally right up until you want to report "scheduled for 12, fired at 14" — at
  which point the original is gone.
- **A filled slot cannot be re-filled**, which is the defect M9 closes: before slot consumption
  a beat stayed `pending` forever and could fire again on any later leg in range.
- **`createContentPack` now reports `unfillableBeatTypes`**, alongside `danglingRefs`. Same
  class of silent bug: the slot opens, nothing is eligible, it slides, it expires, and the only
  trace is a beat-miss rate that reads like a balance problem.

**Open finding — the 47.8% fill rate is a fixture gap, not an engine fault.** The fixture routes
schedule `departure`, `approach` and `ferry_boarding`; the nine-event pack has events for none
of them, so those slots can only expire. The sim now prints the unfillable types under the
number so it is self-explaining. Fixing it is content work — either events for those beats or
routes that do not schedule them — and belongs with the Phase 2 seed corpus, not with a fixture
built to exercise the engine.

---

## M8 shipped — the consequence queue

7 files under `src/queue/`. See `docs/adr/0011`. Engine tests 690 → 733.

**M8 found a real defect while being built:** nothing removed a pending entry when it fired.
The promise stayed queued for the rest of the run, and only `maxOccurrences` stopped the payoff
re-firing on every leg of its window — a filter doing the queue's job. Every kept promise would
also have surfaced in the journal as an unresolved thread. The sim now reports **18 queue
departures against 18 fires, and 0 unresolved threads**.

- **Eviction uses a TOTAL order** ending in an insertion index, so ties are impossible by
  construction. Tested by evicting from EVERY permutation of a tie-heavy set and asserting one
  answer — a stronger claim than "the comparator looks total".
- **Append-then-evict, not reject-when-full**, so a promise due next leg displaces one due
  twenty legs out instead of being turned away at the door.
- **Rebase COMPRESSES rather than drops.** Nothing calls it yet — re-routing is Phase 2 — but
  the queue's shape was chosen for it, and a shape chosen for an unimplemented capability is
  one nobody has checked. A property test sweeps leg counts 1–30 against deltas −10..+10.
- **The queue survives an ending**, feeding the journal ("Dmitri never found you") and the
  sim's bug detector.

The sim is otherwise unchanged from the M7 baseline: nine events schedule one payoff, so the
caps are never approached. Expected — they bound pathological runs, not fixture ones, and the
unit tests are what exercise them.

---

## M7 sim delta against the M6 baseline (still the balance baseline)

|                 | M6 (uniform) | M7 (scored)                                       |
| --------------- | ------------ | ------------------------------------------------- |
| Completion rate | 33.7%        | **30.5%** (30.5 / 30.9 / 31.5 across three seeds) |
| Uneventful legs | 0.0%         | 0.0%                                              |
| Fallback legs   | 0.0%         | 0.0%                                              |
| Payoff rate     | 100% (20/20) | 100% (18/18)                                      |
| Never-fired     | 0 of 9       | 0 of 9                                            |
| 20,000 runs     | 4.4 s        | 4.7 s (+7%)                                       |

The completion drop is **signal, not noise** — stable across seeds. Scoring penalises fillers
(`priorityBoost: 0.40`), so more consequential events fire and runs cost more. Still inside
engine-spec 6’s 30–50% band, at its lower edge.

**Open balance finding: fillers are still 75.7% of everything that fires.** They are the only
events with no context constraints, so they are eligible on nearly every leg while the rest
are gated — a 0.40 boost cannot outweigh that eligibility gap. This is a CONTENT observation,
not an engine defect: nine events, two of them universal, is not a distribution to balance
against. Revisit with the Phase 2 seed corpus.

| Event                  | Share |
| ---------------------- | ----- |
| filler.roadside_quiet  | 38.3% |
| filler.long_hours      | 37.4% |
| rest.pickpocket_victim | 11.3% |
| crisis.breakdown       | 4.3%  |
| transit.bus_ejection   | 3.2%  |
| arrival.final_stretch  | 2.5%  |
| border.document_check  | 2.4%  |
| border.bribe_attempt   | 0.3%  |
| border.guard_remembers | 0.1%  |

```
Completion rate             33.7%      (engine-spec 6 target band 30-50%)
Median legs / days          11 / 5
Uneventful legs              0.0%      (target <2%)
Fallback legs                0.0%      (target <2%)
Long-range payoff rate     100.0%      (20/20 scheduled)
Never-fired events              0      of 9
Wall clock                219 ms       (0.22 ms/run)
Extrapolated to 20,000    4.4 s        (target <30 s — 7x margin)
```

Every gate criterion met. **The performance target is not close** — 4.4 s against a 30 s
budget, before any of M7's optimisation levers (pack pre-indexing, `explain` off) are needed.

### What the gate caught — the point of building it

Two bugs that every unit test in M1–M5 passed straight through, both found in the first
1,000-run report:

1. **5 of 9 events were unreachable.** The fixture routes supplied no preparation choices, so
   transport defaulted to `foot` and money to 0 — silently making every vehicle-constrained
   and cost-gated event impossible. Fixed by giving each fixture route a `start` block, which
   is what the preparation screen will produce.
2. **`border.guard_remembers`: scheduled 20×, fired 0×** — the exact signature ADR 0001 names
   as the shape of a whole class of silent content bug. The payoff window `[9,17]` contained
   exactly ONE leg whose location could host it, and zero if the bribe fired at leg 17. Fixed
   by adding checkpoints inside the windows. Payoff rate went 0% → 100%.

A third, found by its own test rather than the report: **`greedy-safe` and `risk-taker` were
producing byte-identical runs** on every fixture seed, because `risk-taker`'s bonus only
applied where a skill check existed. Two policies that always agree bound nothing, so they
were rebuilt as maximin and maximax.

### One engine addition M6 forced

`RouteState.legLocations` — one `LocationType` per leg, caller-supplied like the rest of the
route. Without it `context.locationTypes` cannot be evaluated at all, which makes every border
and rest-stop event unfilterable. `validateRoute` now rejects a length mismatch, because a
short list would silently fall back to `roadside` for the tail of the route.

---

## Superseded — current state before M6

---

## Superseded — current state before M5

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

**M7 — the director's scoring, and the full relaxation ladder.** _(after the M6 review)_

M6's director picks UNIFORMLY among eligible events and has a two-rung ladder. M7 makes it a
director.

1. **The six scoring factors** with the ranges recorded in the plan: `contextAffinity`
   [0.50, 2.00] · `tensionFit` [0.25, 1.50] · `novelty` [0.20, 1.00] · `recency` [0.05, 1.00]
   · `tagSaturation` [0.25, 1.00] · `priorityBoost` {0.40, 1, 1, 3.00}. **Multiplication order
   is part of the replay contract** — float multiplication is not associative, so reordering
   changes `Math.round`, which changes the pick. Pin it with `scoring-order.test.ts`.
2. **`pickWeight = clampInt(round(score), 1, 1_000_000)`** so an eligible event is ALWAYS
   pickable. That invariant is what separates scoring from filtering; it gets its own test.
3. **All rational arithmetic.** No `Math.pow`/`exp`; `purity.test.ts` enforces it.
4. **`tagSaturation` uses `max`, not a product** — a six-tag event in a busy window would
   otherwise collapse to near-zero and become a filter in disguise. Window derives from
   `history`, which already carries tags copied at fire time.
5. **The full seven-rung ladder**: beat gate → `exclusiveGroup` → soft context → cooldown +
   recency → `locationTypes` → filler pool → `uneventful`. `requires` and `maxOccurrences`
   never relax, at any rung.
6. **The complication hook** — the second Phase 2 seam. Post-selection, drawing from
   `encounterFlavor` so Phase 2 can consume randomness without shifting `eventPick`. Test it
   as a seam, like `ModifierSource`.
7. **`tension`** — `nextTension(state, pack)`, with the "breathe after two high-tension
   events" rule from engine-spec 4.

Re-run the sim after each factor lands; the numbers above are the baseline to diff against.

---

## M6 brief (delivered) — the walking skeleton

The minimum that proves the loop end to end. Deliberately NOT the full director: scoring,
the relaxation ladder, beats and the queue's caps all come after, because their bugs are
invisible until something can run a thousand runs.

1. **`director/`, minimal** — hard filters (`requires`, `maxOccurrences`, context, cooldown,
   `exclusiveGroup`) plus **uniform** `weightedPick`. No scoring factors, no beat gate, no
   ladder beyond falling through to `{ kind: 'uneventful' }`. `selectEvent` returns a
   discriminated union and never throws.
2. **`loop/`** — `advanceLeg(state, pack)`, `resolveChoice(state, pack, choiceId)`,
   `worldTick`, `runSkillCheck` (through `collectModifiers` and
   `PHASE_1_MODIFIER_SOURCES` — never reading `check.modifiers` directly), `pickOutcome`,
   `checkRunEnd`. Every illegal transition returns a typed `EngineError`, never a throw.
3. **`packages/tools/sim/`** — `runOne`, `runMany`, `parse-args`, `cli` printing five counts.
   Policies: `random`, `greedy-safe`, `greedy-fast`, `risk-taker`, `adversarial-worst-case`.
   Reads the fixture pack and routes by path via `findWorkspaceRoot`.
4. **Add `sim` to root `package.json`** and a `pnpm sim -- --runs=50` smoke job to CI.

**Gate criteria:** `pnpm sim -- --runs=1000` completes 1,000 full runs; report shows a
non-zero completion rate, empty-pool fallbacks under 2%, and no never-fired event among the
nine. Measure 1,000 runs and extrapolate against the **20,000-runs-under-30-seconds** target
before optimising anything — if the extrapolation misses, that is a finding to report at the
gate, not a slip to absorb.

Wire `PredicateContext` to the pack's real `ContentRefs` here — `ALL_REFS_KNOWN` was a
placeholder, and `unknown-ref` should start firing on genuinely missing content.

---

## M5 shipped — the content model

7 files under `src/content/`, the fixture pack and routes as JSON, and a hand-written fixture
loader. Engine tests 548 → 591. `docs/adr/0009` records the decisions, and **`CLAUDE.md` §9 is
amended** (DoD item 8).

- **The type-ownership conflict is resolved.** §9 implied engine types are `z.infer`red from
  the Zod schemas; that would make the engine a consumer of `packages/content` and give it a
  Zod dependency. Now: the engine owns the types, the schema owns content _semantics_, and
  Phase 2 holds them identical with a bidirectional compile-time assertion.
- **Sorted once, at construction.** Twenty shuffled orderings produce an identical pack and an
  identical `contentVersion` — with a guard-the-guard asserting the fixture is _not_ already
  in sorted order, or that test would prove nothing.
- **`danglingRefs` walks every predicate and effect.** ADR 0001 accepts that content bugs are
  silent; this is the first instrument that sees them. `content-lint` subsumes it in Phase 2.
- **Fixtures are JSON data in the engine**, not `.ts` and not `packages/content/events/`.
  `packages/content` is still untouched, so Phase 1 needs no `yaml` dependency.
- **Nine events, chosen for coverage not realism:** two fillers (the ladder's rung-6 floor),
  beats for three beat types, a schedule/payoff pair, and one event that can legitimately fail
  to fire so the never-fired line has something real to report.

---

## M5 brief (delivered) — the content model

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

---

## ⚠ Open questions for the human — SESSION 3

**These block or shape Phase 2. Answering 1 and 2 before content lands is much cheaper than
answering them after.**

1. **`worldTick`'s drift constants are structurally wrong — fix before or after content?**
   At 20,000 runs health's p10/p50/p90 collapse to `0/1/1` together, so the dominant failure
   mode is independent of player choice (ADR 0012 §2). **The trap:** real content will apply
   resource effects on top of a decay curve already killing ~60% of runs alone, and the obvious
   fix — weakening the drift — silently changes which system controls pacing. Fixing it _first_
   means one baseline regeneration; fixing it _after_ means re-tuning content too.
   _My recommendation: fix first, as a small dedicated milestone with its own sim delta._

2. **`CHECK_DIE_SIDES = 20` needs a real decision, and it is coupled to the check formula.**
   engine-spec §2 shows `dc: 5` with ±2–3 modifiers. On a d20 each modifier is worth 5% while
   the skill (0–10) swamps them entirely. Currently `total = die + skill + modifiers` vs `dc`.
   Skill checks are picked 0.3–1.5% of the time, so nothing has tested it. **What die, and
   how should skill enter?** This is a design call, not an engineering one.

3. **Merge PR #2 to `main` before Phase 2, or keep stacking on `dev`?**
   All six CI jobs are green. Phase 2 is comparable in size to Phase 1; stacking it on an
   unmerged `dev` makes both unreviewable — the same argument that applied to PR #1.
   ⚠ **Local `main` is stale** at `fdd93aa Initial commit`, now ~30 commits behind
   `origin/main`, which will mislead any `git diff main`.

4. **`CLAUDE.md` is now 463 lines** against its own "~400 lines" cap — third time asked, and
   the gap grew this session because the enforcement notes got longer as rules became live.
   Move the per-rule `_Enforcement:_` notes to `docs/enforcement.md` and keep one-word markers
   in §2, or drop the cap? _It is a constitution; 463 lines is past what anyone re-reads._

5. **Hermes verification — who does it, and when?** Determinism is proven on V8 only. Every
   cross-engine defence (no transcendentals, no `localeCompare`, integer `weightedPick`,
   `Math.imul` over BigInt) is preventive rather than demonstrated (ADR 0012 §3). It needs a
   device or emulator running the golden runs, which is app-layer work.

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
