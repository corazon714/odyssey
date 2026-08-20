# 0035 — Morale is a per-hour drain, and the failure mode is conserved

- **Status:** Accepted, implemented 2026-08-12 (M3.10b). **The band IS met at 47.3% — see the addendum; the Consequences section's prediction was wrong.** Superseded in its NUMBERS by the second addendum (M3.11d, 41.0%): the constants below are no longer the shipped ones. The reasoning is intact and the conservation result is now measured three times. **Every corpus number in this ADR was measured on a harness that welded each route to ONE policy (ADR 0038); the aggregates are ~1.64pp off at 25,000 runs per cell (~1.70pp at 2,000) and the PER-ROUTE figures were not measurements at all. Corrected in place at M3.11f/g, and where a figure could not be re-derived it is marked rather than restated. The shipped completion is 41.9%, not 41.0%.**
- **Relates to:** ADR 0014 (the drift curve is denominated in hours), ADR 0026 (the leg model
  and the survivability addendum), ADR 0034 (generated corpus routes)

## Context

Generated routes are 22–48 legs. Every balance constant in `world-tick.ts` was tuned against
~12-leg fixture routes, and at the new length corpus completion measured **3.6%** against a
30–50% target.

The resource trajectory pointed at health — p50 4 at leg 15, 1 at leg 25 — and morale looked
healthy at p50 7 by leg 25. **That reading was wrong, and the way it was wrong is the lesson:
the trajectory table is conditioned on survival.** Leg-25 percentiles contain only runs that
reached leg 25; every run that had already died of `failure_gave_up` was absent from the sample
that made morale look fine.

## The measurement

Five candidate levers were each applied in isolation and measured on the 22–48 band.

**The failure mode is conserved, not removed.** Across a starvation-damage sweep
(10/5 → 12/6 → 16/9 → 26/14, completion 3.6% → 8.7% → 18.9% → 24.5%), `failure_collapsed` falls
68.1% → 3.0% while `failure_gave_up` rises 28.2% → 72.4%. Health stops killing people and morale
starts.

A reverted diagnostic settles it at the limit: with `HUNGER_HURTS`/`HUNGER_STARVING` set
unreachable — perfect food forever, health 10/10/10 at every checkpoint, zero collapse —
completion **still stalls at 26.3%**. That bounds the entire health-and-food family, including
every content lever, below the floor.

Content cannot close it either: the four health-restoring choices are picked 0.38 times per run
out of 15.5 picks, worth +0.3pp; and universal injection is **saturated** — all 13 events sit at
`min(3, authored)`, so a 16th registry row evicts an existing one rather than adding coverage.

## Decision — convert `moraleCost` from per-leg to per-hour

`moraleCost` charged −1 per **leg** once energy ≤ 1. Energy floors at 0 on any long leg, so that
is effectively an unconditional −1 per leg against a 0–10 pool: death at ~leg 13 regardless of
how far or how long those legs were. The observed median run was 14 legs on routes of 23–31.

It was the **last per-leg drain in the file**, and ADR 0014's first rule — _time makes you
hungry, not legs_ — had been false about it since the rule was written. `world-tick.ts`'s comment
claiming starvation was the last holdout was stale.

**This is a RATE change, not a grading.** `ENERGY_TIRED`'s measured decision is untouched: still
exactly one rung, and energy 0 costs precisely what energy 1 costs. Grading a floored meter
synchronises the collapse (measured: a `−2 at energy 0` rung drove leg-15 morale from `0/2/6` to
`0/0/0`), and that is still forbidden. A test pins the single-rung property directly.

Starvation damage is softened alongside it, 10/5 → 16/9. 26/14 scored better (24.5% vs 18.9% on
its own) and was refused: it drops collapse to 3%, and a mechanic that never fires is worse than
a harsh one (pillar 1).

## Consequences

- Corpus completion **3.6% → 26.1%**, median legs 14 → 21 on routes of 23–31. Fixture pack
  31.2% → 35.1%, still in band. Both baselines and the goldens were regenerated.
