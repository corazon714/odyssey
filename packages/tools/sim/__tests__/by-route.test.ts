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
import { runMany, type SimSummary } from '../run-many.ts';
import { type SimRun } from '../run-one.ts';

const PACK = loadFixturePack();
const SCENARIOS = loadFixtureScenarios();
const OPTIONS = {
  runs: 300,
  seed: 'by-route',
  policies: [],
  diff: false,
  json: false,
  byRoute: true,
  moods: false,
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

describe('acceptance parts 2 and 3 — morale@0 and the ending histogram', () => {
  /**
   * `docs/phase-3-closeout.md` requires THREE things of any montage fix, and completion is only
   * the first. These two columns are the other two, and they shipped BEFORE the fix on purpose:
   * an instrument built and read in the same commit is the circularity ADR 0032 exists to
   * prevent, arriving through the front door.
   *
   * Hand-built runs rather than a simulated corpus, because the properties under test are folds
   * — which population divides, which order the rows take — and a real run cannot be made to
   * exhibit a chosen one on demand.
   */
  const ROUTE = String(SCENARIOS[0]!.route.id);
  const template = SUMMARY.runs[0]!;
  const run = (
    moraleFloored: boolean,
    endings: readonly string[],
    error: string | null = null,
  ): SimRun => ({
    ...template,
    routeId: ROUTE,
    moraleFloored,
    endings: endings as unknown as SimRun['endings'],
    error,
  });
  const summaryOf = (runs: readonly SimRun[]): SimSummary => ({ ...SUMMARY, runs });
  const statFor = (runs: readonly SimRun[]): RouteStat =>
    byRouteStats(summaryOf(runs), SCENARIOS).find((s) => s.routeId === ROUTE)!;

  it('divides morale@0 by the ERROR-FREE population, the same n completion uses', () => {
    // An errored run produced no verdict and therefore no morale trajectory. Counting it in the
    // denominator would dilute the share by exactly the error rate and make a corpus look
    // healthier the more it broke — and the two columns would silently stop being comparable.
    const stat = statFor([
      run(true, []),
      run(false, []),
      run(false, [], 'advanceLeg: SOMETHING'),
      run(false, [], 'advanceLeg: SOMETHING'),
    ]);
    expect(stat.runs).toBe(2);
    expect(stat.errors).toBe(2);
    expect(stat.moraleFloorShare).toBe(0.5);
  });

  it('is a RUN-level share, so a run that sits at the floor counts exactly once', () => {
    expect(
      statFor([run(true, []), run(true, []), run(true, []), run(false, [])]).moraleFloorShare,
    ).toBeCloseTo(0.75, 10);
    expect(statFor([run(false, [])]).moraleFloorShare).toBe(0);
  });

  it('reproduces the contrast ADR 0044 measured — 35.9% against 51.3% at equal completion', () => {
    // The reason this column exists. The two permutations landed 1.7 SE apart on completion and
    // 15pp apart here, so completion alone cannot tell a fix that starves players from one that
    // collapses them. Asserted as arithmetic over a built population, not as a recorded figure.
    const mix = (floored: number, total: number): readonly SimRun[] => [
      ...Array.from({ length: floored }, () => run(true, [])),
      ...Array.from({ length: total - floored }, () => run(false, [])),
    ];
    expect(statFor(mix(359, 1000)).moraleFloorShare).toBeCloseTo(0.359, 10);
    expect(statFor(mix(513, 1000)).moraleFloorShare).toBeCloseTo(0.513, 10);
  });

  it('counts ending UNLOCKS, not runs — a run may unlock more than one', () => {
    const stat = statFor([run(false, ['ending.a', 'ending.b']), run(false, ['ending.a'])]);
    expect(stat.runs).toBe(2);
    expect(stat.endings.reduce((sum, entry) => sum + entry[1], 0)).toBe(3);
    expect(Object.fromEntries(stat.endings)).toEqual({ 'ending.a': 2, 'ending.b': 1 });
  });

  it('orders the histogram by count DESCENDING then id ASCENDING — a total order', () => {
    // The id tiebreak is what makes this diffable. Ordered by Map insertion, the row order would
    // depend on which seed happened to unlock what first, and two identical corpora would print
    // different tables.
    const stat = statFor([
      run(false, ['ending.z', 'ending.a', 'ending.m']),
      run(false, ['ending.m']),
    ]);
    expect(stat.endings.map((entry) => entry[0])).toEqual(['ending.m', 'ending.a', 'ending.z']);
  });

  it('prints both in the table, and neither in the standard report', () => {
    const stat = statFor([run(true, ['ending.a'])]);
    const table = formatByRoute(summaryOf([run(true, ['ending.a'])]), SCENARIOS, {
      seed: 'by-route',
      runs: 1,
      pack: 'fixture',
      elapsedMs: 1,
    });
    expect(stat.moraleFloorShare).toBe(1);
    expect(table).toContain('morale@0');
    expect(table).toContain('ENDINGS PER ROUTE');
    expect(table).toContain('ending.a');

    // The guard that keeps both baselines still. `diff-report.ts` compares by LINE INDEX, so a
    // column leaking into the standard report would move every headline metric beneath it.
    const report = formatReport(SUMMARY, PACK, { seed: 'by-route', runs: 300, elapsedMs: 42 });
    expect(report).not.toContain('morale@0');
    expect(report).not.toContain('ENDINGS PER ROUTE');
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
    moraleFloorShare: 0,
    endings: [],
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

/**
 * THE BASELINE-NEUTRALITY GUARD, asserted rather than argued.
 *
 * `LEGACY_*` below reproduce the format this table printed BEFORE the `morale@0` column existed,
 * copied verbatim from the pre-change formatter. The claim under test is not "morale@0 looks
 * right" — it is **"nothing else moved"**: excise that one field and the table must be
 * byte-identical to what it rendered before.
 *
 * The `peak` column was RETIRED in the same change that added this one (ADR 0046), so the legacy
 * format below is once again the shape the table had before either column existed.
 *
 * That matters because gate 9's whole design is that this mode cannot disturb either sim
 * baseline (ADR 0032/0042). The mode returning before `formatReport` is what makes that true of
 * `docs/sim-baseline*.md`; this is what makes it true of the table's own readers.
 */
const CELL = '  ';
const legacyPad = (t: string, w: number) => (t.length >= w ? t : t + ' '.repeat(w - t.length));
const legacyPadStart = (t: string, w: number) => (t.length >= w ? t : ' '.repeat(w - t.length) + t);

describe('adding `morale@0` changed NOTHING ELSE about the table', () => {
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
   * The `morale@0` cell is `padStart(_, 8)` preceded by its separator, and it sits between `SE`
   * and `vs floor`. Its offset is therefore fixed by the widths of every column to its left.
   */
  const MORALE_AT =
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
    5 +
    CELL.length +
    6 +
    CELL.length +
    10 +
    CELL.length +
    8;
  const MORALE_WIDTH = CELL.length + 8;
  const exciseMorale = (line: string) =>
    line.slice(0, MORALE_AT) + line.slice(MORALE_AT + MORALE_WIDTH);

  it('renders the pre-change header once the morale@0 column is removed', () => {
    const header = TABLE.split('\n').find((l) => l.startsWith('route  '));
    expect(header).toBeDefined();
    expect(header).toContain(legacyPadStart('morale@0', 8));
    // The retired column must not come back by accident.
    expect(header).not.toContain('peak');
    expect(exciseMorale(header ?? '')).toBe(legacyHeader);
  });

  it('renders every pre-change ROW byte-identically once the morale@0 column is removed', () => {
    const lines = TABLE.split('\n');
    // Scoped to the table SECTION. Since the ending histograms shipped, a route id also opens
    // each histogram's header line, so an unscoped scan finds two lines per route and this guard
    // would fail on a block it is not about.
    const endingsAt = lines.findIndex((l) => l.startsWith('ENDINGS PER ROUTE'));
    expect(endingsAt).toBeGreaterThan(0);
    const rows = lines
      .slice(0, endingsAt)
      .filter((l) => stats.some((s) => l.startsWith(s.routeId)));
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

      expect(exciseMorale(row ?? '')).toBe(legacyRow);
    }
  });

  it('leaves every line that is not a route row untouched', () => {
    // The verdict block, the marginals and the title carry no added field, so they must be
    // character-for-character what they were. `Routes below`/`Worst route`/`GATE 9` are what a
    // reader and a future CI check both key on.
    expect(TABLE).toContain('Gate 9 (docs/phase-3-dod.md): NO ROUTE BELOW 3.00% COMPLETION.');
    expect(TABLE).toContain('Grid cells sampled');
    expect(TABLE).toContain('Routes measured');
    expect(TABLE).toContain(`Routes below ${(ROUTE_COMPLETION_FLOOR * 100).toFixed(2)}%`);
    expect(TABLE).toContain('Worst route');
    expect(TABLE).toMatch(/GATE 9 {22}(PASS|FAIL)/);
  });

  it('keeps the per-route columns out of the STANDARD report, which the baselines diff', () => {
    // The column must not reach `format-report.ts`. If it ever did, both baselines would have to
    // regenerate for a change that is purely an instrument improvement — ADR 0032's false
    // positive, arriving by a new route.
    const report = formatReport(SUMMARY, PACK, { seed: 'by-route', runs: 300, elapsedMs: 42 });
    expect(report).not.toContain('morale@0');
    expect(report).not.toContain('vs floor');
  });
});
