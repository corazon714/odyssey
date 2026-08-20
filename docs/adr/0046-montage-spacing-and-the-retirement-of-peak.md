# 0046 — Montage spacing: a ladder, not a switch — and `peak` is retired

- **Status:** Accepted
- **Date:** 2026-08-20
- **Supersedes in part:** `docs/phase-3-closeout.md` §6 item #1 (the proposed fix) and
  ADR 0042's `peak` column
- **Read first:** ADR 0044 **including its addendum** · ADR 0026 D4 · ADR 0039 · ADR 0042

## Context

`docs/phase-3-dod.md` gate 9 — NO ROUTE BELOW 3% COMPLETION — failed at Phase 3 close on
`route.illicit.r1dlxpt5` (2.32%, −4.5 SE) and `route.illicit.r16kyujq` (2.81%, −1.1 SE).

ADR 0044 established the mechanism causally, at 21 SE with two null controls: **drain is charged
per HOUR and recovery arrives per LEG.** Every drain in `world-tick.ts` is `spanPoints`, and
exactly one event fires per leg while `BASE_EVENT_ODDS` is fenced at `1:0`, so survivability is
the LOCAL hours-per-leg ratio and not the total. `r1dlxpt5` billed **232 of its 509 hours inside
nine consecutive montage legs (8–16)** and lost 67% of its population in that window, against 22%
for `r1gjd3s6`, which spreads the same 509 hours.

`planLegs` selected montage by dullness alone. Position entered only through
`protectedFromMontage` (the two anchors and each crossing's neighbourhood), so nothing stopped it
taking a contiguous block, and on a corridor whose dull segments are contiguous it reliably did.

## Decision 1 — a LADDER of passes over one dullness order, capping montage runs at two

`planLegs` carries the position index through the sort — `montaged` is keyed by `edgeIdx`, the
graph's index for an edge, which says nothing about adjacency ALONG the path — and then selects in
two passes over that one order:

- **`maxAdjacent = 0`** takes only segments with no montaged neighbour.
- **`maxAdjacent = 1`** allows extending a run at one end.

There is no `maxAdjacent = 2` pass, so no selection ever closes the hole between two montaged
segments and **no montage run can exceed two**. Every pass shares the same `montageSatisfied` and
`montageBudget` guards, so the constraint changes WHERE montage lands and never how much of it
there is.

Deterministic and RNG-free: `byDullness` is a total order with no ties, and two passes over one
order preserve that. `legKm` reaches `RouteState` → `stateDigest` → every golden run, so this
matters.

### Why the closeout's two-pass proposal was insufficient, measured rather than argued

`docs/phase-3-closeout.md` proposed exactly two passes — refuse a neighbour, then relax — and
**that was implemented first and measured, and it does not work.** On `r1dlxpt5` the deficit
demands 10–11 montaged segments from an 18-edge path whose anchors and crossing neighbourhoods are
already protected; no arrangement of 11 among the remaining candidates is spaced, so the relaxed
pass ran on almost every selection and rebuilt the wall:

| version                           | montage legs on `r1dlxpt5`      | longest run |
| --------------------------------- | ------------------------------- | ----------: |
| before any fix                    | `8–16, 37`                      |       **9** |
| closeout's two-pass (spaced/free) | `9–17, 30, 36`                  |       **9** |
| three-pass ladder (0/1/2)         | `9–17, 30, 36`                  |       **9** |
| **shipped — ladder 0/1, no fill** | **`5, 13, 17, 22, 26, 35, 40`** |       **1** |

A trace of the selection made the failure legible: pass 0 correctly took positions 1, 3, 5, 7, 9,
14, 16 — perfectly spaced — and the final pass then filled 2, 4, 6, 8 and closed every hole. The
lesson generalises: **a relaxation ladder whose last rung is unconditional is not a constraint.**
Refusing the last rung is what makes this one.

### What refusing the last rung costs: nothing in leg count

Every route on the current slice is in the EXPANSION regime (`target > segments.length`), where
`legCount` is exactly `target` whatever montage does — montage decides who gets the surplus, not
how many legs there are (ADR 0039). So leaving the deficit partly unabsorbed moves the surplus and
nothing else. `route.illicit.r1dlxpt5` is 48 legs before and after. This is why the constraint does
not have to trade against ADR 0026 D4's cap, and the test asserts it as an A/B: the same segments
marked as crossings produce a different montage set and an identical leg count.

## Decision 2 — the acceptance criterion, all three parts, measured

`pnpm sim -- --pack=corpus --runs=280000 --by-route`, which is 28 routes × 5 policies × 2000 per
cell exactly. The pre-fix column was produced by stashing **only** `leg-plan.ts`, so both readings
come from the same instrument. It reproduces the closeout's recorded figures exactly (2.32% at
−4.5 SE, 2.81% at −1.1 SE), which is what licenses comparing the other two columns.

