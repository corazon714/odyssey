# Phase 3 — CLOSEOUT

> **READ THIS FIRST.**
>
> # PHASE 3 CLOSED WITH GATE 9 RED. **GATE 9 IS NOW GREEN — item #1 landed on 2026-08-20.**
>
> This document is the record of the phase as it CLOSED, and everything below describes the tree at
> `5c79b64`, where gate 9 failed on `route.illicit.r1dlxpt5` (2.32%, −4.5 SE) and
> `route.illicit.r16kyujq` (2.81%, −1.1 SE). Closing was a scheduling decision, not a pass.
>
> **Carry-forward item #1 — the montage spacing constraint — has since landed. `docs/adr/0046` is
> the authority on it, and it supersedes §6's ITEM #1 below.** Gate 9 passes: no route is under the
> floor, and the two that were read 6.95% (+15.5 SE) and 12.26% (+28.2 SE). **Item #2 has NOT
> landed**, so §6's argument about n = 1 and about path granularity stands unchanged.
>
> Three things in this document were found to be WRONG when the fix was built, and each is
> corrected in place below rather than quietly edited away: the golden-run expectation in §6's
> "Order when it lands", the sufficiency of the two-pass constraint in §6 ITEM #1, and the
> expectation that the morale-floor share would move.

**Measured on:** 2026-08-20, `dev` at `5c79b64`, tree clean.
**Authorities:** `docs/phase-3-dod.md` (what closing requires) · `docs/PROGRESS.md` (current
state) · `docs/adr/0044` **including its addendum** (why gate 9 fails) ·
`docs/phase-3-verification.md` (the adversarial pass and its four findings).

---

## 1. STATUS — all nine gates, run on this tree

| #   | gate                                      | command                                                     | result                          |
| --- | ----------------------------------------- | ----------------------------------------------------------- | ------------------------------- |
| 1   | Static checks                             | `typecheck && lint && test && content:lint && format:check` | **PASS**                        |
| 2   | Fixture baseline (the control)            | `pnpm sim:diff -- --runs=2000`                              | **PASS**                        |
| 3   | Corpus baseline (the real content)        | `pnpm sim:diff -- --pack=corpus --runs=2000`                | **PASS**                        |
| 4   | Goldens                                   | `pnpm test:engine`                                          | **PASS**                        |
| 5   | Geo artifacts regenerate byte-identically | `pnpm geo:build -- --check`                                 | **PASS**                        |
| 6   | `geo:verify` matches the handoff          | `pnpm geo:verify`                                           | **PASS**                        |
| 7   | Route diversity                           | `pnpm geo:diversity`                                        | **PASS**                        |
| 8   | Engine purity under bare Node             | `node packages/engine/src/index.ts`                         | **PASS**                        |
| 9   | **NO ROUTE BELOW 3% COMPLETION**          | `pnpm sim -- --pack=corpus --runs=280000 --by-route`        | **FAIL** (green since ADR 0046) |

Detail on the ones whose "pass" is not self-explanatory:

- **Gate 1** — `content:lint` exits 0 with **one warning**, `MISSING_IMAGE_MANIFEST`
  (17 events reference an image; `imagegen/` is empty and no images exist). Pre-existing and
  expected until the image pipeline ships. `pnpm test` is 86 files / 1,855 vitest + 3 jest.
- **Gate 4** — 56 files / 1,324 tests. **`pnpm golden:update` was not run to make it so.**
- **Gate 5** — `--check: byte-identical.`, 7 epsilon resolutions.
- **Gate 6 passes by MATCHING the handoff, not by being green.** Three sub-results are red and
  all three are owned by `docs/phase-3-verification.md` §8:
  - route diversity **FAIL — 1 of 12 pairs**, Chongjin–Jeju City 80% against a structural floor
    of 71%, resolving at rung 2. Structural: a degree-1 endpoint, unreachable for any filter.
    Valencia–Palermo, the one genuine filter defect, **closed at C2** — 63% on three routes.
  - `selectPaths` benchmark **FAIL at p90 and max**, PASS at mean and p50. At the 6× phone
    estimate: mean 79.5 ms PASS, p50 5.7 ms PASS, p90 263.6 ms FAIL, max 758.0 ms FAIL, against
    a 150 ms budget. Break-evens 3.41× and 1.19×, so it fails at 4×, 6× and 8× alike.
    _Milliseconds move between runs; the VERDICT PER STATISTIC is what reproduces._
  - `ILLICIT STRICTLY DOMINATES` **139 of 410 (34%)**.
