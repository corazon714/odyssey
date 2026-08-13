import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  edgeId,
  modeMask,
  nodeId,
  serviceMask,
  type GeoEdge,
  type GeoNode,
  type LocationType,
} from '@odyssey/engine';
import { type GeoBundle, type GeoNodeRecord } from '@odyssey/content';
import { MIN_LANDMASS_NODES } from '../../geo-build/connectivity.ts';
import { nodesDigest } from '../../geo-build/write-artifacts.ts';
import {
  UNDECLARED_BRANCH_BUDGET,
  geoGraph,
  geoNameFieldMisplaced,
  geoOsmSource,
  geoPlaceBehaviour,
} from '../rules-geo.ts';
import { type ContentBundle } from '../load-content.ts';
import { runLint } from '../run-lint.ts';
import { findWorkspaceRoot } from '../../shared/workspace-root.ts';

/**
 * Every geo rule, fired against a deliberate violation.
 *
 * ALL OF THEM ARE SILENT ON THE SHIPPED CORPUS, which is the correct result and exactly why
 * they need this file: a rule that has never fired is a rule nobody has checked. That lesson
 * cost `REGION_MODIFIER_NOT_DOCUMENT` a session, and `ZERO_WEIGHT_CHOICE` turned out to be
 * unreachable through the loader entirely.
 *
 * The graph rules take a synthetic bundle; the three text rules need real bytes on disk,
 * because scanning raw source is the whole point of them.
 */

const ROOT = findWorkspaceRoot(dirname(fileURLToPath(import.meta.url)));
const CONTENT = join(ROOT, 'packages', 'content');

const temporary: string[] = [];
function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'odyssey-geolint-'));
  temporary.push(dir);
  mkdirSync(join(dir, 'geo'));
  return dir;
}
afterAll(() => {
  for (const dir of temporary) rmSync(dir, { recursive: true, force: true });
});

// ── builders ───────────────────────────────────────────────────────────────────────────

function node(
  id: string,
  type: LocationType = 'city',
  name: string | null = 'Somewhere',
): GeoNodeRecord {
  const built: GeoNode = {
    id: nodeId(id),
    type,
    terrain: 'plain',
    elevationM: 10,
    population: 'medium',
    services: serviceMask(['fuel']),
    closedMonths: [],
  };
  return { node: built, name, lat: 0, lng: 0 };
}

function edge(id: string, from: string, to: string): GeoEdge {
  return {
    id: edgeId(id),
    from: nodeId(from),
    to: nodeId(to),
    distanceKm: 100,
    modes: modeMask(['car']),
    terrainDifficulty: 1,
    scenic: 1,
    seasonality: 'all_year',
    tolled: false,
    adminBoundary: false,
    unavoidable: false,
  };
}

const EMPTY_OVERLAY: GeoBundle['overlay'] = {
  forcedCorridors: [],
  ferries: [],
  forbiddenCorridors: [],
  tolled: [],
  criticalEdges: [],
};

/** Digest computed from the node set, so `GEO_NODES_DIGEST_STALE` stays quiet unless tested. */
function geoOf(
  nodes: readonly GeoNodeRecord[],
  edges: readonly GeoEdge[],
  overlay: Partial<GeoBundle['overlay']> = {},
): GeoBundle {
  const digest = nodesDigest(nodes.map((r) => r.node));
  return {
    nodes,
    edges,
    overlay: { ...EMPTY_OVERLAY, ...overlay },
    nodesDigest: digest,
    edgesNodesDigest: digest,
  };
}

const bundleOf = (geo: GeoBundle | null, root = CONTENT): ContentBundle =>
  ({ root, geo }) as unknown as ContentBundle;

const rulesIn = (issues: readonly { readonly rule: string }[]): readonly string[] =>
  issues.map((i) => i.rule);

/**
 * A connected component of `count` nodes, closed into a RING at 3 or more.
 *
 * ADR 0036 made `GEO_DISCONNECTED` a fragment check rather than a component count, so a healthy
 * fixture now has to clear `MIN_LANDMASS_NODES` — the three-node line this replaced is a
 * fragment, and correctly reports as one.
 *
 * The ring is not decoration: a pure chain makes EVERY edge a Tarjan bridge, so a 45-node chain
 * trips `GEO_UNDECLARED_BRIDGE` and a "healthy graph" fixture would be anything but. A ring has
 * no bridges at all, which is what lets these tests assert silence.
 */
