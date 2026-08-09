import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findWorkspaceRoot } from '../shared/workspace-root.ts';
import { diffReports } from './diff-report.ts';
import { formatReport } from './format-report.ts';
import { loadCorpusPack, loadFixturePack, loadFixtureScenarios } from './load-pack.ts';
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
// Routes stay the fixture set for now. They are generic overland routes with start blocks, and
// route GENERATION is Phase 2B `engine/src/route/` — so a corpus-specific route file would be
// inventing the thing that milestone exists to build. Revisit when the seed corpus lands: a
// corpus whose beat types the fixture routes never schedule would report a misleading fill rate.
const scenarios = loadFixtureScenarios();

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
