# 0025 — Route generation: five cost functions, Yen, and the diversity filter

- **Status:** Accepted
- **Date:** 2026-08-09
- **Implements:** ADR 0013 Decision 4 (the generator the beat-slot lifecycle was written for)
- **Relates to:** ADR 0005 (RNG addressing), ADR 0012 (Hermes is unproven), ADR 0024 (the graph)

> **`Implements`, not `Supersedes`.** Building the thing a decision anticipated is not superseding
> it, and marking ADR 0013 superseded would retire the recorded reason the `routeGen` stream exists.

## Context

`packages/engine/src/route/` is the last `(planned)` engine directory. It has to turn a start node,
an end node, a seed and a profile into 3–5 `RouteState`s that are _meaningfully different_ — and it
has to do it inside an engine that may not use `Math.sqrt`, any trigonometric function, `**`,
`localeCompare` or `Intl.` (`packages/engine/src/__tests__/purity.test.ts:68-79`, because
ECMAScript marks those implementation-approximated and V8 and Hermes may disagree on the last bit).

So: no haversine, no Euclidean A\* heuristic, no great-circle anything. **Distances arrive
precomputed as integer kilometres** from `packages/tools/geo-build`, where the purity test does not
reach, and everything here is integer Dijkstra.

## Decision 1 — five cost functions, and three mechanisms that stop them collapsing

The failure mode is stated first because it is the one that would make the feature theatre: **if
all five costs are monotone in `distanceKm`, Dijkstra returns the same path five times.**

**Mechanism 1 — masks change the feasible graph**, which is the only mechanism with a topological
guarantee rather than a tendency.

| profile               | masked at rung 0                                                            |
| --------------------- | --------------------------------------------------------------------------- |
| `fastest`, `cheapest` | `adminBoundary && !viaCrossingNode`; seasonally closed edges                |
| `safest`              | the above, plus `seasonality !== 'all_year'`, plus `terrainDifficulty >= 3` |
| `scenic`              | `adminBoundary && !viaCrossingNode`                                         |
| **`illicit`**         | **the `train` and `ferry` mode bits** (ticketed, ID-checked)                |

`illicit` is the only profile that may cross an administrative boundary away from a crossing node.
That single asymmetry is the largest topology divergence in the system, and it is derived purely
from profile and graph structure — no player state, no place (ADR 0024 Decision 4). `safest`'s
terrain mask makes it refuse the mountain pass `scenic` actively seeks. A masked edge returns `null`
from `EdgeCost`, mirroring `RELAX_NOTHING` in `hard-filters.ts:37-51`.

**Mechanism 2 — a different dominant attribute per profile.** `fastest` in minutes, `cheapest` in
cash, `safest` in exposure points, `scenic` in `distanceKm × (4 − scenic)`, `illicit` in attention.
All integer, via the existing `mulDivRound` (`modifiers/modifier-tunables.ts:43-47`).

**Mechanism 3 — large flat penalties flip near-ties.** `fastest`'s 150-minute border queue is worth
~150 km of motorway, so a two-crossing shortcut loses to a one-crossing detour 250 km longer. That
is a topological flip produced by a flat term, and it is exactly what the preview reads back to the
player as "2 borders vs 1" — design pillar 2.

## Decision 2 — the collapse risk is measured before three modules are built on it

Three of the five profiles are at risk, not one. The licensed stack carries **no fares and no
travel times**, so both `minutes` and `costCash` are synthesised from `(distanceKm, mode, terrain)`;
on a single-mode corridor `cheapest` is then an affine transform of `fastest` and returns the
identical path. `safest` collapses too wherever `terrainDifficulty` is uniform.

Four structural breakers, all in the model and all testable:

1. `FERRY_CROSSING_FEE` is **per crossing**, not per kilometre — non-affine in distance.
2. `tolled` is an authored overlay boolean on a subset of trunk corridors.
3. `train` exists on only a minority of edges (Natural Earth railroads used as a **proximity
   predicate**: rail within 20 km of both endpoints and ≥60% of 25 km samples within 30 km of the
   line — all its display-scale geometry honestly supports), and rail's fare-to-speed ratio inverts
   road's.
4. Border cost is **minutes** in `fastest` and **cash** in `cheapest` — different units, different
   topological pull.

