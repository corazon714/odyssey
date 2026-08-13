# 0038 — A sampling stride must not share a factor with what it strides over

- **Status:** Accepted 2026-08-12 (M3.11f). **The decision below was AMENDED at M3.11g — read the
  addendum at the end before quoting the `cellFor` in "Decision", which is no longer what ships.**
- **Date:** 2026-08-12, amended 2026-08-13
- **Changes:** `packages/tools/sim/run-many.ts`, `packages/tools/sim/format-report.ts`,
  `packages/tools/sim/__tests__/pairing.test.ts` (new), `packages/tools/sim/__tests__/report.test.ts`,
  both sim baselines, `docs/adr/0035`, `docs/PROGRESS.md`
- **Relates to:** ADR 0032 (a baseline belongs to its run count), ADR 0023 (measuring the
  registries), ADR 0026 addendum (the bimodal completion distribution)

## Context

`runMany` assigned each run a route and a policy with two independent moduli:

```ts
const scenario = scenarios[i % scenarios.length]; // corpus: 25
const policy = policies[i % policies.length]; //    POLICY_NAMES: 5
```

Read quickly this looks like it spreads runs over the grid. It does not. Both indices are driven
by the same `i`, so `i % 5` is a **function of** `i % 25` whenever 5 divides 25. Every route was
welded to exactly one policy, permanently, and the corpus sim visited **25 of its 125 route ×
policy cells** — a fifth of the space, chosen by arithmetic nobody had looked at.

The general condition is `gcd(S, P) === 1`. The pair `(i % S, i % P)` enumerates the grid only
when the counts are coprime; otherwise it walks a single cycle of length `lcm(S, P)` and reaches
`lcm(S, P)` of the `S × P` cells.

**S is a multiple of 5 by construction, not by accident.** `loadCorpusScenarios` expands each
`CORPUS_PAIRS` entry into one scenario per route profile, and there are five profiles
(fastest/cheapest/safest/scenic/illicit) exactly as there are five `POLICY_NAMES`. Two counts with
nothing to do with each other were equal, and the harness silently depended on it.

**The fixture pack was accidentally fine, and that is why this lived so long.** It runs 3 routes
against 5 policies, `gcd(3, 5) = 1`, so the old stride cycled its full 15-cell grid and every
fixture number was honestly sampled. The default pack — the one every test and every casual
`pnpm sim` runs — could not exhibit the bug. It only appeared once a scenario count landed on a
multiple of 5, which happened when the corpus moved to generated routes.

### What it cost, measured rather than estimated

`docs/sim-baseline-corpus.md`'s 41.0% completion headline, and every per-route number M3.11d and
M3.11 close were argued from, are that biased fifth.

The aggregate was barely wrong: **+0.9pp at 2,000 runs, ~1.64pp of true bias measured at 25,000
runs per cell** (weighting all 125 cells equally the corpus completes 42.53%; the welded diagonal
completes 40.89%). The same bias reads **~1.70pp at 2,000 runs per cell** — 42.53% against 40.83%,
the number the amendment's imbalance table below quotes. Two samples of one quantity; the 25,000
one is the later and larger, and neither is a correction of the other. The weld's errors
largely cancel in an average, which is precisely why it survived review — the headline the
baselines were built on was never far off. **Every per-route number was worthless.**

Four mid-range routes are the sharpest cases. Re-measured at **25,000 runs per cell**, 125,000 per
route, on a seed stream unrelated to the harness:

| route              | hours | welded cell (old stride) | all five | gap    | max−min spread |
| ------------------ | ----: | ------------------------ | -------: | ------ | -------------: |
| `illicit.r1nta1ib` |   260 | greedy-safe **0.20%**    |   22.32% | 22.1pp |         53.0pp |
| `scenic.r11j3r4l`  |   272 | adversarial **61.14%**   |   26.14% | 35.0pp |         63.9pp |
| `cheapest.rtps1ek` |   281 | greedy-safe **0.58%**    |   21.06% | 20.5pp |         57.9pp |
| `scenic.rf52s2j`   |   285 | risk-taker **5.52%**     |   24.88% | 19.4pp |         61.2pp |

