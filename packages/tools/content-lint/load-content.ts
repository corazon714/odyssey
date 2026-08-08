import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadDeclarations,
  loadEvents,
  loadModifiers,
  type ContentIssue,
  type Declarations,
} from '@odyssey/content/loader';
import { type GameEvent, type ModifierRegistry } from '@odyssey/engine';
import { error, type LintIssue } from './issue.ts';

/**
 * Everything the rules read, loaded once.
 *
 * Schema failures come back as `ContentIssue`s from the loaders and are converted straight to
 * `SCHEMA` errors — the loaders already resolved a Zod path to a line and column, which is the
 * whole reason they use `parseDocument`.
 *
 * When a file fails to parse, the rules below still run on whatever DID load. A linter that
 * gives up on the first bad file makes fixing a batch of content an N-round trip.
 */
export type ContentBundle = {
  readonly root: string;
  readonly events: readonly GameEvent[];
  readonly declarations: Declarations;
  readonly modifiers: ModifierRegistry;
  /** en/ keys, or null when the locale has no files at all — a different finding. */
  readonly locale: ReadonlyMap<string, string> | null;
  /** images/manifest.json refs, or null when the manifest does not exist. */
  readonly images: ReadonlySet<string> | null;
  readonly issues: readonly LintIssue[];
};

export function loadContent(root: string): ContentBundle {
  const issues: LintIssue[] = [];
  const toLint = (found: ContentIssue): LintIssue =>
    error('SCHEMA', found.file, found.message, found.line, found.column);

  const events = loadEvents(join(root, 'events'), root);
  issues.push(...events.issues.map(toLint));

  const declarations = loadDeclarations(root);
  issues.push(...declarations.issues.map(toLint));

  const modifiers = loadModifiers(root);
  issues.push(...modifiers.issues.map(toLint));

  return {
    root,
    events: events.events,
    declarations: declarations.declarations,
    modifiers: modifiers.modifiers,
    locale: readLocale(join(root, 'i18n', 'en')),
    images: readImageManifest(join(root, 'images', 'manifest.json')),
    issues,
  };
}

/**
 * Flatten `i18n/en/*.json` into dotted keys.
 *
 * Returns null when the directory holds no JSON at all, which is a DIFFERENT finding from "a
 * key is missing". Reporting a hundred missing keys when the real problem is one absent
 * locale buries the cause under its own consequences.
 */
function readLocale(dir: string): ReadonlyMap<string, string> | null {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((name) => name.endsWith('.json'));
  if (files.length === 0) return null;

  const out = new Map<string, string>();
  for (const file of files) {
    const parsed: unknown = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    flatten(parsed, '', out);
  }
  return out;
}

function flatten(value: unknown, prefix: string, out: Map<string, string>): void {
  if (typeof value === 'string') {
    out.set(prefix, value);
    return;
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return;
  for (const [key, child] of Object.entries(value)) {
    flatten(child, prefix === '' ? key : `${prefix}.${key}`, out);
  }
}

function readImageManifest(path: string): ReadonlySet<string> | null {
  if (!existsSync(path)) return null;
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (parsed === null || typeof parsed !== 'object') return new Set();
  return new Set(Object.keys(parsed));
}