function chain(count: number, prefix = 'n.city.c'): { nodes: GeoNodeRecord[]; edges: GeoEdge[] } {
  const nodes = Array.from({ length: count }, (_, i) => node(`${prefix}${String(i)}`));
  const edges = Array.from({ length: count - 1 }, (_, i) =>
    edge(`e.${prefix}${String(i)}`, `${prefix}${String(i)}`, `${prefix}${String(i + 1)}`),
  );
  if (count >= 3) {
    edges.push(edge(`e.${prefix}close`, `${prefix}${String(count - 1)}`, `${prefix}0`));
  }
  return { nodes, edges };
}

const LANDMASS = chain(MIN_LANDMASS_NODES + 5);
const LINE = geoOf(LANDMASS.nodes, LANDMASS.edges);

// ── graph rules ────────────────────────────────────────────────────────────────────────

describe('geoGraph is silent on a healthy graph and on no graph at all', () => {
  it('says nothing about a connected line', () => {
    expect(geoGraph(bundleOf(LINE))).toEqual([]);
  });

  it('says nothing when there is no geo data', () => {
    expect(geoGraph(bundleOf(null))).toEqual([]);
  });

  it('says nothing when the key is ABSENT rather than null', () => {
    // Synthetic bundles omit the key entirely. `undefined !== null` would walk into `geo.nodes`
    // and throw — the same trap ADR 0021 records in `migrate_3_to_4`.
    expect(geoGraph({ root: CONTENT } as unknown as ContentBundle)).toEqual([]);
  });
});

describe('GEO_DISCONNECTED — a FRAGMENT check since ADR 0036, not a component count', () => {
  it('accepts two landmasses, which the old component-count rule forbade', () => {
    // The rule change in one assertion. Two separate continents are a legal map; the old rule
    // made a world map impossible, because no overlay row can land-connect the Americas to
    // Eurasia.
    const a = chain(MIN_LANDMASS_NODES + 2, 'n.city.a');
    const b = chain(MIN_LANDMASS_NODES + 2, 'n.city.b');
    const geo = geoOf([...a.nodes, ...b.nodes], [...a.edges, ...b.edges]);
    expect(rulesIn(geoGraph(bundleOf(geo)))).not.toContain('GEO_DISCONNECTED');
  });

  it('fires on a fragment cut off from every landmass, and names its nodes', () => {
    const big = chain(MIN_LANDMASS_NODES + 2, 'n.city.m');
    const island = chain(3, 'n.city.isle');
    const geo = geoOf([...big.nodes, ...island.nodes], [...big.edges, ...island.edges]);

    const found = geoGraph(bundleOf(geo)).find((i) => i.rule === 'GEO_DISCONNECTED');
    expect(found?.severity).toBe('error');
    expect(found?.message).toContain('3 node(s)');
    expect(found?.message).toContain('n.city.isle0');
    // The fix is an overlay row or a narrower bbox, and the message has to say so: the file it
    // points at is generated and cannot be edited by hand.
    expect(found?.message).toContain('overlay.yaml');
  });

  it('reports every fragment separately, because each is its own decision', () => {
    // Ferry it in, or drop it from the slice. One aggregated finding cannot be acted on.
    const big = chain(MIN_LANDMASS_NODES + 2, 'n.city.m');
    const one = chain(2, 'n.city.x');
    const two = chain(2, 'n.city.y');
    const geo = geoOf(
      [...big.nodes, ...one.nodes, ...two.nodes],
      [...big.edges, ...one.edges, ...two.edges],
    );
    expect(geoGraph(bundleOf(geo)).filter((i) => i.rule === 'GEO_DISCONNECTED')).toHaveLength(2);
  });
});

describe('GEO_ORPHAN_NODE', () => {
  it('fires on a node with no edge at all', () => {
    const geo = geoOf(
      [node('n.city.a'), node('n.city.b'), node('n.city.lonely')],
      [edge('e.ab', 'n.city.a', 'n.city.b')],
    );
    const issues = geoGraph(bundleOf(geo));
    const found = issues.find((i) => i.rule === 'GEO_ORPHAN_NODE');
    expect(found?.severity).toBe('error');
    expect(found?.message).toContain('n.city.lonely');
  });
});