**Two quantities, and the original text named one and printed the other.** The GAP — what the
welded cell reported against what all five policies report — is **19.4 to 35.0pp**. The SPREAD —
best policy minus worst, inside one route — is **53.0 to 63.9pp**. This ADR's first draft wrote
"disagree between the welded policy and all five by 53 to 63 percentage points", which is the
spread wearing the gap's label; the table beneath it refuted the sentence and nobody read down.

The `welded cell` column is `POLICY_NAMES[i % 5]` at the route's load-order index, and nothing
else. `scenic.rf52s2j` is index 18, so it is `risk-taker`; the first draft printed the route's
MINIMUM cell there (`greedy-safe`, 0.09%) and thereby showed three greedy-safe welds where the
prose below correctly says two.

`scenic.r11j3r4l` is the extreme: **0.076% under `greedy-safe` — 19 completions in 25,000, not the
exact zero a 1,000-run sample reported** — against 61.14% under `adversarial-worst-case`. The
stride happened to weld it to adversarial, so it read healthy; one index over and the same route
would have read stone dead. **That coin-flip is the whole defect** — two of those four were welded
to `greedy-safe` and were written into three documents as doomed routes.

## Decision — a mixed-radix odometer, extracted as a pure function

```ts
export function cellFor(i: number, scenarioCount: number, policyCount: number) {
  return { scenario: Math.floor(i / policyCount) % scenarioCount, policy: i % policyCount };
}
```

For `i` in `[0, S*P)` write `i = q*P + r` with `r = i % P` in `[0, P)` and `q = floor(i / P)` in
`[0, S)`. That decomposition is unique and neither digit wraps, so `i → (q, r)` is a **bijection
onto the grid for every S and P**, coprime or not, including `S < P` and either count equal to 1.
The property is unconditional; there is no shape to check.

It is **exported and pure** so the property is testable at scale without 125 engine runs per
shape. `__tests__/pairing.test.ts` enumerates rather than argues it: thirteen named trap shapes
plus a sweep over all `S ≤ 12, P ≤ 8`, a uniformity check over three passes, and two end-to-end
tests through `runMany` on a deliberately non-coprime slice of the fixture pack.

### Policies are the low digit, and that is load-bearing — WRONG, see the addendum

> This section is kept as written because it is the mistake, and deleting it would delete the
> lesson. **"Scenarios on the low digit covers the grid equally well" is the false sentence.**
> It covers the grid equally well only at `runs = S*P`, and the axis choice is exactly what
> decides the sample at every count below that, which is every count anyone types.

Scenarios on the low digit covers the grid equally well, and is wrong for a different reason:
`pnpm sim --pack=corpus` defaults to 100 runs against 25 scenarios, which would report four
policies of five and drop a bound without saying so. Policies low means every policy appears
within the first `P` runs, so a truncated run still carries the spread.

### The alternative that was rejected, because it is the same bug wearing a hat

> **THIS IS NOT THE LATIN SQUARE THAT SHIPPED, and the two differ by one operator.** What is
> rejected here uses `i` where the shipped pairing uses `i % S`. That single character is the
> difference between a bijection for every shape and a stride that fails 271 of 720. The
> rejection below is CORRECT about the expression it names; it is the near-miss, and the
> addendum keeps it as the reason to enumerate rather than reason.

A Latin-square skew, `policy = (i + floor(i / S)) % P`, was considered — it keeps the policy
varying inside a single pass over the scenarios. With `i = q*S + s` it reduces to
`policy = (q*(S+1) + s) % P`, so it enumerates the grid only when `gcd(S + 1, P) === 1`. **The
hidden factor relationship moved from `S` to `S + 1`; it did not go away.** Swept over `S ≤ 30,
P ≤ 8` it misses cells on 85 of 240 shapes, with `(4,5)` covering 4 of 20. On the corpus's own
axis it passes at S = 25 — which is how it would have survived review — and fails at S = 24, the
count one dropped route plan produces.

