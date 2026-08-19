import { legHours, type TransportMode } from '@odyssey/engine';
import { type FixtureScenario } from './load-pack.ts';
import { type SimSummary } from './run-many.ts';
import { type SimRun } from './run-one.ts';

/**
 * `pnpm sim -- --pack=corpus --runs=280000 --by-route` — the ONLY command that can measure
 * `docs/phase-3-dod.md` gate 9.
 *
 * ## Why this is a SEPARATE OUTPUT MODE and not a section of the report
 *
 * `diff-report.ts` compares the two sim reports **by line index**. Appending a per-route table
 * to `format-report.ts` would offset every line beneath it, so a pure formatting change would
 * force BOTH `docs/sim-baseline.md` and `docs/sim-baseline-corpus.md` to be regenerated — the
 * same class of false positive ADR 0032 exists to prevent, and the reason gate 9 specifies the
 * `--json` precedent by name. A separate mode costs zero baseline movement, and `sim:diff`
 * printing "No change" on both packs after this shipped is the test that it was built right.
 *
 * ## Why the standard error is not optional
 *
 * Gate 9 is a FLOOR — no route below 3% completion — and a floor is a claim about the worst
 * cell, not about the pool. The pooled figure can sit comfortably inside the 30-50% band while
 * a single route is unfinishable, which is the blindness this mode exists to correct. A rate
 * printed without its SE cannot say whether a route reading 3.1% is above the floor or is a
 * 2.7% route that got lucky, so the pass condition names the SE explicitly and the worst row is
 * printed first.
 *
 * _This paragraph used to quote the then-current worst route (4.3-4.8%, a margin of 4.1 SE) in
 * the present tense. It went stale the moment the gate started failing, and a doc comment that
 * describes a passing world is worse than one that describes nothing. Everything above is a
 * statement about the INSTRUMENT; the numbers live in `docs/PROGRESS.md` and in the output._
 *
 * ## Why `peak` is printed next to `hours` (ADR 0044)
 *
 * Because the instrument could not read its own verdict. Gate 9 failed on two routes that were
 * identical in every column this table printed — same profile, same mode, same leg count, total
 * hours within 4.7% — and 7.1x apart in completion, and finding out why cost a whole session.
 *
 * Total hours is the better predictor BETWEEN routes of different lengths. It is blind WITHIN a
 * set whose totals are alike, and a floor gate reads exactly there: drain is charged per hour
 * while recovery arrives per leg, so a route that concentrates its hours into a few legs pays
 * more for the same total. `peak` is that concentration. Both columns are printed because a
 * route can fail on either and the two want different fixes.
 *
 * Every per-route figure in ADR 0041 and `docs/phase-3-verification.md` was produced by a
 * scratchpad harness that was then thrown away, which is why the same measurement kept being
 * rebuilt from scratch. It lives in the repo now.
 */

/** Gate 9's floor. One named constant, so the table and the verdict cannot disagree. */
export const ROUTE_COMPLETION_FLOOR = 0.03;

