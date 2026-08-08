import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parseDocument } from 'yaml';
import { type GameEvent } from '@odyssey/engine';
import { gameEventSchema } from '../schema/event.ts';
import { issueAt, type ContentIssue } from './locate.ts';

/**
 * Reads `events/**\/*.yaml` into validated `GameEvent`s.
 *
 * DELIBERATELY NOT EXPORTED FROM `schema/index.ts`. That file is the package entry, so
 * anything it re-exports can reach the app bundle — and this module pulls in `yaml` and
 * `node:fs`, neither of which belongs on a phone. The app consumes a pre-built pack; only
 * build-time tools parse YAML. Import this path directly.
 *
 * Errors are RETURNED, never thrown, and every one carries `file:line:col` — see `locate.ts`.
 */

export type LoadResult = {
  readonly events: readonly GameEvent[];
  readonly issues: readonly ContentIssue[];
};

/** Every `.yaml` under `dir`, recursively, in a stable order. */
export function findEventFiles(dir: string): readonly string[] {
  const found: string[] = [];
  const walk = (current: string): void => {
    // Sorted so the loader is deterministic across filesystems — readdir order is not
    // guaranteed, and an unstable order would make `contentVersion` machine-dependent.
    for (const entry of readdirSync(current).sort()) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.yaml') || entry.endsWith('.yml')) found.push(full);
    }
  };
  walk(dir);
  return found;
}

export function loadEvents(eventsDir: string, rootDir: string = eventsDir): LoadResult {
  const events: GameEvent[] = [];
  const issues: ContentIssue[] = [];

  for (const file of findEventFiles(eventsDir)) {
    const relativePath = relative(rootDir, file).split(sep).join('/');
    const source = readFileSync(file, 'utf8');
    const doc = parseDocument(source, { prettyErrors: false });

    if (doc.errors.length > 0) {
      for (const error of doc.errors) {
        issues.push(issueAt(relativePath, source, error.pos[0], error.message, []));
      }
      continue;
    }

    const parsed = gameEventSchema.safeParse(doc.toJS() as unknown);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        issues.push(issueAt(relativePath, source, doc, issue.message, issue.path));
      }
      continue;
    }

    events.push(parsed.data);
  }

  return { events, issues };
}

export { formatIssue, type ContentIssue } from './locate.ts';