**`geo-build --stage=audit-diversity` is a precondition, not a report.** It samples ~200 pairs on the
real slice and prints the pairwise edge-_distance_ overlap matrix and the modal distinct-path count.
**Median pairwise overlap above 70% means the data is too monotone and the feature does not work** —
and the fix is then data (tolls, ferry fees, rail coverage), not code. It runs at M3.5, before
`route-diversity.ts`, `yen-k-shortest.ts` and `route-preview.ts` exist. The measured number belongs
in this ADR when it exists; it is **not yet measured**.

## Decision 3 — three closures against tie-break nondeterminism

This is the largest unguarded risk in the design and it deserves naming. Equal costs will be
_common_: integer distances, integer costs, and a geometrically synthesised graph full of symmetric
alternatives. With ties unspecified the winner depends on heap sift order, frontier insertion order
and adjacency iteration order — and Yen re-runs Dijkstra on a mutated graph once per spur node, so
one flipped tie changes the entire candidate set.

1. **Strict total order in the heap comparator: `(cost, node, seq)`**, with `seq` a monotone push
   counter. Ordering by cost alone lets two equal-cost entries pop in an order that depends on array
   layout.
2. **Equal-cost predecessor tie-break retains the lowest edge index:**
   `if (cand < dist[v] || (cand === dist[v] && edgeIdx < prevEdge[v]))`.
3. **Every cost body clamps to `Math.max(1, …)`, and the test asserts `cost >= 1`, not `>= 0`.** A
   zero-weight edge is reachable — `mulDivRound(2, 1, 5)` is 0 — and with one present,
   `if (visited[v]) continue` can finalise a node before an equal-cost lower-index relaxation
   arrives, making the retained predecessor depend on pop order. Non-negativity is Dijkstra's
   precondition; **strict positivity is what the tie-break argument above actually needs**, and the
   resulting failure would present as a heap bug rather than a cost-function bug.

Adjacency is stored CSR with edge indices ascending within each node.

> **Correction, made while implementing M3.2.** This ADR originally justified typed arrays by
> claiming TypeScript types TypedArray element access as `number`, so the hot loop could avoid
> `?? Infinity` fallbacks entirely. **That is false.** `noUncheckedIndexedAccess` applies to
> numeric index signatures, TypedArrays included — `packages/engine/src/route/` is the first
> TypedArray in the engine, so there was no precedent to check the claim against and it went in
> unverified. `tsc` rejected it immediately.
>
> The typed arrays stay for the reasons that survive — flat memory, a length fixed at
> allocation, zero-initialisation, integrality enforced by the container rather than by review —
> and every read is written `?? <sentinel>` with sentinels that **fail closed**: an unreadable
> distance reads as `INFINITE` so the node is skipped, `otherEnd` returns `-1` rather than node
> 0, and an unreadable heap slot sorts last. The concern behind the original claim was right —
> `?? 0` on a distance would convert an impossible index into a plausible number — but the fix
> is choosing the fallback, not avoiding it.

**The acceptance test:** insert an unrelated, disconnected node into the mini graph, regenerate, and
assert the produced `RouteState` is byte-identical under `canonicalJson`.

## Decision 4 — Yen is backfill, and its cap is a named approximation

Five cost functions already give up to five topologically distinct paths for **five Dijkstra runs**.
Yen runs only to backfill when the diversity filter rejects a profile's path.

`MAX_SPUR_NODES = 64`. Yen's ascending-cost guarantee depends on enumerating _every_ deviation of
`A[k-1]`, so a cap is an approximation, not a tuning knob: with realistic path lengths of 15–40, a
cap of 24 truncates the common case and makes `cost(A[k+1]) < cost(A[k])` possible. So the cap is
raised to 64, **exceeding it is reported in `RouteShortfall`**, `A` is sorted by `(cost, pathKey)`
before returning, and the test asserts _that_ rather than the strict ascending property the cap
removes. `pathKey` is edge ids joined by `>`, compared with `<`/`>`.

Candidate set `B` is a plain array kept sorted by `(cost, pathKey)` by linear insertion. `|B|` never
exceeds a few hundred and a heap would add a second tie-break surface for no measurable gain.

