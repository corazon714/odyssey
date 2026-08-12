# 0026 — A leg is a session: `legKm`, montage, and the cost in hours

- **Status:** Accepted; Decisions 2–3 **implemented at M3.7, 2026-08-12** (see the addendum at
  the end). The hours table and montage selection remain design-only until M3.8/M3.9.
- **Date:** 2026-08-09
- **Relates to:** ADR 0006 (run-state shape), ADR 0014 (world-tick drift), ADR 0016/0017 (the two prior save bumps)
- **Bumps:** `SAVE_VERSION` 4 → 5

## Context

`world-tick.ts:116` reads:

```ts
const legShare = state.route.legCount > 0 ? state.route.totalKm / state.route.legCount : 0;
```

Every leg advances `progressKm` by the same rounded share. **Distance per leg is uniform, by
construction.** The brief's leg model is a sum over segments of `segmentKm / densityForTerrain`,
which makes it variable. Both cannot be true, and the collision has to be resolved before the
generator exists.

## Decision 1 — the definition

> **A leg is one narrative travel session: exactly one world tick and at most one presented event.
> Its DISTANCE is fixed at generation time and varies per leg; its DURATION is derived at run time
> from that distance plus a per-mode overhead.**

Generation owns _how many legs and how far each covers_. The run loop owns _how long each takes_.
Neither owns both. This formalises what the code already does — `advanceLeg` increments `legIndex`
in exactly one place (`:57`), runs `worldTick` once (`:69`), calls `selectEvent` once (`:84`) — and
adds the one thing a leg has never been: a unit of distance.

The three rejected alternatives, because each was argued for and each fails differently:

- **A leg is one edge.** `route-state.ts:14-15` already rejects it in prose and
  `validate-route.ts:19-24` hard-codes `edges.length === nodes.length − 1`, so leg-per-edge forces
  `legCount === nodes.length − 1` and makes pacing a function of **survey density** — a corridor with
  a node every 40 km yields 30 legs, an equivalent sparse corridor 3. The only repair is synthetic
  waypoints at leg granularity, at which point `route.nodes` is an array of fictions and the density
  formula has been re-implemented in data where it cannot be tuned.
- **A leg is a fixed distance.** Linear in distance by construction, which is exactly what the brief
  forbids; sub-linearity comes back only by varying the constant with distance, which _is_ the
  density formula reached by a worse road. And 200 km is not one thing — it is two motorway hours or
  two days over a pass. `terrainDifficulty` exists because it isn't.
- **A leg is a time slice.** The closest competitor, and what `worldTick` implements today. Rejected
  as the _primary_ definition and kept as the _cost_ model, because hours are an output of transport
  mode and mode is a run-time variable: a route generated as 36 six-hour slices becomes a different
  route when the truck is impounded at leg 14, forcing `legCount` to be recomputed mid-run, which
  moves `checkRunEnd`'s arrival test and rebases every `BeatSlot.legIndex`. **Distance is the only
  quantity invariant to the player's decisions.**

## Decision 2 — `RouteState` gains `legKm` and `montageLegs`

```ts
readonly legKm: readonly number[];        // length === legCount, Σ === totalKm exactly
readonly montageLegs: readonly number[];  // ascending leg indices, may be empty
```

`montageLegs` is a separate field rather than an inference, because **without it montage is
labelled, not implemented**: `wilderness` is already used for ordinary legs (`routes.json` legs 12
and 8), so a montage leg would be indistinguishable in state from a desert leg; "proportional
resource drain" would have no quantity to be proportional to; and `RoutePreview` is not in
`RunState`, so nothing at run time could key off it.

Rejected, each for a concrete reason: a `'montage'` `LocationType` member (every location-filtered
event becomes ineligible, so every montage leg drops to rung 5 of the relaxation ladder, and
`LOCATION_TYPES` is in conformance `VOCABULARIES`); `legKinds: readonly LegKind[]` (a
`legCount`-length string array is bulkier in save and digest than 2–3 indices, and `LEG_KINDS` from
the barrel trips L2); deriving montage from `legKm[i] >= THRESHOLD` (**a ferry crossing is one leg
of 900 km and is emphatically not a montage — it is where `ferry_boarding` lives**); sign-packing
into `legKm` (destroys the sum invariant).

