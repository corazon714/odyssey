# 0030 — A mask must not disconnect the graph

- **Status:** Accepted, implemented in M3.5
- **Date:** 2026-08-12
- **Amends:** ADR 0025 Decision 1 (masks as the divergence mechanism)
- **Relates to:** ADR 0024 (geo derivation), ADR 0025 (route generation)

## Context

ADR 0025 Decision 1 makes masks the primary way route profiles differ: a masked edge is _absent
from the feasible graph_ rather than merely expensive, so profiles produce topologically different
paths instead of the same path at different prices. That is right, and it is not the whole rule.

The diversity gate read **83% median overlap** on the first real slice against a 70% ceiling, and
the report blamed the collapse ADR 0025 Decision 2 predicted. It was not that. Measured:

```
Pairs each profile could route with NO relaxation, of 168 sampled
  fastest 5   cheapest 5   safest 4   scenic 5   illicit 123
```

Two masks had each cut the graph into pieces, and the diversity ladder then rescued every profile
by DROPPING the masks — after which five profiles searched one identical feasible graph and
returned near-identical paths as arithmetic. The 83% was measuring relaxation, not cost functions.

**The boundary mask.** `cost-function.ts` masks `adminBoundary && !viaCrossingNode` for every
profile except `illicit`, and `viaCrossingNode` is true only when an endpoint is typed
`border_crossing`. The pipeline stage that creates those nodes had never been built, so the graph
held **zero** of them and all 68 boundary edges were closed to four of five profiles. Strip
boundary edges and the slice falls into **43 components**, the largest holding 15 of 170 nodes.

**The terrain mask.** `safest` refuses `terrainDifficulty >= 3`. That is 69 of 265 edges, and
removing them leaves **52 components**, the largest holding 146 of 221 nodes. `safest` could reach
its destination on 74 of 200 sampled pairs.

## Decision — a mask is a divergence mechanism only while the masked graph stays connected

Past that it is a disconnection mechanism, and disconnection produces relaxation, and relaxation
produces sameness. Every mask must therefore ship with a derived exemption that keeps the graph it
leaves behind whole.

Both exemptions use the same construction, and it is Kruskal, not a bridge count:

1. seed a union-find with the edges the profile can already use;
2. rank the masked edges by a stated order and add the ones that merge two components;
3. exempt exactly those.

`place-borders.ts` does this for the boundary mask — a max-spanning-forest over boundary edges
ranked by `popRank(u) + popRank(v) - floor(km/200)`, so major short corridors get the posts. 42 of
68 were forced by connectivity, then a budget fill to 75%. `mark-unavoidable.ts` does it for the
terrain mask, ranked easiest-then-shortest, producing the derived `GeoEdge.unavoidable` flag: 54 of
69 hard edges exempted.

**What is NOT exempted is the point.** 17 boundary edges stay uncontrolled and belong to `illicit`
alone; 15 hard edges keep their alternative and `safest` still refuses them. The divergence
survives — it now falls out of a budget rather than an accident.

## Decision — the exemption is computed against the profile's OWN graph, not the whole one

Seeding `markUnavoidable` with every easy edge was wrong and the measurement said so: `safest`
went from 74 of 200 routable to **136**, not to 200. The spanning set had been computed against
edges `safest` also refuses for season and boundary reasons. Each mask alone leaves the graph
whole; the two together do not. `ConnectivityEdge.usable` mirrors the profile's other masks so the
exemption is computed over the intersection.

## Consequences

- Feasibility went `5/5/4/5/123` → `200/200/200/200/144` of 200 pairs. `illicit` at 144 is the
  ferry mask working as designed, not a fault.
- Rung 0 resolution rose from 0 pairs to 146 of 200; rungs 4 and 5 fell to one pair each.
- `GeoEdge` gains a field, so `schema/geo.ts`, `write-artifacts.ts` and the mini fixture move with
  it. The flag is DERIVED and must never be authored — an authored one would be a per-place
  judgement, which CLAUDE.md §11 forbids.
- **The construction is a global over-approximation.** It can flag an edge some journeys could
  route around; it can never fail to flag one they cannot. A per-pair answer would be a Dijkstra
  inside a cost function.

## What this does not fix

Neither exemption moved the diversity median much on its own (83% → 76% → 73%). The thing that did
is ADR 0031. This ADR is about correctness: a player choosing "safest" on a route across the Alps
should get a route, and before this they got a shortfall on 63% of pairs.
