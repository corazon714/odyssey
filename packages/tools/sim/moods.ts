import { MOOD_IDS, type MoodId } from '@odyssey/engine';
import { type FixtureScenario } from './load-pack.ts';
import { type SimSummary } from './run-many.ts';
import { type SimRun } from './run-one.ts';

/**
 * `pnpm sim -- --pack=corpus --moods` — how much of the game each mood actually covers.
 *
 * ## What this is for
 *
 * `docs/phase-3-closeout.md` §6 argues that mood calibration depends on the state distribution,
 * and gives the example that decides whether the system works at all: "today, on long routes,
 * energy floors by leg 5 and morale sits at 0 for most of the run — so the 'exhausted'
 * presentation would be very nearly always-on." **A palette that never changes is not a reacting
 * world, it is a theme.** This is the instrument that turns that from an argument into a number.
 *
 * It is the reason `moodFromState` lives in `packages/engine/src/presentation/` rather than in
 * `apps/mobile/`: a derivation inside a React component cannot be folded over 28 routes.
 *
 * ## Why a FOURTH output mode and not a section of the report
 *
 * The same reason `--by-route` is a mode (ADR 0042): `diff-report.ts` compares the two sim reports
 * **by line index**, so anything appended to `format-report.ts` offsets every line beneath it and
 * forces BOTH baselines to regenerate for a change that is purely presentational. This mode
 * returns before `formatReport` is called, writes nothing, and therefore cannot move a baseline.
 *
 * There is a second reason here that `--by-route` did not have. **The two modes want different run
 * counts.** Gate 9 is a claim about the WORST CELL and needs 280,000 runs to resolve a tail; mood
 * occupancy is a distributional mean over legs × runs and converges in a fraction of that. Folding
 * it into the gate-9 table would mean reading one of them at a count that is wrong for it.
 */

export type MoodStat = {
  readonly routeId: string;
  readonly profile: string;
  /** Legs sampled on this route across all its error-free runs. */
  readonly legs: number;
  readonly byMood: Readonly<Record<MoodId, number>>;
  /** One sample per run — the ending screen. */
  readonly runs: number;
  readonly terminal: Readonly<Record<MoodId, number>>;
};

function emptyCounts(): Record<MoodId, number> {
  const out = {} as Record<MoodId, number>;
  for (const mood of MOOD_IDS) out[mood] = 0;
  return out;
}

/**
 * One row per route, ordered as `scenarios` are.
 *
 * NOT sorted by any share. `--by-route` sorts worst-first because it is a floor gate and the first
 * row decides pass or fail; this has no verdict to lead with, and a stable order makes two runs
 * comparable line by line.
 */
export function moodStats(
  summary: SimSummary,
  scenarios: readonly FixtureScenario[],
): readonly MoodStat[] {
  const byRoute = new Map<string, SimRun[]>();
  for (const run of summary.runs) {
    const bucket = byRoute.get(run.routeId);
    if (bucket === undefined) byRoute.set(run.routeId, [run]);
    else bucket.push(run);
  }

  const seen = new Set<string>();
  const stats: MoodStat[] = [];
  for (const scenario of scenarios) {
    const id = String(scenario.route.id);
    // `loadCorpusScenarios` yields one scenario per route x policy, so the same route arrives
    // several times. Deduplicated here rather than upstream, because `--by-route` relies on the
    // repetition and this does not.
    if (seen.has(id)) continue;
    seen.add(id);

    const runs = (byRoute.get(id) ?? []).filter((r) => r.error === null);
    const byMood = emptyCounts();
    const terminal = emptyCounts();
    let legs = 0;

    for (const run of runs) {
      for (const mood of MOOD_IDS) {
        const n = run.moodLegs[mood] ?? 0;
        byMood[mood] += n;
        legs += n;
      }
      terminal[run.finalMood] += 1;
    }

    stats.push({
      routeId: id,
      profile: scenario.route.profile,
      legs,
      byMood,
      runs: runs.length,
      terminal,
    });
  }
  return stats;
}

export type MoodTotals = {
  readonly legs: number;
  readonly runs: number;
  readonly byMood: Readonly<Record<MoodId, number>>;
  readonly terminal: Readonly<Record<MoodId, number>>;
  /** Moods no route produced on a single leg — a palette nobody would ever see. */
  readonly neverObserved: readonly MoodId[];
  /**
   * Share of legs that are NOT `default`.
   *
   * **The headline number for calibration.** Pillar 3 says the world REACTS, which presupposes a
   * baseline to react from. At ~100% there is no baseline: every screen is a special case, and
   * `default` is a palette that ships and is never seen. At ~0% the mood system is decorative.
   */
  readonly reactingShare: number;
};