## Decision 3 — `SAVE_VERSION` 5, and the `legLocations` precedent does not transfer

`legLocations` was added post-hoc with no bump and no migration. That worked because it is read only
through `locationAtLeg` (`route-state.ts:44-46`) with a `?? 'roadside'` fallback, so an absent field
degrades. Neither new field does:

- `legKm` has a **sum invariant** (`Σ legKm === totalKm`) that a per-element fallback would violate.
- If the array itself is absent, `route.legKm[i]` is a `TypeError` — `noUncheckedIndexedAccess`
  protects the element, not the array — thrown out of a function whose entire contract says it
  returns `EngineError` and never throws.

So: bump to 5, append `migrate_4_to_5`, never edit a shipped migration. The migration writes
`legKm = uniformSplit(totalKm, legCount)` (largest-remainder, exact sum) and `montageLegs = []`.
**That is the correct value for a v4 save, not a placeholder** — it is what that run has been doing
all its life.

**Do not backfill `legKm` into `save-v1..v4{,-loaded}.json`.** Doing so makes `migrate_4_to_5` a
no-op on every checked-in save and ships the migration untested — precisely the hole
`migrate.test.ts:130-159` exists to close for v3→v4. Ship `save-v5{,-loaded}.json` plus a
hand-built mid-route v4 save that exercises the branch. Note `migrate.test.ts:127` hard-codes
`save-v4-loaded.json` as the terminal fixture and must move; the fixture-completeness meta-test at
`:42-43` globs `save-v(\d+).json` only and will **not** catch a missing `-loaded` pair.

### The T1 checklist — the real forcing function is not the digest

`canonicalJson` serialises `Object.keys(record)`, so an **absent key contributes nothing**. Adding a
field to the `RouteState` _type_ without editing `routes.json` moves **no golden digest** and leaves
`state.route.legKm` as `undefined` inside a type that says `readonly number[]`. Nothing typechecks
`routes.json`: `load-fixtures.ts:117-127` shape-checks five named fields and then casts at `:129`.

**Therefore any new `RouteState` field lands with its `requireArray(route['legKm'], …)` guard in
`load-fixtures.ts` in the same commit.** That is the only thing that turns a missing fixture field
into a loud failure instead of a silent `undefined`.

## Decision 4 — leg sizing, and the floor is what creates the cliff

Raw legs accumulate in scaled units (`LEG_SCALE = 1000`), because `Σ floor(km/d)` truncates every
segment and forty 90 km urban segments would raw-count as zero.
`LEG_DENSITY_KM = {urban 120, mountain 150, hill 200, marsh 200, forest 220, coast 230, plain 250,
steppe 320, desert 450, sea 450}`; a ferry segment is exactly one leg.

**Sub-linearity is explicit, not a side effect of the cap.** Density alone is linear, and a hard cap
produces sub-linearity only as a wall — 4,000 km and 12,000 km both landing on 48 is _flat_.
`Math.log` is banned, so the curve is piecewise-linear and the breakpoints **are** the curve: the
first 18 legs at 100%, the next 14 at 75%, the next 28 at 50%, beyond that 25%. Raw 18 → 18 · 32 →
29 · 60 → 43 · 120 → 58. Monotone by construction, which is a property test: **more kilometres must
never produce fewer legs.**

> Keep `COMPRESSION_BANDS` module-private. An array exported from anything the barrel re-exports
> turns conformance L2 red for a change made entirely inside the engine.

The clamp ramps rather than steps, because a hard `totalKm <= 500 ? [10,16] : [22,48]` gives a
500 km route ≤16 legs and a 501 km route ≥22:

```
minLegs(km) = km >= 1200 ? 22 : 10 + mulDivRound(12 * km, 1, 1200)
maxLegs(km) = km <= 500 ? 16 : km >= 1200 ? 48 : 16 + mulDivRound(32 * (km - 500), 1, 700)
```

300 → [13,16] · 499 → [15,16] · 500 → [15,16] · 501 → [15,16] · 800 → [18,30] · 1200 → [22,48].
**There is no `isShortTrip` boolean anywhere in the pipeline**, and that absence is the decision — a
boolean is a cliff waiting to be reintroduced. Property test: `|legCount(500) − legCount(501)| <= 1`.

