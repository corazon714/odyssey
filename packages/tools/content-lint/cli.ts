import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findWorkspaceRoot } from '../shared/workspace-root.ts';
import { applyFixes } from './fix.ts';
import { countBySeverity } from './issue.ts';
import { formatReport } from './format-report.ts';
import { parseArgs } from './parse-args.ts';
import { runLint } from './run-lint.ts';

/**
 * `pnpm content:lint` and `pnpm content:lint -- --fix`.
 *
 * EXIT 1 ON ERROR, 0 WITH WARNINGS. That split is the whole contract: a warning is something a
 * human should look at, and blocking CI on one trains people to suppress it. Errors are
 * content that is wrong.
 *
 * A thin shell over `runLint`, deliberately — everything below it is unit-testable without
 * spawning a process, which is how the sim's CLI is structured and for the same reason.
 */
const ROOT = findWorkspaceRoot(dirname(fileURLToPath(import.meta.url)));
const CONTENT = join(ROOT, 'packages', 'content');

const parsed = parseArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(`content:lint: ${parsed.message}`);
  console.error('usage: pnpm content:lint [-- --fix] [--rules=references,orphan-flags]');
  process.exit(1);
}

if (parsed.options.fix) {
  const fixed = applyFixes(CONTENT);
  for (const line of fixed) {
    // eslint-disable-next-line no-console -- what --fix changed IS this command's output.
    console.log(`fixed  ${line}`);
  }
  if (fixed.length === 0) {
    // eslint-disable-next-line no-console -- same.
    console.log('fixed  nothing to fix');
  }
}

const run = runLint(CONTENT, parsed.options.only);

// eslint-disable-next-line no-console -- the report IS this command's output; stdout is the point.
console.log(formatReport(run));

if (countBySeverity(run.issues).errors > 0) process.exit(1);
