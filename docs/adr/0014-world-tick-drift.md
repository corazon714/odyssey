# 0014 — The world-tick drift curve

- **Status:** Accepted. **Conformance restored at C1, 2026-08-14** — the "±1 hour jitter" this
  document describes below was never what shipped, and now is. See the C1 addendum at the end.
- **Date:** 2026-08-08
- **Supersedes:** the placeholder constants shipped with M6
- **Closes:** `docs/PROGRESS.md` open question 1, ADR 0012 §3

## Context

ADR 0012 §3 recorded that `worldTick`'s drift constants were "structurally wrong, not merely
untuned: at 20,000 runs health's p10/p50/p90 collapse to `0/1/1` together, so the dominant
failure mode is unaffected by player choice."

That diagnosis was right and the mechanism is visible in the code without running anything.
The old tick charged, every leg and unconditionally, `hunger +1` and `energy −1`; then a flat
`health −1` once `hunger >= 8` and a flat `morale −1` once `energy <= 1`. Four consequences
followed, and only the last is a tuning problem:

1. **Cost was per leg, not per hour.** A nine-hour walk and a four-hour train ride cost the
   same point of hunger. The clock and the body disagreed.
2. **Cost was independent of state.** Transport mode, weather and leg length changed nothing.
3. **Penalties were cliffs.** Being starving cost exactly what being peckish cost.
4. **Therefore there was no variance at all.** The only stochastic input to the whole curve was
   the ±1 hour jitter on travel time, and nothing downstream read it.

Measured before the change, over 1,500 runs across the three fixture routes:

```
leg at which health first drops   n=1500  p10=8 p50=8 p90=8  distinct=1
   8:1500
```

Every single run lost its first point of health on leg 8. Not clustered — identical. A
"difficulty curve" that resolves to a constant is not a curve, and no amount of retuning the
constants would have changed that, which is what "structural" meant.

## Decision

**Drive every drain from the clock span the leg covers, not from the leg.** All four rules
below follow from that one change.

### 1. Spans, not legs — with the remainder carried

```ts
spanPoints(before, hours, per) = floor((before + hours) / per) - floor(before / per);
```

Charging `floor(hours / per)` per leg would discard the remainder every leg and quietly halve
the intended rate. Charging against the span makes consecutive ticks contiguous, so the
remainder carries and the summed cost over a run is exactly `floor(total / per)` — asserted as
a property test over six rates and a twelve-leg sequence.

It also needs **no new state**, which is what makes this a non-breaking change: `clock.day` and
`clock.hour` are already the accumulator. `RunState` is untouched, `SAVE_VERSION` stays at 1,
and no migration is required.

The quantisation is where the variance comes from. The same four-hour hop costs 0 or 1 point
depending on the phase it lands in, so two runs on the same route diverge and stay diverged.

**Hours spent inside an event are not charged here.** The drift covers travel; content pays for
its own time explicitly. That keeps the tick a pure function of `(state, hours)` with no hidden
accumulator, at the cost of a detention being cheaper than the equivalent hours on the road.
Accepted deliberately — the alternative is a `lastTickAt` field in `RunState` and a save break,
to model something content can already express.

### 2. Effort, not legs, drains energy

`HOURS_PER_ENERGY` per transport mode: foot 5, car/truck 9, bus/rideshare 10, ferry 11,
train 14. A passenger dozes; a driver does not; a walker least of all. This is the main reason
transport mode is a decision rather than a travel-time number. Harsh weather costs one extra
point, **but only on a leg of six hours or more** — an hour in the rain is nothing, and without
the length gate the penalty applies to three legs in four once weather starts rolling.

### 3. Grade a penalty on an unbounded meter; never on a floored one

This is the finding that cost the most to learn and is the one worth keeping.

**Hunger is graded** — `HUNGER_HURTS = 8`, `HUNGER_STARVING = 10`, charged at one point of
health per 10 and per 5 hours respectively. Hunger has no ceiling, so the rungs are reached at
genuinely different times and grading spreads the population.

**Morale is deliberately not graded.** Energy _floors_ at 0 and most runs sit there, so a
second harsher rung is a penalty the whole population takes on the same leg. It synchronises
the collapse instead of spreading it. Measured: adding a `−2 at energy 0` rung drove leg-15
morale from `0/2/6` to `0/0/0` and pushed `gave_up` from 25% to 60%. The rung was removed.

### 4. Starvation damage is per hour too

The last per-leg holdout, and keeping it per-leg was measurably wrong: with everything else
time-driven, a population past the hunger threshold still lost health in lockstep because a
short hop hurt exactly as much as a long haul. Moving it to the span widened the late game and
restored the long-range payoff rate to 100%.

## Results

Structural claim, measured the same way as the "before" above:

```
leg at which health first drops   n=1202  p10=6 p50=8 p90=9  distinct=9
   5:65 6:215 7:213 8:326 9:280 10:76 11:22 12:4 14:1
```

From one distinct leg to nine. That is the decision's acceptance criterion and it is met.

Sim delta at 2,000 runs (`docs/sim-baseline.md` regenerated in the same commit):

|                             | Before    | After     |
| --------------------------- | --------- | --------- |
| Completion rate             | 30.1%     | **31.2%** |
| Median legs / days          | 11 / 5    | 10 / 5    |
| Long-range payoff           | 100.0%    | 100.0%    |
| Beat fill rate              | 47.9%     | **51.8%** |
| Repeat-event rate           | 62.4%     | **58.4%** |
| Unresolved threads          | 0         | 0         |
| `failure_gave_up`           | **39.1%** | 33.2%     |
| `failure_collapsed`         | 30.8%     | 35.6%     |
| health p10/p50/p90 @ leg 15 | 0/0/1     | 0/0/2     |
| energy p10/p50/p90 @ leg 15 | 0/2/6     | 0/0/7     |

Completion moved 1.1 points and stays inside engine-spec §6's 30–50% band, so **this is not a
difficulty change** — it is the same difficulty with the variance restored. The two failure
modes are now near-balanced (35.6 / 33.2) where `gave_up` previously dominated at 39.1, which
is the concrete form of "the dominant failure mode is no longer independent of player choice."

## What this does NOT fix

**The fixture pack contains no food.** Across nine events, nothing reduces hunger and exactly
one effect grants energy (`+2`). Hunger is therefore monotone and health decline is
irreversible, so every run that lives long enough still converges to health 0 — only the leg it
starts on now varies. A genuinely wide p10/p90 _at a fixed late leg_ is unreachable until
content offers recovery, and that is a Phase 2B seed-corpus matter, not a drift one.

The numbers above are fitted to a nine-event fixture and should be re-checked, not trusted,
when the seed corpus lands.

## Consequences

- Every golden run changed. Regenerated with the new `pnpm golden:update`.
- **`pnpm golden:update` now exists.** Both `golden-runs.json`'s header and
  `golden-run.test.ts` instructed the reader to regenerate with `ODYSSEY_UPDATE_GOLDEN=1`, and
  nothing anywhere implemented it. A documented escape hatch that does not exist is worse than
  none: the first person to legitimately change engine behaviour reaches for it, finds nothing,
  and hand-edits a file whose header says "never hand-written". The generator lives in
  `packages/tools/sim/regenerate-goldens.ts` because the engine may not touch `process` or
  write files (rule 2.2), and it derives its expectations from `replayRun` rather than from the
  simulator, so the two cannot drift apart and still look green.
- **`worldTick` has unit tests for the first time.** It had none, which is how a curve that
  resolves to a constant survived to a sim report. They pin the _shape_ — the no-drift
  accumulator property, mode-dependence, the graded/ungraded asymmetry — not the constants,
  which are balance and are expected to move.
- `RunState`, `SAVE_VERSION` and the RNG stream set are all unchanged. No migration.

---

## Addendum — M3.8b (2026-08-12): rule 3 is now true about hygiene too

This ADR's third rule is "penalties are GRADED, not cliffs". **Hygiene was the one meter it was
false about.** `world-tick.ts` read `hours >= 6 ? -1 : 0` — one point, once, for any leg over six
hours — and under a flat `HOURS_PER_LEG` that fired for truck and for nobody else, so hygiene was
very nearly static. M3.8a made hours a function of distance, which made the cliff worse rather than
better: a leg's hygiene cost became a step function of a continuous quantity, so 5.9 hours cost
nothing and 6.0 cost a point.

It now accrues via `spanPoints` against the clock span, exactly like hunger and energy, so the
remainder carries and two short legs cost what one long one does.

**Grading a DRAIN is not what `ENERGY_TIRED` warns against.** That rule concerns a THRESHOLD
penalty keyed on a floored meter: energy sits at 0 for most of a run, so a second rung there lands
on the whole population at once. Hygiene is the meter being drained, not the trigger. Morale stays
ungraded for the original reason and got no exception here.

### The finding: grading moved WHEN hygiene floors, not WHETHER

A prediction was written before the run — completion down 3–7pp, `Modifier chips / check` up from
6.7 to ~7.0–7.3. **It was wrong.** Completion moved 44.1% → 44.0% and chips/check did not move at
all.

The reason is only visible in a line the report did not have, which is why `hygiene` was added to
the resource trajectory table in the same commit:

| corpus hygiene p10/p50/p90 | leg 5 | leg 15 |
| -------------------------- | ----- | ------ |
| old (6-hour cliff)         | 3/5/6 | 0/0/3  |
| graded                     | 1/2/4 | 0/0/0  |