/**
 * The window `peak` is measured over, in legs. **EMPIRICAL, and labelled as such.**
 *
 * ## Where 9 came from
 *
 * ADR 0044. It is the length of the contiguous montage block measured on
 * `route.illicit.r1dlxpt5` — legs 8-16, billing 232 of that route's 509 travel hours against
 * nine events. So this is the size of the structure the statistic exists to detect, taken from
 * the one case where the structure was identified, not fitted.
 *
 * **It is NOT optimal and nothing here claims it is.** Swept against completion over the
 * 28-route corpus, K = 5 / 9 / 13 give Spearman -0.876 / -0.915 / -0.921: the statistic is
 * insensitive to K across that range and 13 scores marginally better. 9 is kept because a
 * window much shorter than the block it is meant to detect degenerates toward reporting one
 * leg's `MAX_MONTAGE_HOURS` ceiling, and one much longer stops distinguishing a wall from a
 * route that is simply long.
 *
 * ## What would make it wrong
 *
 * The block length is a consequence of montage selection, so anything that changes the SHAPE of
 * a montage run invalidates this number rather than merely retuning it:
 *
 *   - `MAX_MONTAGE_HOURS` or `MAX_MONTAGE_SHARE` moving (`leg-hours.ts`, `leg-plan.ts`);
 *   - the 48-leg compression cap moving, since the block is bounded by the montage budget;
 *   - **the montage SPACING CONSTRAINT ADR 0044 names.** If `planLegs` is taught to refuse a
 *     segment adjacent to one already montaged, contiguous blocks stop existing by construction
 *     and a fixed-width window is the wrong shape for what remains. Re-derive it or retire the
 *     column; do not keep it because it is already here.
 *
 * A parameter-free alternative exists — maximum-subarray over `hours[i] - r`, where `r` is the
 * drain one event repays — and was not taken because it trades this constant for `r`, which has
 * to be measured from content and would drift with every registry change. This one is a fact
 * about route geometry and moves only when route geometry does.
 */
export const PEAK_WINDOW_LEGS = 9;

/**
 * The most travel hours any `window` consecutive legs of a route bill.
 *
 * Exported so its own test can exercise it on hand-built inputs rather than only through a sim
 * summary. Windows shorter than the route are clamped to the route, so a 5-leg route reports its
 * whole hour content and never a slice of a window it does not have.
 */
export function peakWindowHours(perLeg: readonly number[], window: number): number {
  if (perLeg.length === 0 || window < 1) return 0;
  const width = Math.min(window, perLeg.length);
  let running = 0;
  for (let i = 0; i < width; i += 1) running += perLeg[i] ?? 0;
  let peak = running;
  for (let i = width; i < perLeg.length; i += 1) {
    running += (perLeg[i] ?? 0) - (perLeg[i - width] ?? 0);
    if (running > peak) peak = running;
  }
  return peak;
}

export type RouteStat = {
  readonly routeId: string;
  readonly profile: string;
  readonly mode: TransportMode;
  readonly legs: number;
  readonly km: number;
  /**
   * The route's STATIC hour content at its starting mode — `Σ legHours(legKm[i], mode, montage)`.
   *
   * This is the quantity `RoutePreview.travelHours` reports, and the two agree exactly while the
   * per-leg jitter is zero-mean (it has been since C1 made it symmetric). It is deliberately NOT
   * the mean of what the runs accumulated: a route's realised hours are an OUTCOME — a run that
   * dies on leg 6 banks six legs of hours — so averaging them would rank routes by how survivable
   * they are and then offer that as the explanation for how survivable they are.
   *
   * At the STARTING mode only. A run that loses its truck and walks costs more than this says.
   */
  readonly hours: number;
  /**
   * The most travel hours any `PEAK_WINDOW_LEGS` consecutive legs bill — the route's worst
   * stretch, alongside `hours`, which is its total.
   *
   * **Both are printed and neither substitutes for the other**: a route can be unfinishable
   * because it is long or because one stretch of it is brutal, and the two failures need
   * different fixes. `hours` is the better predictor BETWEEN routes of different lengths;
   * this one discriminates WITHIN a set whose totals are alike, which is the case a floor gate
   * has to read and the case `hours` alone is blind to.
   *
   * Derived from the same `legHours` fold as `hours`, at the STARTING mode, so the two are
   * commensurable by construction and `peak <= hours` always holds.
   *
   * Comparable within a leg count, not across one: nine legs is 19% of a 48-leg route and 41%
   * of a 22-leg one. That is a property of a fixed-width window and is why this column supports
   * the verdict rather than deciding it.
   */
  readonly peakHours: number;
  /** Runs that produced a verdict. Errored runs are excluded here and counted separately. */
  readonly runs: number;
  readonly completed: number;
  readonly errors: number;
  readonly rate: number;
  /**
   * Wald standard error of the completion proportion, `sqrt(p(1-p)/n)`.
   *
   * Wald rather than Wilson or Agresti-Coull deliberately: it is what ADR 0041's sweep reported
   * (4.3% ± 0.32pp), so the numbers here are comparable to the ones the knee was chosen against.
   * Its known degeneracy is at `p = 0`, where it returns 0 and claims certainty it does not have
   * — `marginInSe` returns null there rather than dividing, and a route at exactly 0.0% is under
   * the floor by inspection anyway.
   */
  readonly standardError: number;
};

