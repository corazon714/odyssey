# 0034 — Corpus routes are generated at sim time, not committed

- **Status:** Accepted, implemented 2026-08-12 (M3.10a)
- **Relates to:** ADR 0024 (committed geo artifacts), ADR 0026 (leg model), ADR 0027 (beats)
- **Closes:** phase-plan open question 4

## Context

The corpus sim borrowed the FIXTURE routes. A corpus whose beat types those routes never
schedule reports a beat-fill ceiling nobody can see — measured at 38.5%, with 30.1% observed and
nothing in the report saying the gap was structural.

M3.9 finished route generation. The remaining question was where the corpus route set lives: a
committed `corpus-routes.json` with a staleness digest, or built at sim time.

## Decision — build at sim time

A route is a **pure deterministic function of inputs that are already committed and already
digest-checked**: the geo artifacts (`geo:build --check` proves they regenerate byte-identically)
plus a fixed seed and a fixed pair list in `load-pack.ts`.

A committed route file would add a second staleness class — its own digest, its own `--check`,
its own CI guard — to re-derive something that cannot drift from its inputs. The thing that CAN
drift, the geo slice, already carries all of it.

What is given up: reviewing a route change as a diff. What is gained: a route change is
impossible without a geo change or a code change, and both of those are diffs already.

`docs/adr/0024`'s precedent is not contradicted. Committing `nodes.gen.json` is right because it
is derived from ~200 MB of licensed archives nobody should need to reproduce; a route is derived
from a 120 KB file already in the repo.

## The fixture pack keeps its hand-written routes, permanently

It is the control the golden runs are built on, and **a control that regenerates itself from the
geo slice is not a control**. `pnpm sim -- --runs=2000 --diff` reporting "No change" after this
milestone is the evidence a corpus-only change touched nothing else, and that evidence only
exists because the two route sets have different provenance.

## Two findings from the first generated route set

**Every route came out `mode=bus`.** `startingMode` ordered by "best supported, then
`TRANSPORT_MODES` order"; on the real graph bus, car and truck are on essentially every road
edge, so they tie on count and index 1 wins every time. That erases transport as a decision and
makes every car/truck-gated event unreachable — the exact failure route and start block are kept
together to prevent (`load-pack.ts:63-69`). Mode is now chosen by PROFILE preference, because a
profile is a statement about how the player wants to travel. Result: car ×8, train ×3.

**The first pair list crossed no borders.** It was taken off the overlay's tolled corridors,
which are deliberately INTRA-country roads, so `border.night_crossing` never fired in 2,000 runs.
The pairs were re-chosen by measurement — 40 city pairs on the shipped slice yield a 10-16-leg
route that passes a crossing — and four of six now do. Two intra-country pairs are kept, because
a corpus where every route crosses a border is the same distortion reversed.

## Consequences

- **Completion is 74.4%, outside the 30-50% band, and that is expected rather than a regression.**
  ADR 0026's addendum measured the survivability curve at 97.0% for 10 legs and 36.6% for 16;
  median 15 legs sits on it. M3.10b raises to the 22-48 band, where the same measurement says
  completion collapses to ~0 — which is the open problem that milestone inherits, not this one.
- Long-range payoff falls 73.9% → 13.9% with 62 unresolved threads: consequences are scheduled
  and the run ends before they land. Short routes do that, and it is the clearest single argument
  that the short band is a measurement point rather than a shipping target.
- **Never-fired events: 0.** Every event in the corpus is now reachable, which the borrowed
  fixture routes could not manage.
- The corpus baseline does not compare to the one before it — different route set. Its header
  says so.
