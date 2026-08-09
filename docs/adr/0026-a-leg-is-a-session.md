# 0026 — A leg is a session: `legKm`, montage, and the cost in hours

- **Status:** Accepted
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
