# 0014 — The world-tick drift curve

- **Status:** Accepted
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
