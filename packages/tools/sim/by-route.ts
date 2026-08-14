import { legHours, type TransportMode } from '@odyssey/engine';
import { type FixtureScenario } from './load-pack.ts';
import { type SimSummary } from './run-many.ts';
import { type SimRun } from './run-one.ts';

/**
 * `pnpm sim -- --pack=corpus --runs=230000 --by-route` — the ONLY command that can measure
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
 * cell, not about the pool. At the chosen knee the pooled figure reads a comfortable ~43-50%
 * while the worst route has sat at 4.3-4.8%, a margin measured at **4.1 standard errors**. A
 * rate printed without its SE cannot say whether a route that reads 3.1% is above the floor or
 * is a 2.7% route that got lucky, so the pass condition names the SE explicitly.
 *
 * Every per-route figure in ADR 0041 and `docs/phase-3-verification.md` was produced by a
 * scratchpad harness that was then thrown away, which is why the same measurement kept being
 * rebuilt from scratch. It lives in the repo now.
 */

/** Gate 9's floor. One named constant, so the table and the verdict cannot disagree. */
export const ROUTE_COMPLETION_FLOOR = 0.03;

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
  const hours = scenario.route.legKm.reduce(
    (sum, km, leg) => sum + legHours(km, mode, montage.has(leg)),
    0,
  );

  return {
    routeId,
    profile: scenario.route.profile,
    mode,
    legs: scenario.route.legCount,
    km: scenario.route.totalKm,
    hours,
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
      `${padStart('km', 6)}  ${padStart('hours', 5)}  ${padStart('runs', 6)}  ` +
      `${padStart('completion', 10)}  ${padStart('SE', 8)}  ${padStart('vs floor', 10)}`,
  );

  for (const stat of stats) {
    const margin = marginInSe(stat);
    const marginText = margin === null ? 'n/a' : `${margin >= 0 ? '+' : ''}${margin.toFixed(1)} SE`;
    lines.push(
      `${pad(stat.routeId, idWidth)}  ${pad(stat.profile, 8)}  ${pad(stat.mode, 9)}  ` +
        `${padStart(String(stat.legs), 4)}  ${padStart(String(stat.km), 6)}  ` +
        `${padStart(String(stat.hours), 5)}  ${padStart(String(stat.runs), 6)}  ` +
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
