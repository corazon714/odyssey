import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findWorkspaceRoot } from '../shared/workspace-root.ts';
import { diffReports, runCountOf } from './diff-report.ts';
import { formatReport } from './format-report.ts';
import {
  loadCorpusPack,
  loadCorpusScenarios,
  loadFixturePack,
  loadFixtureScenarios,
} from './load-pack.ts';
import { parseArgs } from './parse-args.ts';
import { runMany } from './run-many.ts';

/**
 * `pnpm sim -- --runs=20000` and `pnpm sim:diff`.
 *
 * The report goes to stdout AND to `reports/sim-latest-<pack>.md`. `reports/` is git-ignored and
 * write-protected by `guard-protected-paths.mjs`, which is right — generated output should
 * never be committed.
 *
 * The BASELINE therefore lives under `docs/`, one per pack, where it is reviewable in a pull
 * request. That placement is the point: a balance change should be visible as a diff somebody
 * signed off on, not as a number that quietly moved between releases.
 */
const ROOT = findWorkspaceRoot(dirname(fileURLToPath(import.meta.url)));

const parsed = parseArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(`sim: ${parsed.message}`);
  console.error(
    'usage: pnpm sim -- --runs=1000 [--seed=base] [--policy=random ...] [--pack=fixture|corpus] [--diff] [--json]',
  );
  process.exit(1);
}

/**
 * ONE BASELINE PER PACK, tagged in the filename rather than kept in two hand-managed files.
 *
 * The baseline's whole value is that it predates the change being reviewed. A single file
 * shared by two packs would be overwritten by whichever ran last, and "no change" would mean
 * "no change since somebody else's run" — which is worse than no baseline, because it looks
 * like coverage. `fixture` keeps the historical name so every existing reference and the
 * `sim:diff` in CI keep working.
 */
const LATEST_PATH = join(ROOT, 'reports', `sim-latest-${parsed.options.pack}.md`);
const BASELINE_PATH =
  parsed.options.pack === 'fixture'
    ? join(ROOT, 'docs', 'sim-baseline.md')
    : join(ROOT, 'docs', `sim-baseline-${parsed.options.pack}.md`);

const baselineName = `docs/${basename(BASELINE_PATH)}`;

const loaded = parsed.options.pack === 'corpus' ? loadCorpusPack() : null;
if (loaded !== null && loaded.issues.length > 0) {
  console.error(`sim: the corpus did not load cleanly (${String(loaded.issues.length)} issue(s)):`);
  for (const issue of loaded.issues) console.error(`  ${issue}`);
  process.exit(1);
}

const pack = loaded === null ? loadFixturePack() : loaded.pack;

// M3.10a: the corpus finally runs on GENERATED routes rather than borrowing the fixture's.
// Until now a corpus whose beat types the fixture routes never schedule reported a misleading
// fill rate — the ceiling was 38.5% and nothing said so in the report.
//
// The fixture pack keeps its hand-written routes, deliberately and permanently: it is the
// control the golden runs are built on, and a control that regenerates itself from the geo
// slice is not a control.
const corpusRoutes = parsed.options.pack === 'corpus' ? loadCorpusScenarios() : null;
if (corpusRoutes !== null && corpusRoutes.issues.length > 0) {
  console.error(`sim: corpus routes did not generate (${String(corpusRoutes.issues.length)}):`);
  for (const issue of corpusRoutes.issues) console.error(`  ${issue}`);
  process.exit(1);
}
const scenarios = corpusRoutes === null ? loadFixtureScenarios() : corpusRoutes.scenarios;

// The one sanctioned wall-clock read outside the app's system-clock adapter is here, in a
// build-time tool that is not the engine — it measures the harness, never the run.
const startedAt = performance.now();
const summary = runMany(pack, scenarios, parsed.options);
const elapsedMs = Math.round(performance.now() - startedAt);

const report = formatReport(summary, pack, {
  seed: parsed.options.seed,
  runs: parsed.options.runs,
  elapsedMs,
});

if (parsed.options.json) {
  // The trace, not the report. Only the fields that describe WHAT HAPPENED in order — a
  // 40-field dump would bury the sequence this exists to show.
  const trace = summary.runs.map((run) => ({
    seed: run.seed,
    routeId: run.routeId,
    policy: run.policy,
    legs: run.legs,
    days: run.days,
    completed: run.completed,
    endings: run.endings,
    firedEvents: run.firedEvents,
    choicesPicked: run.choicesPicked,
    error: run.error,
  }));
  // eslint-disable-next-line no-console -- the trace IS this command's output.
  console.log(JSON.stringify(trace, null, 2));
  process.exit(summary.errors.length > 0 ? 1 : 0);
}

mkdirSync(dirname(LATEST_PATH), { recursive: true });
writeFileSync(LATEST_PATH, `${report}\n`);

// eslint-disable-next-line no-console -- the report IS this command's output; stdout is the point.
console.log(report);

if (parsed.options.diff) {
  const baseline = readBaseline();
  if (baseline === null) {
    console.error(`sim: no baseline at ${BASELINE_PATH} — copy ${LATEST_PATH} there.`);
    process.exit(1);
  }

  // A baseline is only comparable against the run count it was GENERATED at. Every rate in it
  // is a sample, and a bigger sample is a different sample — see `runCountOf`.
  const baselineRuns = runCountOf(baseline);
  if (baselineRuns !== null && baselineRuns !== parsed.options.runs) {
    console.error(
      `sim: ${baselineName} was generated at runs=${String(baselineRuns)}, and you asked for ` +
        `runs=${String(parsed.options.runs)}. Those are not comparable — the diff would be ` +
        `sampling noise dressed as a finding. Re-run with --runs=${String(baselineRuns)}, or ` +
        `regenerate the baseline deliberately if the new count is the one you want.`,
    );
    process.exit(1);
  }

  const diff = diffReports(baseline, report);
  const rendered = diff.changed
    ? ['', `## Diff vs ${baselineName}`, ...diff.lines].join('\n')
    : `\nNo change vs ${baselineName}.`;

  // eslint-disable-next-line no-console -- the diff IS this command's output.
  console.log(rendered);
}

if (summary.errors.length > 0 || summary.turnCapHits > 0) process.exit(1);

function readBaseline(): string | null {
  try {
    return readFileSync(BASELINE_PATH, 'utf8');
  } catch {
    return null;
  }
}
