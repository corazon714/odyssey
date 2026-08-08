import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Document, parseDocument } from 'yaml';

/**
 * `--fix`, scoped hard to what is UNAMBIGUOUSLY mechanical.
 *
 * Two operations only: sort a declaration registry by id, and dedupe repeated entries in a
 * list field. Both are order- and set-preserving rewrites with exactly one correct answer,
 * so a `--fix` cannot change what the content MEANS.
 *
 * WHAT IT DELIBERATELY WILL NOT DO:
 *
 *   - Touch i18n. Scaffolding a missing key with a placeholder writes a user-visible string,
 *     which is the rule (2.4) the linter exists to protect. A `--fix` that violates the thing
 *     it enforces is worse than the missing key.
 *   - Hoist a local modifier into the registry. It looks mechanical and is not: the hoisted
 *     row needs an id, a priority, a sourceKind and a stacking decision, none of which are
 *     derivable from the thing being moved. Guessing them writes balance nobody chose.
 *   - Delete anything. Every fix here is a reordering.
 *
 * Returns the human-readable list of what changed, which is the command's output.
 */

const REGISTRIES = ['flags.yaml', 'items.yaml', 'npcs.yaml', 'traits.yaml', 'endings.yaml'];
const LIST_FIELDS = ['tags', 'appliesTo', 'conflictsWith', 'liability', 'addTags'];

export function applyFixes(contentRoot: string): readonly string[] {
  const changed: string[] = [];

  for (const file of REGISTRIES) {
    const path = join(contentRoot, file);
    if (!existsSync(path)) continue;

    const source = readFileSync(path, 'utf8');
    const doc = parseDocument(source);
    if (doc.errors.length > 0) continue; // A parse error is the linter's job to report.

    const entries = doc.toJS() as unknown;
    if (!Array.isArray(entries)) continue;

    const before = JSON.stringify(entries);
    const sorted = sortById(entries.map(dedupeLists));
    if (JSON.stringify(sorted) === before) continue;

    // A FRESH document carrying the original's leading comment block. Those headers explain
    // why each registry exists and losing them to a formatting fix would be a bad trade.
    //
    // Per-ENTRY comments do not survive, which is the honest cost of this fix and the reason
    // it only writes when the sorted output genuinely differs — a no-op run must not quietly
    // strip an author's annotations.
    const rewritten = new Document(sorted);
    if (doc.commentBefore !== null && doc.commentBefore !== undefined) {
      rewritten.commentBefore = doc.commentBefore;
    }
    writeFileSync(path, String(rewritten), 'utf8');
    changed.push(`${file}  sorted by id / deduped list fields`);
  }

  return changed;
}

function sortById(entries: readonly unknown[]): readonly unknown[] {
  return [...entries].sort((a, b) => {
    const left = idOf(a);
    const right = idOf(b);
    if (left === right) return 0;
    return left < right ? -1 : 1;
  });
}

function idOf(entry: unknown): string {
  if (entry === null || typeof entry !== 'object') return '';
  const id = (entry as Record<string, unknown>)['id'];
  return typeof id === 'string' ? id : '';
}

function dedupeLists(entry: unknown): unknown {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return entry;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entry as Record<string, unknown>)) {
    if (LIST_FIELDS.includes(key) && Array.isArray(value)) {
      // Order-preserving dedupe: the first occurrence wins, so a list an author ordered
      // deliberately keeps that order.
      out[key] = [...new Set(value.map((item) => JSON.stringify(item)))].map(
        (json) => JSON.parse(json) as unknown,
      );
      continue;
    }
    out[key] = value;
  }
  return out;
}
