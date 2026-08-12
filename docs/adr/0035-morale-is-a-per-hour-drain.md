# 0035 — Morale is a per-hour drain, and the failure mode is conserved

- **Status:** Accepted, implemented 2026-08-12 (M3.10b). **The band is NOT met — see Consequences.**
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
