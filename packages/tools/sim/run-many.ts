import { type ContentPack, type EventId } from '@odyssey/engine';
import { type FixtureScenario } from './load-pack.ts';
import { type PackName } from './parse-args.ts';
import { POLICY_NAMES, type PolicyName } from './policy.ts';
import { runOne, type SimRun } from './run-one.ts';

export type SimOptions = {
  readonly runs: number;
  readonly seed: string;
  readonly policies: readonly PolicyName[];
  readonly diff: boolean;
  readonly json: boolean;
  readonly pack: PackName;
};

/**
 * How much of the route x policy grid this sample actually touched.
 *
 * **Counted from the runs, not from the stride.** ADR 0038's operational rule is "if you are
 * about to change how something pairs or ranks, enumerate the coverage first — it is one `Set`
 * and it would have caught all three". A number derived from `cellFor` would agree with
 * `cellFor` by construction and catch nothing; these three Sets are over what `runOne` was
 * handed, so a pairing bug, a duplicate route id and a skipped cell all show up the same way.
 *
 * The MARGINALS are the part that must be read, not the cell count. `cells < cellsAvailable`
 * is ordinary — it means `--runs` stopped mid-grid. A marginal short of its total means an
 * entire route or an entire policy never ran, and every rate in the report is then an average
 * over a space with a hole in it.
 */
export type GridCoverage = {
  readonly routes: number;
  readonly routesAvailable: number;
  readonly policies: number;
  readonly policiesAvailable: number;
  readonly cells: number;
  readonly cellsAvailable: number;
};

export type SimSummary = {
  readonly runs: readonly SimRun[];
  readonly coverage: GridCoverage;
  readonly completionRate: number;
  readonly medianLegs: number;
  readonly medianDays: number;
  readonly uneventfulRate: number;
  readonly fallbackRate: number;
  readonly neverFired: readonly EventId[];
  readonly scheduled: number;
  readonly queueFires: number;
  readonly payoffRate: number;
  readonly errors: readonly string[];
  readonly turnCapHits: number;
  readonly unresolvedThreads: number;
  readonly queueDrops: number;
  readonly beatsFilled: number;
  /** Share of presented legs that got a complication. Measures ATTACH_PERCENT against play. */
  readonly complicationRate: number;
  readonly meanChipsPerCheck: number;
  readonly checksRolled: number;
  readonly checksUnderTwoChips: number;
  readonly checksOverBand: number;
  readonly maxChips: number;
  readonly universalOfferRate: number;
  readonly universalPickRate: number;
  readonly beatsExpired: number;
  readonly beatFillRate: number;
  readonly unfillableBeatTypes: readonly string[];
};