**What this section then over-generalised, and it is the reason the odometer shipped for an
hour:** rejecting one skew is not rejecting every skew. `(i % S + floor(i / S)) % P` has no
factor condition at all, and nobody enumerated it because the family had already been dismissed.

## Consequences

> These are the ODOMETER's consequences, recorded as they were measured. **None of them reached a
> committed baseline** — the amendment landed inside the same pass. For what actually ships, read
> "Consequences of the amendment" at the end.

- **Both baselines were regenerated and both moved.** Corpus: completion 41.0% → 42.9%, median
  legs 26 → 25, long-range payoff 14.0% → 26.4%, endings 41.0/32.8/26.1 → 42.8/37.3/19.8. Fixture:
  completion 75.3% → 75.0% and a handful of single-digit run counts. Each file's header records
  which and why.
- **It is a measurement correction, not a balance change, and that is proved rather than claimed.**
  Replaying the OLD pairing against the corrected tree reproduces both committed baseline bodies
  **line for line**, the two machine-dependent wall-clock lines excepted. The engine returns
  identical output for identical `(seed, scenario, policy)` triples, so 100% of the movement is
  attributable to which cells got sampled. `packages/engine` was not touched and the goldens are
  unmoved. **This one survives the amendment unchanged** — it was re-run against the shipped
  Latin square and still holds.
- **The fixture pack moved for a different reason and the distinction matters.** Its grid was
  already fully covered, 15 of 15 before and after. What changed is which route each seed plays:
  1,333 of 2,000 runs (**66.7%**, not the 66.6% first written — 1333/2000 is 66.65%). A resample,
  not a coverage fix.
- **100 route × policy combinations ran for the first time and none broke.** Zero engine errors,
  zero empty-pool fallbacks, zero turn-cap hits. A robustness result bought by the coverage.
- **`policy.ts`'s stated contract is measurably false, and the grid is what exposed it.** Over
  25,000 runs each: random 21.3%, greedy-safe 24.9%, greedy-fast 63.9%, risk-taker 42.4%,
  adversarial-worst-case 60.1%. Its header says a rate under `random` and under
  `adversarial-worst-case` bound the range a real player lives in; adversarial is the
  second-**highest** of the five, 39pp above random. This is pre-existing, was invisible while
  each policy ran on a different non-overlapping fifth of the routes, and has no owner yet.
- **The M3.11d constant sweep was scored against the welded split.** `HOURS_PER_MORALE 20` and
  `HOURS_PER_HUNGER_DAMAGE 44` are not thereby wrong — completion and the ending mix are in
  acceptable shape on the corrected sampling — but the sweep's `collapsed`/`gave_up` columns
  measured a fifth of the grid, and the next tuning pass must re-read them before leaning on them.

## The family lesson, which is the reason this ADR exists

This is the **third** instance of one failure in M3.11 alone, and all three look identical once
named: **a ranking or an index quietly collapsed the space it was supposed to spread, and the
report stayed healthy while it did.**

1. `2e38375` — `CORPUS_PAIRS` measured one destination four times, because the endpoint search
   converged. Four pairs, one city.
2. `04f0f38` — five generated pairs all landed at exactly 48 legs, because longest-first
   saturates the leg cap.
3. This one — every route welded to one policy, because a stride shared a factor with its axis.

In each case the aggregate looked fine. That is the trap: **an average over a collapsed sample is
still an average, and it is the per-cell numbers that go silently wrong.** In each case the defect
was in code that selects _what to measure_, which no amount of correctness in the thing being
measured can catch.