- **Gate 7** — median 53% (n = 747) against a 70% ceiling, **p90 87%**. The p90 is measured
  against the union of all other routes, which is a superset of any pairwise edge set, so it is a
  diversity observation and not a post-condition breach. Pairwise breaches: **zero**.

### Gate 9, in full

```
route                   profile   mode     legs      km  hours   peak    runs  completion      SE   vs floor
route.illicit.r1dlxpt5  illicit   truck      48   16983    509    232   10000       2.32%  0.15pp   -4.5 SE   <- BELOW
route.illicit.r16kyujq  illicit   truck      48   17243    513    236   10000       2.81%  0.17pp   -1.1 SE   <- BELOW
route.illicit.rskpfno   illicit   truck      48   17521    490    170   10000      10.80%  0.31pp  +25.1 SE
route.illicit.r1gjd3s6  illicit   truck      48   16069    509    177   10000      16.51%  0.37pp  +36.4 SE
```

**The two failing route ids are `route.illicit.r1dlxpt5` and `route.illicit.r16kyujq`.** Both are
Beira-Aktobe's illicit routes. Pooled completion at 2,000 runs reads 46.1%, comfortably inside the
30-50% band — **which is precisely the blindness gate 9 exists to correct, and why the pooled
figure must never be quoted as evidence that the corpus is healthy.**

---

## 2. WHY WE ARE CLOSING ANYWAY

**The fix moves `legKm` on every corpus route, therefore the corpus baseline, therefore gate 9
itself. A fix validated by a measure that changed in the same commit is not validated.**

That is the reason, stated as a reason. It is not that the fix is hard, or that time ran out, or
that the failure is small — it is 2.32% against a 3% floor at 4.5 standard errors, and it is real.
It is that the only honest sequence puts the fix and its measurement in different commits, in
this order:

1. Phase 3 measures the failure and explains it, against a baseline nobody has moved. **Done.**
2. A separate engine milestone changes route generation, regenerates the baseline, and
   re-measures. **Not started — see §6 for where it goes and why it is NOT Phase 4.**

Doing both inside Phase 3 would mean regenerating `docs/sim-baseline-corpus.md` and then
declaring the gate green against the new baseline — the same class of circularity ADR 0032 exists
to prevent, arriving through the front door. Every instrument this phase needed was also built
this phase (`--by-route` at ADR 0042, the `peak` column after ADR 0044), so a fix landing now
would be measured by tooling that had never measured anything else.

**A second reason, and it is not smaller.** The two failing routes **share 16 of 18 edges and 18
of 19 nodes — 88.9% overlap.** Gate 9 fails on ONE CORRIDOR sampled twice; the second sample
exists only because Beira-Aktobe's generator collapsed to rung 3 (ADR 0043) and could not supply
an alternative. So **any fix that clears gate 9 today is validated on n = 1.** Widening the
corpus, or fixing the generator collapse, is a prerequisite for believing the fix generalises —
and that is itself carry-forward item #2.

---

## 3. WHAT IS KNOWN

- **The mechanism.** Drain is charged per HOUR (every drain in `world-tick.ts` is `spanPoints`);
  recovery arrives per LEG (exactly one event fires per leg while `BASE_EVENT_ODDS` is fenced at
  `1:0`). Survivability is therefore the LOCAL ratio. `r1dlxpt5` bills **232 of its 509 hours
  inside nine consecutive legs (8-16)** because its montage block is contiguous; 67% of its
  population dies in that window against 22% for `r1gjd3s6`, which spreads the same 509 hours.
- **Clamping is what makes this possible at equal totals.** Total drain telescopes, but the
  overshoot on a floored meter is discarded while the TIME still charges morale. Where the meters
  were when the lump arrived decides the outcome.
- **The binding meter is morale.** Median leg of first morale floor: **leg 14** on both breaching
  routes, **never** on both healthy ones.
- **Arrangement is CAUSAL, at 21 standard errors, with null controls.** A permutation holding
  every multiset invariant (same `legKm` multiset, same 509 hours, same montage count, same
  `legLocations`, same beats, carried together so beats stay coherent) moved completion
  2.56% → 9.60%. Beats-only and locations-only controls came back at +0.8 SE and +0.6 SE.
- **Roughly half the 14pp gap is the leg MULTISET, not its order, and no rearrangement reaches
  it.** Every permutation of `r1dlxpt5`'s own legs tops out near **9%** against `r1gjd3s6`'s
  16.51%. `r1dlxpt5` has nine legs at 23-30 h; `r1gjd3s6`'s montage legs are milder. The multiset
  is a consequence of path granularity — **18 path edges for 16,983 km** against 23-32 on the
  healthy 48-leg routes — which is what gives montage nine consecutive segments to collapse.