function statOf(routeId: string, scenario: FixtureScenario, runs: readonly SimRun[]): RouteStat {
  const usable = runs.filter((r) => r.error === null);
  const completed = usable.filter((r) => r.completed).length;
  const n = usable.length;
  const rate = n === 0 ? 0 : completed / n;

  const montage = new Set(scenario.route.montageLegs);
  const mode = scenario.transport.mode;
  // ONE fold, two statistics. `hours` is its sum and `peakHours` its worst window, so the two
  // cannot disagree about what a leg costs the way two independent traversals could.
  const perLeg = scenario.route.legKm.map((km, leg) => legHours(km, mode, montage.has(leg)));
  const hours = perLeg.reduce((sum, h) => sum + h, 0);

  return {
    routeId,
    profile: scenario.route.profile,
    mode,
    legs: scenario.route.legCount,
    km: scenario.route.totalKm,
    hours,
    peakHours: peakWindowHours(perLeg, PEAK_WINDOW_LEGS),
    runs: n,
    completed,
    errors: runs.length - n,
    rate,
    standardError: n === 0 ? 0 : Math.sqrt((rate * (1 - rate)) / n),
  };
}

/** How many standard errors a route sits above the floor, or null when the SE is degenerate. */
export function marginInSe(stat: RouteStat): number | null {
  if (stat.standardError <= 0) return null;
  return (stat.rate - ROUTE_COMPLETION_FLOOR) / stat.standardError;
}

/**
 * One row per route, ordered WORST FIRST.
 *
 * Worst-first because the gate is a floor: the row that decides pass or fail is the first one,
 * and a table sorted by route id buries it in the middle. Ties break on route id so the output
 * is stable — a report whose row order depends on `Map` insertion is a report `sim:diff` cannot
 * be pointed at later.
 *
 * A route with NO runs is still a row. Silently dropping it would turn a hole in the grid into
 * a shorter, healthier-looking table, which is exactly the defect `Grid cells sampled` exists
 * to catch one level up.
 */
export function byRouteStats(
  summary: SimSummary,
  scenarios: readonly FixtureScenario[],
): readonly RouteStat[] {
  const runsByRoute = new Map<string, SimRun[]>();
  for (const run of summary.runs) {
    const bucket = runsByRoute.get(run.routeId);
    if (bucket === undefined) runsByRoute.set(run.routeId, [run]);
    else bucket.push(run);
  }

  const stats: RouteStat[] = [];
  for (const scenario of scenarios) {
    const id = String(scenario.route.id);
    stats.push(statOf(id, scenario, runsByRoute.get(id) ?? []));
  }

  return stats.sort((a, b) => a.rate - b.rate || (a.routeId < b.routeId ? -1 : 1));
}

