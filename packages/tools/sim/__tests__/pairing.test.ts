import { describe, expect, it } from 'vitest';
import { loadCorpusScenarios, loadFixturePack, loadFixtureScenarios } from '../load-pack.ts';
import { parseArgs } from '../parse-args.ts';
import { POLICY_NAMES, type PolicyName } from '../policy.ts';
import { cellFor, runMany } from '../run-many.ts';

/**
 * The scenario x policy stride, and the TWO properties it has to have at once.
 *
 * **(a) FULL GRID** — over `runs = S*P`, every cell exactly once, for arbitrary counts.
 * **(b) FULL MARGINALS** — a prefix of `max(S, P)` runs already touches every scenario and every
 * policy, because a prefix is what almost every invocation actually runs.
 *
 * This suite has now failed to catch two different bugs, and the second one is why the (b) block
 * exists. `scenario = i % S; policy = i % P` broke (a): S = 25 against P = 5 welded each route to
 * one policy and measured 25 of 125 cells. The mixed-radix odometer that replaced it satisfied
 * (a) unconditionally and broke (b): scenarios on the slow digit meant `--runs=100`, the DEFAULT,
 * touched 20 of 25 routes — the five profiles of the highest leg bucket, because `CORPUS_PAIRS`
 * is ordered by ascending leg bucket — and reported completion 10.6pp optimistic and out of band.
 * **The suite
 * as it stood asserted (a) thirteen ways and passed on the shape it was silently wrong about.**
 *
 * So neither property alone is the guard, and this file proves that rather than asserting it:
 * the old stride passes every (b) test ever written, the odometer passes every (a) test ever
 * written, and `the two properties together` below pins exactly that.
 *
 * EVERY EXPECTATION HERE IS DERIVED FROM THE INPUTS. Nothing asserts a cell count, a route count
 * or a default run count as a literal: all three have moved during this milestone, and a test
 * that hard-codes one has to be edited by the same person who breaks it.
 */

/** The full grid, built from the two counts alone — the answer the stride has to reproduce. */
function fullGrid(scenarioCount: number, policyCount: number): readonly string[] {
  const grid: string[] = [];
  for (let s = 0; s < scenarioCount; s += 1) {
    for (let p = 0; p < policyCount; p += 1) grid.push(`${String(s)},${String(p)}`);
  }
  return grid;
}

type Pairing = (
  i: number,
  scenarioCount: number,
  policyCount: number,
) => {
  readonly scenario: number;
  readonly policy: number;
};

function cellsOver(
  runs: number,
  scenarioCount: number,
  policyCount: number,
  pairing: Pairing = cellFor,
): readonly string[] {
  const cells: string[] = [];
  for (let i = 0; i < runs; i += 1) {
    const cell = pairing(i, scenarioCount, policyCount);
    cells.push(`${String(cell.scenario)},${String(cell.policy)}`);
  }
  return cells;
}

/** The two marginals of a prefix — the axis totals, which is what a truncated run reports on. */
function marginalsOver(
  runs: number,
  scenarioCount: number,
  policyCount: number,
  pairing: Pairing = cellFor,
): { readonly scenarios: number; readonly policies: number } {
  const cells = cellsOver(runs, scenarioCount, policyCount, pairing);
  return {
    scenarios: new Set(cells.map((cell) => cell.split(',')[0])).size,
    policies: new Set(cells.map((cell) => cell.split(',')[1])).size,
  };
}

function sorted(values: readonly string[]): readonly string[] {
  return [...values].sort();
}

/**
 * Shapes chosen to break a stride that leans on ANY arithmetic relationship between the counts,
 * not just the one that was there. Each comment is the reason the row exists.
 */
const SHAPES: readonly (readonly [number, number])[] = [
  [25, 5], // the corpus today. gcd(S,P) = 5 — the first bug; S > P — the second.
  [24, 5], // ONE route plan falling outside the leg band. gcd(S,P) = 1, gcd(S+1,P) = 5.
  [5, 5], // both axes equal.
  [4, 5], // gcd(S+1,P) = 5; the near-miss skew's worst case, 4 of 20 cells.
  [3, 5], // coprime — the fixture pack's own shape, which is why it never showed the first bug.
  [7, 5], // coprime, S > P.
  [1, 5], // one scenario.
  [5, 1], // one policy, e.g. `pnpm sim -- --policy=random`.
  [2, 3], // scenarios < policies, coprime.
  [3, 4], // scenarios < policies, gcd(S+1,P) = 4.
  [6, 4], // gcd(S,P) = 2 and gcd(S+1,P) = 1.
  [9, 6], // gcd(S,P) = 3 and gcd(S+1,P) = 2 — both relationships present at once.
  [1, 1], // degenerate but legal.
];