export function moodTotals(stats: readonly MoodStat[]): MoodTotals {
  const byMood = emptyCounts();
  const terminal = emptyCounts();
  let legs = 0;
  let runs = 0;

  for (const stat of stats) {
    legs += stat.legs;
    runs += stat.runs;
    for (const mood of MOOD_IDS) {
      byMood[mood] += stat.byMood[mood];
      terminal[mood] += stat.terminal[mood];
    }
  }

  // Counts LEGS, not terminal samples: a mood reachable only at the ending screen — `triumphant`
  // is the one — is not "never observed", it is terminal. The report prints both tables so the
  // difference is visible rather than inferred.
  const neverObserved = MOOD_IDS.filter((m) => byMood[m] === 0 && terminal[m] === 0);
  const reactingShare = legs === 0 ? 0 : (legs - byMood.default) / legs;

  return { legs, runs, byMood, terminal, neverObserved, reactingShare };
}

function pct(n: number, total: number): string {
  return total === 0 ? '—' : `${((100 * n) / total).toFixed(2)}%`;
}

function pad(t: string, w: number): string {
  return t.length >= w ? t : t + ' '.repeat(w - t.length);
}

function padStart(t: string, w: number): string {
  return t.length >= w ? t : ' '.repeat(w - t.length) + t;
}

export type MoodMeta = {
  readonly seed: string;
  readonly runs: number;
  readonly pack: string;
  readonly elapsedMs: number;
};

export function formatMoods(
  summary: SimSummary,
  scenarios: readonly FixtureScenario[],
  meta: MoodMeta,
): string {
  const stats = moodStats(summary, scenarios);
  const totals = moodTotals(stats);
  const lines: string[] = [];

  lines.push(
    `# Sim mood occupancy — seed=${meta.seed} pack=${meta.pack} runs=${String(meta.runs)}`,
    '',
    'What share of the game each mood actually covers. A mood near 100% is a palette that never',
    'changes; a mood at 0% is a palette nobody will see. Neither is a reacting world.',
    '',
    `Routes measured             ${padStart(String(stats.length), 8)}`,
    `Legs sampled                ${padStart(String(totals.legs), 8)}`,
    `Runs sampled                ${padStart(String(totals.runs), 8)}`,
    `Legs NOT \`default\`          ${padStart(pct(totals.legs - totals.byMood.default, totals.legs), 8)}   <- pillar 3 needs a baseline to react FROM`,
    '',
  );

  // ── per-mood, corpus-wide, with the worst route beside it ────────────────────────────
  //
  // The corpus share alone hides the case that matters: a mood at 5% corpus-wide and 90% on one
  // route is always-on for anyone who plays that route, and route choice is the player's first
  // meaningful decision. So the peak is printed next to the mean, the same argument gate 9 makes
  // about pooled completion.
  const idWidth = Math.max(10, ...MOOD_IDS.map((m) => m.length));
  lines.push(
    `${pad('mood', idWidth)}  ${padStart('legs', 9)}  ${padStart('corpus', 8)}  ` +
      `${padStart('peak route', 8)}  route`,
  );
  for (const mood of MOOD_IDS) {
    let peakShare = 0;
    let peakRoute = '—';
    for (const stat of stats) {
      if (stat.legs === 0) continue;
      const share = stat.byMood[mood] / stat.legs;
      if (share > peakShare) {
        peakShare = share;
        peakRoute = stat.routeId;
      }
    }
    lines.push(
      `${pad(mood, idWidth)}  ${padStart(String(totals.byMood[mood]), 9)}  ` +
        `${padStart(pct(totals.byMood[mood], totals.legs), 8)}  ` +
        `${padStart(`${(peakShare * 100).toFixed(2)}%`, 8)}  ${peakRoute}`,
    );
  }

  // ── terminal moods ───────────────────────────────────────────────────────────────────
  lines.push(
    '',
    'TERMINAL MOOD — the ending screen, one sample per run. `triumphant` lives ONLY here.',
    '',
  );
  for (const mood of MOOD_IDS) {
    if (totals.terminal[mood] === 0) continue;
    lines.push(
      `${pad(mood, idWidth)}  ${padStart(String(totals.terminal[mood]), 9)}  ` +
        `${padStart(pct(totals.terminal[mood], totals.runs), 8)}`,
    );
  }

  lines.push(
    '',
    totals.neverObserved.length === 0
      ? 'NEVER OBSERVED              (none) — every mood in the vocabulary is reachable'
      : `NEVER OBSERVED              ${totals.neverObserved.join(' · ')}   <- palette nobody will see`,
    '',
    `Wall clock ${String(meta.elapsedMs)} ms`,
  );

  return lines.join('\n');
}
