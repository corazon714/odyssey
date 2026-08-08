import { type Document } from 'yaml';

/**
 * Turning a Zod issue into something a human can paste back.
 *
 * This is the whole reason the loaders use `parseDocument` rather than `parse`. A Zod path
 * like `choices.0.outcomes.2.effects.1` is precise and unusable; `content:lint` has to emit
 * `events/border/bribe_attempt.yaml:34:7`, which means resolving that path against the YAML
 * CST. Shared by both loaders so the two cannot report positions differently.
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

export function offsetToLineCol(
  source: string,
  offset: number,
): { readonly line: number; readonly column: number } {
  const upTo = source.slice(0, Math.max(0, offset));
  const lines = upTo.split('\n');
  return { line: lines.length, column: (lines[lines.length - 1]?.length ?? 0) + 1 };
}

/**
 * Deepest node the path reaches, falling back to its parent, then to the document.
 *
 * The fallback is what makes a MISSING key reportable: there is no node at
 * `choices.0.outcomes.2.weight` when `weight` is absent, so without it every such error would
 * land on line 1 — useless in a 200-line file. Reporting at the map that should have
 * contained the key is the next best true thing.
 */
export function locate(
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

/** Build an issue from either a raw byte offset (YAML parse errors) or a Zod path. */
export function issueAt(
  file: string,
  source: string,
  at: Document | number,
  message: string,
  path: readonly PropertyKey[],
): ContentIssue {
  const position = typeof at === 'number' ? offsetToLineCol(source, at) : locate(at, source, path);
  return {
    file,
    ...position,
    message,
    path: path.filter((s): s is string | number => typeof s !== 'symbol'),
  };
}

/** `path:line:col` — the prefix every `content:lint` report line starts with. */
export function formatIssue(issue: ContentIssue): string {
  return `${issue.file}:${String(issue.line)}:${String(issue.column)}`;
}