### Part 1 — completion. **GATE 9 PASSES. Routes below 3.00%: 0.**

| route                    | completion before |    completion after | vs floor         |
| ------------------------ | ----------------: | ------------------: | ---------------- |
| `route.illicit.r1dlxpt5` |   2.32% (−4.5 SE) |  **6.95%** (0.25pp) | **+15.5 SE**     |
| `route.illicit.r16kyujq` |   2.81% (−1.1 SE) | **12.26%** (0.33pp) | **+28.2 SE**     |
| `route.illicit.rskpfno`  | 10.80% (+25.1 SE) |     14.68% (0.35pp) | +33.0 SE         |
| `route.illicit.r1gjd3s6` | 16.51% (+36.4 SE) | **11.32%** (0.32pp) | +26.3 SE — WORSE |

### Part 2 — the morale-floor share. **It barely moves, and that is a finding.**

| route      | morale@0 before | after      |
| ---------- | --------------: | ---------- |
| `r1dlxpt5` |          76.70% | **76.60%** |
| `r16kyujq` |          71.53% | 70.37%     |
| `rskpfno`  |          72.83% | 69.75%     |
| `r1gjd3s6` |          60.39% | **68.50%** |

`r1dlxpt5`'s completion tripled while its morale-floor share did not move at all. **So morale is
not what this fix relieved**, and the closeout's expectation that it would is not borne out. Part 3
says what was relieved instead.

A second observation, and it qualifies the column: `morale@0` tracks `ending.failure_gave_up`
almost exactly on every one of the 28 routes (76.60% / 76.00% on `r1dlxpt5`; 9.54% / 9.54% on
`route.safest.r2ga6nn`). The morale floor and the give-up ending are very nearly the same event, so
this column is close to a restatement of one histogram row rather than an independent signal. It is
kept because it is the meter ADR 0044 identified as binding and because reading it costs nothing,
but it should not be treated as a second opinion.

### Part 3 — the ending histogram. **The fix converts COLLAPSE into ARRIVAL.**

| `r1dlxpt5`                 | before |  after | Δ         |
| -------------------------- | -----: | -----: | --------- |
| `ending.failure_gave_up`   | 75.98% | 76.00% | **+0.02** |
| `ending.failure_collapsed` | 21.70% | 17.05% | **−4.65** |
| `ending.arrival_quiet`     |  2.10% |  6.15% | **+4.05** |
| `ending.arrival_hollow`    |  0.20% |  0.79% | +0.59     |

| `r16kyujq`                 | before |  after | Δ         |
| -------------------------- | -----: | -----: | --------- |
| `ending.failure_gave_up`   | 70.54% | 69.98% | −0.56     |
| `ending.failure_collapsed` | 26.65% | 17.76% | **−8.89** |
| `ending.arrival_quiet`     |  2.47% | 11.26% | **+8.79** |

**Give-up is untouched to two decimal places; collapse falls and arrival rises by the same
amount.** That is a coherent mechanism rather than a summary statistic: the wall was killing runs
by concentrated exhaustion, and breaking it lets exactly those runs finish. Morale attrition is a
separate, global pressure that this constraint does not address and was never going to.

Design pillar 1 says a bad outcome should be interesting rather than punishing, and this is the
direction that pillar wants: fewer runs ended by a stretch the player could do nothing about.

## Decision 3 — `peak` is RETIRED from `--by-route`

ADR 0044's addendum retired `peak` as a **dial**. It survived as a **flag**, with a note on its own
constant saying this constraint would invalidate it: _"contiguous blocks stop existing by
construction and a fixed-width window is the wrong shape for what remains. Re-derive it or retire
the column; do not keep it because it is already here."_ Re-measured on the corpus this constraint
produces:

- **It fails its own charter.** The column existed because "total hours is blind WITHIN a set whose
  totals are alike, and `peak` is the only printed column that separates them". On that exact set
  it now orders them WRONGLY: `r1gjd3s6` has the LOWEST peak of the four (118) and only the
  third-best completion (11.32%), while `rskpfno` at peak 134 completes best at 14.68%.
- **It is dominated globally by a column already printed.** Over 28 routes,
  `rho(hours, completion) = −0.956` against the best window's **−0.940** (K = 13); K = 9 gives
  −0.931, K = 5 −0.875, K = 17 −0.914, K = 21 −0.928. Re-pinning K buys 0.009 on n = 28 — noise,
  and the same insensitivity ADR 0042 recorded.
- **Its constant measured a structure that no longer exists.** 9 was the length of `r1dlxpt5`'s
  contiguous block. Runs are capped at two by construction now, so a nine-leg window is no longer
  the width of anything.

`PEAK_WINDOW_LEGS`, `peakWindowHours` and `RouteStat.peakHours` are deleted; the retirement
argument lives in `by-route.ts`'s header so nobody re-adds the column without reading it. If item
#2 (path granularity) needs a concentration statistic, derive one against the route set IT
produces.

## Decision 4 — `--by-route` gains `morale@0` and per-route ending histograms

Landed in a separate step, **before** the constraint, and both sim baselines printed `No change` at
that point — the evidence the instrument was behaviour-neutral. They go on `--by-route` and never
into `format-report.ts`: `diff-report.ts` compares by LINE INDEX, so a column in the standard
report would force both baselines to regenerate for a formatting change (ADR 0032, ADR 0042). A
test asserts the standard report contains neither string.

## Consequences

### The fixture baseline and the goldens did NOT move, and the closeout said they would

`docs/phase-3-closeout.md` §6 says _"Expect every golden to move: `legKm` feeds `stateDigest`."_
**That is wrong and has been corrected there.** `planLegs` is reached only through
`route/materialise-route.ts`; `packages/tools/sim/load-pack.ts` reads fixture routes from
`engine/src/__tests__/__fixtures__/routes.json` as literal `RouteState`, and
`regenerate-goldens.ts` builds every golden from those same scenarios. So `pnpm sim:diff
-- --runs=2000` printing `No change` and all 1,324 engine tests passing is **the evidence this is a
route-generation change and nothing else** — exactly what gate 2 exists to say. `pnpm
golden:update` was NOT run, and running it here would have converted a real finding into a silent
pass.

### One route got worse and the mechanism is NOT established

`route.illicit.r1gjd3s6` — the healthy comparable every ADR 0044 experiment was measured against —
fell **16.51% → 11.32%**, with `failure_gave_up` up 59.77% → 68.00% and `arrival_quiet` down
15.85% → 10.62%. Its montage was already partly spread (`2–3, 26, 36–45`); the constraint took it
from 13 montaged segments to 9, so four long dull segments are no longer crushed to one clamped leg
and are travelled at full cost instead.

That is a hypothesis, not a measurement, and it is recorded as unresolved. What can be said:

- The corpus **compressed**. The four Beira-Aktobe illicit routes now span **6.95–14.68%** where
  they spanned 2.32–16.51%.
- Pooled completion **rose**, 46.1% → 46.7%, still inside the 30–50% band. Nothing was lost in
  aggregate.
- `r1gjd3s6`'s `peak` fell 177 → 118, a 33% reduction, while its completion fell. **Further
  evidence for Decision 3**, arriving from a direction nobody arranged.

### Scope, stated as the closeout asked it to be

**This is a GATE FIX, not a route fix.** `r1dlxpt5` at 6.95% is clear of the floor by 15.5 SE and
is still the worst route in the corpus, at roughly half the healthiest illicit comparable. The
other half of the gap is path granularity — 18 path edges for 16,983 km — and is carry-forward
item #2, whose same root cause is ADR 0043's generator collapse.

**And it is still n = 1.** The two routes that failed gate 9 share 16 of 18 edges and 18 of 19
nodes (88.9% overlap): one corridor sampled twice. Fixing the generator is what takes this
validation off a single corridor, and until it lands the generality of this constraint is asserted
by its shape rather than demonstrated by its sample.

### Not a `peak` threshold

No acceptance test anywhere is written as a `peak` threshold, and after Decision 3 none can be.