- **THE BAND IS NOT MET AND THE SWEEP SATURATES.** `HOURS_PER_MORALE` at 8/12/16/20 gives
  23.5/26.1/27.5/27.8 — no value reaches 30. **Energy is the next binding meter**: it floors by
  mid-run, which is what keeps the morale drain running at all, and no constant in
  `world-tick.ts` lifts completion past ~28% while it does. M3.10b's acceptance criterion is
  therefore open.
- **Two tests encoded pre-generated-route leg lengths.** `healthCost(8,0,12) > healthCost(8,0,3)`
  silently capped `HOURS_PER_HUNGER_DAMAGE` at 12 — above that a single 12-hour leg charges zero
  and the assertion inverts — and is now derived from the constant. `sim.test.ts`'s
  `payoffRate > 0.5` floor was **lowered to 0.2, which is a weaker guard**: the rate falls
  whenever runs last long enough to schedule consequences they do not live to resolve. The same
  pack at 2,000 runs measures 61.9%, so the signal is healthy and it was the 200-run threshold
  that was wrong — but tighten it and raise the sample if unresolved threads climb.
- **A method note worth more than the numbers.** Do not read a survival-conditioned trajectory as
  a population trajectory. The table showed health falling and pointed everyone at health; health
  was merely the first meter to reach zero. The test that would have caught it earlier is the
  ending MIX, which was in the report all along.

---

## Addendum — the band IS met, and this ADR's own prediction was wrong

The Consequences above named **energy** as the next binding meter and said no constant in
`world-tick.ts` could lift completion past ~28%. **Both claims are false, and the measurement
that disproves them is cheap enough that it should have been run before the claim was written.**