**Performance is estimated, not measured.** Expected case is five Dijkstras (~75,000 relax/heap
operations, order of 1 ms); pathological case is Yen on all five (~11 M operations, order of
0.15–0.4 s on V8). These are arithmetic estimates from operation counts. **Hermes is unmeasured for
the entire engine (ADR 0012 §3)** and is typically 2–4× slower on pointer-chasing loops.
`packages/tools/sim/bench-routegen.ts` produces the p50/p99 under Node; it is not a test, because
timing assertions flake.

## Decision 5 — overlap is measured by distance, and `>70` means `>`, not `>=`

The brief says "sharing >70% of edges". **Measuring by distance instead of edge count is a change,
and it is made here deliberately rather than silently.** Two routes sharing eight short urban edges
of thirty are different journeys; two sharing one 900 km trunk edge are the same journey. The player
experiences kilometres.

Overlap is **asymmetric containment normalised by the candidate's own length**, which is correct in
both directions: a short candidate wholly inside a long accepted route reads 100% and is rejected as
a truncation; a long candidate containing a short accepted route plus a 600 km detour reads low and
is accepted, because it _is_ a different journey. Jaccard gets the second case wrong.

Two corrections that matter: reject on `> DIVERSITY_MAX_PERCENT`, **not `>=`** — the brief says
"sharing >70%", and `>=` rejects exactly 70. And compute overlap against **both** the worst pairwise
accepted route **and the union of all accepted edges**, rejecting on the larger, because a candidate
sharing a different 45% with each of two accepted routes is 90% covered.

> **Simplified at M3.3.** "Both, rejecting on the larger" is redundant: the union is a superset of
> every pairwise set, so its shared distance is never smaller and the union is _always_ the larger.
> The implementation keeps the union check alone, which is exactly equivalent and half the work.
> The 45%-plus-45% case that motivated the clause is still the one that matters and it has its own
> test — the clause was right about the risk and wrong about needing two measurements to catch it.