Montage compression handles `rawLegs > targetLegs` by crushing the dullest stretches rather than
shrinking everything, capped at `targetLegs / 3` — a route that is a third montage is eight summary
screens and there is no game left, so **the cap wins over the deficit** and leg count may run a
little over target.

Selection is deterministic, integer and **RNG-free**; the brief's stability requirement is strictly
stronger without a coin and a coin adds nothing. `dullness = (10 − TERRAIN_INTEREST)×10 +
(6 − servicesCount)×6 + (scenic > 0 ? 0 : 8) − 1000×viaCrossingNode − 1000×ferry`, tie-broken
longer-first then by edge id with `<`/`>`. **Crossings and ferries sort last by construction rather
than by a special case someone can forget.** `dullness` reads only the segment's own fields and the
comparator reads only its two arguments — no index, no rank, no global — so adding a node elsewhere
cannot reshuffle an unrelated montage. Two tests pin that: invariant to input order, invariant to
unrelated segments added and removed.

**Below the floor**, the brief says to raise event probability and tighten time pressure rather than
pad. **Neither is available in this phase** — the probability gate is ADR 0029 and lands last, and
time pressure does not exist at all (`checkRunEnd` ends a run on arrival, health or morale; nothing
reads the clock as a limit). `RoutePreview` may carry `suggestedDeadlineDay` for the future
preparation screen; **it must not go on `RouteState` until something reads it.** The sub-floor
response is deferred, and saying so is better than a constant nothing consumes.

## Decision 5 — hours, and why montage drain is free

