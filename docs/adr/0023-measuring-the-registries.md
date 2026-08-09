# 0023 — Measuring the registries: the row count is not the metric

- **Status:** Accepted
- **Date:** 2026-08-09
- **Relates to:** ADR 0015 (modifier registry), ADR 0022 (universal choices)

## Context

08-DIVERSITY-SYSTEMS D1 gives two numbers: **"140–180 modifiers"** and **"a typical check should
pull 3–7"**. They are not independent. The first is a proxy for the second, and Phase 2B shipped
**137** — under the stated floor — which forced the question of which one is actually the
requirement.

The universal-choice registry raised the mirror-image question: a **36% pick rate** against a
stated "over ~30% means they are too strong". Both numbers looked like failures. Neither was,
and working out why produced the rules below.

## Decision 1 — chips-per-check is the D1 metric; the row count is a proxy for it

The sim now reports `Modifier chips / check` and `Checks under 2 chips` (`run-one.ts` counts
`resolution.modifiers.length` per resolved check).

Measured over 27,395 checks on the corpus pack: **6.7 mean, 0 checks under two.** That is the
top of the 3–7 band. Adding 25 rows to reach the approved 162 would push more checks _above_ the
range the row count existed to produce.

**So a shortfall against the row count is only a finding if chips-per-check is also low.** It is
not. Recorded rather than padded.

Where the missing 25 went is itself the constraint worth knowing: `item`, `trait`, `companion`
and `region` are the kinds that need **declarations**, and declarations are bounded from both
sides — a flag a modifier reads must be WRITTEN by an event (`FLAG_READ_NEVER_WRITTEN` is an
error), and an item needs a liability event that reads it. Thirteen events can only back so many.
**The registry cannot outgrow the corpus, by construction.**

> **Read the fixture pack's numbers correctly.** `--pack=fixture` reports 0.2 chips/check and
> 7325 checks under two. That is not a regression — the fixture pack ships EMPTY registries on
> purpose, and those two lines are the clearest statement of what "empty registries" means.
> Only the corpus pack's chips/check is a balance signal.

## Decision 2 — report universal-choice OFFER rate and PICK rate, both

Either alone misleads in a different direction:

- **Pick rate alone** cannot distinguish "too strong" from "offered constantly".
- **Offer rate alone** cannot distinguish "useful option" from "clutter nobody takes".

The pair does. And the decisive cut is **per policy**, because the policies differ in whether
they evaluate outcomes at all:

| policy        | offered | picked | pick ÷ offer |
| ------------- | ------- | ------ | ------------ |
| `random`      | 38.2%   | 37.7%  | **0.99**     |
| `greedy-safe` | 37.4%   | 21.1%  | **0.56**     |
| `risk-taker`  | 38.7%   | 0.6%   | **0.02**     |

**Both optimising policies reject them.** Only `random` — which by construction evaluates
nothing — takes them at their offer share. The aggregate 36% is that uniform picker averaged in.

So ADR 0022's hard rule ("a universal choice must never be strictly the best option") is
**empirically satisfied, and this is the evidence**: two independent optimisers avoid them.

## Decision 3 — the fix for a high pick rate is not a nerf, and was not applied

What is actually true is that they are **too many, not too strong**: 38.5% of choices shown are
universal, which is a lot of screen space for options good play declines.

The lever was measured, not guessed. `MAX_UNIVERSAL_PER_EVENT` 3 → 2:

```
offered 38.5% -> 30.2%    picked 36.0% -> 31.8%    completion 43.7% -> 44.5%
```

**Not applied.** It buys 4pp on a metric distorted by the random policy and costs a third of the
injection diversity the registry exists to provide. Reverted; recorded here so it is not
re-derived from scratch.

**The finding underneath is the opposite of the feared one.** `risk-taker` taking a universal
choice 0.6% of the time means these rows are close to dead for aggressive play. If this is
revisited, the question is "which rows should tempt a risk-taker", not "which should be nerfed".

## Decision 4 — an instrument needs an instrument

`content-stats` reported the `search` check tag as used by **one** choice. Three carry it. It
read `choice.skillCheck?.tags`, so both actual searches were invisible — the same blind spot
fixed in `content-lint` when `Choice.search` landed, never propagated.

**The tool whose job is finding content holes had a hole in it, and it had been reporting a
wrong number since M0.** The helper now lives in `packages/tools/shared/rolled-checks.ts` and
both tools use it.

The general form: a metric that has never been checked against a hand count is a metric nobody
has verified. Every number in this ADR was cross-checked at least twice — per-policy, or by
recomputing it outside the sim.

## Decision 5 — `--json` emits the trace, not the report

Aggregates cannot answer ordering questions. `pnpm sim -- --runs=N --seed=x --json` emits per-run
`firedEvents` and `choicesPicked` in order, and nothing else that would bury them.

It is what proved the memory chain, and the proof needed the **negative** control rather than an
example: over 3000 runs, 246 gate fires, 68 payoffs, **zero payoffs without the gate and zero out
of order**. A single passing trace would have shown only that the two events can co-occur.

## Consequences

- Five new report lines. Both baselines were regenerated for the format change; every
  pre-existing line was unmoved, which is the property that made the regeneration safe.
- `SimRun` gained eight counters. They are per-run, so the summary can aggregate any subset —
  which is what made the per-policy decomposition a one-line filter rather than a new harness.
- **The row-count target in the brief should be read as advisory.** If a future phase wants a
  number to hit, chips-per-check is the one with a mechanism behind it.