describe('GEO_EDGE_ENDPOINT_UNRESOLVED', () => {
  it('fires when an edge names a node the file does not hold', () => {
    const geo = geoOf(
      [node('n.city.a'), node('n.city.b')],
      [edge('e.ab', 'n.city.a', 'n.city.b'), edge('e.ax', 'n.city.a', 'n.city.ghost')],
    );
    const issues = geoGraph(bundleOf(geo));
    const found = issues.find((i) => i.rule === 'GEO_EDGE_ENDPOINT_UNRESOLVED');
    expect(found?.severity).toBe('error');
    expect(found?.message).toContain('n.city.ghost');
  });

  it('does not let a dangling edge shift the bridge indices', () => {
    // `resolved` drops unresolvable edges, so its indices are NOT geo.edges indices. If the
    // bridge report were read with the wrong array, this graph would report a lifeline edge id
    // that belongs to a different edge.
    // Built on a landmass-sized ring so the only finding is the dangling edge itself — a small
    // graph would also report as a fragment since ADR 0036 and muddy the assertion.
    const big = chain(MIN_LANDMASS_NODES + 2, 'n.city.m');
    const geo = geoOf(big.nodes, [edge('e.zz', 'n.city.m0', 'n.city.ghost'), ...big.edges]);
    const issues = geoGraph(bundleOf(geo));
    expect(rulesIn(issues)).toEqual(['GEO_EDGE_ENDPOINT_UNRESOLVED']);
  });
});

describe('GEO_NODES_DIGEST_STALE', () => {
  it('fires when the header digest does not match the node set', () => {
    const geo: GeoBundle = {
      ...LINE,
      nodesDigest: 'f'.repeat(16),
      edgesNodesDigest: 'f'.repeat(16),
    };
    const found = geoGraph(bundleOf(geo)).find((i) => i.rule === 'GEO_NODES_DIGEST_STALE');
    expect(found?.severity).toBe('error');
    expect(found?.message).toContain('geo:build');
  });

  it('fires when the two files disagree about which node set they used', () => {
    const geo: GeoBundle = { ...LINE, edgesNodesDigest: 'a'.repeat(16) };
    const issues = geoGraph(bundleOf(geo)).filter((i) => i.rule === 'GEO_NODES_DIGEST_STALE');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.file).toBe('geo/edges.gen.json');
  });
});

describe('GEO_NAMED_BORDER', () => {
  it('fires on a border crossing that carries a name (CLAUDE.md §11)', () => {
    const geo = geoOf(
      [node('n.city.a'), node('n.border.x', 'border_crossing', 'Some Named Frontier')],
      [edge('e.ax', 'n.city.a', 'n.border.x')],
    );
    const found = geoGraph(bundleOf(geo)).find((i) => i.rule === 'GEO_NAMED_BORDER');
    expect(found?.severity).toBe('error');
    expect(found?.message).toContain('Some Named Frontier');
  });

  it('accepts an unnamed border crossing', () => {
    const geo = geoOf(
      [node('n.city.a'), node('n.border.x', 'border_crossing', null)],
      [edge('e.ax', 'n.city.a', 'n.border.x')],
    );
    expect(rulesIn(geoGraph(bundleOf(geo)))).not.toContain('GEO_NAMED_BORDER');
  });
});

describe('GEO_OVERLAY_STALE', () => {
  it('fires on a row naming a node the selector dropped, and quotes the reason', () => {
    // The real instance this rule exists for: an earlier Menorca ferry row named a node the
    // selector had stopped keeping, and the row silently did nothing.
    const geo = geoOf(LINE.nodes, LINE.edges, {
      ferries: [
        {
          from: nodeId('n.city.a'),
          to: nodeId('n.city.gone'),
          reason: 'a crossing to somewhere that is no longer in the slice',
          seasonality: null,
        },
      ],
    });
    const found = geoGraph(bundleOf(geo)).find((i) => i.rule === 'GEO_OVERLAY_STALE');
    expect(found?.severity).toBe('error');
    expect(found?.file).toBe('geo/overlay.yaml');
    expect(found?.message).toContain('no longer in the slice');
    expect(found?.message).toContain('n.city.gone');
  });

  it('fires on a criticalEdges row naming an edge that no longer exists', () => {
    const geo = geoOf(LINE.nodes, LINE.edges, {
      criticalEdges: [{ edge: edgeId('e.vanished'), reason: 'the only way across' }],
    });
    const found = geoGraph(bundleOf(geo)).find((i) => i.rule === 'GEO_OVERLAY_STALE');
    expect(found?.message).toContain('e.vanished');
  });
});

