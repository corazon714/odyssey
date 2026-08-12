import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDocument } from 'yaml';
import type { z } from 'zod';
import {
  geoEdgesFileSchema,
  geoNodesFileSchema,
  geoOverlaySchema,
  type GeoBundle,
} from '../schema/geo.ts';
import { issueAt, type ContentIssue } from './locate.ts';

/**
 * Read `packages/content/geo/` into a validated bundle.
 *
 * ## An ABSENT geo directory is not a finding; a HALF-PRESENT one is
 *
 * This follows `readLocale` (`packages/tools/content-lint/load-content.ts:84-87`) and
 * deliberately NOT `loadComplications`. A missing-file `ContentIssue` becomes an
 * `error('SCHEMA', …)` in `load-content.ts`, which would fail `lint.test.ts`'s zero-errors
 * assertion for every milestone before the data lands — and the registries could take that
 * stance only because they shipped empty files on day one.
 *
 * But "none of the three files exist" and "two of the three exist" are different findings, and
 * only the first is a legitimate state. A partial geo directory means a build wrote one
 * artifact and died, or someone deleted a file by hand; both produce a graph that is wrong
 * rather than absent. So: nothing present is silence, something present obliges the rest.
 *
 * ## Why the `.gen.json` findings land at line 1 and the overlay's do not
 *
 * `locate.ts` resolves a Zod path against a YAML CST, which JSON does not have. That is the
 * price of JSON for the bulk files, and it was paid on purpose: `JSON.parse` on 400 KB is
 * single-digit milliseconds where `yaml.parse` is two orders worse, and this parses at app
 * start. The consequence is a hard requirement on whoever writes a geo lint rule — **name the
 * overlay row that caused the finding, never the generated symptom.** `edges.gen.json:1:1 edge
 * too long` tells nobody anything; the row that forced the corridor is the actionable fact.
 */

const NODES_FILE = 'geo/nodes.gen.json';
const EDGES_FILE = 'geo/edges.gen.json';
const OVERLAY_FILE = 'geo/overlay.yaml';

const GEO_FILES = [NODES_FILE, EDGES_FILE, OVERLAY_FILE] as const;

export type LoadGeoResult = {
  /** `null` when the directory holds no geo files at all, or when any file failed to parse. */
  readonly geo: GeoBundle | null;
  readonly issues: readonly ContentIssue[];
};

export function loadGeo(root: string): LoadGeoResult {
  const present = GEO_FILES.filter((file) => existsSync(join(root, file)));
  if (present.length === 0) return { geo: null, issues: [] };

  const issues: ContentIssue[] = [];
  if (present.length < GEO_FILES.length) {
    for (const file of GEO_FILES) {
      if (present.includes(file)) continue;
      issues.push({
        file,
        line: 1,
        column: 1,
        message:
          'the geo directory is half-present: an absent geo/ is a legitimate state, a partial ' +
          'one means a build wrote some artifacts and not others. Run `pnpm geo:build`.',
        path: [],
      });
    }
    return { geo: null, issues };
  }

  const nodes = readJson(root, NODES_FILE, geoNodesFileSchema);
  const edges = readJson(root, EDGES_FILE, geoEdgesFileSchema);
  const overlay = loadGeoOverlay(root);
  issues.push(...nodes.issues, ...edges.issues, ...overlay.issues);

  if (nodes.data === null || edges.data === null || overlay.data === null) {
    return { geo: null, issues };
  }

  // `count` is an integrity claim in the file's own header, so a mismatch is the file
  // disagreeing with itself — cheaper to catch here than as a downstream node that is not
  // there. Checked in the loader rather than as a Zod refinement so the message can name both
  // numbers; a refinement can only say the object is wrong.
  if (nodes.data.count !== nodes.data.nodes.length) {
    issues.push(countMismatch(NODES_FILE, nodes.data.count, nodes.data.nodes.length, 'nodes'));
  }
  if (edges.data.count !== edges.data.edges.length) {
    issues.push(countMismatch(EDGES_FILE, edges.data.count, edges.data.edges.length, 'edges'));
  }

  return {
    geo: {
      nodes: nodes.data.nodes,
      edges: edges.data.edges,
      overlay: overlay.data,
      nodesDigest: nodes.data.digest,
      edgesNodesDigest: edges.data.nodesDigest,
    },
    issues,
  };
}

function countMismatch(file: string, claimed: number, actual: number, what: string): ContentIssue {
  return {
    file,
    line: 1,
    column: 1,
    message: `header says count ${String(claimed)} but the file holds ${String(actual)} ${what}`,
    path: [],
  };
}

/**
 * `JSON.parse` plus a schema, with both failure modes reported at 1:1.
 *
 * A malformed byte offset is available from a `SyntaxError` on some runtimes and not others,
 * so it is not used: a position that is right under Node and wrong under Bun is worse than one
 * that is honestly always 1:1.
 */
function readJson<T>(
  root: string,
  file: string,
  schema: z.ZodType<T>,
): { readonly data: T | null; readonly issues: readonly ContentIssue[] } {
  const source = readFileSync(join(root, file), 'utf8');

  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'invalid JSON';
    return { data: null, issues: [{ file, line: 1, column: 1, message, path: [] }] };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      data: null,
      issues: parsed.error.issues.map((i) => ({
        file,
        line: 1,
        column: 1,
        message: `${i.path.join('.')}: ${i.message}`,
        path: i.path.filter((s): s is string | number => typeof s !== 'symbol'),
      })),
    };
  }
  return { data: parsed.data, issues: [] };
}

/**
 * The overlay ALONE — the human-authored input, with no dependency on the generated artifacts.
 *
 * `geo-build` needs exactly this and must not use `loadGeo`: the build tool WRITES
 * `nodes.gen.json` and `edges.gen.json`, so requiring them to already parse would make a first
 * build impossible and a rebuild-after-corruption impossible in the same way. The overlay is
 * the only geo file it reads.
 *
 * The overlay is YAML, so its findings get a real file:line:col.
 */
export function loadGeoOverlay(root: string): {
  readonly data: z.infer<typeof geoOverlaySchema> | null;
  readonly issues: readonly ContentIssue[];
} {
  const source = readFileSync(join(root, OVERLAY_FILE), 'utf8');
  const doc = parseDocument(source, { prettyErrors: false });
  if (doc.errors.length > 0) {
    return {
      data: null,
      issues: doc.errors.map((e) => issueAt(OVERLAY_FILE, source, e.pos[0], e.message, [])),
    };
  }

  const parsed = geoOverlaySchema.safeParse(doc.toJS() as unknown);
  if (!parsed.success) {
    return {
      data: null,
      issues: parsed.error.issues.map((i) => issueAt(OVERLAY_FILE, source, doc, i.message, i.path)),
    };
  }
  return { data: parsed.data, issues: [] };
}
