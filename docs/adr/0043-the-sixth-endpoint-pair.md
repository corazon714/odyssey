# 0043 — The sixth endpoint pair, and a constraint that did not do its job

- **Status:** Accepted 2026-08-14 (C4b). **Constraint 3 below is recorded as REFUTED, not as
  satisfied.** Read "The correction" before quoting the selection rule anywhere.
- **Date:** 2026-08-14
- **Changes:** `packages/tools/sim/load-pack.ts` (`CORPUS_PAIRS` 5 → 6 entries and its doc
  comment), `docs/sim-baseline-corpus.md` (grid 23×5 → 28×5, whole body re-sampled),
  `docs/PROGRESS.md`
- **Relates to:** ADR 0034 (corpus routes are generated at sim time), ADR 0025 Decision 5
  (diversity is measured by distance and the guarantee is two-directional), ADR 0038 (a sampling
  stride must not share a factor), ADR 0042 (`--by-route`), `docs/phase-3-dod.md` gate 9

## Context

C2 made `acceptByDiversity` two-directional and correct. The corpus route set fell **25 → 23**,
and the entire loss was at ONE endpoint pair: **Beira-Aktobe**, which went from five accepted
routes to three.

That pair is also where gate 9's breach lives. Its three survivors are `scenic`, `illicit`,
`illicit` — one endpoint pair contributing the same profile twice — and both routes in the
over-500 h tail came from it. **A floor measured over a regime carried by a single endpoint pair
is measuring that pair, not the regime.** Whatever gate 9 was reporting about "long routes" was,
at that point, a report about Beira-Aktobe.

The obvious lever was rejected first. **`YEN_K` stays at 6.** Raising it to 16 does restore
Beira-Aktobe to five routes — the literal routes exist at K=12 and K=16 — but it flips the
route-generation benchmark from PASS to FAIL (13.33 → 35.60 ms on Node, 80.0 → 212.9 phone-ms
against a 150 ms budget this repo has refused to raise), takes p90 from 44.02 to 128.33 ms, and
its two extra routes are BOTH more Beira-Aktobe long routes. It **concentrates** the tail it was
supposed to spread.

## Decision

**Add a sixth pair, Nairobi-Segezha**, and **amend the third selection constraint**.

### The amendment: one pair per leg bucket, EXCEPT 46-48, which takes two

The original third constraint (added at the Afro-Eurasia switch) was ONE PAIR PER LEG BUCKET —
22-27, 28-33, 34-39, 40-45, 46-48 — because ranking candidates longest-first had returned five
pairs _all at exactly 48 legs_: on a continental graph everything long saturates the leg cap, so
"take the best" concentrates rather than spreads.

A leg bucket turns out to be a poor proxy for the thing that actually needed spreading. Leg COUNT
is capped at 48 by the compression curve (ADR 0026 Decision 4); leg LENGTH is not. So the 46-48
bucket contains routes from 406 h to 513 h, and the long-hour regime — the one gate 9 breaches in
— lives entirely inside a single bucket. The bucket takes **two** pairs.

### The five clauses, stated BEFORE the search ran

That ordering is the discipline the two earlier degenerate re-picks lacked (one converged all four
pairs on the same destination; one returned five pairs at the leg cap). Both were invisible in the
sim report, which is why the rule is now written down before the measurement rather than after:

1. both endpoints ≥900 km from all ten already chosen — the existing separation rule, extended;
2. all five routes inside the 22-48 leg band;
3. **five DISTINCT profiles among the plans `generateRoutes` returns** — intended to exclude
   Beira-Aktobe's collapse. **This clause failed. See the correction below.**
4. longest route at 46-48 legs and above 400 travel hours — the regime the breaching routes
   occupy;
5. **the MEDIAN of the qualifying set by that hour figure, never the maximum.**

### Clause 5 is the one that carries the most weight

94 pairs qualified, spanning 401-631 h. **Taking the argmax is what produced both earlier
degenerate re-picks** — argmax of "longest" gave five pairs at the leg cap, argmax of "furthest
apart" gave one shared destination. A median of an already-constrained set cannot saturate,
because the constraint has already removed everything that would have been out of band. Rank
statistics over a filtered set, never extrema over an unfiltered one.

## The correction: constraint 3 did not do the work it was written to do

