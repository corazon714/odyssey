import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { loadGeo, loadGeoOverlay } from '../loader/index.ts';
import { geoNodeSchema, geoOverlaySchema } from '../schema/geo.ts';

/**
 * The geo bundle, checked against the COMMITTED artifacts rather than a synthetic fixture.
 *
 * This file is the only thing in the repo that links `packages/tools/geo-build/write-artifacts.ts`
 * to `packages/content/schema/geo.ts`. They live in different packages, the writer builds
 * strings rather than objects, and nothing typechecks one against the other — so if the writer
 * renames a terse key or adds a field, the schema's `strictObject` catches it HERE and nowhere
 * else. Replacing this with a hand-built fixture would make the whole layer vacuous.
 */

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const loaded = loadGeo(PACKAGE_ROOT);

const temporaryDirectories: string[] = [];
function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'odyssey-geo-'));
  temporaryDirectories.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of temporaryDirectories) rmSync(dir, { recursive: true, force: true });
});

describe('the committed geo artifacts parse', () => {
  it('loads with no issues at all', () => {
    expect(loaded.issues.map((i) => `${i.file}:${i.message}`)).toEqual([]);
    expect(loaded.geo).not.toBeNull();
  });

  it('is a non-empty graph — an empty one would satisfy every assertion below vacuously', () => {
    expect(loaded.geo?.nodes.length ?? 0).toBeGreaterThan(0);
    expect(loaded.geo?.edges.length ?? 0).toBeGreaterThan(0);
  });

  it('carries the coordinates the engine may never see', () => {
    // ADR 0024: `lat`/`lng` are on the RECORD, never on `GeoNode`. The engine bans Math.sqrt/
    // hypot/atan2 (purity.test.ts:71), so a coordinate reaching `GeoNode` would be a field with
    // no legal consumer. Asserted as a property of every node, not a spot check.
    const nodes = loaded.geo?.nodes ?? [];
    for (const record of nodes) {
      expect(Number.isFinite(record.lat)).toBe(true);
      expect(Number.isFinite(record.lng)).toBe(true);
      expect(Math.abs(record.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(record.lng)).toBeLessThanOrEqual(180);
      expect(record.node).not.toHaveProperty('lat');
      expect(record.node).not.toHaveProperty('lng');
      expect(record.node).not.toHaveProperty('name');
    }
  });

  it('agrees with itself about which node set the edges were built against', () => {
    // Both headers are written from the same `nodesDigest()` call in one build. A mismatch
    // means one of the two files was regenerated and the other was not — which is exactly the
    // failure `GEO_NODES_DIGEST_STALE` exists to catch, asserted here for the shipped data.
    expect(loaded.geo?.nodesDigest).toBe(loaded.geo?.edgesNodesDigest);
  });

  it('resolves every edge endpoint to a node', () => {
    const ids = new Set((loaded.geo?.nodes ?? []).map((r) => String(r.node.id)));
    const dangling = (loaded.geo?.edges ?? [])
      .filter((e) => !ids.has(String(e.from)) || !ids.has(String(e.to)))
      .map((e) => String(e.id));
    expect(dangling).toEqual([]);
  });
});

describe('the terse on-disk form is the schema’s input', () => {
  it('rejects a record written with canonical key names', () => {
    // The mistake this stops: `write-artifacts.ts` emits `n`/`t`/`tr`, and a schema over
    // `name`/`type`/`terrain` would reject every real record while passing a hand-built
    // fixture. Pinning the direction keeps the two files honest about which shape is real.
    const canonical = {
      id: 'n.city.g1',
      name: 'Somewhere',
      type: 'city',
      terrain: 'urban',
      elevationM: 10,
      population: 'medium',
      services: [],
      closedMonths: [],
    };
    expect(geoNodeSchema.safeParse(canonical).success).toBe(false);
  });

  it('rejects an unknown key rather than silently dropping it', () => {
    const first = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'geo', 'nodes.gen.json'), 'utf8')) as {
      readonly nodes: readonly Record<string, unknown>[];
    };
    const record = first.nodes[0];
    expect(record).toBeDefined();
    expect(geoNodeSchema.safeParse(record).success).toBe(true);
    expect(geoNodeSchema.safeParse({ ...record, cc: 'PT' }).success).toBe(false);
  });
});