**The strongest structural result in the design: `worldTick`'s drift model is already denominated in
hours, not legs** (ADR 0014, restated at `world-tick.ts:20-27` — _"TIME makes you hungry, not
legs… EFFORT drains energy, not legs"_). So making hours a function of distance makes montage drain
proportional with no montage-specific arithmetic anywhere.

```
legHours(km, mode, montage) = clamp(LEG_OVERHEAD_HOURS[mode] + mulDivRound(km, 1, KMH[mode]),
                                    MIN_LEG_HOURS[mode], montage ? 30 : 12)
LEG_OVERHEAD_HOURS = { foot 0, bus 3, train 2, car 4, truck 4, ferry 4, rideshare 3 }
KMH                = { foot 4, bus 50, train 80, car 70, truck 50, ferry 30, rideshare 65 }
```

Calibrated so all three fixtures reproduce their current `HOURS_PER_LEG` exactly **and stably across
the ±1 km split** — which earlier candidate speeds did not:

| fixture           | mode  | km/leg   | derived                  | today |
| ----------------- | ----- | -------- | ------------------------ | ----- |
| `fixture.short`   | car   | 62       | 4 + round(62/70) = **5** | 5 ✓   |
| `fixture.illicit` | truck | 89 or 90 | 4 + round(·/50) = **6**  | 6 ✓   |
| `fixture.scenic`  | bus   | 86 or 87 | 3 + round(·/50) = **5**  | 5 ✓   |

**So the fixture baseline must move by nothing at this step. If `Median legs` or `Median in-game
days` moves on `--pack=fixture`, the calibration is wrong — that is a spec bug, not a finding.**

Jitter stays absolute (`nextInt(-1, 2, 'worldTick')`, one call per leg, draw count unchanged, cursor
unmoved): ±1 hour on a 5-hour leg is texture, ±20% on a 30-hour montage is noise that would make two
identical montages read as different mechanics.

A 600 km car montage is 13 hours against a 90 km leg's 5. Clock, `progressKm`, hunger, energy and
health all scale **with no new code** — that is the argument for the hours model over a montage
multiplier, which would have to be applied six times and kept in sync with six thresholds. Two
exceptions:

- **Hygiene must become graded, and it is not a small correction.** `hours >= 6 ? −1 : 0`
  (`world-tick.ts:131`) never fires for car (5), bus (5) or train (4), so hygiene is effectively
  static on two of three fixture routes today. `spanPoints(elapsed, hours, 6)` makes it drain every
  leg — and hygiene is mechanically live (`modifiers.yaml:61` at `lte 3` for −2 across five check
  tags, `:69` at `gte 8` for +1), so this flips one modifier from near-never-active to always-active
  within about four legs and moves `Modifier chips / check` and every DC it touches. **Its own
  commit, with the prediction written before the sim runs.**
- **Morale stays ungraded.** `world-tick.ts:94-104` records the measurement: energy floors at 0 and
  most runs sit there, so a second rung is a penalty the whole population takes on the same leg —
  it _synchronises_ the collapse (`0/2/6` → `0/0/0` at leg 15). Grade on an unbounded meter, never a
  floored one. A montage gets no exception.

## Decision 6 — a known incoherence, named rather than dressed

`legKm` is baked at generation. If the truck is impounded at leg 14 and the player continues on foot,
`legHours(450, 'foot')` is 112, clamped to 12 — **twelve hours to walk 450 km**. The generation-time
mode factor does not help, because the mode was not foot when the route was planned. The proper fix
is recomputing `legKm` on a mode change, which moves `legCount`, which rebases the beat schedule —
the exact problem leg-as-time-slice was rejected for.

Recorded as an open incoherence rather than presented as "failing in the direction that keeps the
game playable". It needs an owner and a phase.

## Addendum, measured 2026-08-09 — the 22–48 band is not survivable today

Decision 4's clamp targets 22–48 legs. **The corpus cannot survive that, and the gap is not
tuning.** Measured on the corpus pack, 2000 runs per point, all five policies, synthetic routes
varying only `legCount`:

| legs       |    10 |    16 |   24 |   30 |   36 |   42 |   48 |
| ---------- | ----: | ----: | ---: | ---: | ---: | ---: | ---: |
| completion | 97.0% | 36.6% | 0.1% | 0.0% | 0.0% | 0.0% | 0.0% |

Only **2 of 2000** runs reach leg 25. At 48 legs the split is 70.5% `failure_collapsed`, 29.5%
`failure_gave_up`, **zero arrivals**.

Three things that measurement establishes, each of which matters to a different decision:

1. **`totalKm` is inert.** The same sweep with `totalKm` fixed at 620 returned digit-for-digit
   identical numbers. Drain today is purely per-leg, which is the collision Decision 1 exists to
   resolve — but resolving it does **not** fix this, because more legs still means more hours.
2. **Health is a one-way ratchet.** Two outcomes in the entire 13-event corpus restore it
   (`rest.the_shared_room/see_to_your_feet`, `weather.the_storm_you_cannot_drive_through/see_to_the_damage`),
   both +2. Health p10/p50/p90 runs `9/10/10` at leg 5 → `0/2/4` at leg 15 → `0/0/0` at leg 25.
3. **The shipped 44.1% corpus completion is an averaging artefact**, not a distribution:
   `fixture.short` (10 legs) 97.3%, `fixture.scenic` (16) 34.2%, `fixture.illicit` (24) **0.0%**.
   Mean 43.8%. A route that always succeeds, one that always fails, and one in between.

**Consequence for the phase.** Generation still emits the 22–48 band as specified — the band is a
design target and the generator should not be bent to hide a balance problem. But **M3.10b's
acceptance criterion is unreachable until a recovery economy exists**, and M3.10a's short-trip
band (10–16) is the only honest measurement point until then. The fix is content and `worldTick`
tuning — more restoration, or `healthCost` regraded, or recovery scaled off the `rationsNeeded`
figure Decision 6 already computes — and it is a milestone this phase does not currently contain.

Recorded rather than worked around.

## Consequences

- All nine golden digests move at the field addition; **neither sim baseline should**, because
  values are uniform at that commit and `progressKm` is write-only telemetry. Anything that moves is
  a finding, and that commit is the cheapest place in the phase to find it.
- `validate-route.ts` gains three checks and `ENGINE_ERROR_CODES` two members
  (`route/leg-distance-mismatch`, `route/montage-out-of-range`).
- `make-route.ts` is imported by **13** test files; `Partial<RouteState>` shields the callers.
- One caveat that kills a tempting test: `world-tick.ts:126` applies `Math.round(totalKm/legCount)`
  each leg, so a v4 run's accumulated `progressKm` was built at a rate summing to
  `legCount × round(totalKm/legCount)`, not `totalKm` (2140/24 → 24×89 = 2136). Harmless in play,
  but "the `apply-world-effects.ts:115` clamp can never fire from the world tick" is **already**
  false today for round-up routes. Scope that test to fresh runs on generated routes, or drop it.

---

## Addendum — implemented at M3.7 (2026-08-12)

Decisions 2 and 3 shipped: `RouteState` carries `legKm` and `montageLegs`, `SAVE_VERSION` is 5,
and `migrate_4_to_5` is appended. **Values are uniform everywhere** — M3.9 replaces them.

**The prediction held exactly.** All nine golden digests moved and nothing else did:
`contentVersion`, `choiceSequence`, `expectedHistoryKeys`, `expectedLegs` and `expectedEndings`
are byte-identical, and both sim baselines report "No change". That digests-only signature is what
distinguishes a save-format bump from a behaviour change, and this ADR predicted it as the cheap
place to find out otherwise.

### Deviation: the allocator is cumulative-floor, NOT largest-remainder

Decision 3 above says `uniformSplit` is "largest-remainder, exact sum". It is not, and the
sentence should be read as superseded by this paragraph.

**Largest-remainder is ill-defined on a uniform split.** Every leg has the identical remainder, so
ranking them is a tie across the whole array and the allocator's output depends entirely on
whatever tie-break the sort happens to use — which is a nondeterminism surface in a value that
feeds `stateDigest`, and the exact class of thing ADR 0005 §3 exists to keep out of this engine.
Decision 5 had already rejected largest-remainder for `arrivalLegOfEdge` on the same grounds
("requires ranking float remainders with exact ties on any equal-length run"); Decision 3 simply
did not notice it was specifying the thing Decision 5 threw out.

So `uniformSplit` is **cumulative-floor** — `floor((i+1)·total/n) − floor(i·total/n)` — matching
Decision 5. Two further reasons, and the second is the one that matters later:

- The sum is exact **by construction** rather than by correction. The series telescopes to
  `floor(total)`, so there is no fix-up pass that a refactor can drop while the tests still pass.
- The remainder **spreads** instead of clumping at the front. That is cosmetic while nothing reads
  `legKm`, and it stops being cosmetic at M3.8: `legHours` divides `legKm` by speed, so a
  front-loaded remainder would put a deterministic duration bump on the opening legs of every
  route in the game. There is a test asserting the spread, not just the sum.

This is the same allocator Decision 5 chose for `arrivalLegOfEdge`, for the same family of reason.

### Deviations from the Consequences section, both minor

- The two new `ENGINE_ERROR_CODES` are `route/leg-distance-mismatch` and
  `route/montage-out-of-range`, as named here. **`montage-out-of-range` also carries the
  ascending/unique violation**, which this ADR implied in the type comment but did not name a code
  for; folding it in kept the count at the two members promised rather than inventing a third.
- The `legKm` **length** check returns `route/leg-count-mismatch`, reusing the code `legLocations`
  already uses for the identical failure. That is why three checks landed against two new codes.
- **The extra hand-built mid-route v4 save was not needed and was not added.** That instruction
  was inherited from v3→v4, whose branch (`presentation.kind === 'event'`) no fixture reached.
  `migrate_4_to_5` has no branch — every save has a route — and `save-v4.json` is _already_
  mid-route at `legIndex: 7` of `legCount: 24`, so the v1→v5 chain exercises it on real values.
  Two tests assert the outcome rather than the fact it ran: that the keys are WRITTEN rather than
  left absent, and that the result sums to `totalKm` and passes `validateRoute`.

### The caveat in the last bullet was real, and no test was written against it

`world-tick.ts:126` still applies `Math.round(totalKm/legCount)` per leg, so a v4 run's
accumulated `progressKm` was built at a rate summing to `legCount × round(totalKm/legCount)`
rather than `totalKm` — 24 × 89 = 2136 against 2140 on the illicit fixture. M3.7 did not change
`world-tick.ts` at all, so this is unchanged and still true. **M3.8a is where it goes away**, when
the hours model replaces that line; until then, do not write the test this ADR warned about.