- **Eliminated by measurement**, so nobody re-derives them: the harsh-weather threshold (46/48 vs
  45/48 eligible legs); `legLocations` and event-pool starvation (`uneventfulLegs` and
  `fallbackLegs` are **0.00 on every route** — the relaxation ladder never engages); the beat
  schedule; realized-vs-static hours (max realized 520 against 509 static, so the routes were
  genuinely comparable). Ruled out earlier: total hours, distance, profile, mode, leg count,
  starting cash, starting weather.

---

## 4. WHAT IS NOT KNOWN

**This section is as load-bearing as the one above. Do not read past it assuming these are
settled.**

- **Whether the response across `peak` (177, 232] is a CLIFF or a GRADIENT is UNRESOLVED, and
  this corpus cannot resolve it.** Only 6 of 28 routes reach `peak` 100 at all, and **the band
  178-231 contains ZERO routes**. The clean-looking separation between the failing pair (232/236)
  and their comparables (170/177) is a hole in the sample, not a measured response. A threshold
  somewhere inside that interval and a smooth gradient across it are indistinguishable on the
  evidence. **Anyone who needs to know must widen the corpus into that band first.**
- **Why the two interventions with equal completion produce different failure mixes.** Relocating
  the montage block gives morale-floor 35.9% / collapse 31.9%; spreading it into a comb gives
  51.3% / 17.6%. **Collapse differs by 1.8× at statistically identical completion.** Two
  mechanisms averaging to one number. Which one is preferable is a DESIGN question nobody has
  answered, and pillar 1 ("a bad outcome should be interesting, not just punishing") says it
  matters.
- **Whether a real `planLegs` change behaves like the permutation estimate.** The permutation
  family holds the multiset fixed; a real spacing constraint also re-allocates legs and may move
  the multiset, in a direction no experiment here can predict. **The ~9% is an estimate from the
  order-only family, not a promise.**
- **Whether the finding generalises beyond one corridor.** n = 1. See §2.
- **Whether `HOURS_PER_HUNGER_DAMAGE` / `HOURS_PER_STARVING_DAMAGE` (44/22) are correctly tuned.**
  Their recorded justification is stale and has been corrected to say so, but the constants were
  never re-derived, deliberately: ADR 0044 found **no dial is implicated at all** (the same
  constants give 2.56% and 9.60% on the same multiset), so re-deriving them would be tuning
  against a route-shape defect. Re-derive only after item #2, against the route set it produces.

---

## 5. WHAT WAS RETIRED — with the evidence, so neither is re-proposed

### `peak`-as-a-dial — RETIRED

`peak` (the most travel hours any nine consecutive legs bill) ships as a column and **earns its
place as a FLAG**: it is the only printed column that separates gate 9's failing routes from
their comparables. The stronger reading — that it is a quantity to tune down — was proposed by
ADR 0044's body and **falsified by measurement in the same phase**:

| variant               | peak    | hours | completion |     SE | morale floor | collapsed |
| --------------------- | ------- | ----: | ---------: | -----: | -----------: | --------: |
| base (as generated)   | 232     |   509 |      2.31% | 0.15pp |        61.2% |     22.6% |
| wall last             | **232** |   509 |  **9.32%** | 0.29pp |        35.9% |     31.9% |
| COMB — montage spread | **109** |   509 |  **8.64%** | 0.28pp |        51.3% |     17.6% |

**A 2.1× difference in `peak` for a 1.7 SE difference in completion.** The intervention that left
`peak` untouched did nominally better than the one that halved it. Supporting evidence:
`rho(peak, hours) = 0.938`, so `peak`'s −0.923 against completion falls to a partial of
**−0.296** once hours is held; within hours-strata it orders inconsistently and two of five bands
run backwards.

**Consequence: no acceptance test may be written as a `peak` threshold.** Use it to notice a
route, then measure that route.

### `conc` as a second column — REFUSED

`conc = peak / (9 × the route's own mean hours-per-leg)` — shape with route length divided out —
separates the failing pair **better** than `peak` does: 2.43 / 2.45 against a corpus maximum of
1.85 everywhere else. It was still refused:

- its partial correlation with completion holding hours is **+0.211 — the wrong sign**, so once
  size is controlled, more concentration is if anything associated with BETTER completion;
- raw ρ = −0.698 against `peak`'s −0.923;
- it inverts badly mid-range: conc 1.71 → 67.78%, conc 1.55 → 68.58%, against conc 1.17 → 17.15%;
- the comb refutes it **more** directly than it refutes `peak`, because `conc` is pure shape: the
  comb takes it from 2.43 to 1.14 — below the corpus median — and still does not beat the variant
  that leaves it at 2.43.