describe('overlay.yaml', () => {
  const overlay = loadGeoOverlay(PACKAGE_ROOT);

  it('parses, and every row names a node that exists', () => {
    expect(overlay.issues).toEqual([]);
    expect(overlay.data).not.toBeNull();

    const ids = new Set((loaded.geo?.nodes ?? []).map((r) => String(r.node.id)));
    const rows = [
      ...(overlay.data?.forcedCorridors ?? []),
      ...(overlay.data?.ferries ?? []),
      ...(overlay.data?.forbiddenCorridors ?? []),
      ...(overlay.data?.tolled ?? []),
    ];
    expect(rows.length).toBeGreaterThan(0);

    const unresolved = rows
      .filter((row) => !ids.has(String(row.from)) || !ids.has(String(row.to)))
      .map((row) => row.reason);
    expect(unresolved).toEqual([]);
  });

  it('requires a reason on every row', () => {
    // The overlay's comments are the most valuable thing in it. An undocumented override is
    // indistinguishable from a mistake six months later, so `reason` is non-empty by schema.
    expect(
      geoOverlaySchema.safeParse({ tolled: [{ from: 'n.city.g1', to: 'n.city.g2', reason: '' }] })
        .success,
    ).toBe(false);
  });

  it('defaults an omitted list to [] rather than undefined (ADR 0009 §2)', () => {
    const parsed = geoOverlaySchema.safeParse({});
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.tolled).toEqual([]);
    expect(parsed.success && parsed.data.criticalEdges).toEqual([]);
  });
});

describe('an absent geo directory is not a finding', () => {
  it('returns null with NO issues when nothing is there', () => {
    // The `readLocale` precedent. A missing-file ContentIssue becomes an error('SCHEMA', …) in
    // content-lint, which would fail lint.test.ts's zero-errors assertion for every milestone
    // before the data lands. Do not "improve" this into an error.
    expect(loadGeo(scratch())).toEqual({ geo: null, issues: [] });
  });

  it('DOES report a half-present directory, which is a different thing', () => {
    const root = scratch();
    mkdirSync(join(root, 'geo'));
    writeFileSync(join(root, 'geo', 'overlay.yaml'), 'tolled: []\n');

    const result = loadGeo(root);
    expect(result.geo).toBeNull();
    expect(result.issues.map((i) => i.file).sort()).toEqual([
      'geo/edges.gen.json',
      'geo/nodes.gen.json',
    ]);
    expect(result.issues[0]?.message).toContain('half-present');
  });
});

describe('the file header is an integrity claim, not decoration', () => {
  const write = (nodes: string): string => {
    const root = scratch();
    mkdirSync(join(root, 'geo'));
    writeFileSync(join(root, 'geo', 'nodes.gen.json'), nodes);
    writeFileSync(
      join(root, 'geo', 'edges.gen.json'),
      JSON.stringify({ _format: [], nodesDigest: '0'.repeat(16), count: 0, edges: [] }),
    );
    writeFileSync(join(root, 'geo', 'overlay.yaml'), 'tolled: []\n');
    return root;
  };

  it('reports a count that disagrees with the array', () => {
    const root = write(
      JSON.stringify({ _format: [], digest: '0'.repeat(16), count: 7, nodes: [] }),
    );
    const result = loadGeo(root);
    expect(result.issues.map((i) => i.message)).toEqual([
      'header says count 7 but the file holds 0 nodes',
    ]);
  });

  it('reports malformed JSON at 1:1 rather than throwing', () => {
    const result = loadGeo(write('{ not json'));
    expect(result.geo).toBeNull();
    expect(result.issues[0]?.file).toBe('geo/nodes.gen.json');
    expect(result.issues[0]?.line).toBe(1);
  });
});