**The rule, stated so it can be applied to the next one: a pairing, stride or ranking must never
depend on an arithmetic relationship between two counts that are free to move independently.**
Both counts here have already moved twice this milestone — `CORPUS_PAIRS` has been re-picked
twice, and a single route plan falling outside the leg band takes S to 24 without a word in the
report.

**And the operational version: if you are about to change how something pairs or ranks, enumerate
the coverage first.** Count the distinct cells actually visited and compare it to the grid. It is
one `Set` and it would have caught all three.

---

## Addendum, M3.11g (2026-08-13) — the odometer was half a fix, and the half it missed was the default

The decision above satisfies exactly one of the two properties a pairing needs, and this ADR did
not know there were two.

- **(a) Full grid.** Over `runs = S*P`, every cell exactly once, for arbitrary `S` and `P`.
- **(b) Full marginals early.** A prefix of `max(S, P)` runs already touches every scenario and
  every policy. **A prefix is the normal case.** `--runs` is a round number, the grid size is not,
  and `parse-args.ts` defaults to 100 against a 125-cell corpus grid.

The odometer has (a) unconditionally and fails (b) on every shape with `S > 1 < P`, because the
slow digit is only exercised by a run count that reaches it. A prefix of `R` runs touches
`ceil(R / P)` scenarios, so `pnpm sim --pack=corpus` at the documented default of 100 runs sampled
**20 of the 25 routes** — and `CORPUS_PAIRS` is ordered by ascending leg bucket while
`loadCorpusScenarios` is pair-major, so the five it dropped were **always the five profiles of the
highest leg bucket** (`Beira-Aktobe`, 48 legs), five of the seven near-zero-completion routes.

**Not "the five longest", which this ADR said first and which is false at ROUTE granularity.**
The bucket is a property of the PAIR, taken from its shortest route, while a pair's five profiles
diverge hard: scenario 14 is `route.illicit.rskpfno` — 48 legs, **17,521 km, 494 h** — and it sits
in the third bucket, so the prefix KEEPS it while dropping three routes that are shorter than it
in both km and hours (15,296 km/407 h, 15,444 km/395 h, 16,983 km/490 h). "Ascending leg bucket,
pair-major" establishes which BUCKET is dropped and nothing about the ordering of routes inside
it. The bias magnitude is unaffected: **+10.6pp** stands.

Measured by weighting every cell equally, 16 runs per cell:

| sample                               | routes | policies | cells   | completion |
| ------------------------------------ | -----: | -------: | ------- | ---------: |
| full grid                            |  25/25 |      5/5 | 125/125 |     42.30% |
| odometer at `--runs=100` (default)   |  20/25 |      5/5 | 100/125 | **52.88%** |
| odometer at `--runs=25`              |   5/25 |      5/5 | 25/125  |     85.50% |
| old pre-M3.11f stride, any `R >= 25` |  25/25 |      5/5 | 25/125  |     42.00% |
| Latin square at `--runs=100`         |  25/25 |      5/5 | 100/125 |     42.25% |

**+10.6pp, above the top of the 30-50% band, in a known direction** — bias, not noise. The stride
this ADR replaced covered all 25 routes at any `R >= 25`. **On the invocation CLAUDE.md §5
documents, the fix was a regression.**

Sixteen runs per cell is 400 runs behind each of those figures, so they were re-measured at
**25,000 runs per cell** (3.125M runs over the grid, zero engine errors): full grid 42.53%,
odometer at 100 **53.16%**, odometer at 25 86.85%, old stride 40.89%, Latin square at 100 42.31%.
The gap is **+10.63pp** — the same number to two decimal places, which is the point: it was never
a sampling artefact of the measurement that found it.

### The amended decision

```ts
const scenario = i % scenarioCount;
const policy = (scenario + Math.floor(i / scenarioCount)) % policyCount;
```