Hygiene was **already floored by mid-run under the cliff** — p90 of 3 at leg 15 means `dishevelled`
(hygiene ≤ 3, −2, five check tags) was already firing for 90%+ of runs. Grading brings that forward
from roughly leg 12 to roughly leg 6. The behavioural window is legs ~3–12 only, and it intersects
5 of 18 check tags, so the aggregate barely moves.

**`presentable` (+1 at hygiene ≥ 8) was already near-dead** and is now dead: hygiene starts at 8, so
one point of drain ends it. That is worth knowing before anyone tunes it — the row is reachable for
about one leg.

The one number that looks like a real move is not: `Long-range payoff rate` 73.9% → 78.3% is
**17/23 → 18/23**, a single thread out of twenty-three, which `Unresolved threads 6 → 5` confirms.
A four-point swing on a two-dozen denominator is one event, and reading it as a behavioural result
would be exactly the mistake ADR 0032 was written about.

### Consequence for whoever tunes hygiene next

The lever is not the drain rate. Both models floor the meter; the drain rate only sets how fast.
What decides whether hygiene matters is the RESTORE economy — `rest.the_shared_room` is the only
event that gives any back (+1 and +2) — and the `dishevelled` threshold, which at ≤3 on a meter
that reaches 0 by mid-run is effectively "always, eventually".

---

## Addendum — C1, 2026-08-14: the ±1 jitter was a ±1/+2 jitter for six milestones

Context §4 above calls the travel-time jitter "the ±1 hour jitter on travel time". The code
implemented it as `rng.nextInt(-1, 2, 'worldTick')`. **`Rng.nextInt` is inclusive at BOTH ends**
(`rng.ts:50`, and its own signature names the arguments `minInclusive` / `maxInclusive`), so the
realised draw was over `{-1, 0, 1, 2}` — four values, not three, with a mean of **+0.5 hours per
leg** rather than 0.

It was an off-by-one from an exclusive-max assumption, and it was invisible for the usual reason:
nothing downstream ever compared the distribution against the intent, and a jitter is the one
quantity nobody double-checks because being random is the whole point.

**Every route in the game was ~5% longer than designed** — `legCount / 2` hours, so 11 on the
22-leg corpus route and 24 on each of the 48-leg ones. That is a systematic bias in the only
quantity this ADR's entire drain economy is denominated in.

`LEG_JITTER_MIN` / `LEG_JITTER_MAX` are now `-1` / `1`. The fix is one constant; the verification
is not, and is worth naming because the obvious test would have missed the original bug:

- **`LEG_JITTER_MIN + LEG_JITTER_MAX === 0` is very nearly a tautology.** It restates the two
  constants in terms of each other, and the bug was never in the arithmetic — it was in a belief
  about `nextInt`'s contract. A test carrying the same belief agrees with it.
- So `world-tick.test.ts` asserts the **realised draw set**, measured through `worldTick` itself
  across three seeds × 400 cursors, against a hardcoded `[-1, 0, 1]`, plus a coverage case
  proving all three values are reached. Verified failing at the old bound:
  `expected [ -1, +0, 1, 2 ] to deeply equal [ -1, +0, 1 ]`.
- Sampled independently of the test, over 100,000 drained draws and 20,000 distinct cursors on
  every one of the eight substreams: support exactly `{-1, 0, 1}`, uniform to 33.1–33.8%, mean
  −0.005.

### What moved

Both sim baselines, and the golden runs. Fixture completion 74.0% → 77.0%, corpus 43.1% → 45.6%
(still inside the 30–50% band). The systematic part is `-legCount / 2` travel hours per route,
a lighter drain; **everything else in those diffs is re-randomisation**, because correcting the
draw moves every drawn value and every run therefore walks a different path through the same
streams.

Two of the nine goldens moved, in OPPOSITE directions, and one of them got SHORTER on a lighter
drain — which looks like a defect and is not. `fixture.scenic:random` fires identical events with
identical outcomes on legs 0–10 under both bounds; only the wall-clock PHASE at which each span
is charged differs. `spanPoints` counts `HOURS_PER_MORALE` boundaries inside a travel-length span
laid on the WALL clock, and event hours advance that clock without any span being charged against
them, so the spans do not tile it and the per-leg point count is a phase lottery. Holding the OLD
bounds and sweeping `startHour` over all 24 values, that run alone finishes anywhere from 11 to 16
legs and `fixture.illicit:random` from 12 to 24; both C1 values sit inside the old bounds' own
range, and the seven phase-stable runs did not move at all.

**No drain constant was re-derived here.** `HOURS_PER_HUNGER_DAMAGE`, `HOURS_PER_MORALE` and
`FULL_UNTIL` are hour-denominated against a route set that keeps moving; re-deriving them against
a moving target is how this file came to record three successive re-tunings of the same constant.
