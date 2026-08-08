import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEvents, loadModifiers } from '@odyssey/content/loader';
import { findWorkspaceRoot } from '../shared/workspace-root.ts';
import { formatStats } from './format-stats.ts';

/**
 * `pnpm content:stats`.
 *
 * A REPORT, not a gate — it always exits 0 unless the content will not load. `content:lint`
 * is the thing that fails CI; this answers "where is the corpus thin", which is a question
 * with no pass mark. Making it exit non-zero would turn every authoring session into an
 * argument with a threshold nobody chose.
 *
 * A load failure IS fatal, because stats over half-parsed content are worse than none: they
 * would report holes that are really just files that did not read.
 */
const ROOT = findWorkspaceRoot(dirname(fileURLToPath(import.meta.url)));
const CONTENT = join(ROOT, 'packages', 'content');

const events = loadEvents(join(CONTENT, 'events'), CONTENT);
const modifiers = loadModifiers(CONTENT);
const failures = [...events.issues, ...modifiers.issues];

if (failures.length > 0) {
  console.error('content:stats: content did not load — run `pnpm content:lint` for the detail');
  for (const found of failures.slice(0, 5)) {
    console.error(
      `  ${found.file}:${String(found.line)}:${String(found.column)}  ${found.message}`,
    );
  }
  process.exit(1);
}

// eslint-disable-next-line no-console -- the report IS this command's output; stdout is the point.
console.log(formatStats(events.events, modifiers.modifiers));
