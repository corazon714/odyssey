import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parseDocument, type Document } from 'yaml';
import { type GameEvent } from '@odyssey/engine';
import { gameEventSchema } from '../schema/event.ts';

/**
 * Reads `events/**\/*.yaml` into validated `GameEvent`s.
 *
 * DELIBERATELY NOT EXPORTED FROM `schema/index.ts`. That file is the package entry, so
 * anything it re-exports can reach the app bundle — and this module pulls in `yaml` and
 * `node:fs`, neither of which belongs on a phone. The app consumes a pre-built pack; only
 * build-time tools parse YAML. Import this path directly.
 *
 * Errors are RETURNED, never thrown, and every one carries a file path with a line and
 * column. That is the whole reason this uses `parseDocument` rather than `parse`: the linter
 * has to emit something a human can paste back, and a Zod path like `choices.0.outcomes.2`
 * is not that. Resolving a Zod path against the YAML CST is what turns it into
 * `events/border/bribe_attempt.yaml:34:7`.
 */

export type ContentIssue = {
  /** Repo-relative, forward slashes on every platform, so reports diff across machines. */
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly message: string;
  /** The Zod path, kept for tooling that wants structure rather than a location. */
  readonly path: readonly (string | number)[];
};

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
        const at = offsetToLineCol(source, error.pos[0]);
        issues.push({ file: relativePath, ...at, message: error.message, path: [] });
      }
      continue;
    }

    const parsed = gameEventSchema.safeParse(doc.toJS() as unknown);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        issues.push({
          file: relativePath,
          ...locate(doc, source, issue.path),
          message: issue.message,
          path: issue.path.map((segment) => (typeof segment === 'symbol' ? '?' : segment)),
        });
      }
      continue;
    }

    events.push(parsed.data);
  }

  return { events, issues };
}

/**
 * Resolve a Zod issue path to a line and column in the source.
 *
 * Walks the YAML CST for the deepest node the path reaches, then falls back to its parent —
 * so a missing key reports at the map that should have contained it rather than at line 1,
 * which would be useless in a 200-line file.
 */
function locate(
  doc: Document,
  source: string,
  path: readonly PropertyKey[],
): { readonly line: number; readonly column: number } {
  const segments = path.filter((s): s is string | number => typeof s !== 'symbol');

  for (let depth = segments.length; depth >= 0; depth -= 1) {
    const node: unknown = depth === 0 ? doc.contents : doc.getIn(segments.slice(0, depth), true);
    const range = (node as { readonly range?: readonly number[] } | null)?.range;
    if (range !== undefined && range[0] !== undefined) return offsetToLineCol(source, range[0]);
  }
  return { line: 1, column: 1 };
}

function offsetToLineCol(
  source: string,
  offset: number,
): { readonly line: number; readonly column: number } {
  const upTo = source.slice(0, Math.max(0, offset));
  const lines = upTo.split('\n');
  return { line: lines.length, column: (lines[lines.length - 1]?.length ?? 0) + 1 };
}

/** `path:line:col` — the prefix every `content:lint` report line starts with. */
export function formatIssue(issue: ContentIssue): string {
  return `${issue.file}:${String(issue.line)}:${String(issue.column)}`;
}
