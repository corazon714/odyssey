import { describe, expect, it } from 'vitest';
import {
  byRouteStats,
  formatByRoute,
  marginInSe,
  ROUTE_COMPLETION_FLOOR,
  type RouteStat,
} from '../by-route.ts';
import { formatReport } from '../format-report.ts';
import { loadFixturePack, loadFixtureScenarios } from '../load-pack.ts';
import { parseArgs } from '../parse-args.ts';
import { runMany } from '../run-many.ts';

const PACK = loadFixturePack();
const SCENARIOS = loadFixtureScenarios();
const OPTIONS = {
  runs: 300,
  seed: 'by-route',
  policies: [],
  diff: false,
  json: false,
  byRoute: true,
  pack: 'fixture',
} as const;
const SUMMARY = runMany(PACK, SCENARIOS, OPTIONS);
const TABLE = formatByRoute(SUMMARY, SCENARIOS, {
  seed: 'by-route',
  runs: 300,
  pack: 'fixture',
  elapsedMs: 42,
});

describe('--by-route is a SEPARATE OUTPUT MODE (docs/phase-3-dod.md gate 9)', () => {
  it('parses the valueless flag', () => {
    const parsed = parseArgs(['--by-route']);
    expect(parsed.ok && parsed.options.byRoute).toBe(true);
    expect(parseArgs([]).ok && parseArgs([]).ok).toBe(true);
    const off = parseArgs([]);
    expect(off.ok && off.options.byRoute).toBe(false);
  });

  it('refuses to be combined with the other two output modes', () => {
    // One output per invocation. `--by-route` has no baseline to diff against, and its table is
    // not the per-run trace `--json` emits, so either combination is a mistake about what the
    // command will print rather than a request the tool could honour.
    expect(parseArgs(['--by-route', '--diff']).ok).toBe(false);
    expect(parseArgs(['--by-route', '--json']).ok).toBe(false);
  });

  it('does NOT appear in the standard report — the whole reason it is a separate mode', () => {
    /**
     * THE REGRESSION GUARD THAT MATTERS. `diff-report.ts` compares by LINE INDEX, so a per-route
     * table appended to `format-report.ts` would offset every line beneath it and force BOTH
     * `docs/sim-baseline.md` and `docs/sim-baseline-corpus.md` to regenerate for a change that is
     * purely presentational. Gate 9 names the `--json` precedent for exactly this reason, and
     * ADR 0032 is the record of the false positive it prevents.
     */
    const report = formatReport(SUMMARY, PACK, { seed: 'by-route', runs: 300, elapsedMs: 42 });
    expect(report).not.toContain('Sim by route');
    expect(report).not.toContain('GATE 9');
    expect(report).not.toContain('vs floor');
    // ...and the table is genuinely a different artifact, not a re-print of the report.
    expect(TABLE).not.toContain('## Endings');
    expect(TABLE).not.toContain('Completion rate');
  });
});

describe('byRouteStats', () => {
  it('emits exactly one row per scenario, and loses no run', () => {
    const stats = byRouteStats(SUMMARY, SCENARIOS);
    expect(stats).toHaveLength(SCENARIOS.length);
    expect(new Set(stats.map((s) => s.routeId)).size).toBe(SCENARIOS.length);

    const counted = stats.reduce((sum, s) => sum + s.runs + s.errors, 0);
    expect(counted).toBe(SUMMARY.runs.length);
  });

  it('agrees with the pooled completion rate when it is re-pooled', () => {
    // The per-route split is a PARTITION of the same runs, so re-pooling it must reproduce the
    // number the standard report prints. If these disagree, one of the two is measuring a
    // different population and the gate would be read against the wrong one.
    const stats = byRouteStats(SUMMARY, SCENARIOS);
    const completed = stats.reduce((sum, s) => sum + s.completed, 0);
    const runs = stats.reduce((sum, s) => sum + s.runs, 0);
    expect(completed / runs).toBeCloseTo(SUMMARY.completionRate, 12);
  });

  it('computes the Wald standard error of each rate', () => {
    // The formula, asserted rather than trusted: gate 9's pass condition is stated in SE, and a
    // wrong SE would make a failing margin read as a passing one at the same completion rate.
    for (const stat of byRouteStats(SUMMARY, SCENARIOS)) {
      if (stat.runs === 0) continue;
      expect(stat.standardError).toBeCloseTo(
        Math.sqrt((stat.rate * (1 - stat.rate)) / stat.runs),
        12,
      );
    }
  });

  it('orders WORST FIRST, so the row that decides the gate is the first one', () => {
    const stats = byRouteStats(SUMMARY, SCENARIOS);
    for (let i = 1; i < stats.length; i += 1) {
      expect(stats[i]?.rate).toBeGreaterThanOrEqual(stats[i - 1]?.rate ?? 0);
    }
  });

  it('keeps a route with zero runs as a row rather than shortening the table', () => {
    // A hole in the grid must not present as a smaller, healthier corpus — the same defect
    // `Grid cells sampled` exists to catch one level up.
    const thin = runMany(PACK, SCENARIOS, { ...OPTIONS, runs: 1, seed: 'thin' });
    const stats = byRouteStats(thin, SCENARIOS);
    expect(stats).toHaveLength(SCENARIOS.length);
    expect(stats.filter((s) => s.runs === 0)).toHaveLength(SCENARIOS.length - 1);
    expect(formatByRoute(thin, SCENARIOS, { ...OPTIONS, pack: 'fixture', elapsedMs: 1 })).toContain(
      'NEVER RUN',
    );
  });

  it('reports the route hours a route costs, not the hours its runs happened to bank', () => {
    // A route's hour content is a property of `legKm` and the starting mode. Averaging what the
    // runs accumulated would rank routes by survivability and then offer that as the reason for
    // their survivability — every row must be positive and finite regardless of how its runs went.
    for (const stat of byRouteStats(SUMMARY, SCENARIOS)) {
      expect(stat.hours).toBeGreaterThan(0);
      expect(Number.isInteger(stat.hours)).toBe(true);
      expect(stat.legs).toBeGreaterThan(0);
      expect(stat.km).toBeGreaterThan(0);
    }
  });
});