/**
 * Which (scenario, policy) cell run `i` measures.
 *
 * ## TWO PROPERTIES. EVERY SIMPLER FORM SATISFIES EXACTLY ONE OF THEM
 *
 * **(a) FULL GRID.** Over `runs = S*P` every cell is visited exactly once, for ARBITRARY `S`
 * and `P` — coprime, sharing a factor, equal, `S < P`, or either equal to 1.
 *
 * **(b) FULL MARGINALS EARLY.** A prefix of `max(S, P)` runs already touches every scenario and
 * every policy. **A prefix is the normal case, not the edge case**: `--runs` is a round number
 * and the grid size is not, so almost every invocation stops mid-grid. `parse-args.ts` defaults
 * to 100 and the corpus grid is 125.
 *
 * (a) without (b) is not enough, and that is what this file got wrong twice.
 *
 * ## What (a) killed: `scenario = i % S; policy = i % P`
 *
 * Two independent moduli driven by the same `i` enumerate the grid only when `gcd(S, P) === 1`;
 * otherwise they walk one cycle of length `lcm(S, P)`. On the corpus S is 25 and P is 5, so
 * `i % 5` was fully determined by `i % 25`: every scenario welded to exactly one policy, 25 of
 * 125 cells, forever. ADR 0038 has what that cost per route (53-63pp).
 *
 * The FIXTURE pack was fine, and that is the whole reason it lived so long. It runs 3 routes
 * against 5 policies, `gcd(3, 5) = 1`, so the old stride cycled its full 15-cell grid and every
 * test and every fixture baseline number was honestly sampled. The default pack was accidentally
 * correct; the bug only appeared once a scenario count landed on a multiple of 5.
 *
 * S is a multiple of 5 BY CONSTRUCTION, not by accident: `loadCorpusScenarios` expands each
 * entry of `CORPUS_PAIRS` into one scenario per route profile, and there are five profiles
 * (fastest/cheapest/safest/scenic/illicit) exactly as there are five `POLICY_NAMES`. Two counts
 * that have nothing to do with each other were equal, and the harness silently depended on it.
 *
 * **THE RULE: this pairing must never depend on an arithmetic relationship between the two
 * counts.** Both move. `CORPUS_PAIRS` has been re-picked twice already, and one route plan
 * falling outside the leg band takes S to 24 without a word in the report.
 *
 * ## What (b) killed: the mixed-radix odometer that replaced it
 *
 * `scenario = floor(i / P) % S; policy = i % P` satisfies (a) unconditionally — the decomposition
 * `i = q*P + r` is unique and neither digit wraps — and it fails (b) on every shape with
 * `S > 1 < P`. **The slow digit is only exercised by a run count that reaches it.** A prefix of
 * `R` runs touches `ceil(R / P)` scenarios, so the documented `--runs=100` sampled **20 of the
 * corpus's 25 routes**, and because `CORPUS_PAIRS` is ordered by ascending leg bucket and
 * `loadCorpusScenarios` is pair-major, the five it dropped were the five profiles of the HIGHEST
 * LEG BUCKET. (Not "the five longest routes", which this said until M3.11g and which is false at
 * route granularity: scenario 14, `route.illicit.rskpfno` at 17,521 km / 494 h, sits in the third
 * bucket and is KEPT, while three of the five dropped are shorter in both km and hours. Nor "the
 * ones that complete least" — that set is a seven-way tie at ~0%.) Measured: full grid 42.30%
 * completion, the default prefix 52.88%,
 * **+10.6pp and out the top of the 30-50% band**. Direction-known bias, not sampling noise, and
 * the old broken stride covered all 25 routes at any `R >= 25`. On the invocation CLAUDE.md §5
 * documents, the odometer was a REGRESSION.
 *
 * ## The fix, and the near-miss that is one `% S` away from it
 *
 * A Latin square. With `i = q*S + s` (`s = i % S`, `q = floor(i / S)`) this is `(s, (s + q) % P)`.
 * (a): for any cell `(s, p)` there is exactly one `q = (p - s) mod P` in `[0, P)`, hence exactly
 * one `i = q*S + s` in `[0, S*P)` — a bijection for every shape, with no factor condition to
 * check. (b): the first S runs are `q = 0`, so they hit all S scenarios and policies `0..S-1`.
 *
 * **The near-miss, which is the whole lesson: `policy = (i + floor(i / S)) % P`, using `i` where
 * it must be `i % S`.** It reduces to `(q*(S + 1) + s) % P` and merely MOVES the factor trap from
 * `S` to `S + 1`. Swept over `S <= 60, P <= 12` it fails (a) on 271 of 720 shapes including
 * `(4,5)`, which covers 4 of 20 cells. On this corpus's own axis it passes at S = 25 — which is
 * how it would survive review — and fails at S = 24, one out-of-band route plan away.
 *
 * ## Where (b) does NOT hold, stated rather than discovered later
 *
 * When `S < P` the first `max(S, P) = P` runs reach all S scenarios but only `min(S, P)` policies:
 * 55 of the 720 swept shapes, ALL of them `2 <= S < P`. It is not reachable from here — a prefix
 * can only bias what it truncates, and truncation needs `runs < S*P`, which with `P <= 5` and a
 * default of 100 means `S >= 20 > P`. The fixture pack's own 3 x 5 covers its 15-cell grid six
 * times over at the default. **This is a known gap, not an unknown one, and the report now prints
 * the coverage on every run so it cannot be silent if the shape ever changes.**
 *
 * ## This is the fourth of its family in M3.11
 *
 * Each one was a ranking or an index quietly collapsing the space it was supposed to spread,
 * with the report still looking healthy: `2e38375` measured one destination four times because
 * the endpoint search converged, and `04f0f38` returned five pairs all at exactly 48 legs
 * because longest-first saturates the leg cap. Same shape of error, third time — and then a
 * fourth, when the fix for it sampled a prefix of the space instead of a cycle of it. If you are
 * about to change how this pairs, enumerate the coverage first, at TRUNCATED counts as well as
 * at the full grid.
 */
export function cellFor(
  i: number,
  scenarioCount: number,
  policyCount: number,
): { readonly scenario: number; readonly policy: number } {
  const scenario = i % scenarioCount;
  // `scenario`, i.e. `i % S` — NOT `i`. With `i` this is `(q*(S+1) + s) % P` and the factor trap
  // is back, one axis over. That one operator is the difference between a Latin square and a
  // stride that fails 271 of 720 shapes.
  const policy = (scenario + Math.floor(i / scenarioCount)) % policyCount;
  return { scenario, policy };
}

/**
 * Run the corpus, spreading seeds across routes and policies.
 *
 * Seeds are derived from a base string rather than drawn, so `--seed base --runs 1000` is the
 * same thousand runs on any machine. That is what makes a sim DIFF meaningful: a change in
 * the numbers is a change in the engine or the content, never in the sampling.
 */