/** The swept range, wide enough that S = 25 is nowhere near its edge. */
const SWEEP_SCENARIOS = 60;
const SWEEP_POLICIES = 12;

describe('cellFor — property (a): the full grid, for arbitrary counts', () => {
  it.each(SHAPES)(
    'visits every cell exactly once over runs = scenarios x policies (%i x %i)',
    (scenarioCount, policyCount) => {
      const cells = cellsOver(scenarioCount * policyCount, scenarioCount, policyCount);
      expect(new Set(cells).size).toBe(scenarioCount * policyCount);
      expect(sorted(cells)).toEqual(sorted(fullGrid(scenarioCount, policyCount)));
    },
  );

  it('holds for every shape in a swept range, not only the tabled ones', () => {
    // The table above is a set of named traps; this is the general claim. A stride that depends
    // on a factor relationship fails somewhere in here whatever the relationship is.
    const broken: string[] = [];
    for (let scenarioCount = 1; scenarioCount <= SWEEP_SCENARIOS; scenarioCount += 1) {
      for (let policyCount = 1; policyCount <= SWEEP_POLICIES; policyCount += 1) {
        const cells = cellsOver(scenarioCount * policyCount, scenarioCount, policyCount);
        if (new Set(cells).size !== scenarioCount * policyCount) {
          broken.push(
            `${String(scenarioCount)}x${String(policyCount)} covered ${String(new Set(cells).size)}`,
          );
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it('stays uniform over repeated passes, which is what a 2,000-run baseline averages', () => {
    // Every rate in a baseline is a mean over the cells. Uniformity is the property that makes
    // it a mean over the GRID rather than over whichever cells the stride happened to reach.
    for (const [scenarioCount, policyCount] of SHAPES) {
      const passes = 3;
      const cells = cellsOver(passes * scenarioCount * policyCount, scenarioCount, policyCount);
      const counts = new Map<string, number>();
      for (const cell of cells) counts.set(cell, (counts.get(cell) ?? 0) + 1);
      expect(sorted([...counts.keys()])).toEqual(sorted(fullGrid(scenarioCount, policyCount)));
      expect([...counts.values()].every((n) => n === passes)).toBe(true);
    }
  });
});

describe('cellFor — property (b): both marginals inside max(S,P) runs', () => {
  /**
   * THE CLASS OF TEST THAT WAS MISSING. Every assertion above measures the stride at a run count
   * that is an exact multiple of the grid, which is the one count no real invocation uses. The
   * odometer these replaced was correct at `runs = S*P` and wrong at every count below it.
   */
  it.each(SHAPES.filter(([s, p]) => s >= p))(
    'touches every scenario and every policy within max(S,P) runs (%i x %i)',
    (scenarioCount, policyCount) => {
      const seen = marginalsOver(Math.max(scenarioCount, policyCount), scenarioCount, policyCount);
      expect(seen.scenarios).toBe(scenarioCount);
      expect(seen.policies).toBe(policyCount);
    },
  );

  it('holds across the swept range wherever S >= P, which is every shape that can truncate', () => {
    const broken: string[] = [];
    for (let scenarioCount = 1; scenarioCount <= SWEEP_SCENARIOS; scenarioCount += 1) {
      for (
        let policyCount = 1;
        policyCount <= Math.min(scenarioCount, SWEEP_POLICIES);
        policyCount += 1
      ) {
        const seen = marginalsOver(scenarioCount, scenarioCount, policyCount);
        if (seen.scenarios !== scenarioCount || seen.policies !== policyCount) {
          broken.push(
            `${String(scenarioCount)}x${String(policyCount)} saw ${String(seen.scenarios)} scenarios, ${String(seen.policies)} policies`,
          );
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it('reaches only min(S,P) policies when S < P — the known gap, pinned rather than discovered', () => {
    // `policy = (s + q) % P` gives policies `0..S-1` on its first pass, so with fewer scenarios
    // than policies a prefix of P runs cannot show them all. 55 of the 720 swept shapes, all of
    // them 2 <= S < P. It is unreachable from any real invocation — a prefix only biases what it
    // TRUNCATES, and truncation needs runs < S*P, which with P <= 5 and a default of 100 means
    // S >= 20 > P — but it is asserted here so that a future shape change trips a test rather
    // than a baseline. If this ever needs closing, the fix is to put the identity digit on the
    // LONGER axis; it is not a deeper property of the square.
    //
    // Asserted as an EQUALITY, not as a lower bound, on purpose: a pairing that closes the gap
    // is an improvement that must come with an updated comment above, and `>=` would let the
    // documentation and the behaviour drift apart silently. The old two-moduli stride trips this
    // one for exactly that reason — its marginals were always its good half.
    for (const [scenarioCount, policyCount] of SHAPES.filter(([s, p]) => s >= 2 && s < p)) {
      const seen = marginalsOver(Math.max(scenarioCount, policyCount), scenarioCount, policyCount);
      expect(seen.scenarios).toBe(scenarioCount);
      expect(seen.policies).toBe(Math.min(scenarioCount, policyCount));
    }
  });

  it('THE REGRESSION: the real corpus at the real default run count runs every route', () => {
    // The defect, stated in the units it was measured in. Both numbers are read rather than
    // written down: 25 route plans from the committed geo slice, and `parse-args.ts`'s default,
    // which is the invocation CLAUDE.md 5 documents. The odometer scored 20/25 here, dropping
    // the five profiles of the highest leg bucket, and reported completion 52.88% against a
    // full-grid 42.30%, above the top of the 30-50% band. (NOT "the five longest routes": one
    // KEPT route is longer in both km and hours than three of the five dropped.)
    const scenarios = loadCorpusScenarios();
    expect(scenarios.issues).toEqual([]);
    const scenarioCount = scenarios.scenarios.length;
    expect(scenarioCount).toBeGreaterThan(POLICY_NAMES.length);

    const parsed = parseArgs([]);
    if (!parsed.ok) throw new Error(parsed.message);
    const defaultRuns = parsed.options.runs;
    // The premise of the whole test: the default TRUNCATES the grid. If a future default covers
    // it, this test is measuring nothing and should be told so rather than passing quietly.
    expect(defaultRuns).toBeLessThan(scenarioCount * POLICY_NAMES.length);

    const seen = marginalsOver(defaultRuns, scenarioCount, POLICY_NAMES.length);
    expect(seen.scenarios).toBe(scenarioCount);
    expect(seen.policies).toBe(POLICY_NAMES.length);
  });
});

describe('the two properties together are what discriminate', () => {
  /**
   * GUARDS THE GUARD, and it is not decoration — it is the finding that produced this file's
   * second rewrite. Each of these three shipped or was formally proposed, and each passes one of
   * the two property blocks above in full. A suite asserting either property alone would wave one
   * of them through, which is exactly what happened.
   */
  const REJECTED: readonly {
    readonly name: string;
    readonly pairing: Pairing;
    /** Which property this one violates over the shape table. Exact, not "at least". */
    readonly failsGridOn: boolean;
    readonly failsMarginalsOn: boolean;
  }[] = [
    {
      // Shipped for four milestones. Perfect marginals, and a fifth of the grid.
      name: 'old two-moduli stride (i%S, i%P)',
      pairing: (i, s, p) => ({ scenario: i % s, policy: i % p }),
      failsGridOn: true,
      failsMarginalsOn: false,
    },
    {
      // Shipped for one. Perfect grid at runs = S*P, and 20 of 25 routes at the default.
      name: 'mixed-radix odometer (floor(i/P)%S, i%P)',
      pairing: (i, s, p) => ({ scenario: Math.floor(i / p) % s, policy: i % p }),
      failsGridOn: false,
      failsMarginalsOn: true,
    },
    {
      // Proposed as the fix and never shipped: `i` where it must be `i % S`. It reduces to
      // (q*(S+1) + s) % P, which moves the factor trap from S to S+1 rather than removing it —
      // so it breaks the SAME property as the stride it was meant to replace, on a different
      // set of shapes. Its marginals are fine, which is most of why it reads as a fix.
      name: 'near-miss skew (i%S, (i + floor(i/S))%P)',
      pairing: (i, s, p) => ({ scenario: i % s, policy: (i + Math.floor(i / s)) % p }),
      failsGridOn: true,
      failsMarginalsOn: false,
    },
  ];

  function failsGrid(pairing: Pairing): readonly string[] {
    const bad: string[] = [];
    for (const [s, p] of SHAPES) {
      const cells = cellsOver(s * p, s, p, pairing);
      if (new Set(cells).size !== s * p) bad.push(`${String(s)}x${String(p)}`);
    }
    return bad;
  }

  function failsMarginals(pairing: Pairing): readonly string[] {
    const bad: string[] = [];
    for (const [s, p] of SHAPES.filter(([a, b]) => a >= b)) {
      const seen = marginalsOver(Math.max(s, p), s, p, pairing);
      if (seen.scenarios !== s || seen.policies !== p) bad.push(`${String(s)}x${String(p)}`);
    }
    return bad;
  }

  it.each(REJECTED)(
    '$name breaks exactly one property, and passes the other in full',
    ({ pairing, failsGridOn, failsMarginalsOn }) => {
      // The "passes the other in full" half is the load-bearing one. Each of these three was
      // reviewed by someone looking at one property, found clean, and shipped or proposed.
      expect(failsGrid(pairing).length > 0).toBe(failsGridOn);
      expect(failsMarginals(pairing).length > 0).toBe(failsMarginalsOn);
    },
  );

  it('the near-miss skew passes on the corpus shape and fails one route plan away', () => {
    // Why `i` vs `i % S` is not a nitpick. The skew enumerates the grid iff gcd(S+1, P) = 1, so
    // on 25 x 5 — the shape a reviewer would check, because it is the shape in the repo — it is
    // indistinguishable from correct. S = 24 is one out-of-band route plan away.
    const skew: Pairing = (i, s, p) => ({ scenario: i % s, policy: (i + Math.floor(i / s)) % p });
    const covers = (s: number, p: number): number => new Set(cellsOver(s * p, s, p, skew)).size;

    const [live, oneAway] = [
      [25, 5],
      [24, 5],
    ] as const;
    expect(covers(live[0], live[1])).toBe(live[0] * live[1]);
    expect(covers(oneAway[0], oneAway[1])).toBeLessThan(oneAway[0] * oneAway[1]);
    // And the shipped square does not care which of the two it is handed.
    for (const [s, p] of [live, oneAway]) {
      expect(new Set(cellsOver(s * p, s, p)).size).toBe(s * p);
    }
  });

  it('the shipped pairing is the only one of the four that fails neither', () => {
    expect(failsGrid(cellFor)).toEqual([]);
    expect(failsMarginals(cellFor)).toEqual([]);
    for (const { pairing } of REJECTED) {
      expect(failsGrid(pairing).length + failsMarginals(pairing).length).toBeGreaterThan(0);
    }
  });
});

describe('runMany — the stride, end to end', () => {
  const PACK = loadFixturePack();
  const SCENARIOS = loadFixtureScenarios();

  it('pairs every route with every policy exactly once over the grid', () => {
    // Deliberately a shape where the scenario and policy counts SHARE A FACTOR, because that is
    // the shape the old stride collapsed. The fixture pack's natural 3 x 5 is COPRIME and covers
    // its grid either way — which is exactly how this survived into a corpus baseline. Squaring
    // a common size keeps the shared factor whatever either list grows to, rather than pinning
    // a count that would quietly become coprime again.
    const side = Math.min(SCENARIOS.length, POLICY_NAMES.length);
    expect(side).toBeGreaterThan(1);
    const routes = SCENARIOS.slice(0, side);
    const policies: readonly PolicyName[] = POLICY_NAMES.slice(0, side);

    const summary = runMany(PACK, routes, {
      runs: routes.length * policies.length,
      seed: 'stride',
      policies,
      diff: false,
      json: false,
      pack: 'fixture',
    });

    const visited = summary.runs.map((run) => `${run.routeId}/${run.policy}`);
    const expected = routes.flatMap((scenario) =>
      policies.map((policy) => `${scenario.route.id}/${policy}`),
    );
    expect(sorted(visited)).toEqual(sorted(expected));
    expect(summary.coverage.cells).toBe(summary.coverage.cellsAvailable);
  });

  it('runs distinct seeds, so a repeated cell is a repeated cell and not a repeated run', () => {
    const summary = runMany(PACK, SCENARIOS, {
      runs: SCENARIOS.length * POLICY_NAMES.length,
      seed: 'stride',
      policies: [],
      diff: false,
      json: false,
      pack: 'fixture',
    });
    expect(new Set(summary.runs.map((run) => run.seed)).size).toBe(summary.runs.length);
  });

  it('reports full marginals at a TRUNCATED count, measured from the runs themselves', () => {
    // The end-to-end form of property (b), and the one that would have caught the odometer:
    // a count deliberately short of the grid, with the coverage read off what `runOne` was
    // actually handed rather than off `cellFor`.
    //
    // The policy list is SLICED to the scenario count rather than left at five. The fixture's
    // natural 3 x 5 is S < P, which is the documented gap above — this test wrote itself into it
    // on the first attempt and failed, at 3 policies of 5, which is the gap behaving exactly as
    // the unit test says it does.
    const side = Math.min(SCENARIOS.length, POLICY_NAMES.length);
    const policies: readonly PolicyName[] = POLICY_NAMES.slice(0, side);
    const runs = Math.max(SCENARIOS.length, policies.length);
    expect(runs).toBeLessThan(SCENARIOS.length * policies.length);

    const summary = runMany(PACK, SCENARIOS, {
      runs,
      seed: 'truncated',
      policies,
      diff: false,
      json: false,
      pack: 'fixture',
    });

    expect(summary.coverage.routes).toBe(summary.coverage.routesAvailable);
    expect(summary.coverage.policies).toBe(summary.coverage.policiesAvailable);
    expect(summary.coverage.cells).toBe(runs);
    expect(summary.coverage.cellsAvailable).toBe(SCENARIOS.length * policies.length);
  });
});