Constraint 3 was written to guarantee that the sixth pair could not "import the same collapse
under a healthier-looking count". Adversarial review measured the sixth pair on the same
instruments Beira-Aktobe was measured on. **The collapse is identical.**

| measured at `YEN_K = 6`         | Beira-Aktobe | Nairobi-Segezha | the healthy four |
| ------------------------------- | ------------ | --------------- | ---------------- |
| distinct profile shortest paths | 2 of 5       | **2 of 5**      | 2, 2, 5, 5       |
| profiles returning NO path      | 3 of 5       | **3 of 5**      | 0 of 5           |
| pool B (profiles + Yen k=6)     | 12           | **12**          | 14, 24, 29, 28   |
| diversity rung reached          | 3            | **4**           | 1, 1, 0, 0       |
| plans returned                  | 3            | 5               | 5, 5, 5, 5       |

`fastest`, `cheapest` and `safest` return **no path at all** under rung-0 masks on BOTH pairs, so
both enter the ladder with a two-path pool of twelve candidates. The only difference is where they
stop. At rung 3 Beira-Aktobe has already collected three routes and `selectPaths` breaks;
Nairobi-Segezha has not, so it climbs to **rung 4 — masks dropped** — where its pool goes 12 → 29
and five routes appear.

Those five carry five distinct profile _labels_. But they are labels applied after the profiles'
own cost functions were relaxed away, which is exactly what rung 4 means (`route-diversity.ts`:
"dropping a profile's masks changes what the profile MEANS — a `safest` route through a closed
mountain pass is not a safest route"). **Nairobi-Segezha did not satisfy constraint 3; it climbed
past the rung at which constraint 3 was meaningful.**

The error is a category one and worth naming, because it is cheap to repeat: **the constraint
measured an OUTPUT of `generateRoutes` and inferred a property of the generator.** Profile
diversity among the returned plans does not imply profile diversity in the pool they were drawn
from. Five labels out of a collapsed pool and five labels out of a healthy one are the same
observation.

**The constraint that would have worked already exists and nothing reads it.** `selectPaths`
returns `rungReached`, and `generateRoutes` passes it through: 0 or 1 is a generator supplying
genuine alternatives, 3 or 4 is one that is not. That, not the profile count, is the check to
write if a seventh pair is ever added.

### The pair still stays, and here is the honest accounting

- **What it delivered:** the amendment's actual goal. The over-500 h tail is now three routes
  across **two** endpoint pairs rather than two routes from one, so the long-hour regime is no
  longer synonymous with Beira-Aktobe. Grid 23×5 → 28×5.
- **What it did not deliver:** it did not restore Beira-Aktobe. It **compensates** for the
  collapse rather than fixing it — Beira-Aktobe still yields three routes, and **both** routes
  that breach gate 9 are still its two `illicit` routes — and it does so by adding a second pair
  with the same defect.
- **What it refuted, unexpectedly, and this is worth more than what it was added for:** the hour
  theory of the gate-9 breach. Nairobi-Segezha's `route.illicit.r1gjd3s6` has the same profile,
  the same mode, the same 48 legs and the same 509 travel hours as the breaching
  `route.illicit.r1dlxpt5`, and completes an order of magnitude better. The current figures are in
  `docs/PROGRESS.md`.

## Consequences

- **Scenario count 28 ≡ 3 (mod 5), and that is load-bearing.** ADR 0038's condition is
  `gcd(S, P) = 1` with `P = 5` policies; `gcd(28, 5) = 1`, so the stride still enumerates the full
  140-cell grid. 25 routes did NOT satisfy it and 30 would not either. **Any future change to
  `CORPUS_PAIRS` must re-check this**, because the count is a product of pairs × surviving routes
  and neither factor is fixed.
- Every cell denominator moved, so `docs/sim-baseline-corpus.md` is re-sampled in whole rather
  than nudged. Comparing any individual line of it against the pre-C4b body is meaningless.
- `YEN_K` remains 6 and this ADR does not reopen it. The benchmark budget is the constraint;
  bounding `kShortestPaths`' stray ratio was tried and reverted (`63278eb`).
- Gate 9 still fails. This pair was never going to fix it — supply cannot lift a completion rate
  that is a property of an individual route — and adding it is not offered as an attempt to.