Its entire apparent advantage is a two-point separation in a 28-route sample.

---

## 6. CARRY-FORWARD

> ### These are DEBT ITEMS, not a phase. **They are NOT Phase 4.**
>
> An earlier draft of this document called them "carry-forward item #1" and "#2". **That was wrong and
> the label was invented here without checking the roadmap.** Phase 4 is
> **the design system, mood, and motion foundation** — `apps/mobile/src/{design,features,audio}/`,
> CLAUDE.md rules 9 and 10, design pillar 7, and `docs/motion-inventory.md`, none of which exist
> yet. It is app-layer work and has nothing to do with route generation.
>
> **Where these two items go is an OPEN DECISION** (see `docs/PROGRESS.md`, open questions).
> They are engine work in `packages/engine/`, so nothing in the design phase blocks on them at
> compile time and they can be scheduled independently. **The recommendation is to land them as a
> small interim engine milestone BEFORE the design phase**, for three reasons that are about
> sequencing cost rather than dependency:
>
> 1. **Montage IS a presentation concept.** A montage leg is a stretch the journal SUMMARISES
>    rather than plays, so "what a montage screen looks like" is design-phase work. Item #1
>    changes montage from **nine consecutive legs** to **ten scattered ones** (measured: 8-16
>    becomes 3, 7, 12, 17, 21, 26, 30, 35, 40, 44). Those are two different screens — one long
>    summary sequence versus ten short interludes. Designing the first and then shipping the
>    second means designing it twice.
> 2. **Mood calibration depends on the state distribution, and the balance moves it.** Pillar 3
>    ("the world reacts": broke → desaturation, wanted → sirens) has to be tuned against how often
>    each state actually occurs. Today, on long routes, energy floors by leg 5 and morale sits at
>    0 for most of the run — so the "exhausted" presentation would be very nearly always-on.
>    Calibrating mood against that and then fixing the balance invalidates the calibration.
> 3. **The wear curve already writes to the journal.** `wearHistoryEntry` leaves a line on every
>    band change (`wearChipKey`, `wearJournalKey`). That is a thing to present and it belongs in
>    `docs/motion-inventory.md`, which does not exist yet.
>
> **If the design phase starts first instead**, that is defensible — but then decide it
> explicitly and write down that **montage presentation and mood calibration are not to be
> designed until item #1 lands.** Everything else in the design phase (tokens, typography, the
> map, prep screens, the animation substrate, the motion inventory itself) is independent of the
> engine and can proceed in parallel.

### ITEM #1 — the montage spacing constraint

**Where:** `packages/engine/src/route/leg-plan.ts`, the selection loop in `planLegs`, beside
`byDullness` and `protectedFromMontage`.