A Latin square. With `i = q*S + s` this is `(s, (s + q) % P)`. **(a)**: for any cell `(s, p)` there
is exactly one `q = (p - s) mod P` in `[0, P)`, hence exactly one `i = q*S + s` in `[0, S*P)` — a
bijection for every shape, no factor condition to check. **(b)**: the first `S` runs are `q = 0`,
so they hit all `S` scenarios and policies `0..S-1`.

### The near-miss, which is one `% S` away and is the reason to enumerate rather than reason

The skew this ADR rejected was `policy = (i + floor(i / S)) % P` — `i` where it must be `i % S`.
That reduces to `(q*(S+1) + s) % P` and moves the factor trap from `S` to `S + 1` instead of
removing it. The two differ by one operator and by 271 shapes.

Enumerated over `S = 1..60 x P = 1..12`, 720 shapes, failure counts:

| candidate                                 | fails (a) | fails (b) | fails either |
| ----------------------------------------- | --------: | --------: | -----------: |
| old two-moduli `(i%S, i%P)`               |       271 |         0 |          271 |
| odometer-A, scenarios low                 |         0 |       649 |          649 |
| odometer-C, policies low — **as shipped** |         0 |       649 |          649 |
| near-miss skew `(i + floor(i/S)) % P`     |       271 |        61 |          300 |
| **Latin square `(i%S + floor(i/S)) % P`** |     **0** |    **55** |       **55** |

Each of the first three passes one property in full, which is how each survived review.

### The gap that remains, recorded rather than left to be discovered

The Latin square's 55 (b)-failures are **all** shapes with `2 <= S < P`: with fewer scenarios than
policies, a prefix of `P` runs reaches all `S` scenarios but only `min(S, P)` policies. It is
unreachable from any real invocation — a prefix can only bias what it truncates, truncation needs
`runs < S*P`, and with `P <= 5` and a default of 100 that means `S >= 20 > P` — and the fixture
pack's own 3 x 5 grid is covered six times over at the default. It is pinned by a test so a shape
change trips CI rather than a baseline. **If it ever needs closing, put the identity digit on the
LONGER axis** (`S >= P ? (i%S, (i%S + floor(i/S))%P) : ((i%P + floor(i/P))%S, i%P)`); enumerated
over the same 720 shapes that variant fails neither property. It was not shipped because it doubles
the code paths to close a gap no invocation can reach.

### The report now prints its own coverage, which is the durable half of this fix

`format-report.ts` contained the string `route` **zero** times. Two pairing bugs in a row shipped,
were baselined and were argued from, with nothing in the artifact people read saying which part of
the space had been measured. That is the same defect as the pairing itself — a collapsed sample
with a confident number on top of it — so the report gained a line above the first rate computed
over it:

```
Grid cells sampled            100   (of 125 — 25/25 routes x 5/5 policies)
Grid cells sampled              3   (of 125 — 3/25 routes x 3/5 policies)   <- 22 routes and 2 policies NEVER RUN
```

Cells short of the grid is ordinary. A **marginal** short of its total is the finding, and it is
counted from the runs themselves — one `Set` over what `runOne` was handed, never from `cellFor`,
which would agree with itself by construction.

#### What the coverage line cannot see, bounded rather than left to be discovered

**It catches HOLES, not IMBALANCE.** Between the round counts a prefix reaches the cells it does
reach an unequal number of times, so the average can be tilted with **both marginals reading full
and the line therefore silent**. Measured on the corpus's 25 × 5 grid at 2,000 runs per cell,
against its cell-weighted 42.53%:

| `--runs`                       | routes | policies | run-weighted | bias vs full grid |
| ------------------------------ | -----: | -------: | -----------: | ----------------: |
| 25                             |  25/25 |      5/5 |       40.83% |           −1.70pp |
| **39**                         |  25/25 |      5/5 |       50.89% |       **+8.36pp** |
| 50                             |  25/25 |      5/5 |       44.07% |           +1.54pp |
| 100                            |  25/25 |      5/5 |       42.32% |           −0.21pp |
| 125 (and 250, 500, 1000, 2000) |  25/25 |      5/5 |       42.53% |        **0.00pp** |

