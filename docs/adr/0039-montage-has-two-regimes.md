# 0039 — Montage has two regimes, and the gate only ever tested one

- **Status:** Accepted, implemented 2026-08-13
- **Date:** 2026-08-13
- **Corrects an implementation of:** ADR 0026 Decision 4 (montage selection)
- **Relates to:** ADR 0027 (the beat schedule and its four invariants), ADR 0029 (the quiet-leg gate), ADR 0035 (per-hour drain)
- **Unblocks:** M3.12b — ADR 0029 Decision 7 item 2 was being computed over an empty set

## Context

`RouteState.montageLegs` was `[]` on **all 25 corpus routes**, and had been since montage
selection landed at M3.9 (`681f621`). ADR 0029 gives montage legs a ×0.3 event-odds multiplier
and makes "montage legs should be quiet most of the time" one of four calibration targets for
M3.12b. That target was unmeasurable: the class had no members. Two agent reports drew
conclusions from it before an adversarial check found the set was empty.

`leg-plan.ts:263` read:

```ts
if (segments.length > target && montageBudget > 0) {
```

ADR 0026 Decision 4 says, in its own words:

> Montage compression handles **`rawLegs > targetLegs`** by crushing the dullest stretches rather
> than shrinking everything, capped at `targetLegs / 3`.

`segments.length` and `rawLegs` are the same number only while a path edge is worth at most one
leg. Measured on the committed 692-node slice, the median path edge is **378 km** (p90 1,090,
max 2,306) against terrain densities of 120–450 km per leg, so an edge is typically worth 1.5–4
legs and the two quantities are nowhere near each other:

| across the 25 corpus routes | min | median | max |
| --------------------------- | --: | -----: | --: |
| `segments.length`           |   3 |     22 |  33 |
| `rawLegs`                   |  11 |     49 | 115 |
| `target`                    |  22 |     38 |  48 |

**`rawLegs > target` on 23 of 25. `segments.length > target` on 0 of 25.** On a 123-route sweep
across the whole graph the shipped gate fires 5 times and the ADR's gate 89 times.

The compression montage exists to absorb **was happening the whole time** — `rawLegs` 115 down to
a `target` of 48 — it was just being spread proportionally across every segment by the surplus
allocator. Which is precisely the "shrinking everything" that sentence rejects.

### Why no test caught it

Every montage test in `leg-plan.test.ts` builds a 60-to-90-segment synthetic route
(`evenRoute(60, 300)`, `evenRoute(90, 400)`, `evenRoute(70, 350)`). Those are all in the regime
the shipped gate does test. **The tests and the bug were written against the same mental model**,
so the suite was green and montage was dead. The generalisation: a synthetic fixture chosen for
convenience picks a regime, and pinning one regime is not pinning the function.

## Decision 1 — the gate is `rawLegs > target`, and the stop rule is per-regime

There are genuinely two regimes and no honest single formula. Forcing one expression is what
produced the bug.

- **Compression** (`segments.length >= target`, short edges). Every segment already gets its floor
  of one leg, so `legCount` is `segments.length` whatever montage does. `target` is a budget of
  PLAYABLE legs and montage marks the excess. Stop when `segments.length - montaged <= target` —
  unchanged from what shipped.
- **Expansion** (`target > segments.length`, long edges — every route the generator can currently
  produce). `legCount` is exactly `target` whatever montage does, because the allocator spreads
  `target - segments.length` surplus legs either way. Montage does not change the count, it
  changes **who gets the surplus**: a montaged segment takes one leg and its share goes to
  segments worth travelling through. Stop when the survivors fit `target` at FULL density, which
  is the point at which nothing is being compressed any more.

`montageSatisfied` is one function with the regime as an argument, so the two rules sit next to
each other and neither can be mistaken for the general case.

**Leg count moved on 0 of 123 generated routes.** That is the property that makes this safe to
land: `minLegs`/`maxLegs`, the 22–48 band and total route length are untouched. What moves is the
distribution of kilometres across legs, and the montage marks themselves.

## Decision 2 — the first and last segments are never montage candidates

The first segment owns leg 0 and the last owns `legCount - 1`. Those are the **slack-0 anchors**
of `departure` and `finale`, and ADR 0027 invariant (d) **drops** a beat whose window intersects a
montage leg rather than sliding it (`beat-schedule.ts:182`).

Without the guard, measured across the 25 corpus routes: **10 `finale` and 6 `departure` slots
deleted.** Losing `finale` is the exact metric-gaming ADR 0027 Decision 5 forbids — it is
unfillable in the corpus today, so dropping it can only leave the fill-rate **denominator** and
raise beat fill with nothing changing for a player. With the guard, both are 25/25 on both trees.

It also guarantees the free set is non-empty whenever montage is, so the surplus always has
somewhere to go — a guard that would otherwise need writing separately.

## Decision 3 — the segments either side of a crossing are protected too

**A crossing is already safe from montage by its dullness, and that is not enough.** Montaging the
stretch BETWEEN two crossings collapses it to one leg, the two slack-1 border windows land within
a leg of each other, and ADR 0027 invariant (b) drops one. The crossing keeps its scene and loses
its beat, and it reports as content starvation.

`border_crossing` and `checkpoint` **leg counts are identical on all three trees** (119 and 114) —
the crossings never moved type and were never candidates. What montage changed was their SPACING.