Slowing energy drain does almost nothing for survival. Scaling `HOURS_PER_ENERGY` by 1.4/1.8/2.2/3.0
moves completion 26.1% → 27.0/26.9/27.1/**27.4%** while `failure_gave_up` falls 22.9% → 13.5%. So
energy governs the SHARE of deaths that are morale deaths, and not whether runs survive.

The ending mix said so plainly and nobody read it: at 16/9 the split was **collapsed 50.8%**,
arrival 26.0%, gave_up 22.9%. Collapse was still the majority ending. Health had never stopped
being the wall — the morale conversion moved enough runs past the morale cliff that health became
visible again, and this ADR mistook the falling gave_up share for morale being solved.

**The fix was to re-sweep the lever this ADR had already used.** `16/9` was chosen when morale was
still per-leg; once morale went per-hour the same lever behaves differently, and it was never
re-measured:

| hunger/starving | completion | median legs | collapsed | gave_up |
| --------------- | ---------- | ----------- | --------- | ------- |
| 16/9            | 26.1%      | 21          | 50.8%     | 22.9%   |
| 20/10           | 29.5%      | 22          | 43.1%     | 27.2%   |
| **28/14**       | **47.3%**  | **24**      | 14.7%     | 37.8%   |
| 32/16           | 54.8%      | 25          | 5.8%      | 39.3%   |
| 40/20           | 59.4%      | 25          | 0.7%      | 39.8%   |

**`28/14` ships.** It is inside the 30–50% band on 22–48 leg routes at median 24, and collapse
stays meaningful at 14.7% — 32/16 and 40/20 score higher and are refused for the same reason 26/14
was refused earlier, that a mechanic which never fires is worse than a harsh one (pillar 1). The
pair also preserves the 2:1 rung ratio the invariant test pins.

**No energy change ships.** The sweep is recorded so nobody repeats it.

### The lesson, which is the same one twice

Both wrong calls in this milestone came from reading a _derived_ number instead of the ending mix.
First the survival-conditioned trajectory table said morale was healthy; then a falling `gave_up`
share said morale was the problem. **The ending mix was correct and available on both occasions.**
When completion moves, read what runs are DYING of before choosing a lever.

---

## Second addendum, measured 2026-08-12 (M3.11d) — survival is a budget in HOURS, and the route set outgrew it

M3.11 widened the geo slice to Afro-Eurasia (263 → 692 nodes) and corpus completion fell
**38.7% → 19.2%**, below the band again. `04f0f38` committed the number with a hypothesis
attached: leg count is capped at 48 by the compression curve, so a 15,296 km route is 48 legs of
~320 km where the old 6,000 km routes were 48 legs of ~125 km, and the drift constants were tuned
against the shorter ones.

**The hypothesis is right about the mechanism and wrong about what changed.** No engine file was
touched at `04f0f38` — the diff is geo artifacts, `CORPUS_PAIRS`, and this pack's baseline. The
economy did not regress. What moved is which routes it is measured on.

### What the measurement actually says

Completion is dominated by **one** number, the route's total travel hours, and by neither legs nor
kilometres.

> **M3.11f: the table below is NOT a per-route measurement and must not be quoted as one.** Its
> caption said "200 runs each, all five policies". The harness paired runs as
> `scenario = i % 25; policy = i % 5`, so each route saw exactly **one** policy for all 200 of its
> runs — see ADR 0038. Policy swings a mid-range route by up to 94pp, so these cells are a route
> crossed with an arbitrary policy. They are left standing because they were also measured on the
> **pre-M3.11d** constants, which are no longer in the engine, so they cannot be re-derived
> without reverting `world-tick.ts`. **The corrected, properly-crossed per-route table for the
> SHIPPED constants is in `docs/sim-baseline-corpus.md`.** The claim the table was cited for —
> that hours is the variable — survived re-measurement and got stronger; the thresholds did not.

| total hours | 112 | 116 | 138 | 151 | 173 | 191 |  213 |  222 |  260 |  285 | 383+ |
| ----------- | --: | --: | --: | --: | --: | --: | ---: | ---: | ---: | ---: | ---: |
| completion  | 82% | 85% | 63% | 58% | 36% | 19% | 1.0% | 1.5% | 0.0% | 0.0% | 0.0% |

**The two train routes settle that hours is the variable rather than distance**, because they
break the km ordering: 6,090 km over 36 legs is 151 hours by train, while 5,790 km over 34 legs is
213 hours by car. Same distance, same leg band, and the faster-in-hours route wins. This ADR read
those as 58.0% against 1.0%, "four times the completion"; on the shipped constants and the full
25 × 5 grid they are **85.23% against 46.09% at 25,000 runs per cell, 1.8×** (85.4% against 46.4%
at 1,000 runs per cell — same pair, 25× the sample). The multiple was wrong, the direction was
not.

**On the shipped constants the ordering is confirmed with policy controlled for**, which is the
check the welded sampling could not run. Kendall tau-b against completion computed inside each
policy column (n = 25): hours −0.850 to −0.934, km −0.696 to −0.759, legs −0.653 to −0.703. Hours
beats both under all five policies. Two routes at _identical_ 43-leg counts complete 60.2%
(1,000 runs per cell — no 25,000-runs/cell figure for the 202 h route is recorded anywhere, so the
sample it was measured at is stated instead) and 0.06% (0.060% at both samples), at 202 and 383
hours.

The cliff is not a coincidence, and the arithmetic predicts it: hunger reaches `HUNGER_STARVING`
at ~60 elapsed hours, and 10 points of health at one per `HOURS_PER_STARVING_DAMAGE` is another
10 × 14 = 140. **Death at 200 hours, calculable from the constants without running the sim.**

**M3.11f — and the same arithmetic on the SHIPPED constants is the best corroboration in this
ADR.** `HOURS_PER_STARVING_DAMAGE` is now 22, so the same sum is 60 + 10 × 22 = **280 hours**. The
measured cliff on the corrected 25 × 5 grid lies in **(285 h, 383 h]** — 285 h completes **24.88%
at 25,000 runs per cell** (24.5% at 1,000) and 383 h completes 0.06% (0.060% at both samples). The
prediction lands within five hours of the observed lower bound, having been derived from two
constants and no simulation. Note that the corrected measurement moved the cliff **from ~250 h to
past 285 h**: the welded harness put four routes between 250 and 300 hours at ~0%, and they in
fact complete **21.1% to 26.1% at 25,000 runs per cell** — 22.32 / 26.14 / 21.06 / 24.88 for the
260 / 272 / 281 / 285 h routes. That band read 21.3% to 25.8% at 1,000 runs per cell, and the top
end is the part that moved: **26.14% is above the 25.8% this sentence used to state.**

### The second hypothesis, priced and rejected

It was legitimate to ask whether a 15,296 km route is one the game should offer at all — the
phase plan's verification section speaks of 300 km to 13,000 km. It was measured rather than
assumed, and it is **not** the fix, for three independent reasons:

1. **It does not clear the floor.** Capping `CORPUS_PAIRS` at 13,000 km moves completion
   19.2% → 23.7%; at 9,000 km, 26.0%. Only a 6,000 km cap reaches band (38.9%), and that
   abandons more than half the stated route contract.
2. **On top of this change it overshoots.** The same 13,000 km cap applied after the constants
   moved reports **57.1%, above the band.** A knob that lands below the floor alone and above the
   ceiling in combination is not measuring the thing.
3. **It points the wrong way.** Sampled over 898 city pairs on this slice, 90.5% land in the
   22-48 leg band, and within it **46-48 legs is 51.4% of everything** — median 14,188 km, median
   368 hours. The one-pair-per-leg-bucket rule gives that bucket 20%, so the pair set already
   **under**-weights the hard tail. Trimming it would make the sim report an easier world than
   the map offers, which is the failure mode `CORPUS_PAIRS`' own comment has documented three
   times under a different name.

`CORPUS_PAIRS` is untouched.

### The sweep, and why one lever is always enough to look like progress

Every point 2,000 runs, `--pack=corpus`, on the M3.11 route set.

| change                        | completion | median legs | collapsed |   gave_up |
| ----------------------------- | ---------: | ----------: | --------: | --------: |
| shipped (28/14, morale 12)    |      19.2% |          20 |     28.5% |     52.2% |
| morale 16                     |      22.4% |          22 |     46.0% |     31.6% |
| morale 20                     |      24.1% |          23 |     55.5% |     20.3% |
| morale 26                     |      25.4% |          23 |     62.8% |     11.7% |
| morale 34                     |      26.6% |          23 |     66.8% |      6.5% |
| starvation 36/18              |      25.6% |          21 |     12.6% |     61.8% |
| starvation 44/22              |      28.1% |          22 |      6.4% |     65.4% |
| morale 16 + 36/18             |      31.4% |          23 |     26.4% |     42.2% |
| morale 18 + 40/20             |      36.1% |          24 |     26.4% |     37.4% |
| morale 20 + 40/20             |      38.3% |          25 |     31.3% |     30.4% |
| **morale 20 + 44/22 — SHIPS** |  **41.0%** |      **26** | **26.1%** | **32.8%** |
| morale 22 + 44/22             |      43.5% |          27 |     28.4% |     28.1% |
| morale 20 + 48/24             |      43.6% |          26 |     21.5% |     34.7% |

Also swept and not taken: `HOURS_PER_HUNGER` 6 → 8 → 9 alongside morale 20 gives 26.8% / 27.9%,
worse than moving the damage rate, because runs spend most of their life already starving and it
is the rate rather than the approach that bills them.

**Neither lever reaches the band alone, and each looks like it is working while it does not.**
Morale alone drives `gave_up` 52.2% → 6.5% and `collapsed` 28.5% → **66.8%**; starvation alone
does the mirror image. This is the conservation the original ADR named, measured a third time,
and it is the reason a single-lever sweep saturates around 26-28% whichever lever you pick.

> **M3.11f/g — every row of that table was scored on the welded harness (ADR 0038), and the two
> failure columns are the ones to distrust.** The weld put the collapse-heavy policies on the
> routes where they collapse hardest — `adversarial-worst-case` collapsed 64.9% on its five welded
> routes against 39.1% over all 25, `risk-taker` 38.4% against 27.9% — and under-sampled `gave_up`
> the same way on `random` (59.8% welded against 74.4%). On the shipped row that is worth 6.3pp of
> `collapsed` and 5.4pp of `gave_up`: the SHIPS row is really **41.9% / 25 legs / 19.8% collapsed /
> 38.3% gave_up**. **The conservation result itself is unaffected** — it is a within-row contrast
> between levers measured the same way, and each row's bias is the same bias. The chosen constants
> are not shown wrong by this. But the two columns are a fifth of the grid, and a fourth sweep must
> re-measure rather than diff against them.

### Decision — re-derive both denominators, together

`HOURS_PER_MORALE` **12 → 20**, `HOURS_PER_HUNGER_DAMAGE` **28 → 44**,
`HOURS_PER_STARVING_DAMAGE` **14 → 22**.

This is a **rescale, not a reshaping**, and every structural decision this ADR made survives it
unchanged: the hunger rungs stay 8/10, the 2:1 damage ratio holds, morale stays single-rung, and
`HOURS_PER_ENERGY` is untouched because the first addendum already showed energy governs which
meter kills rather than whether runs survive. The ratio is ~1.6× on both meters, which is roughly
what the hour content of a run grew by.

**The ending mix is the argument, not the completion rate**: arrival 41.9%, gave_up 38.3%,
collapsed 19.8% — the first corpus measurement in this project where neither failure mode is the
majority ending, against a shipped state where `gave_up` alone was 52.2%. Both mechanics sit far
clear of the pillar-1 floor that refused 32/16 at M3.10b. Median legs rose 20 → 25, so the
completion did not come from runs getting shorter.

> **M3.11f/g re-measured those three: 41.0 / 32.8 / 26.1 → 41.9 / 38.3 / 19.8, with no engine
> constant changing.** The PROPERTY this section rests on holds — neither failure mode is the
> majority — but the **collapsed:gave_up ratio it implies moved 0.79 → 0.52 on sampling alone.**
> Do not quote the ratio from this ADR; quote it from `docs/sim-baseline-corpus.md`.

### What this costs, stated rather than buried

- **The fixture control leaves the band: 48.5% → 75.3% → 74.0%, with `failure_collapsed` at 0.1%.**
  M3.11f/g annotation: 75.3% was the welded-sampling figure; the shipped Latin square measures
  **74.0%** (`docs/sim-baseline.md:137` and its body, `PROGRESS` M3.11g). This ADR's status fence
  scopes itself to "every CORPUS number", so it did not reach this fixture bullet and this was the
  one M3.11d figure in the file left unannotated. `failure_collapsed` 0.1% is unchanged.
  Starvation is now vestigial on that pack. It is the empty-registry control the goldens are
  built on rather than a balance target (ADR 0022, ADR 0032) and its header has said since M3.10b
  that an engine change necessarily moves it — but 0.1% is worth naming, because it is the same
  wall seen from the other side. **One per-hour economy cannot serve a 112-hour route and a
  510-hour one.** Softening it enough to give the long route a chance necessarily makes the short
  one trivial. The two baselines now bracket that gap instead of hiding it.
- **SEVEN of 25 corpus routes complete under 0.2%** — every one over 380 travel hours (383
  to 510 h), 10,992 km and up. **This bullet said FIVE, and five was a number nobody measured.**
  Corrected to seven at M3.11 close, and **the seven survived M3.11f's re-measurement on the full
  25 × 5 grid unchanged — the count, the 383-510 h range and the 10,992 km floor are all exact.**
  What changed is the provenance and the flat zero: it is 5,000 runs per route (1,000 in each of
  five policy cells), not 1,000 against one policy, and four are true zeros over 5,000 while three
  land on 3, 2 and 5 completions — written as counts so nobody re-derives a false absolute.
  **They are doomed under all five policies**: of the 35 cells, 30 are exactly 0 of 1,000 and the
  best anywhere is 3 of 1,000, so the doom is a property of the route rather than of play. That
  is 28% of the pair set rather than 20%. **"Under 0.2%" rather than the "at or below 0.1%" this
  bullet used to say**, because the bound has to survive its own interval: the worst of the seven
  (`route.scenic.r29ui5g`, 395 h) reads 0.100% at 125,000 runs, 95% CI [0.082, 0.118], straddling
  0.1, and two further 125,000-run streams put it at 0.123% and 0.112% — pooled, 0.118%
  [0.104, 0.131], ABOVE 0.1. All seven are comfortably under 0.2% on every stream measured; none
  is resolved at 0.1%. **The cliff is bounded, not located** — it lies in
  (285 h, 383 h], where 285 h completes **24.88% at 25,000 runs per cell** (24.5% at 1,000 runs
  per cell; this bullet said 15.0%) and 383 h completes
  0.06% (0.060% at both samples). The 98-hour span between them holds no route, and that is a hole in `CORPUS_PAIRS`, which
  takes one pair per leg bucket, **not a measured dead zone**. The distribution either side is
  bimodal exactly as ADR 0026's addendum warned, and the aggregate being in band is again an
  average over which side of the cliff the pair set samples. **Recorded as unfinished, not fixed.**
- **The reverse error is worth naming, because it is what the correction actually caught.** The
  welded harness reported **nine** routes under 1%, not seven — it also had `illicit.r1nta1ib`
  (260 h) at 0.2% and `cheapest.rtps1ek` (281 h) at 0.6%, because it happened to weld both to
  `greedy-safe`, their single worst policy. Their true rates are **22.3% and 21.1%**. The doc
  reached the right seven by excluding two routes its own harness called dead — a correct set by a
  compensating error. Under the corrected cross the "383-510 h, 10,992 km and up" framing is true
  rather than lucky.
- Long-range payoff **is 24.8% with 46 unresolved threads**. This bullet read 18.0% → 14.0% and
  55 → 63, and blamed runs lasting long enough to schedule consequences and then arriving before
  resolving them. **That explanation is withdrawn**: unwelding the harness moved the line to 24.8% / 46 without
  touching the engine, so the rate was being measured on a biased fifth of the grid. It is also
  the lowest-n line in the report — 113 schedules and 28 fires across 2,000 runs — and wants a
  bigger instrument before anyone tunes against it.
- Goldens moved and should have: three runs get further (9 → 13, 14 → 16, 15 → 16 legs) and two
  convert from failure to arrival. Six are unchanged in outcome.

### Three tests carried leg-length assumptions, not properties

`world-tick.test.ts` failed on this change in three places, each for the same reason and each
already described by a comment one test away:

- `charges starvation twice as fast as hunger` used `span = 40`, which asserted
  `HOURS_PER_HUNGER_DAMAGE <= 40` — above it the hungry rung charges zero and `x === 2 * 0` only
  holds when x is zero too.
- `does NOT grade morale` used `span = 12`, which was `HOURS_PER_MORALE`'s own value.
- `bleeds health faster while starving` looped exactly 6 legs, ~30 hours at the fixture's leg
  length, which stopped spanning a single 44-hour rung.

All three now derive their span from the constant. The first addendum fixed exactly this bug for
`HOURS_PER_HUNGER_DAMAGE` and wrote down the general rule — _a test that forbids a balance
constant from moving without saying so is a test asserting a number, not a property_ — and then
left the other three in place because morale did not move in that commit. `HOURS_PER_MORALE` is
now exported for the same reason `HOURS_PER_HUNGER_DAMAGE` is.

### The real next move, which is not another sweep

There is **no recovery term anywhere in the engine.** `worldTick` is all drain; energy floors by
mid-run and never returns, which makes `ENERGY_TIRED` permanently true and the morale bleed
unconditional; and content recovery was already measured at 0.38 picks per run. So survival is a
**fixed** hour budget, and a fixed budget cannot scale with a journey whose length varies 4.5×
across the route space. Another constant sweep buys the same trade every time.

The two honest options are a recovery mechanic — so the budget grows with the journey — or a
route-length contract the generator enforces, so the game stops offering journeys it has already
decided are unsurvivable. **Both are milestones, not tunings.** Do not sweep these constants a
fourth time expecting a different shape.

### One thing found in passing and not fixed

The graph has a fat detour tail. Route km over great-circle km across 191 sampled long pairs is
p50 1.72 and p90 2.53 — plausible for a road network — but Copenhagen→Brest, which is in
`CORPUS_PAIRS`, is **5.87** (1,414 km great-circle, 8,306 km routed), and the worst sampled pair
is 8.24. Because leg count rises with routed distance, **selecting pairs by leg bucket
preferentially selects the graph's worst-connected regions.** That is a fourth instance of
"the ranking, not the measurement, decides the shape" and it belongs to the geo work, not here.

### The method note, for the third time

The ending mix was correct again and the trajectory table was again survival-conditioned. But
this milestone adds one: **a sweep is only valid for the configuration it was run in.** Every
number in this ADR's first addendum was measured on 23-31 leg routes, and the M3.11 route set made
all of them stale — including the ones this ADR used to reject 32/16. The first addendum learned
that lesson about morale and did not generalise it. Re-derive, do not look up.
