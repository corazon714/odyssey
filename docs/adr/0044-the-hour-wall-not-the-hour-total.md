# 0044 — The hour WALL, not the hour TOTAL

**Status:** accepted (a finding; no constant, no engine change)
**Date:** 2026-08-19
**Supersedes in part:** `world-tick.ts:111-136`'s "completion is a near-deterministic function of
that one number", and ADR 0035's reading of it
**Relates to:** `docs/adr/0026` (leg planning), `0039` (montage's two regimes), `0040`/`0041`
(the wear curve and its knee), `0042` (`--by-route`), `0043` (the sixth endpoint pair)

---

## The question

`docs/phase-3-dod.md` gate 9 fails on two routes. Re-measured on this tree at
`pnpm sim -- --pack=corpus --runs=280000 --by-route`:

| route                    | pair            | profile / mode | legs |    km | hours | completion |    vs floor |
| ------------------------ | --------------- | -------------- | ---: | ----: | ----: | ---------: | ----------: |
| `route.illicit.r1dlxpt5` | Beira-Aktobe    | illicit/truck  |   48 | 16983 |   509 |  **2.32%** | **-4.5 SE** |
| `route.illicit.r16kyujq` | Beira-Aktobe    | illicit/truck  |   48 | 17243 |   513 |  **2.81%** | **-1.1 SE** |
| `route.illicit.rskpfno`  | Jijel-Shakhty   | illicit/truck  |   48 | 17521 |   490 |     10.80% |    +25.1 SE |
| `route.illicit.r1gjd3s6` | Nairobi-Segezha | illicit/truck  |   48 | 16069 |   509 |     16.51% |    +36.4 SE |

Four routes, identical on **every variable the report prints** — profile, transport mode, leg
count, and total travel hours to within 4.7% — and **7.1× apart in completion**. A floor gate
nobody can explain is a gate nobody can defend.

## The answer, in one sentence

**Drain is charged per HOUR; recovery arrives per LEG. So what a run can afford is set by the
LOCAL hours-per-leg, and `r1dlxpt5` bills 232 of its 509 hours inside nine consecutive legs.**

## Decision

Record the mechanism. **Change no constant and no engine code.** Moving a route above 3% by
tuning a number nobody has explained is what this investigation existed to avoid.

---

## The mechanism

### 1. The exchange rate is hours-per-leg, and it is LOCAL

Every drain in `world-tick.ts` is `spanPoints(elapsed, span, per)` — denominated in hours, by
ADR 0014's rule 1 ("TIME makes you hungry, not legs"). Recovery is the opposite: it arrives
only from events, and while `BASE_EVENT_ODDS` is fenced at `1:0` **exactly one event fires per
leg**. So a leg is one unit of recovery whatever it costs, and a route's survivability is the
ratio between the two — measured over the stretch you are currently on, not over the route.

### 2. Clamping makes the outcome path-dependent even at equal totals

Summed over a run the drain telescopes: `span` is `worn(travel + hours) − worn(travel)`, so the
total is a function of total travel hours and nothing else. **That proves less than it appears
to**, and assuming otherwise is the error this investigation began with.

Resources clamp. When a 30-hour leg lands on meters that are already at their floor, the
overshoot is **discarded** — but the TIME is not, and morale is charged for every hour of it.
The same 30 hours arriving on full meters is largely absorbed by the clamp and costs far less.
Two runs with identical summed drain therefore end differently, and the direction depends on
WHERE the meters were when the lump arrived.

### 3. What that does to `r1dlxpt5`

`legHours` caps an ordinary leg at 12 hours and a **montage** leg at 30 (`MAX_MONTAGE_HOURS`),
and a montaged segment collapses to exactly one leg however long it is (ADR 0026 D4). The route
has **18 path edges for 16,983 km**; the planner montages 10 of them, and nine land at
consecutive leg indices:

```
leg          0..7    8   9  10  11  12  13  14  15  16   17..47
hours        7 x8   30  30  30  23  30  30  11  23  25   5..7
```

Legs 8–16 bill **232 hours against nine events**. Measured trajectories (2,000 runs, all five
policies):

```
                 leg    0     4     8    12    16    20    24
r1dlxpt5  travel h      7    35    86   199   288   311   335
          morale        7     8     6     2     2     2     3
          ALIVE      2000  2000  1997  1304   671   244   191

r1gjd3s6  travel h      9    64    96   128   160   185   213
          morale        7     7     6     4     5     5     7
          ALIVE      2000  2000  1997  1898  1555  1142   946
```

**67% of the population dies between leg 8 and leg 16 on `r1dlxpt5`; 22% does on `r1gjd3s6`.**
The binding meter is morale, and it is binary across the four:

| route      | median leg of FIRST morale floor | `failure_gave_up` | completion |
| ---------- | -------------------------------: | ----------------: | ---------: |
| `r1dlxpt5` |                       **leg 14** |             75.5% |      2.32% |
| `r16kyujq` |                       **leg 14** |             70.8% |      2.81% |
| `rskpfno`  |                        **never** |             73.3% |     10.80% |
| `r1gjd3s6` |                        **never** |             59.8% |     16.51% |

Energy floors at leg 5 on every route in the corpus, so it discriminates nothing. Once energy
is at the floor `moraleCost` charges `spanPoints(elapsed, span, 20)` **per hour**, so a 30-hour
leg costs 1–2 morale outright and returns one event to win it back. Morale starts at 7. Nine
such legs are not survivable; the same hours spread over 25 legs are.

---

## The causal test

Correlation across four routes is worth very little. So: **permute the route and change nothing
else.** A permutation holds every multiset invariant BY CONSTRUCTION — same `legKm` multiset,
same total km, same 509 static hours, same montage count, same clamped-leg count, same
harsh-eligible count, same `legLocations` multiset, same beats. Only the ORDER changes.

The permutation acts on interior legs only, so `departure@0` and `finale@47` keep their anchors,
and it carries `legKm`, `legLocations`, `montageLegs` and `beatSchedule` **together**, so a beat
stays on the leg whose location it was scheduled against. Coherence is asserted, not assumed.
Two single-channel controls apply the same permutation to one passenger at a time.

**10,000 runs per variant, all five policies:**

| variant                            | completion |  Δ vs base | morale floor | coherent |
| ---------------------------------- | ---------: | ---------: | -----------: | -------- |
| base (as generated)                |      2.56% |          — |        60.9% | yes      |
| **ALL: montage wall moved LAST**   |  **9.60%** | **+21 SE** |    **35.7%** | yes      |
| ALL: montage wall moved FIRST      |      6.90% |     +14 SE |        65.1% | yes      |
| CTRL — beats permuted only         |      2.75% |    +0.8 SE |        61.4% | no (2)   |
| CTRL — locations permuted only     |      2.69% |    +0.6 SE |        65.6% | no (3)   |
| _reference_ `r1gjd3s6`, unpermuted |     15.95% |          — |        36.2% | —        |

**Both controls are null and the hour permutation moves 7.04pp at 21 standard errors.** The
position of the hour mass is causal; its passengers are not. And the permutation reproduces the
reference route's morale-floor share almost exactly — 35.7% against 36.2% — which is the
mechanism confirming itself on a quantity nobody tuned toward.

### What the permutation does NOT do

It recovers **7.0 of the 13.4pp gap, not all of it.** `failure_collapsed` rises 21.9% → 32.2%
when the wall moves to the end: a contiguous block is still a block, and at the end of the run
it starves the player instead of demoralising them. `r1gjd3s6` does not merely put its wall
late — it **has no wall**, spreading montage over legs 2, 3, 26 and 36–45. The finding is
"a contiguous hour wall is lethal", not "late is safe".

Note also that wall-FIRST (6.90%) beats the base (2.56%). That is the clamp argument in the
player's favour: 232 hours landing at leg 1 hit meters at 9/10/7 and most of the drain is
discarded by the floor. **The worst place for the wall is the middle-early** — after the
starting buffer is spent, before the wear curve has bought anything back.

---

## Hypotheses ELIMINATED, with what killed them

- **Per-leg hour distribution against `HARSH_WEATHER_HOURS`** — the only distribution-sensitive
  term inside the tick is energy's `+ (harsh ? 1 : 0)`. Harsh-eligible legs: **46/48 vs 45/48**.
  Not the channel. (It was still worth counting: it is the only term the telescoping argument
  does not cover, and it had to be excluded by measurement rather than by argument.)
- **`legLocations` / event-pool starvation** — `uneventfulLegs` and `fallbackLegs` are **0.00 on
  every route**. The relaxation ladder never engages; rung 0 always finds an event. Confirmed
  twice: by the counters and by the null locations-only control.
- **Beat schedule** — null control at 10,000 runs (+0.8 SE).
- **Realized vs static hours** — the 509 is static, and play agrees: max realized travel is 520
  against 509 static (`r1dlxpt5`) and 524 against 509 (`r1gjd3s6`). The montage ceiling is
  already priced into the static sum, so the two routes were genuinely comparable and the 14pp
  gap has no boring explanation.
- **Total hours, distance, profile, mode, leg count, starting cash, starting weather** — ruled
  out before this session; not re-derived.

---

## Does it generalise? Honestly: PARTLY

A candidate statistic — the **worst 9-leg window**, `max over L of Σ hours[L..L+9)`:

|                    | all 28 routes | the 9 routes at the 48-leg cap |
| ------------------ | ------------: | -----------------------------: |
| total hours        |    **−0.947** |                     **−0.929** |
| worst 9-leg window |        −0.915 |                         −0.900 |
| km per path edge   |        −0.380 |                         −0.667 |

**Total hours remains the better GLOBAL predictor, and this ADR does not claim otherwise.** The
window is robust to its own size (ρ = −0.876 / −0.915 / −0.921 at K = 5 / 9 / 13), so the choice
of 9 is not load-bearing, but it does not beat the total.

The two statistics answer different questions, and gate 9 asks the second one:

- **Between strata**, total hours orders the corpus.
- **Within a stratum**, it is blind — and a FLOOR lives inside a stratum. On the four
  comparables total hours ranks `r16kyujq` (513) worst and `rskpfno` (490) best, and **gets both
  ends wrong**. The window separates them with a clean gap and nothing in between:

  ```
  r1dlxpt5  232 -> 2.32%      rskpfno   170 -> 10.80%
  r16kyujq  236 -> 2.81%      r1gjd3s6  177 -> 16.51%
  ```

## The structural cause, upstream

A wall needs long segments that montage will select and collapse. That needs a **coarse path**:
`r1dlxpt5` carries 16,983 km on **18 edges** (944 km/edge) against `r1gjd3s6`'s 23 (699) and the
healthy 48-leg routes' 457–555. Stratified to the 48-leg routes, km-per-edge reaches ρ = −0.667.

And the path is coarse because the generator collapsed. ADR 0043 measured Beira-Aktobe at
`rungReached = 3` out of a 12-candidate pool with every survivor overlapping 91–98%. **The two
breaching routes share 16 of 18 edges and 18 of 19 nodes — 88.9% overlap.** They differ by one
detour.

> **Gate 9 does not fail on two routes. It fails on ONE CORRIDOR, sampled twice**, and the
> second sample exists because the generator could not supply an alternative. `acceptByDiversity`
> is not at fault — 88.9% is inside the rung-3 ceiling of 90% it was asked to enforce.

That makes the open questions "chase the discriminator" and "fix Beira-Aktobe's generator
collapse" **one item, not two**.

## Consequences

1. **`world-tick.ts:111-136` is now wrong in a third way.** Beyond the two already recorded, its
   "completion is a near-deterministic function of that one number" is false within a stratum,
   which is exactly where a floor gate reads. Left in place deliberately — see PROGRESS.
2. **The corpus cannot demonstrate a fix.** With one corridor supplying both breaches, any change
   that clears gate 9 is being validated on n=1. Raising `YEN_K` was already measured to
   CONCENTRATE the tail (ADR 0043).
3. **`--by-route` could not see the thing that decides its own verdict.** It printed total hours,
   which is blind within the stratum the gate reads. **A `peak` column shipped immediately after
   this ADR** — see `PEAK_WINDOW_LEGS` in `by-route.ts`, where the window's provenance and its
   invalidation conditions are recorded. It reads 232 / 236 against 170 / 177 on the four
   comparables. It landed BEFORE any change that moves `legKm`, so the fix in the next section
   has a working instrument to be measured against rather than one that moved alongside it.
   **It is a FLAG, not a dial — see the addendum, which retired the stronger reading this ADR
   originally gave it.**
4. **No dial is implicated.** Neither `HOURS_PER_MORALE`, nor `FULL_UNTIL`, nor `MAX_MONTAGE_HOURS`
   is mistuned — the same constants produce 2.56% and 9.60% on the same multiset of legs. The
   defect is in route SHAPE, so the fix belongs in `leg-plan.ts` or in path selection, not in the
   drain economy.

## The fix this ADR does not make

`planLegs` picks montage by **dullness alone** (`byDullness`), with position entering only as
`protectedFromMontage` — the two anchors and the neighbourhood of each crossing. Nothing stops it
selecting nine consecutive segments, and on a corridor whose dull segments are contiguous it
reliably does. A **spacing constraint** on montage selection — refuse a segment adjacent to one
already montaged while any unmontaged candidate remains — would break the wall into a comb at no
cost to the montage budget, and it is a change to route generation rather than to balance.

It is not made here because it moves `legKm` on every corpus route, therefore the corpus baseline,
therefore gate 9 itself, and it should not be measured on the same run that discovered the
problem. Handed forward with an owner.

---

# ADDENDUM — `peak` is a FLAG, not a dial. The comb permutation retires the stronger claim

**Date:** 2026-08-20. Written against the same tree, before any carry-forward work, so that the fix
above cannot be justified against a claim this measurement has weakened.

## What this ADR originally claimed, and what was measured

The body says a route "that concentrates its hours into a few legs pays more for the same total",
and the `peak` column shipped carrying that reading. **Three measurements narrow it.**

### 1. The comb permutation. Halving `peak` bought nothing

A spacing constraint does not relocate the montage block, it dissolves it. The **comb** — the
same 10 montage legs placed as far apart as the interior allows (3, 7, 12, 17, 21, 26, 30, 35,
40, 44 rather than 8-16) — is that shape, reachable inside the permutation family, so every
multiset is still held fixed. 10,000 runs per variant:

| variant               | peak    | hours | completion |     SE | morale floor | collapsed |
| --------------------- | ------- | ----: | ---------: | -----: | -----------: | --------: |
| base (as generated)   | 232     |   509 |      2.31% | 0.15pp |        61.2% |     22.6% |
| wall last             | **232** |   509 |  **9.32%** | 0.29pp |        35.9% |     31.9% |
| COMB — montage spread | **109** |   509 |  **8.64%** | 0.28pp |        51.3% |     17.6% |

**A 2.1x difference in `peak` for a 1.7 SE difference in completion.** The intervention that left
`peak` untouched did nominally better than the one that halved it. Whatever the engine responds
to, `peak` is not it: both permutations move WHERE the hours sit relative to the meters and the
wear knee, and only one of them moves `peak`.

The body's causal result is untouched — arrangement is causal, at 21 SE, with null controls. What
is retired is the identification of arrangement WITH `peak`.

### 2. The same two variants reach the same completion through DIFFERENT failure mixes

Morale floor 35.9% / collapse 31.9% against 51.3% / 17.6%: **collapse differs by 1.8x at
statistically identical completion.** These are two mechanisms averaging to one number — the
relocated block starves runs at the end, the comb demoralises them throughout. That is a second,
independent argument against `peak` as a dial, and it is the reason the acceptance test for the
fix cannot be a single completion figure: pillar 1 says a bad outcome should be interesting
rather than punishing, and "starves out slowly" and "collapses" are not interchangeable.

### 3. Most of `peak`'s corpus correlation is borrowed from `hours`

```
rho(peak,  hours)       0.938      <- the confound
rho(hours, completion) -0.950      partial | peak   -0.629
rho(peak,  completion) -0.923      partial | hours  -0.296
```

Stratified by total hours, `peak` orders inconsistently: rho = -0.525, -0.162, **+0.800**,
**0.000**, -0.600 across five bands (mode is a live confound at n=4 per band, so these refute
nothing — but they support nothing either). And **no threshold is demonstrated**: only 6 of 28
routes reach `peak` 100, and the band **178-231 contains zero routes**. The clean gap between the
failing pair (232/236) and their comparables (170/177) is a hole in the sample. A cliff in
(177, 232] and a smooth gradient across it are indistinguishable on this corpus.

## `conc` was considered as a second column and REFUSED

`conc = peak / (9 x the route's own mean hours-per-leg)` — shape with route length divided out —
separates the failing pair better than `peak` does: **2.43 / 2.45 against a corpus maximum of
1.85 everywhere else.** It is still not worth printing. Its partial correlation with completion
holding hours is **+0.211 — the wrong sign**, so once size is controlled, more concentration is
if anything associated with BETTER completion. Its raw rho is -0.698 against `peak`'s -0.923. It
inverts badly in the middle of the range (conc 1.71 -> 67.78%, conc 1.55 -> 68.58%, against conc
1.17 -> 17.15%). And the comb refutes it more directly than it refutes `peak`: the comb takes
`conc` from 2.43 to 1.14 — below the corpus median — and still does not beat the variant that
leaves it at 2.43. Its entire apparent advantage is a two-point separation at the top of a
28-route sample, which is exactly the kind of evidence this addendum exists to discount.

## What `peak` is still for

Noticing. It is the only printed column that separates gate 9's failing routes from their
comparables, and that is worth a column — a route it flags is a route to go and measure. It is
not a quantity to tune against, and no acceptance test may be written as a `peak` threshold.