Beat slots across the 25 corpus routes, same seed, same pairs:

| type              | pre-montage | anchors only | + adjacency |
| ----------------- | ----------: | -----------: | ----------: |
| `departure`       |          25 |           25 |      **25** |
| `finale`          |          25 |           25 |      **25** |
| `ferry_boarding`  |           8 |            8 |       **8** |
| `border_crossing` |          71 |           58 |      **71** |
| `midpoint_crisis` |          14 |           11 |      **13** |
| `approach`        |          21 |           15 |          15 |
| **total**         |         164 |          142 |     **157** |

**Every border slot comes back — 58 → 71, the exact pre-montage count** — and 2 of the 3
`midpoint_crisis` slots with them. `approach` stays at 15 and is left there deliberately: it is
**unfillable** in this corpus, so recovering it would only add to the fill-rate denominator, which
is the metric-gaming ADR 0027 Decision 5 forbids in the other direction.

The guard is a NEIGHBOURHOOD, not a distance. What a border beat needs is legs between it and the
next one, and the segment either side is where those legs come from.

**It costs about a third of montage coverage**, which is the trade and it is worth stating in
full: 157 montage legs → **106** across the corpus (17% of legs → 11%), and 48% of corpus km →
**38%**. On a 123-route sweep, 15% of legs → 10% and routes with no montage at all go 34/123 →
46/123. 106 legs is still an ample population for M3.12b to calibrate against, and buying back
18% of one of only two fillable beat types is worth more than the coverage.

## Consequences, measured

The fixture pack is untouched and that is checkable rather than asserted: `regenerate-goldens.ts`
builds from `loadFixtureScenarios()`, the hand-authored `routes.json`, which carries
`montageLegs: []` and **never calls `planLegs` at all**. So a `leg-plan.ts` change cannot reach a
golden digest or the fixture baseline.

- **All nine golden digests unmoved**, `pnpm test:engine` green with no `golden:update`.
- **`pnpm sim:diff -- --runs=2000` reports "No change vs docs/sim-baseline.md."**
- Only `--pack=corpus` moves. At **20,000 runs** (10× the baseline sample, because
  `payoffRate`'s denominator is ~600 and a 2,000-run reading of it is noise):

**The middle column is kept on purpose.** It is what montage costs without Decision 3, and it is
the evidence that the guard is doing the thing it was added to do rather than moving a number by
coincidence.

| metric              | pre-montage | anchors only |   shipped |         Δ vs pre |
| ------------------- | ----------: | -----------: | --------: | ---------------: |
| Completion          |       42.2% |        44.1% | **43.2%** |           +1.0pp |
| Long-range payoff   |       24.6% |        18.5% | **24.3%** |           −0.3pp |
| Beat fill           |       28.1% |        26.1% | **27.5%** |           −0.6pp |
| Unresolved threads  |         521 |          452 |   **525** |               +4 |
| Checks resolved     |     205,612 |      196,382 |   198,606 |            −3.4% |
| Median legs         |          25 |           25 |    **24** | survival, not km |
| Median in-game days |          10 |           10 |    **10** |                — |

**One mechanism explains all of it.** A montage leg replaces `k` ordinary legs over the same
ground, and `legHours` charges the per-mode overhead **once instead of k times** — a 1,200 km car
segment is `4 + round(1200/70)` = 21 hours as one montage leg against `5 × (4 + 3)` = 35 hours as
five ordinary ones. Drift is denominated in hours (ADR 0035), so:

1. **Completion up** — fewer hours over the same distance is less hunger, morale and health drain.
   This makes montage a **time discount nobody explicitly chose**, and it is the single most
   important thing on this page for whoever tunes next. Decision 3 halves it (+1.9pp → +1.0pp) as
   a side effect of protecting fewer kilometres, but does not remove it. 43.2% is still mid-band.
2. **Ordinary legs get scarcer**, so generic queued payoffs lose windows. Without Decision 3
   `roadside` legs fell 311 → 279 and the payoff rate fell 6.1pp with them; **with it the payoff
   rate returns to 24.3% against a 24.6% baseline and unresolved threads to 525 against 521**.
   That the two recover together is what identifies the mechanism — it was fewer schedules
   reaching fewer eligible legs, not more failures.
3. **Structural beats bunch**, per Decision 3, and that is now bought back in full.

**`Median legs` 25 → 24 is a survival statistic, not a route-shape change.** Total route legs
across the 25 corpus routes is **931 on all three trees** — identical. What moved is how far a
run gets before it ends.

## What this hands to M3.12b

ADR 0029 Decision 7 item 2 can now be computed. The class it is computed over:

- **106 montage legs of 931** across the 25 corpus routes — **11.4% of legs**, inside
  `MAX_MONTAGE_SHARE` by construction.
- **38% of corpus kilometres**; on the 123-route sweep, p50 10% and p90 63% per route, with
  46 of 123 routes carrying no montage at all.

That km share is the number to argue about, and it is a design call rather than a defect: a
17,000 km continental route SHOULD be mostly summary. It is stated here so M3.12b calibrates
against a measured population instead of discovering it. **The 46-of-123 figure is the one to
watch** — a montage-quiet-ratio target computed over a route set where a third of routes have no
montage legs is thinner than it looks.