**What:** `planLegs` picks montage by dullness alone; position enters only via
`protectedFromMontage` (the two anchors and each crossing's neighbourhood). Nothing stops it
taking nine consecutive segments, and on a corridor whose dull segments are contiguous it
reliably does. Refuse a segment adjacent to one already montaged while any unmontaged candidate
remains — that breaks the wall into a comb at no cost to the montage budget.

**Read first:** ADR 0044 **including its addendum**, ADR 0026 D4, ADR 0039.

> **CORRECTION — the constraint as worded above was IMPLEMENTED AND MEASURED INSUFFICIENT.**
> "Refuse a segment adjacent to one already montaged while any unmontaged candidate remains" has an
> unconditional last rung, and an unconditional last rung is not a constraint. On `r1dlxpt5` the
> deficit demands 10–11 montaged segments from an 18-edge path whose anchors and crossing
> neighbourhoods are already protected, so the relaxed pass ran on almost every selection: the
> spaced pass correctly took positions 1, 3, 5, 7, 9, 14, 16 and the relaxed pass then filled
> 2, 4, 6, 8 and closed every hole. Measured, it moved a 9-leg run at legs 8–16 to a 9-leg run at
> legs 9–17. **What shipped refuses the hole-filling rung outright, capping montage runs at two.**
> `docs/adr/0046` is the authority.

**ACCEPTANCE CRITERION — three parts, and completion alone is NOT enough:**

1. **Completion at `--runs=280000 --by-route`** on `route.illicit.r1dlxpt5`, reported with its SE.
   Clearing the 3% floor is necessary, not sufficient.
2. **The morale-floor share** — the fraction of runs whose morale reaches 0. It tracked every
   intervention cleanly where completion alone did not, and it is the meter ADR 0044 identified
   as binding.
   > **CORRECTION — it did NOT track this one.** `r1dlxpt5`'s completion tripled while its
   > morale-floor share moved 76.70% → 76.60%, i.e. not at all. Part 3 is what showed the
   > mechanism: `failure_collapsed` fell 21.70% → 17.05% and `arrival_quiet` rose 2.10% → 6.15%,
   > with `failure_gave_up` unmoved to two decimal places. **The fix converts collapse into
   > arrival and does not touch morale attrition.** Noted additionally: `morale@0` tracks
   > `ending.failure_gave_up` to within a point on all 28 routes, so it is close to a restatement
   > of one histogram row rather than an independent signal. ADR 0046 §Decision 2.
3. **The ending histogram, compared against a healthy comparable** (`rskpfno` or `r1gjd3s6`).

_Why part 3 is not optional: the two permutations reach statistically identical completion —
9.32% and 8.64%, 1.7 SE apart — through different failure mixes, morale-floor 35.9% / collapse
31.9% against 51.3% / 17.6%. Collapse differs by 1.8× at the same completion. One fix leaves
players starving out slowly, the other leaves them collapsing; a single completion figure cannot
tell them apart, and design pillar 1 says a bad outcome must be interesting rather than
punishing. Two fixes with the same number are not interchangeable._

**NOT a `peak` threshold.** See §5.

**SCOPE, STATED HONESTLY: this is a GATE FIX, NOT A ROUTE FIX.** Expect 2.32% → near 9%: clear of
the floor by ~20 SE, and **still an outlier at about half its comparable's 16.51%.** Say so when
it ships.

**Order when it lands:** `leg-plan.ts` → `pnpm test:engine` → `pnpm sim:diff -- --runs=2000` on
BOTH packs → regenerate `docs/sim-baseline-corpus.md` → `--runs=280000 --by-route` →
`pnpm geo:verify` (route structure moved) → ~~`pnpm golden:update`, reviewing the diff.~~
~~**Expect every golden to move: `legKm` feeds `stateDigest`.**~~

> **CORRECTION — THAT LAST STEP IS WRONG AND WAS NOT RUN.** No golden moved and the fixture
> baseline printed `No change`. `planLegs` is reached only through `route/materialise-route.ts`;
> `packages/tools/sim/load-pack.ts` reads fixture routes from
> `engine/src/__tests__/__fixtures__/routes.json` as literal `RouteState`, and
> `regenerate-goldens.ts` builds every golden from those same scenarios. So a route-GENERATION
> change cannot reach them. **That null result is the evidence the change was generation-only** —
> exactly what `docs/phase-3-dod.md` gate 2 says it is for — and running `golden:update` on the
> strength of this line would have converted a real finding into a silent pass.

### ITEM #2 — montage SELECTION and path GRANULARITY

The half of the gap a spacing constraint cannot reach. `illicit` detours around controls onto the
coarsest long-edge path, which is how Beira-Aktobe carries 16,983 km on 18 edges; montage then
collapses each 2,238 km segment to one leg clamped at `MAX_MONTAGE_HOURS`. **Same root as ADR
0043's generator collapse** — `selectPaths` returns `rungReached` and nothing reads it; 0 or 1 is
a generator that supplies alternatives, 3 or 4 is one that does not.

Do it after #1, measure it against the same three-part criterion, and note that fixing the
generator is also what takes gate 9's validation off n = 1.

### Also carried, from earlier passes

- **`docs/phase-3-verification.md`'s four findings**, none fixed, all owned: route diversity on
  Chongjin–Jeju City (structural), the `selectPaths` p90/max budget miss, `ILLICIT STRICTLY
DOMINATES` at 34%, and the ferry gap (6 ferry edges in 1,215, all hand-authored for the old
  263-node slice; 14 shipped edges below the 70% water threshold, 13 of them touching a
  border-crossing node that `place-borders.ts` split without re-testing).
- **38 `winter_closed` edges, none flagged `unavoidable`** — 126 of 410 rung-0 refusals.
- **Five outcomes carrying a flag, an ending or a `scheduleEvent` hang off choices only `random`
  picks.** Listed in `docs/sim-baseline-corpus.md`'s header block.
- **M3.12b (the quiet-leg odds sweep) is NOT a Phase 3 gate** and stays out — `docs/phase-3-dod.md`
  argues it. Note additionally that `BASE_EVENT_ODDS = 1:0` is why ADR 0044's obvious channel is
  inert, so M3.12b would **change the mechanics underneath gate 9** and must not land before
  item #1.
