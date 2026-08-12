# 0031 — Route diversity came from graph density, not from the cost functions

- **Status:** Accepted, implemented in M3.5
- **Date:** 2026-08-12
- **Amends:** ADR 0025 Decision 2 (the `fastest ≡ cheapest` collapse) and its rail-predicate numbers
- **Relates to:** ADR 0024 (edge derivation), ADR 0030 (masks and connectivity)

## Context

With both mask exemptions in (ADR 0030) the gate still read **72–73%** against a 70% ceiling, and
the profile-redundancy matrix named the culprit precisely:

```
              fastest cheapest   safest   scenic  illicit
  fastest           —      170       66       66       26     pairs returning the IDENTICAL path
```

`fastest` and `cheapest` returned the byte-identical path on **170 of 200** pairs. That is ADR 0025
Decision 2 landing exactly as written. Three faults were found in the cost model and fixed, and
then the thing that actually mattered turned out to be somewhere else entirely.

## Decision 1 — `foot` is only offered on corridors short enough to walk

`FARE_PER_100KM.foot` is 0 and `pickMode` ranked by fare alone, so `cheapest` chose to **walk all
257 land edges**, a 2,478 km one included. Its cost then reduced to `0.23 × distance` against
`fastest`'s `0.86 × distance` — the same ordering in different units.

The comment on `FARE_PER_100KM` claimed foot being free was one of the four things _keeping_ the
two apart: "no fare but a fortnight of subsistence". **It cannot be.** Subsistence is charged
against elapsed time, time is distance over speed, so the term is proportional to distance and
reorders nothing. `FOOT_MAX_KM = 120` — about three days on foot — and the run loop keeps `foot`
for a player who loses their vehicle.

## Decision 2 — `pickMode` scores what the profile actually pays

Every other profile's mode score is the quantity its cost function minimises. `cheapest` scored the
fare while paying fare plus subsistence. Now it scores the cash. Belt-and-braces given Decision 1
caps foot anyway — stated as such rather than overclaimed — but it is the invariant that stops the
same class of bug returning when a constant moves.

## Decision 3 — a toll buys speed, because a trade-off needs both sides

A toll cost `cheapest` 25 and gave `fastest` nothing. Nobody had a reason to _want_ the tolled
corridor, so avoiding it cost nothing to weigh. A tolled edge is a motorway:
`MOTORWAY_SPEED_PERCENT = 157`, so road modes run at 110 km/h rather than 70. `fastest` now routes
onto it and `cheapest` routes around it — the divergence every satnav has, and it was missing.

**`leg-hours.ts` must apply the same factor when it lands** (ADR 0026 Decision 5). `KMH` is shared
with the run loop and the two must not drift.

## Decision 4 — and none of that is what fixed it. `TWO_HOP_RATIO` did.

Decisions 1–3 together moved identical pairs from 170 to 167. The binding constraint was the graph.

The 2-hop prune sat at **1.6**, dropping 363 of 628 proposed edges — more than it kept — leaving 45
independent cycles against 89 bridges. A distance-only second-best route still overlapped the best
by **83% at the median**, so no cost function could express a difference the graph did not contain.

```
  ratio   edges   fastest = cheapest   median overlap
   1.2      404        102 of 200        59%   PASS
   1.3      360         98               63%   PASS
   1.4      319        101               65%   PASS
   1.6      265        167               72%   FAIL
```

Its own docstring said keeping the long side of a triangle "makes every route look the same and
defeats the diversity filter downstream". **Exactly backwards, now measured.** 1.2 is also the more
defensible rule on its own terms: it drops an edge only when the two-hop detour costs under a fifth
extra, where 1.6 dropped one even when the detour ran 59% longer — and a corridor that much shorter
than the alternative is plainly its own road. Mean degree 2.4 → 3.7, bridges 89 → 35.

**Isolated, because the credit matters:** at ratio 1.2 the three cost fixes move identical pairs
112 → 102 and the median not at all. They are right on their own merits and they are not what
carried this.

## Correction to ADR 0025

Decision 2 item 3 states the rail predicate as "rail within 20 km of both endpoints and ≥60% of
25 km samples within 30 km of the line". The shipped predicate is **8 of 9 interior samples within
10 km**, plus the same 20 km endpoint gate, chosen from a measured sweep. The old predicate tested
only the ENDPOINTS, which made `train` true on 93% of edges because every European settlement over
15,000 has a line within reach — Paris and Palermo are both served and there is no direct train.

Item 3 also assumes `train` is "a minority". At 36% it is, but the plan's "~380 of ~3,000" was a
planet-scale guess written before any geometry existed. Europe's interior samples sit a **median
5.7 km** from a line; forcing 13% here would mean deleting real railways to hit a number in a
document.

## Consequences

- The gate PASSES: median 59%, rung 0 on 146 of 200 pairs.
- Graph is 263 nodes / 404 edges / 1 component / 35 bridges.
- **The 70% guarantee is directional and that is now known.** `acceptByDiversity` tests each new
  candidate against the union of what is accepted, normalised by the CANDIDATE's length, and never
  re-tests an earlier route against a later one. `pnpm geo:verify` finds pairs where the reverse
  direction exceeds 70% at rung 0 — `fastest` is 79% inside `safest` on Barcelona–Palermo while
  `safest` was accepted at 69%. The candidate-normalisation is deliberate (it rejects truncations);
  the one-way consequence was not written down. **Open.**
- **Yen has no length ceiling.** Vienna–Budapest is 297 km direct and the pool also holds 866,
  1,186 and 1,352 km alternatives. Sample-wide the longest-over-shortest ratio is p50 1.36×, p90
  1.79×, tail 10.32×. **Open.**
- Every number here is the 263-node European slice and must be re-measured at M3.11.
