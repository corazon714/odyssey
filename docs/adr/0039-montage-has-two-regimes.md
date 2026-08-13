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

## Decision 3 — montage bunches the structural beats, and invariant (b) drops the collisions

Recorded rather than mitigated, because it is a real property of the shape and the fix for it is a
calibration decision, not a bug fix.

Beat slots across the 25 corpus routes, same seed, same pairs:

| type              | before |   after |
| ----------------- | -----: | ------: |
| `departure`       |     25 |  **25** |
| `finale`          |     25 |  **25** |
| `ferry_boarding`  |      8 |       8 |
| `border_crossing` |     71 |  **58** |
| `approach`        |     21 |      15 |
| `midpoint_crisis` |     14 |      11 |
| **total**         |    164 | **142** |

`border_crossing` and `checkpoint` **leg counts are identical** on both trees (119 and 114) — the
crossings did not move type, and they were never montage candidates. What changed is their
SPACING: montage collapses the dull stretches between them, so two crossings that were five legs
apart become adjacent, their slack-1 windows overlap, and ADR 0027 invariant (b) drops one. Same
mechanism costs 3 `midpoint_crisis` slots.

**13 of the 71 border slots is 18% of one of only two fillable beat types in the corpus**, and it
is why beat fill went DOWN rather than up despite 6 unfillable `approach` slots also leaving the
denominator. If M3.12b wants those back, the lever is a rule against montaging a segment
ADJACENT to a crossing, not a change to invariant (b) — but that trades montage coverage for beat
coverage and wants measuring, not guessing.

## Consequences, measured

The fixture pack is untouched and that is checkable rather than asserted: `regenerate-goldens.ts`
builds from `loadFixtureScenarios()`, the hand-authored `routes.json`, which carries
`montageLegs: []` and **never calls `planLegs` at all**. So a `leg-plan.ts` change cannot reach a
golden digest or the fixture baseline.

- **All nine golden digests unmoved**, `pnpm test:engine` green with no `golden:update`.
- **`pnpm sim:diff -- --runs=2000` reports "No change vs docs/sim-baseline.md."**
- Only `--pack=corpus` moves. At **20,000 runs** (10× the baseline sample, because
  `payoffRate`'s denominator is ~600 and a 2,000-run reading of it is noise):

| metric              |  before |     after |      Δ |
| ------------------- | ------: | --------: | -----: |
| Completion          |   42.2% | **44.1%** | +1.9pp |
| Long-range payoff   |   24.6% | **18.5%** | −6.1pp |
| Beat fill           |   28.1% | **26.1%** | −2.0pp |
| Unresolved threads  |     521 |   **452** |    −69 |
| Checks resolved     | 205,612 |   196,382 |  −4.5% |
| Median legs         |      25 |        25 |      — |
| Median in-game days |      10 |        10 |      — |

**One mechanism explains all of it.** A montage leg replaces `k` ordinary legs over the same
ground, and `legHours` charges the per-mode overhead **once instead of k times** — a 1,200 km car
segment is `4 + round(1200/70)` = 21 hours as one montage leg against `5 × (4 + 3)` = 35 hours as
five ordinary ones. Drift is denominated in hours (ADR 0035), so:

1. **Completion up** — fewer hours over the same distance is less hunger, morale and health drain.
   This makes montage a **time discount nobody explicitly chose**, and it is the single most
   important thing on this page for whoever tunes next. 44.1% is still mid-band.
2. **Ordinary legs get scarcer.** `roadside` legs fall 311 → 279 while `wilderness` rises 69 → 86
   and `city` 263 → 277. Generic queued payoffs live on ordinary intermediate legs, so they lose
   windows — that is the payoff rate, and unresolved threads falling 69 at the same time confirms
   it is fewer schedules reaching fewer eligible legs rather than more failures.
3. **Structural beats bunch**, per Decision 3.

Checks fall 4.5% while complication rate, repeat rate and universal-choice rates are all flat to
within 0.2pp: the choice MIX shifted toward paying rather than rolling, which is what more cash
and health buys. Median legs is unmoved, so this is not a shorter run.

## What this hands to M3.12b

ADR 0029 Decision 7 item 2 can now be computed. The class it is computed over:

- **157 montage legs of 931** across the 25 corpus routes — **16.9% of legs**, inside
  `MAX_MONTAGE_SHARE` by construction (max 33% on any single route).
- **48% of corpus kilometres**, p50 35% and p90 73% per route; the worst single route summarises
  73% of 17,521 km into 11 of its 48 legs.

That km share is the number to argue about, and it is a design call rather than a defect: a
17,000 km continental route SHOULD be mostly summary. It is stated here so M3.12b calibrates
against a measured population instead of discovering it.
