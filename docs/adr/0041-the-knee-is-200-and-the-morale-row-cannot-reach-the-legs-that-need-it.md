# 0041 — The knee is 200, and the morale row cannot reach the legs that need it

- **Status:** Accepted, with one part refuted by its own measurement — see Decision 3.
- **Date:** 2026-08-13
- **Relates to:** ADR 0032 (a baseline belongs to its run count), ADR 0035 (morale is a per-hour
  drain, and the conservation result), ADR 0040 (the wear curve compresses the span)

## Context

ADR 0040 landed the wear curve with `FULL_UNTIL = 160` explicitly "placed, not chosen", and named
the sweep as the thing that would choose it. The plan alongside it was that the curve and a
registry graft would ship together, "because neither half works alone". This ADR is the sweep,
and the graft.

**The acceptance measure lost a clause before either was measured.** It used to also demand
`|Kendall tau| < 0.6` between route length and completion. That is unreachable by construction:
`worn` has strictly positive slope, so it is a monotone reparametrisation of the hour axis, and
tau is rank-based — no knee anywhere can break a rank correlation. Demanding it would also ask
route length to stop predicting completion, which contradicts CLAUDE.md §11: geography is real,
and a 17,999 km crossing SHOULD be harder than a 1,957 km hop. **What survives is NO ROUTE BELOW
3%** — a run no one can finish under any play is a dead end, which is design pillar 4.

## Decision 1 — `FULL_UNTIL = 200`, swept on the real engine

`{140, 160, 180, 200, 240}` plus a no-curve control, 2,000 runs per cell over the full 25 × 5
corpus grid, paired seeds across cells:

| knee    | pooled | routes < 3% | routes in 30–50% | worst route |
| ------- | -----: | ----------: | ---------------: | ----------: |
| 140     |  51.0% |           0 |                4 |       14.2% |
| 160     |  47.9% |           0 |                5 |        9.3% |
| 180     |  45.1% |           0 |                6 |        6.2% |
| **200** |  42.7% |       **0** |                7 |    **4.8%** |
| 240     |  38.7% |           4 |                6 |        1.2% |
| control |  36.0% |           7 |                5 |        0.0% |

140 puts pooled completion **outside** the 30–50% band. 240 and the control leave routes on the
floor. Of the three survivors, 200 is chosen — and the honest one-liner is simply **"200 is the
highest knee that clears both gates."**

The three grounds below are NOT three independent arguments, and an earlier draft of this ADR
presented them as such ("the tie-break is the weakest of them"). Every one of them is monotone in
the knee, so they cannot disagree, and none of them discriminates 200 from 240 or from the control
— both of which score BETTER on ground 1 while failing the acceptance gate outright. Ground 1 is a
ranking only AMONG survivors of that gate. What follows is corroboration, and reading it as
independent support is how a single criterion gets counted three times:

1. **It disturbs the already-healthy routes least.** The five routes inside 30–50% under the
   control move `+26pp` summed at 200, against `+40pp` at 180 and `+58pp` at 160. Lifting a route
   that already completes toward the ceiling is a cost, not a benefit — the curve is supposed to
   compress the SPREAD, and relief spent on a route completing at 49% buys nothing.
   **Even at 200 this costs two of those five routes their band membership** (route 8
   42.75 → 51.15%, route 11 49.45 → 55.33%), measured at 4,000 runs/route. An earlier draft said
   one of five and had route 8 at 49.65%, just inside — the two readings are ~2 SE apart and the
   larger sample is the one to believe. The per-knee counts are 3/3/2/2 across 140/160/180/200,
   not the tidy 4/3/2/1 that draft reported.
2. **It leaves the most band headroom.** 42.7% sits mid-band; 160's 47.9% sits 2.1pp under the
   ceiling, so at 160 any registry row that works at all pushes pooled completion out of band.
3. **It is the highest surviving knee**, so the curve applies to less of the corpus — ADR 0040's
   own "search upward" note, and the stated tie-break.

**The analytic model that predicted a 143–178 h knee is superseded, and the direction of its error
is the useful part.** It computed `P(S > worn(R))` holding survival invariant in drain-hours,
which is a lower bound: under the curve the same events fire at the same legs at lower
drain-hours, so a run collects more recovery per drain-hour than the model allowed. On the seven
doomed routes the engine delivers 4.8–16.6% where the model predicted 0.7–14.4%.

`MID_SPAN` and the tail rate did not move, for ADR 0040's reason: they are worth ±0.5pp against
the knee's several points, and moving two levers at once is how ADR 0035's conservation result got
measured three times before anyone noticed the levers were deleting each other's failure mode.

## Decision 2 — hours are not a price, so the cooldown is

