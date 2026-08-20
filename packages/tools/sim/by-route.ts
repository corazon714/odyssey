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
 * ## `peak` WAS RETIRED FROM THIS TABLE (ADR 0046). Do not re-add it without reading this
 *
 * The column printed the most travel hours any nine consecutive legs bill, and its charter was
 * narrow and explicit (ADR 0044): total hours is the better predictor BETWEEN routes of different
 * lengths but is blind WITHIN a set whose totals are alike, and `peak` "is the only printed column
 * that separates them". ADR 0044's own addendum then retired it as a DIAL — two permutations of
 * one route, same leg multiset, reached 9.32% at peak 232 and 8.64% at peak 109, a 2.1x difference
 * in `peak` for 1.7 SE of completion.
 *
 * It survived as a FLAG, with a note attached to its constant saying the montage spacing
 * constraint would invalidate it: "contiguous blocks stop existing by construction and a
 * fixed-width window is the wrong shape for what remains. Re-derive it or retire the column; do
 * not keep it because it is already here."
 *
 * That constraint landed (ADR 0046) and the column was re-measured on the corpus it produced:
 *
 *   - **It fails its own charter.** On the four Beira-Aktobe illicit routes — the exact set it
 *     existed to separate — it now orders them WRONGLY. `r1gjd3s6` has the LOWEST peak of the four
 *     (118) and only the third-best completion (11.32%), while `rskpfno` at peak 134 completes
 *     best at 14.68%.
 *   - **It is dominated globally by a column already printed.** Over the 28 routes,
 *     rho(hours, completion) = -0.956 against the best window's -0.940 (K = 13); K = 9 gives
 *     -0.931. Re-pinning K buys 0.009 on n = 28 — noise, and the same insensitivity ADR 0042
 *     already recorded across K = 5/9/13.
 *   - **Its constant measured a structure that no longer exists.** 9 was the length of
 *     `r1dlxpt5`'s contiguous montage block. Montage runs are capped at two by construction now,
 *     so a nine-leg window is no longer the width of anything.
 *
 * If item #2 (path granularity) needs a concentration statistic, derive one against the route set
 * IT produces, rather than reviving a constant fitted to a shape this constraint deleted.
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
   * Share of error-free runs whose morale reached 0 at any point — acceptance part 2.
   *
   * ADR 0044 identified morale as the BINDING meter, and `docs/phase-3-closeout.md` requires
   * this alongside completion because **completion alone cannot tell two fixes apart**. The two
   * permutations it measured landed 1.7 SE apart on completion (9.32% / 8.64%) and 15pp apart
   * on this (35.9% / 51.3%). A montage fix that clears the floor by starving players slowly and
   * one that clears it by letting them collapse are different games, and pillar 1 says the
   * difference is the finding.
   *
   * Denominated over the ERROR-FREE population, the same `n` the completion rate uses, so the
   * two columns are read against the same denominator.
   */
  readonly moraleFloorShare: number;
  /**
   * The route's ending histogram — acceptance part 3. `[endingId, count]`, descending by count
   * then ascending by id, so the ordering is total and the output is stable enough to diff.
   *
   * Counts UNLOCKS, not runs: `state.unlockedEndings` is a list and a run may unlock more than
   * one, so the counts sum to at least `runs` rather than exactly to it. That is the right
   * population for the comparison the criterion asks for — "which endings does this route
   * produce, against a healthy comparable" — and the header prints the total so nobody reads it
   * as a partition of the runs.
   */
  readonly endings: readonly (readonly [string, number])[];
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
  const floored = usable.filter((r) => r.moraleFloored).length;

  const endingCounts = new Map<string, number>();
  for (const run of usable) {
    for (const ending of run.endings) {
      const id = String(ending);
      endingCounts.set(id, (endingCounts.get(id) ?? 0) + 1);
    }
  }

  const montage = new Set(scenario.route.montageLegs);
  const mode = scenario.transport.mode;
  const hours = scenario.route.legKm
    .map((km, leg) => legHours(km, mode, montage.has(leg)))
    .reduce((sum, h) => sum + h, 0);

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
    moraleFloorShare: n === 0 ? 0 : floored / n,
    // Descending by count, then ASCENDING by id. The id tiebreak is what makes the order total:
    // a histogram ordered by `Map` insertion is one whose row order depends on which seed
    // happened to unlock what first.
    endings: [...endingCounts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)),
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
      `${padStart('km', 6)}  ${padStart('hours', 5)}  ` +
      `${padStart('runs', 6)}  ` +
      `${padStart('completion', 10)}  ${padStart('SE', 8)}  ${padStart('morale@0', 8)}  ` +
      `${padStart('vs floor', 10)}`,
  );

  for (const stat of stats) {
    const margin = marginInSe(stat);
    const marginText = margin === null ? 'n/a' : `${margin >= 0 ? '+' : ''}${margin.toFixed(1)} SE`;
    lines.push(
      `${pad(stat.routeId, idWidth)}  ${pad(stat.profile, 8)}  ${pad(stat.mode, 9)}  ` +
        `${padStart(String(stat.legs), 4)}  ${padStart(String(stat.km), 6)}  ` +
        `${padStart(String(stat.hours), 5)}  ` +
        `${padStart(String(stat.runs), 6)}  ` +
        `${padStart(pct(stat.rate), 10)}  ${padStart(pp(stat.standardError), 8)}  ` +
        `${padStart(pct(stat.moraleFloorShare), 8)}  ` +
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
  );

  // ── ENDING HISTOGRAMS — acceptance part 3 ──────────────────────────────────────────
  //
  // BELOW the table rather than interleaved with it, and that placement is the decision. The
  // table is what the gate is read off — one row per route, worst first, so the row deciding
  // pass or fail is the first line under the header. Indenting a histogram under each row would
  // put a dozen lines between the failing route and its runner-up.
  //
  // Read it by COMPARING a breaching route against a healthy one, which is what
  // `docs/phase-3-closeout.md` asks for: two fixes can reach the same completion through
  // different failure mixes, and this is the only output that can tell them apart.
  lines.push('', 'ENDINGS PER ROUTE — unlocks, not runs; a run may unlock more than one.', '');
  for (const stat of stats) {
    const total = stat.endings.reduce((sum, entry) => sum + entry[1], 0);
    lines.push(
      `${stat.routeId}  (${String(stat.runs)} runs, ${String(total)} unlock` +
        `${total === 1 ? '' : 's'}, completion ${pct(stat.rate)}, ` +
        `morale@0 ${pct(stat.moraleFloorShare)})`,
    );
    if (stat.endings.length === 0) {
      lines.push('    (none unlocked)');
      continue;
    }
    const endingWidth = Math.max(...stat.endings.map((entry) => entry[0].length));
    for (const [id, count] of stat.endings) {
      lines.push(
        `    ${pad(id, endingWidth)}  ${padStart(String(count), 7)}  ` +
          `${padStart(pct(stat.runs === 0 ? 0 : count / stat.runs), 8)}`,
      );
    }
  }

  lines.push('', `Wall clock ${String(meta.elapsedMs)} ms`);

  return lines.join('\n');
}
