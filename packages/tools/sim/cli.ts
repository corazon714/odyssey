import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findWorkspaceRoot } from '../shared/workspace-root.ts';
import { diffReports } from './diff-report.ts';
import { formatReport } from './format-report.ts';
import { loadFixturePack, loadFixtureScenarios } from './load-pack.ts';
import { parseArgs } from './parse-args.ts';
import { runMany } from './run-many.ts';

/**
 * `pnpm sim -- --runs=20000` and `pnpm sim:diff`.
 *
 * The report goes to stdout AND to `reports/sim-latest.md`. `reports/` is git-ignored and
 * write-protected by `guard-protected-paths.mjs`, which is right — generated output should
 * never be committed.
 *
 * The BASELINE therefore lives at `docs/sim-baseline.md`, where it is reviewable in a pull
 * request. That placement is the point: a balance change should be visible as a diff somebody
 * signed off on, not as a number that quietly moved between releases.
 */
const ROOT = findWorkspaceRoot(dirname(fileURLToPath(import.meta.url)));
const LATEST_PATH = join(ROOT, 'reports', 'sim-latest.md');
const BASELINE_PATH = join(ROOT, 'docs', 'sim-baseline.md');

const parsed = parseArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(`sim: ${parsed.message}`);
  console.error('usage: pnpm sim -- --runs=1000 [--seed=base] [--policy=random ...] [--diff]');
  process.exit(1);
}

const pack = loadFixturePack();
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

mkdirSync(dirname(LATEST_PATH), { recursive: true });
writeFileSync(LATEST_PATH, `${report}\n`);

// eslint-disable-next-line no-console -- the report IS this command's output; stdout is the point.
console.log(report);

if (parsed.options.diff) {
  const baseline = readBaseline();
  if (baseline === null) {
    console.error(`sim: no baseline at ${BASELINE_PATH} — copy reports/sim-latest.md there.`);
    process.exit(1);
  }

  const diff = diffReports(baseline, report);
  const rendered = diff.changed
    ? ['', '## Diff vs docs/sim-baseline.md', ...diff.lines].join('\n')
    : '\nNo change vs docs/sim-baseline.md.';

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
