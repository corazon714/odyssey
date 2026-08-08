import { loadFixturePack, loadFixtureScenarios } from './load-pack.ts';
import { parseArgs } from './parse-args.ts';
import { runMany, type SimSummary } from './run-many.ts';

/**
 * `pnpm sim -- --runs=1000`.
 *
 * M6 prints the handful of counts the walking-skeleton gate is judged on. The full
 * engine-spec 6 report — endings distribution, choices picked under 2%, resource
 * trajectories, flags never set or read — lands in M10, once there is a director worth
 * measuring.
 */
function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function format(
  summary: SimSummary,
  ms: number,
  runs: number,
  seed: string,
  version: string,
): string {
  const lines = [
    `# Sim Report — seed=${seed} contentVersion=${version.slice(0, 8)} runs=${String(runs)}`,
    '',
    `Completion rate           ${pct(summary.completionRate).padStart(7)}`,
    `Median legs               ${String(summary.medianLegs).padStart(7)}`,
    `Median in-game days       ${String(summary.medianDays).padStart(7)}`,
    `Uneventful legs           ${pct(summary.uneventfulRate).padStart(7)}   (target <2%)`,
    `Fallback legs             ${pct(summary.fallbackRate).padStart(7)}   (target <2%)`,
    `Long-range payoff rate    ${pct(summary.payoffRate).padStart(7)}   (${String(summary.queueFires)}/${String(summary.scheduled)} scheduled)`,
    `Never-fired events        ${String(summary.neverFired.length).padStart(7)}   of ${String(summary.runs.length > 0 ? summary.neverFired.length + firedCount(summary) : 0)}`,
    `Unresolved threads        ${String(summary.unresolvedThreads).padStart(7)}   (promises a run ended owing)`,
    `Beat fill rate            ${pct(summary.beatFillRate).padStart(7)}   (${String(summary.beatsFilled)} filled, ${String(summary.beatsExpired)} missed)`,
    `Queue departures          ${String(summary.queueDrops).padStart(7)}   (fired / expired / evicted)`,
    '',
    `Wall clock                ${String(ms)} ms   (${(ms / runs).toFixed(2)} ms/run)`,
    `Extrapolated to 20,000    ${(((ms / runs) * 20000) / 1000).toFixed(1)} s   (target <30 s)`,
  ];

  if (summary.neverFired.length > 0) {
    lines.push('', '## Never-fired events');
    for (const id of summary.neverFired) lines.push(`  ${id}`);
  }
  if (summary.unfillableBeatTypes.length > 0) {
    lines.push(
      '',
      '## Beat types no event in this pack can fill',
      '   Every slot scheduled for one of these can only expire, so the fill rate above is',
      '   bounded well below 100%. A content gap, not an engine fault.',
    );
    for (const type of summary.unfillableBeatTypes) lines.push(`  ${type}`);
  }
  if (summary.turnCapHits > 0) {
    lines.push('', `## Turn cap hit by ${String(summary.turnCapHits)} run(s) — investigate`);
  }
  if (summary.errors.length > 0) {
    lines.push('', '## Errors');
    for (const error of summary.errors) lines.push(`  ${error}`);
  }

  return lines.join('\n');
}

function firedCount(summary: SimSummary): number {
  const fired = new Set<string>();
  for (const run of summary.runs) for (const id of run.firedEvents) fired.add(id);
  return fired.size;
}

const parsed = parseArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(`sim: ${parsed.message}`);
  console.error('usage: pnpm sim -- --runs=1000 [--seed=base] [--policy=random ...]');
  process.exit(1);
}

const pack = loadFixturePack();
const scenarios = loadFixtureScenarios();

if (pack.danglingRefs.length > 0) {
  console.warn(`sim: ${String(pack.danglingRefs.length)} dangling content reference(s)`);
}

// The one sanctioned wall-clock read outside the app's system-clock adapter is here, in a
// build-time tool that is not the engine — it measures the harness, never the run.
const startedAt = performance.now();
const summary = runMany(pack, scenarios, parsed.options);
const elapsed = Math.round(performance.now() - startedAt);

// The report IS this command's output, so stdout is the point — console.warn/error would
// send a successful run's result to the wrong stream. The disable must sit on the line
// directly above the statement: a second comment line in between silently defuses it.
// eslint-disable-next-line no-console -- see above
console.log(format(summary, elapsed, parsed.options.runs, parsed.options.seed, pack.version));

if (summary.errors.length > 0 || summary.turnCapHits > 0) process.exit(1);