describe('GEO_UNDECLARED_BRIDGE', () => {
  /**
   * `spokes` chains of ten hanging off the landmass ring: one lifeline edge per chain, each
   * stranding exactly ten nodes, and nothing else in the fixture is a bridge at all.
   *
   * **Built on the ring rather than on a bare hub, so the fixture is valid at ANY budget.** The
   * budget is MEASURED against the shipped slice and is 0 today; a bare star degenerates there —
   * `star(0)` is one orphan node, and the quiet assertion would pass because there is no graph
   * rather than because there is no lifeline. The ring also keeps the node count above 20, which
   * matters because a stranded side is `min(subtree, n - subtree)`: hang ten nodes off a
   * ten-node graph and the "stranded" side is the other one.
   */
  function spokesOnLandmass(spokes: number): { nodes: GeoNodeRecord[]; edges: GeoEdge[] } {
    const nodes = [...LANDMASS.nodes];
    const edges = [...LANDMASS.edges];
    for (let s = 0; s < spokes; s += 1) {
      let previous = 'n.city.c0';
      for (let i = 0; i < 10; i += 1) {
        const id = `n.city.s${String(s)}_${String(i)}`;
        nodes.push(node(id));
        edges.push(edge(`e.s${String(s)}_${String(i)}`, previous, id));
        previous = id;
      }
    }
    return { nodes, edges };
  }

  // Sized from the constant, never from a literal beside it: the budget moves whenever the slice
  // does, and a test that hardcoded 13 would have gone green against a map that no longer exists.
  const OVER = UNDECLARED_BRANCH_BUDGET + 1;

  it('stays quiet at the budget', () => {
    const { nodes, edges } = spokesOnLandmass(UNDECLARED_BRANCH_BUDGET);
    expect(rulesIn(geoGraph(bundleOf(geoOf(nodes, edges))))).not.toContain('GEO_UNDECLARED_BRIDGE');
  });

  it('warns — never errors — once the budget is exceeded', () => {
    const { nodes, edges } = spokesOnLandmass(OVER);
    const found = geoGraph(bundleOf(geoOf(nodes, edges))).find(
      (i) => i.rule === 'GEO_UNDECLARED_BRIDGE',
    );
    // A warning with a budget, never a per-edge error (`connectivity.ts`): 32 bridges on the
    // real slice would otherwise be 32 findings nobody reads.
    expect(found?.severity).toBe('warn');
    expect(found?.message).toContain(`${String(OVER)} undeclared lifeline edges`);
  });

  it('is silenced by declaring the branches in criticalEdges', () => {
    const { nodes, edges } = spokesOnLandmass(OVER);
    const declared = Array.from({ length: OVER }, (_, s) => ({
      edge: edgeId(`e.s${String(s)}_0`),
      reason: 'the only road onto this spur',
    }));
    expect(
      rulesIn(geoGraph(bundleOf(geoOf(nodes, edges, { criticalEdges: declared })))),
    ).not.toContain('GEO_UNDECLARED_BRIDGE');
  });
});

// ── text rules ─────────────────────────────────────────────────────────────────────────

