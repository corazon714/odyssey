# 0012 — What Phase 1 does not prove

- **Status:** Accepted
- **Date:** 2026-08-08

## Context

Phase 1 ships 816 engine tests, 88.5% statement coverage, byte-identical replay across 4,841
bytes of canonical state, and a 20,000-run simulation in 4.6 seconds against a 30-second
budget. Those numbers invite a conclusion the evidence does not support.

This ADR exists so the next person — or the next session — reads the limits alongside the
results. A verification pass that only records what passed is a worse artefact than one that
records what was never asked.

---

## Decision 1 — Four engine mechanisms are UNTESTED IN THE LOOP, and are recorded as such

Unit tests cover them in isolation. **No simulated run has ever executed them**, because the
nine-event fixture cannot reach the states they require:

| Mechanism                                   | Why unreachable                                        |
| ------------------------------------------- | ------------------------------------------------------ |
| Skill-check modifier gating                 | `check.modifier.wanted` — no effect ever sets `wanted` |
| Outcome `requires` + `unlockEnding`         | `out.flagged_in_system` gates on `wanted`              |
| The `passport` predicate (all three fields) | No fixture scenario grants a passport                  |
| **`hiddenUnless`**                          | `turn_back` needs `heat >= 6`; observed runs peak at 3 |

`hiddenUnless` is the sharpest case: **one instance in the entire pack, and it is dead**, so
engine-spec §2's "reward for state" mechanism has never run inside the loop.

A fifth, found during the verification trace: **`passport_lost` is neither written nor read by
any event.** A scenario can set it and nothing in the game responds.

**Accepted at the human's direction, carried to Phase 2.** Closing it is content work — grant a
passport on one route, add an effect that sets `wanted`, let heat reach 6. **When the seed
corpus lands, verify these paths appear in the sim before treating coverage as complete.**

---

## Decision 2 — `worldTick`'s constants are structurally wrong, not merely untuned

At 20,000 runs the health trajectory reads:

```
health   leg5: 10/10/10    leg15: 0/1/1
```

Every percentile collapses together. That is not difficulty — it is `hunger +1` applied
unconditionally with `health -1` at `hunger >= 8`, so from roughly leg 8 every run loses health
every leg **regardless of any choice the player makes**. The dominant failure mode is
independent of play.

The economy has the mirror problem: money's p10 never drops below 180 from a start of 320–540,
because the only real expense is a bribe picked 0.3% of the time.

**Not fixed in Phase 1**, because tuning nine fixture events would be fitting to the fixture.
**The trap for Phase 2:** real content will apply resource effects on top of a decay curve
already steep enough to kill 60% of runs alone, and the obvious fix — weakening the drift —
silently changes which system controls pacing. Nothing currently detects that; `sim:diff` shows
a number moved, not why.

---

## Decision 3 — Determinism is proven on V8 only

Golden-run replay is exact: same seed twice produces byte-identical canonical JSON, verified
character by character. CI runs it on Linux and Windows.

**The game ships on Hermes, and nothing has ever run there.** Every cross-engine defence is
preventive rather than demonstrated — the ban on transcendental math and `localeCompare`, the
integer `weightedPick`, `Math.imul` over BigInt, canonical pack ordering. They are the right
defences and they are untested against the engine they were chosen for.

A Hermes golden-run job is Phase 2's first determinism task, not an optimisation.

---

## Decision 4 — The repetition system is unvalidated at scale

Novelty, recency and tag-saturation each work in isolation, with tests. The aggregate
repeat-event rate moved from 62.4% (M7, uniform-ish) to 63.8% (M10, fully scored) — **barely at
all**.

The scoring factors are being swamped by the eligibility distribution: two universal fillers
are eligible on nearly every leg while the other seven events are gated, and no multiplier
bounded at 0.4 can outweigh that. A nine-event pack cannot distinguish "the factors work" from
"the factors are irrelevant here."

**This is the single measurement Phase 2 should take first** once the seed corpus exists,
because it is the one Phase 1 result that is actively uninformative rather than merely
incomplete.

---

## Consequences

- `docs/engine-spec.md` gains a **Part II — AS BUILT**, written from the exported code rather
  than from the plan, listing every divergence from Part I with the ADR that authorised it.
- The `sim-smoke` CI job has still never run on a real runner — the only Phase 1 addition
  without a green build behind it.
- Coverage is 88.5% of statements. The weakest module is `select-event.ts` at 64.3%, because
  the fixture never drives the director past relaxation rung 1.