export function runMany(
  pack: ContentPack,
  scenarios: readonly FixtureScenario[],
  opts: SimOptions,
): SimSummary {
  const results: SimRun[] = [];
  const policies = opts.policies.length > 0 ? opts.policies : POLICY_NAMES;

  for (let i = 0; i < opts.runs; i += 1) {
    const cell = cellFor(i, scenarios.length, policies.length);
    const scenario = scenarios[cell.scenario];
    const policy = policies[cell.policy];
    // With no scenarios BOTH indices are NaN — `i % 0` is NaN and the policy is derived from the
    // scenario, so it inherits it. That is a property of the current formula and not something
    // to lean on, so the guard tests the two lookups independently. Skipping is the existing
    // contract, and `cli.ts` already refuses a corpus that generated none.
    if (scenario === undefined || policy === undefined) continue;
    results.push(runOne(`${opts.seed}:${String(i)}`, scenario, pack, policy));
  }

  return summarise(results, pack, {
    scenarios: scenarios.length,
    policies: policies.length,
  });
}

export function summarise(
  runs: readonly SimRun[],
  pack: ContentPack,
  grid: { readonly scenarios: number; readonly policies: number },
): SimSummary {
  const usable = runs.filter((r) => r.error === null);
  const fired = new Set<EventId>();
  for (const run of usable) for (const id of run.firedEvents) fired.add(id);

  const totalLegs = usable.reduce((sum, r) => sum + Math.max(1, r.legs), 0);
  const uneventful = usable.reduce((sum, r) => sum + r.uneventfulLegs, 0);
  const fallback = usable.reduce((sum, r) => sum + r.fallbackLegs, 0);
  const scheduled = usable.reduce((sum, r) => sum + r.scheduled, 0);
  const queueFires = usable.reduce((sum, r) => sum + r.queueFires, 0);
  const filled = usable.reduce((sum, r) => sum + r.beatsFilled, 0);
  const expiredBeats = usable.reduce((sum, r) => sum + r.beatsExpired, 0);
  const complicated = usable.reduce((sum, r) => sum + r.complicatedLegs, 0);
  const checksRolled = usable.reduce((sum, r) => sum + r.checksRolled, 0);
  const chipsTotal = usable.reduce((sum, r) => sum + r.chipsTotal, 0);
  const choicesOffered = usable.reduce((sum, r) => sum + r.choicesOffered, 0);
  const universalOffered = usable.reduce((sum, r) => sum + r.universalOffered, 0);
  const picks = usable.reduce((sum, r) => sum + r.picks, 0);
  const universalPicked = usable.reduce((sum, r) => sum + r.universalPicked, 0);

  return {
    runs,
    coverage: coverageOf(runs, grid),
    completionRate: rate(usable.filter((r) => r.completed).length, usable.length),
    medianLegs: median(usable.map((r) => r.legs)),
    medianDays: median(usable.map((r) => r.days)),
    uneventfulRate: rate(uneventful, totalLegs),
    fallbackRate: rate(fallback, totalLegs),
    neverFired: pack.events.map((e) => e.id).filter((id) => !fired.has(id)),
    scheduled,
    queueFires,
    payoffRate: rate(queueFires, scheduled),
    errors: [...new Set(runs.filter((r) => r.error !== null).map((r) => r.error ?? ''))],
    turnCapHits: runs.filter((r) => r.turnCapHit).length,
    unresolvedThreads: usable.reduce((sum, r) => sum + r.unresolvedThreads, 0),
    queueDrops: usable.reduce((sum, r) => sum + r.queueDrops, 0),
    beatsFilled: filled,
    beatsExpired: expiredBeats,
    beatFillRate: rate(filled, filled + expiredBeats),
    complicationRate: rate(complicated, totalLegs - uneventful),
    meanChipsPerCheck: checksRolled === 0 ? 0 : chipsTotal / checksRolled,
    checksRolled,
    checksUnderTwoChips: usable.reduce((sum, r) => sum + r.checksUnderTwoChips, 0),
    checksOverBand: usable.reduce((sum, r) => sum + r.checksOverBand, 0),
    maxChips: usable.reduce((most, r) => Math.max(most, r.maxChips), 0),
    universalOfferRate: rate(universalOffered, choicesOffered),
    universalPickRate: rate(universalPicked, picks),
    unfillableBeatTypes: pack.unfillableBeatTypes,
  };
}

/**
 * Errored runs COUNT as coverage: the cell was sampled, and whether the engine survived it is a
 * different question the report answers elsewhere. Excluding them would let a route that always
 * errors read as a route that was never tried.
 */
function coverageOf(
  runs: readonly SimRun[],
  grid: { readonly scenarios: number; readonly policies: number },
): GridCoverage {
  return {
    routes: new Set(runs.map((r) => r.routeId)).size,
    routesAvailable: grid.scenarios,
    policies: new Set(runs.map((r) => r.policy)).size,
    policiesAvailable: grid.policies,
    cells: new Set(runs.map((r) => `${r.routeId}/${r.policy}`)).size,
    cellsAvailable: grid.scenarios * grid.policies,
  };
}

function rate(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

/** Integer-indexed, so no float arithmetic decides a reported statistic. */
function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}
