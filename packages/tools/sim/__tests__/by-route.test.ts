import { describe, expect, it } from 'vitest';
import {
  byRouteStats,
  formatByRoute,
  marginInSe,
  peakWindowHours,
  PEAK_WINDOW_LEGS,
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
    peakHours: 47,
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

describe('peakWindowHours — the worst stretch, not the total', () => {
  it('is the maximum over every window of the given width', () => {
    // Hand-built so the expected answer is arithmetic rather than whatever the corpus happens
    // to produce: the worst three of [1,2,9,9,1,1] are the 9,9 pair plus a neighbour.
    expect(peakWindowHours([1, 2, 9, 9, 1, 1], 3)).toBe(20);
    expect(peakWindowHours([1, 2, 9, 9, 1, 1], 1)).toBe(9);
    expect(peakWindowHours([5, 5, 5, 5], 2)).toBe(10);
  });

  it('separates a WALL from a flat route at identical totals — the whole point', () => {
    // The two shapes ADR 0044 is about, reduced to nine legs each. Same sum, same length; a
    // statistic that cannot tell these apart cannot see what gate 9 failed on.
    const flat = [10, 10, 10, 10, 10, 10, 10, 10, 10];
    const wall = [2, 2, 2, 30, 30, 20, 2, 1, 1];
    expect(flat.reduce((a, b) => a + b, 0)).toBe(wall.reduce((a, b) => a + b, 0));
    expect(peakWindowHours(flat, 3)).toBe(30);
    expect(peakWindowHours(wall, 3)).toBe(80);
  });

  it('clamps a window wider than the route to the route', () => {
    // A 5-leg route has no 9-leg window. Reporting its whole hour content is right; reporting a
    // slice of a window it does not have, or zero, would both be lies about a short route.
    expect(peakWindowHours([3, 4, 5], 9)).toBe(12);
    expect(peakWindowHours([], 9)).toBe(0);
    expect(peakWindowHours([7], 9)).toBe(7);
  });

  it('never exceeds the total, and equals it exactly when the route fits the window', () => {
    for (const stat of byRouteStats(SUMMARY, SCENARIOS)) {
      expect(stat.peakHours).toBeLessThanOrEqual(stat.hours);
      expect(Number.isInteger(stat.peakHours)).toBe(true);
      if (stat.legs <= PEAK_WINDOW_LEGS) expect(stat.peakHours).toBe(stat.hours);
    }
  });
});

/**
 * THE BASELINE-NEUTRALITY GUARD, asserted rather than argued.
 *
 * `LEGACY_*` below reproduce the format this table printed BEFORE the `peak` column existed,
 * copied verbatim from the pre-change formatter. The claim under test is not "peak looks right"
 * — it is **"nothing else moved"**: excise the peak field and the table must be byte-identical
 * to what it rendered before.
 *
 * That matters because gate 9's whole design is that this mode cannot disturb either sim
 * baseline (ADR 0032/0042). The mode returning before `formatReport` is what makes that true of
 * `docs/sim-baseline*.md`; this is what makes it true of the table's own readers.
 */
const CELL = '  ';
const legacyPad = (t: string, w: number) => (t.length >= w ? t : t + ' '.repeat(w - t.length));
const legacyPadStart = (t: string, w: number) => (t.length >= w ? t : ' '.repeat(w - t.length) + t);

describe('adding `peak` changed NOTHING ELSE about the table', () => {
  const stats = byRouteStats(SUMMARY, SCENARIOS);
  const idWidth = Math.max(8, ...stats.map((s) => s.routeId.length));

  /** The header exactly as it read before the peak column. */
  const legacyHeader =
    legacyPad('route', idWidth) +
    CELL +
    legacyPad('profile', 8) +
    CELL +
    legacyPad('mode', 9) +
    CELL +
    legacyPadStart('legs', 4) +
    CELL +
    legacyPadStart('km', 6) +
    CELL +
    legacyPadStart('hours', 5) +
    CELL +
    legacyPadStart('runs', 6) +
    CELL +
    legacyPadStart('completion', 10) +
    CELL +
    legacyPadStart('SE', 8) +
    CELL +
    legacyPadStart('vs floor', 10);

  /**
   * The peak cell is `padStart(_, 5)` preceded by its separator, and it sits immediately after
   * `hours`. Its offset is therefore fixed by the widths of the columns to its left.
   */
  const PEAK_AT =
    idWidth +
    CELL.length +
    8 +
    CELL.length +
    9 +
    CELL.length +
    4 +
    CELL.length +
    6 +
    CELL.length +
    5;
  const PEAK_WIDTH = CELL.length + 5;
  const excisePeak = (line: string) => line.slice(0, PEAK_AT) + line.slice(PEAK_AT + PEAK_WIDTH);

  it('renders the pre-change header once the peak column is removed', () => {
    const header = TABLE.split('\n').find((l) => l.startsWith('route  '));
    expect(header).toBeDefined();
    expect(header).toContain(legacyPadStart('peak', 5));
    expect(excisePeak(header ?? '')).toBe(legacyHeader);
  });

  it('renders every pre-change ROW byte-identically once the peak column is removed', () => {
    const lines = TABLE.split('\n');
    const rows = lines.filter((l) => stats.some((s) => l.startsWith(s.routeId)));
    expect(rows).toHaveLength(stats.length);

    for (const stat of stats) {
      const row = rows.find((l) => l.startsWith(stat.routeId));
      const margin = marginInSe(stat);
      const marginText =
        margin === null ? 'n/a' : `${margin >= 0 ? '+' : ''}${margin.toFixed(1)} SE`;
      const legacyRow =
        legacyPad(stat.routeId, idWidth) +
        CELL +
        legacyPad(stat.profile, 8) +
        CELL +
        legacyPad(stat.mode, 9) +
        CELL +
        legacyPadStart(String(stat.legs), 4) +
        CELL +
        legacyPadStart(String(stat.km), 6) +
        CELL +
        legacyPadStart(String(stat.hours), 5) +
        CELL +
        legacyPadStart(String(stat.runs), 6) +
        CELL +
        legacyPadStart(`${(stat.rate * 100).toFixed(2)}%`, 10) +
        CELL +
        legacyPadStart(`${(stat.standardError * 100).toFixed(2)}pp`, 8) +
        CELL +
        legacyPadStart(marginText, 10) +
        (stat.rate < ROUTE_COMPLETION_FLOOR ? '   <- BELOW THE FLOOR' : '') +
        (stat.errors > 0 ? `   <- ${String(stat.errors)} errored run(s)` : '');

      expect(excisePeak(row ?? '')).toBe(legacyRow);
    }
  });

  it('leaves every line that is not a route row untouched', () => {
    // The verdict block, the marginals and the title carry no peak field, so they must be
    // character-for-character what they were. `Routes below`/`Worst route`/`GATE 9` are what a
    // reader and a future CI check both key on.
    expect(TABLE).toContain('Gate 9 (docs/phase-3-dod.md): NO ROUTE BELOW 3.00% COMPLETION.');
    expect(TABLE).toContain('Grid cells sampled');
    expect(TABLE).toContain('Routes measured');
    expect(TABLE).toContain(`Routes below ${(ROUTE_COMPLETION_FLOOR * 100).toFixed(2)}%`);
    expect(TABLE).toContain('Worst route');
    expect(TABLE).toMatch(/GATE 9 {22}(PASS|FAIL)/);
  });

  it('keeps `peak` out of the STANDARD report, which is what the baselines diff', () => {
    // The column must not reach `format-report.ts`. If it ever did, both baselines would have to
    // regenerate for a change that is purely an instrument improvement — ADR 0032's false
    // positive, arriving by a new route.
    const report = formatReport(SUMMARY, PACK, { seed: 'by-route', runs: 300, elapsedMs: 42 });
    expect(report).not.toContain('peak');
    expect(report).not.toContain('vs floor');
  });
});