**Every row reports full marginals**, so the coverage line is silent on all of them. The tilt is
exactly zero only at multiples of the 125-cell grid — among round numbers, 250 and up, which
includes the 2,000 both baselines are taken at. `--runs=25` is the special case worth noticing:
`q = 0` throughout, so the Latin square's first pass **is** the old stride's welded diagonal, and
it reproduces its bias. This is still strictly better than the old stride, whose **~1.70pp — that
figure at the 2,000 runs per cell this table is measured at, and ~1.64pp at 25,000 (see "What it
cost" above)** — was permanent at **every** R because it could never reach more than 25 of the 125
cells; the Latin
square's error is a truncation artefact that closes. **An honest bound beats a silent one:** read a
non-multiple count as a sample, not as the grid.

### Consequences of the amendment

- **Both baselines are committed against the Latin square, and it is the delta from the OLD
  STRIDE that a reviewer diffs.** Corpus: completion 41.0% → **41.9%** (821 → 838 completions),
  median legs 26 → 25, payoff 14.0% → **24.8%** (scheduled 143 → 113, fires 20 → 28), threads
  63 → 46, endings 41.0/32.8/26.1 → **41.9/38.3/19.8**, checks 21,063 → 20,501. Fixture:
  75.3% → **74.0%** (1,506 → 1,480), payoff 90.3% → 85.3%, threads 3 → 5, 15/15 cells on both
  sides. Neither header tells an odometer story, because no odometer number was ever committed.
- **Against the odometer's intermediate numbers the difference is pure resample**, which is why
  the amendment cost nothing at the baseline count: at 2,000 runs the corpus grid is covered
  exactly 16 times over by both, 125/125 cells, route marginal 80 and policy marginal 400 under
  each, with 1,984 of 2,000 runs (99.2%) merely changing which seed plays which cell.
- **The Latin square changes the POLICY and never the ROUTE, on either pack.**
  `scenario = i % S` is the same expression in the old stride and in the shipped pairing, so
  every run plays the route it always played and both route marginals are unmoved — corpus
  80 per route, fixture 667/667/666. What moves is the policy: 1,600 of 2,000 corpus runs
  (80.0%) and 1,598 of 2,000 fixture runs (79.9%), and **zero** route changes on either. That is
  what makes "measurement correction, not balance change" narrow enough to be checkable rather
  than a slogan.
- **The fix is invisible at 2,000 runs by construction and decisive below the grid**, which is
  where every casual invocation lives. Re-measured at 25,000 runs per cell: at `--runs=100` the
  Latin square samples 25/25 routes for a cell-weighted 42.3% against the full grid's 42.5%,
  where the odometer sampled 20/25 for 53.2%.
- **`packages/engine` was not touched and the goldens are unmoved by content.** `golden:update`
  re-emits 416 lines against the committed 398 every time regardless — a layout difference only —
  so this was judged by JSON deep-equality, which holds.
- **The test suite now guards both properties and is proved to discriminate.** The old suite
  asserted (a) thirteen ways and passed on the shape it was silently wrong about. Swapping each
  rejected candidate into `cellFor` now fails the suite: old stride 10 tests, odometer 11, near-miss
  10 — including `THE REGRESSION: the real corpus at the real default run count runs every route`,
  which reads `expected 20 to be 25` against the odometer.

### The family lesson, updated

This was the **fourth** instance, not the third — and the first three were all found by looking at
the thing being sampled, while this one was in the fix for the third. The rule needs its second
half: **a pairing must not depend on an arithmetic relationship between two counts that move
independently, and it must be enumerated at TRUNCATED counts as well as at the full grid.** A
property that only holds at `runs = S*P` is a property that holds for no invocation anyone makes.
