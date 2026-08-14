# 0036 — One component per landmass, not one component

- **Status:** Accepted 2026-08-12 (decision by the human). **IMPLEMENTED** at `d21be34`
  (`feat(geo): ADR 0036 implemented — one component per landmass, fragments fail`) and closed at
  `0b241b4`, which dropped the 48 fragment nodes and left Afro-Eurasia as one component.
  `MIN_LANDMASS_NODES = 40` is exported from `packages/tools/geo-build/connectivity.ts`; the
  build fails on fragments in `packages/tools/geo-build/cli.ts`, and `GEO_DISCONNECTED` reports
  them per fragment in `packages/tools/content-lint/rules-geo.ts`.
- **Amends:** ADR 0024, which requires the geo graph to be exactly one connected component
- **Relates to:** ADR 0025 (route selection), ADR 0033 (`GEO_DISCONNECTED`), ADR 0034 (corpus
  routes are generated from the slice)

## Context

ADR 0024 makes the build fail closed on more than one component, and gives the reason in one
line: a second component is _"a map the player can be stranded on"_. That was written when the
slice was Europe, where it is simply true.

It stops being true the moment the slice is larger than one landmass. Measured at M3.11 scouting:

- A **world bbox is impossible** under the rule. The Americas and Oceania are not land-connected
  to Eurasia, so no amount of overlay authoring can make the planet one component. The rule does
  not make the map safer; it makes the map _Europe_.
- **Afro-Eurasia** (`--bbox=-18,-35,180,72`) is the largest connected landmass: 805 nodes, 1307
  edges, **49 components**, 37 orphans.

The 1,200-node target in the phase plan therefore contained a contradiction nobody had noticed:
1,200 nodes needs more than one landmass, and more than one landmass is forbidden.

## Decision

**The invariant becomes one component per LANDMASS.** A graph may hold several components, and
every one of them must be a landmass rather than an accident.

That requires a definition, because "landmass" is not a thing the data knows. The proposed shape,
to be settled when it is implemented:

- A component with at least `MIN_LANDMASS_NODES` members is a **landmass** and is admissible.
- A component below that floor is a **fragment**: an island the selector reached and the edge
  builder could not connect. It must be joined — an overlay `ferries` row is the intended tool —
  or dropped from the slice. It must never ship as a place a player can be routed into.
- The build still fails closed, on fragments rather than on component count.

## What this does NOT fix, and it is the important part

**It does not make M3.11 cheap, and it does not close the 49 components.** Afro-Eurasia is ONE
landmass. Those 49 components are 1 landmass plus 48 fragments — Britain, Japan, Sri Lanka,
Sicily, Madagascar and forty-odd smaller ones. Under this ADR every one of them still has to be
ferried in or dropped, exactly as before. M3.5 spent most of a milestone taking 13 components to
1 on a slice a third of that size.

What the decision buys is that the slice may now _extend past_ Afro-Eurasia at all — the Americas
and Oceania become reachable as separate landmasses instead of being a hard error. That is the
only thing it buys, and pretending otherwise would mis-price the next milestone.

## Consequences, each of which is work

- **`GEO_DISCONNECTED` inverts.** It currently errors on `componentCount > 1` (ADR 0033). It must
  become a fragment check: report components below the floor, naming the nodes to ferry or drop.
  The rule's synthetic-bundle test inverts with it.
- **Route generation must refuse a cross-landmass pair UP FRONT.** Today `selectPaths` returns a
  `shortfall` when no path exists, which is the right shape for "this corridor has one route" and
  the wrong shape for "these two cities are on different continents". A player picking Lisbon and
  Sydney is not experiencing a thin route pool; they are picking an impossible journey, and the
  map screen has to say so before generation runs.
- **`checkRunEnd` and the beat schedule are unaffected** — a run happens on one route, and a route
  is within one component by construction once the pair is refused.
- **Sea travel becomes the only cross-landmass mechanic, and it does not exist.** `ferry` is a
  `TransportMode` and ferries are authored overlay rows between two nodes; there is no
  ocean-crossing model, no `MIN_LANDMASS_NODES`, and no content for a two-week passage. Until
  there is, separate landmasses are separate games and the map screen must present them that way.
- ADR 0024's one-line justification is amended rather than deleted: a second component is still a
  map the player can be stranded on **if it is a fragment**. That was always the real claim.

## Rejected

**Raising the Afro-Eurasia quotas to reach 1,200 on one landmass.** It keeps the invariant intact
and needs no code change, and it was refused because it caps the game at one landmass forever for
a reason that is an artefact of the connectivity check rather than a design intent. The cost is
the same 48 fragments either way.