The plan specified the row's cost in HOURS on the argument that hours are what a struggling run is
short of. **They are not a price in this engine, and ADR 0040 already contains the fact that
refutes it**: `advanceTime` moves the wall clock, `worldTick` bills each leg's own span against
that clock, and the gap between two legs is never billed at all. There is no deadline —
`checkRunEnd` ends a run on arrival, health, or morale, and on nothing else. So an `advanceTime`
cost is a null cost, and a row priced only in hours would be strictly the best option, which is
the one thing `universal-choices.yaml`'s header forbids.

`advanceTime` **is** legal from content (`schema/effect.ts`, `op: advanceTime`, positive int), and
the row still charges eight hours because that is the honest fiction. What actually limits it is
`rested_recently`, a `ttlLegs: 6` flag the row both reads and writes — one rest per seven legs.
Cash was rejected before it was tried, on the measurement that the doomed routes start with the
most of it and die holding 96%.

`hunger` was tried as the always-paid cost and **removed**: hunger at 10 is `HUNGER_STARVING`,
which moves health damage from the 44-hour rung to the 22-hour one, and the row was pushing runs
onto it early. Measured, it cost 3.1pp of extra `failure_collapsed` and put two routes back under
the floor.

## Decision 3 — the row ships scoped to `cat:rest`, and does no measurable work at 13 events

This is the part the measurement refuted, recorded as a decision because the scoping is
deliberate.

Sizing was derived, not guessed. Route 23 (523 h, 48 legs) needs **+2.08 morale per 100 travel
hours**, i.e. 10.9 morale over the run. At `E[morale] = (3 × 2 + 1 × −1) / 4 = +1.25` per use and
a six-leg cooldown capping uses at `48 / 7 ≈ 6.9`, full uptake delivers 8.6 morale — 79% of the
target, and an implied take rate of 19.4% of offers against a registry ceiling of ~30% picked.
The arithmetic works. **The registry does not have room to run it.**

`filler.the_hours_between` has two authored choices and therefore two injection slots, held by
`use_an_item` (45) and `share_what_you_have` (20). There is **no priority** that puts a 16th row
into a two-slot event without evicting one of them: above 20 takes `share_what_you_have`'s slot,
below 20 does not make the cut. And `share_what_you_have` is this corpus's only always-available
morale option on exactly the empty legs where morale dies.

Measured, four configurations at knee 200:

| config                                           | pooled | routes < 3% | route 23 |
| ------------------------------------------------ | -----: | ----------: | -------: |
| no row                                           |  42.7% |           0 |     5.6% |
| `cat:rest`+`cat:filler`, hunger cost, ungated    |  46.4% |       **2** |     2.6% |
| `cat:rest`+`cat:filler`, no hunger, ungated      |  45.6% |       **1** |        — |
| `cat:rest`+`cat:filler`, no hunger, morale-gated |  43.3% |       **1** |     2.8% |
| **`cat:rest` only, no hunger, morale-gated**     |  42.7% |       **0** |     5.6% |

**Every version that does measurable work breaks the acceptance.** Two mechanisms, both real:

- **Displacement.** Reaching the filler legs costs `share_what_you_have` its slot, and that row is
  worth more on those legs than this one, because it is ungated and uncapped. Proved from the
  other side: raising `share_what_you_have` to priority 50 so both fit takes pooled completion to
  **55.5%**, far out of band. The lever was never the new row; it was the old row's reach.
- **A per-event row pays out in proportion to how many events a run survives to see**, so it
  rewards the runs that were already completing. Ungated it is +8 to +14pp on the routes above
  70% and negative on the seven that need it — Decision 1's criterion (b), in its purest form.
  `requires: { resource: morale, lte: 5 }` is what stops that, and it is targeting rather than
  flavour.

So the row ships at `cat:rest` only, where it evicts `pay_the_asking_price` from
`rest.the_shared_room` (which keeps four other hosts) and moves pooled completion by 0.01pp. It is
correct content, it is the only row in the registry that restores morale on a cooldown, and it
will start doing work when the corpus outgrows 13 events and two-slot filler events stop being the
binding constraint.

**Do not widen it by raising another row's priority without re-sweeping.** That is a larger lever
than this row and it is worth 12.8pp of pooled completion on its own.

## Consequences

- **The acceptance is met by the curve alone.** No route below 3%; worst is route 21 at 4.3% over
  4,000 runs (SE 0.32pp, so 4.1 SE clear of the floor). The plan's premise that neither half works
  alone is **false as measured**: the curve half works alone, and the registry half cannot reach
  far enough to help at this corpus size.
- **The bimodality is not gone, it is compressed.** Per-route completion spans 4.3% to 94.9%
  against 0.0% to 94.0% before. Route length still predicts completion and always will — that is
  CLAUDE.md §11 working, not a defect.
- `Universal choices picked` is 27.4% against the ~30% ceiling. It is the number to watch as the
  corpus grows, because the widening this ADR defers will move it.
- The fixture baseline was not regenerated because it did not move — see ADR 0040.