describe('marginInSe — gate 9 is a margin, not a rate', () => {
  const stat = (rate: number, runs: number): RouteStat => ({
    routeId: 'route.x',
    profile: 'fastest',
    mode: 'bus',
    legs: 22,
    km: 1957,
    hours: 112,
    runs,
    completed: Math.round(rate * runs),
    errors: 0,
    rate,
    standardError: Math.sqrt((rate * (1 - rate)) / runs),
  });

  it('reproduces ADR 0041 arithmetic — 4.3% at SE 0.32pp is 4.1 SE above the floor', () => {
    // The margin the whole gate turns on, and the reason a pooled number cannot stand in for it.
    const thin = stat(0.043, 4000);
    expect(thin.standardError * 100).toBeCloseTo(0.32, 2);
    expect(marginInSe(thin)).toBeCloseTo(4.1, 1);
  });

  it('returns null at p=0 instead of dividing by a degenerate SE', () => {
    // Wald's known failure: zero successes gives SE 0 and a certainty the sample does not have.
    // A route at 0.0% is under the floor by inspection, so nothing is lost by declining to
    // express the margin.
    expect(marginInSe(stat(0, 5000))).toBeNull();
  });

  it('is negative exactly when the route is under the floor', () => {
    expect(marginInSe(stat(ROUTE_COMPLETION_FLOOR - 0.005, 5000))).toBeLessThan(0);
    expect(marginInSe(stat(ROUTE_COMPLETION_FLOOR + 0.005, 5000))).toBeGreaterThan(0);
  });
});

describe('the table states its own verdict', () => {
  it('prints every route, its SE, and the worst route with its margin', () => {
    for (const scenario of SCENARIOS) expect(TABLE).toContain(String(scenario.route.id));
    expect(TABLE).toContain('Worst route');
    expect(TABLE).toContain('SE ');
    expect(TABLE).toContain('Routes below 3.00%');
    expect(TABLE).toContain('Grid cells sampled');
  });

  it('names the floor from one constant, so table and verdict cannot disagree', () => {
    expect(TABLE).toContain(`${(ROUTE_COMPLETION_FLOOR * 100).toFixed(2)}%`);
  });

  it('says FAIL, and marks the row, when a route is under the floor', () => {
    // Guards the guard. A verdict that only ever prints PASS would satisfy every test above.
    const doomed = {
      ...SUMMARY,
      runs: SUMMARY.runs.map((r) => ({ ...r, completed: false })),
    };
    const table = formatByRoute(doomed, SCENARIOS, {
      seed: 'doomed',
      runs: 300,
      pack: 'fixture',
      elapsedMs: 1,
    });
    expect(table).toContain('BELOW THE FLOOR');
    expect(table).toContain('GATE 9                      FAIL');
    expect(TABLE).toContain('GATE 9                      PASS');
  });

  it('is deterministic for the same summary', () => {
    const again = formatByRoute(SUMMARY, SCENARIOS, {
      seed: 'by-route',
      runs: 300,
      pack: 'fixture',
      elapsedMs: 42,
    });
    expect(again).toBe(TABLE);
  });
});