function pct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function pp(value: number): string {
  return `${(value * 100).toFixed(2)}pp`;
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

function padStart(text: string, width: number): string {
  return text.length >= width ? text : ' '.repeat(width - text.length) + text;
}

export type ByRouteMeta = {
  readonly seed: string;
  readonly runs: number;
  readonly pack: string;
  readonly elapsedMs: number;
};

export function formatByRoute(
  summary: SimSummary,
  scenarios: readonly FixtureScenario[],
  meta: ByRouteMeta,
): string {
  const stats = byRouteStats(summary, scenarios);
  const under = stats.filter((s) => s.rate < ROUTE_COMPLETION_FLOOR);
  const worst = stats[0];
  const lines: string[] = [];

  lines.push(
    `# Sim by route — seed=${meta.seed} pack=${meta.pack} runs=${String(meta.runs)}`,
    '',
    `Gate 9 (docs/phase-3-dod.md): NO ROUTE BELOW ${pct(ROUTE_COMPLETION_FLOOR)} COMPLETION.`,
    '',
  );

  // The same marginals guard the standard report carries. A rate averaged over a grid with a
  // hole in it looks entirely healthy, and here it would hide a whole ROUTE — the one unit this
  // mode exists to measure.
  const c = summary.coverage;
  const holes: string[] = [];
  if (c.routes < c.routesAvailable) {
    const missing = c.routesAvailable - c.routes;
    holes.push(`${String(missing)} route${missing === 1 ? '' : 's'}`);
  }
  if (c.policies < c.policiesAvailable) {
    const missing = c.policiesAvailable - c.policies;
    holes.push(`${String(missing)} polic${missing === 1 ? 'y' : 'ies'}`);
  }
  lines.push(
    `Grid cells sampled  ${padStart(String(c.cells), 6)}   (of ${String(c.cellsAvailable)} — ` +
      `${String(c.routes)}/${String(c.routesAvailable)} routes x ` +
      `${String(c.policies)}/${String(c.policiesAvailable)} policies)` +
      (holes.length > 0 ? `   <- ${holes.join(' and ')} NEVER RUN` : ''),
    '',
  );

  const idWidth = Math.max(8, ...stats.map((s) => s.routeId.length));
  lines.push(
    `${pad('route', idWidth)}  ${pad('profile', 8)}  ${pad('mode', 9)}  ${padStart('legs', 4)}  ` +
      `${padStart('km', 6)}  ${padStart('hours', 5)}  ${padStart('peak', 5)}  ` +
      `${padStart('runs', 6)}  ` +
      `${padStart('completion', 10)}  ${padStart('SE', 8)}  ${padStart('vs floor', 10)}`,
  );

  for (const stat of stats) {
    const margin = marginInSe(stat);
    const marginText = margin === null ? 'n/a' : `${margin >= 0 ? '+' : ''}${margin.toFixed(1)} SE`;
    lines.push(
      `${pad(stat.routeId, idWidth)}  ${pad(stat.profile, 8)}  ${pad(stat.mode, 9)}  ` +
        `${padStart(String(stat.legs), 4)}  ${padStart(String(stat.km), 6)}  ` +
        `${padStart(String(stat.hours), 5)}  ${padStart(String(stat.peakHours), 5)}  ` +
        `${padStart(String(stat.runs), 6)}  ` +
        `${padStart(pct(stat.rate), 10)}  ${padStart(pp(stat.standardError), 8)}  ` +
        `${padStart(marginText, 10)}` +
        (stat.rate < ROUTE_COMPLETION_FLOOR ? '   <- BELOW THE FLOOR' : '') +
        (stat.errors > 0 ? `   <- ${String(stat.errors)} errored run(s)` : ''),
    );
  }

  const worstMargin = worst === undefined ? null : marginInSe(worst);
  lines.push(
    '',
    `Routes measured             ${padStart(String(stats.length), 6)}`,
    `Routes below ${pct(ROUTE_COMPLETION_FLOOR)}          ${padStart(String(under.length), 6)}`,
    worst === undefined
      ? 'Worst route                    (none — no routes were sampled)'
      : `Worst route                 ${worst.routeId} at ${pct(worst.rate)} ` +
          `(SE ${pp(worst.standardError)}, ` +
          `${worstMargin === null ? 'margin undefined at p=0' : `${worstMargin >= 0 ? '+' : ''}${worstMargin.toFixed(1)} SE vs the floor`})`,
    `GATE 9                      ${under.length === 0 && stats.length > 0 ? 'PASS' : 'FAIL'}`,
    '',
    `Wall clock ${String(meta.elapsedMs)} ms`,
  );

  return lines.join('\n');
}