describe('GEO_PLACE_BEHAVIOUR scans raw bytes, not parsed data', () => {
  it('fires on a country code in a generated file, with a real line number', () => {
    // It has to scan TEXT: every geo schema is a strictObject, so a file carrying `cc` fails to
    // load and `bundle.geo` is null. A parsed-data check would go silent exactly when it matters.
    const root = scratch();
    writeFileSync(
      join(root, 'geo', 'nodes.gen.json'),
      ['{', '  "nodes": [', '    {"id":"n.city.a","cc":"PT"}', '  ]', '}'].join('\n'),
    );
    const issues = geoPlaceBehaviour(bundleOf(null, root));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.rule).toBe('GEO_PLACE_BEHAVIOUR');
    expect(issues[0]?.severity).toBe('error');
    expect(issues[0]?.line).toBe(3);
  });

  it('fires on a per-place danger field in the overlay', () => {
    const root = scratch();
    writeFileSync(join(root, 'geo', 'overlay.yaml'), 'tolled:\n  - from: n.city.a\n    risk: 4\n');
    expect(rulesIn(geoPlaceBehaviour(bundleOf(null, root)))).toEqual(['GEO_PLACE_BEHAVIOUR']);
  });

  it('does NOT fire on a country named in a reason string', () => {
    // The overlay's justifications name real countries and must keep doing so. Describing where
    // a road is priced is not a judgement about anybody; the scan is over KEYS for that reason.
    const root = scratch();
    writeFileSync(
      join(root, 'geo', 'overlay.yaml'),
      'tolled:\n  - from: n.city.a\n    to: n.city.b\n' +
        '    reason: Freiburg-Macon. Free in Germany, then the A36 charges from Mulhouse.\n',
    );
    expect(geoPlaceBehaviour(bundleOf(null, root))).toEqual([]);
  });

  it('is clean on the shipped geo files', () => {
    expect(geoPlaceBehaviour(bundleOf(null))).toEqual([]);
  });
});

describe('GEO_NAME_FIELD_MISPLACED', () => {
  it('fires on a name carried by an edge rather than a node', () => {
    const root = scratch();
    writeFileSync(
      join(root, 'geo', 'edges.gen.json'),
      '{\n  "edges": [\n    {"id":"e.ab","n":"The Coast Road"}\n  ]\n}\n',
    );
    const issues = geoNameFieldMisplaced(bundleOf(null, root));
    expect(rulesIn(issues)).toEqual(['GEO_NAME_FIELD_MISPLACED']);
    expect(issues[0]?.severity).toBe('error');
  });

  it('is clean on the shipped geo files, where only nodes are named', () => {
    expect(geoNameFieldMisplaced(bundleOf(null))).toEqual([]);
  });
});

describe('GEO_OSM_SOURCE — the ADR 0024 firewall, re-checked at lint time', () => {
  const lock = (sources: unknown): string => JSON.stringify({ nodeMajor: 22, sources }, null, 2);

  it('fires on an OSM-derived source', () => {
    const root = scratch();
    writeFileSync(
      join(root, 'geo', 'sources.lock.json'),
      lock([
        {
          id: 'osm-roads',
          url: 'https://planet.openstreetmap.org/pbf/planet-latest.osm.pbf',
          license: 'ODbL-1.0',
          attribution: 'OpenStreetMap contributors',
          sha256: null,
          retrievedUtc: null,
          file: 'planet.osm.pbf',
        },
      ]),
    );
    const issues = geoOsmSource(bundleOf(null, root));
    expect(rulesIn(issues)).toEqual(['GEO_OSM_SOURCE']);
    expect(issues[0]?.severity).toBe('error');
    expect(issues[0]?.message).toContain('share-alike');
  });

  it('accepts the licences the project actually ships on', () => {
    const root = scratch();
    writeFileSync(
      join(root, 'geo', 'sources.lock.json'),
      lock([
        {
          id: 'geonames-cities15000',
          url: 'https://download.geonames.org/export/dump/cities15000.zip',
          license: 'CC-BY-4.0',
          attribution: 'GeoNames contributors',
          sha256: null,
          retrievedUtc: null,
          file: 'cities15000.txt',
        },
      ]),
    );
    expect(geoOsmSource(bundleOf(null, root))).toEqual([]);
  });

  it('is clean on the committed lock file', () => {
    expect(geoOsmSource(bundleOf(null))).toEqual([]);
  });
});

// ── the whole tool, over the real corpus ───────────────────────────────────────────────

describe('the shipped geo data passes every geo rule', () => {
  it('reports no geo finding at all', () => {
    const geoRules = ['geo-graph', 'geo-place-behaviour', 'geo-name-field', 'geo-osm-source'];
    const run = runLint(CONTENT, geoRules);
    expect(run.issues.map((i) => `${i.rule} ${i.message}`)).toEqual([]);
    expect(run.ruleCount).toBe(geoRules.length);
  });
});