> **Amended at C2 (Phase 3 close). The note above is CORRECT and INCOMPLETE, and the gap is the
> normalisation, not the union.** "The union is a superset of every pairwise set" is true, and it
> is true only **within a fixed normalisation**. Every measurement the note compares is normalised
> by the CANDIDATE's length, so the union really does dominate the pairwise sets and dropping them
> really does cost nothing. What the note is silent about is the OTHER denominator: the accepted
> route's own length. `overlapPercent(a, b) != overlapPercent(b, a)`, and no amount of union-taking
> in the candidate's direction produces a number in the accepted route's direction.
>
> So the filter made a ONE-DIRECTIONAL guarantee while `verifyPair` (`geo-build/verify-routes.ts`)
> maximised over ORDERED pairs, and the two quantities are not the same quantity. `geo:verify`
> reported 85% on Valencia-Palermo while the filter believed it had held the pair to 70. Neither
> was wrong; they were measuring different things, and nothing in this ADR said so.
>
> **The fix, and the shape of it is the decision.** The forward check STAYS the union — the
> 45%-plus-45% case is real and only the union catches it. A REVERSE check is added, pairwise per
> accepted route, asking how much of each accepted route a later candidate would swallow. The
> post-condition is then exactly `verifyPair`'s metric:
>
> > for every accepted pair `(a, b)`, `max(overlap(a,b), overlap(b,a)) <= the threshold of the rung
it was accepted at`.
>
> **Pairwise in reverse, NOT a second union, and that is a measured choice rather than a stylistic
> one.** A union in reverse — "how much of this accepted route is covered by everything else
> together" — is a strictly stronger claim than anything measures or asks for. It would reject far
> more, push far more pairs up the rung ladder into Yen backfill, and Yen is ~95% of `selectPaths`'
> cost (Decision 4's estimate, confirmed by the section 5 benchmark). Pairwise makes the guarantee
> equal to the reported metric, which is the property that was missing.
>
> **What it cost, measured on the 692-node slice.** The one genuine filter failure among the twelve
> named pairs cleared: Valencia-Palermo 85% -> 63%, PASS, on three routes rather than four.
> Chongjin-Jeju City still FAILs at 80% and always will — three edges totalling 1,000 km are in
> every route and its shortest is 1,391 km, a structural floor of 71% that no threshold at or below
> 70 can clear — but it now resolves at rung 2 instead of rung 1. That escalation is the price:
> `selectPaths` mean went ~11.9 ms -> ~13.3 ms over repeated runs, bands not overlapping. p90 moved
> ~3% and max not at all. **The regression is real and is accepted**, because a diversity guarantee
> the report can contradict is not a guarantee.
>
> **This is unrelated to the water/ferry defect reported in the same `geo:verify` finding** — the
> 70%-land threshold admitting road edges to islands lives in `build-edges.ts`, changes committed
> artifacts, and is Phase 4 work.

The ladder, written in the shape of `RELAXATION_RUNGS`: 0 nothing · 1 run Yen for each rejected
profile · 2 threshold 70→80 · 3 80→90 · 4 drop the profile's mode and season masks and re-run
Dijkstra · 5 accept what exists. The threshold never reaches 100. Consideration order is fixed:
`ROUTE_PROFILES` order (`route-state.ts:17`), then Yen backfill in ascending `(cost, pathKey)`.

**Fewer than three routes is not an error.** One valid route is a playable run.

| produced | result                                                                       |
| -------- | ---------------------------------------------------------------------------- |
| ≥ 3      | `ok: true`, `shortfall: null`                                                |
| 1–2      | `ok: true`, `shortfall: { requested, produced, rungReached, reasonKey }`     |
| 0        | `ok: false` with `route/unknown-node`, `route/degenerate` or `route/no-path` |

`rejected[]` is returned unconditionally with the overlap percentage per rejection — design pillar 2
applied to route generation rather than only to checks.

## Decision 6 — the preview is agnostic to place names, and its day estimate is honest

`notableNodes` is `readonly NodeId[]`, never a display string, which is what keeps the whole module
independent of ADR 0028. Notability is `3×populationRank + 4×port + 3×border_crossing +
2×(elevationM ≥ 1500)` over intermediate nodes, sorted `(−notability, id ascending)`, top three,
then re-emitted **in path order** so it reads as an itinerary. Zero RNG: a preview that changes when
you look at it twice is a bug.

`riskBand` is derived from graph structure and profile only — there is no country field to read:
`Σ(terrainDifficulty + 6×viaCrossingNode + 8×unofficial + 4×seasonal + 3×remote) + PROFILE_RISK`,
normalised per 1,000 km so a long safe route does not read "severe". `riskPer1000Km` is shown
alongside the band.

**`estDays` is an estimate and is labelled one.** The tempting derivation — summing
`HOURS_PER_LEG ± jitter` — is a systematic under-estimate, because `{op:'advanceTime'}` is a content
effect and `world-tick.ts:28` says hours inside an event are the event's business, and because
`{op:'transport'}` can change the mode mid-run. The band is widened from measured sim data bucketed
by `legCount`. `HOURS_PER_LEG` lifts from module-private (`world-tick.ts:32-40`) to
`loop/leg-hours.ts` so the preview and the tick cannot drift.

## Consequences

- Three new `ENGINE_ERROR_CODES`: `route/unknown-node`, `route/degenerate`, `route/no-path`. There
  are **zero `engine.error.*` keys in `i18n/en/`** today, so new codes cost nothing at
  `locale.test.ts`'s orphan assertion — **and by the same token, do not add `route.shortfall.*` keys
  to the locale**, or that assertion turns red immediately.
- `generateRoutes` is barrel-exported; `TERRAIN_KINDS` and `SERVICE_KINDS` are too, so both must be
  registered in `conformance.test.ts`'s `VOCABULARIES` with mirroring schemas in the same commit, or
  the L2 sweep fails the moment the barrel changes. `RISK_BANDS` and `DIVERSITY_RUNGS` go in
  `NOT_CONTENT` with written reasons.
- `packages/content/schema/geo.ts` must contain **zero** `: z.ZodType` annotations — the L1 hygiene
  sweep (`conformance.test.ts:190-206`) pins the result to exactly `['predicate.ts']`. Six
  `z.enum(VOCAB)` derivations cannot drift, so none is needed. Note the sweep uses `readdirSync` and
  is **flat, not recursive**: a `schema/geo/` subdirectory would escape it. That is a hole in the
  sweep, not a workaround to use.
- `2 ** 32` must be written `4294967296` — the exponent operator is banned repo-wide.
