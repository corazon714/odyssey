import { describe, expect, it } from 'vitest';

import { analyseConnectivity, degreeHistogram } from '../connectivity.ts';
import { buildEdges, type EdgeNode } from '../build-edges.ts';
import { createEpsilonLedger, interpolate } from '../geodesy.ts';
import {
  isOnLand,
  landFractionPercent,
  pointInRing,
  readLand,
  readLines,
  readPoints,
  readRegions,
  regionIndexAt,
} from '../read-natural-earth.ts';

/** A closed square ring, counter-clockwise, in [lng, lat] order as GeoJSON requires. */
function square(minLng: number, minLat: number, maxLng: number, maxLat: number) {
  return [
    [minLng, minLat],
    [maxLng, minLat],
    [maxLng, maxLat],
    [minLng, maxLat],
    [minLng, minLat],
  ];
}

function collection(features: unknown[]): string {
  return JSON.stringify({ type: 'FeatureCollection', features });
}

function polygonFeature(rings: number[][][]) {
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: rings } };
}

/** Two adjacent squares plus a lake inside the left one. */
const TWO_REGIONS = collection([
  polygonFeature([square(0, 0, 10, 10), square(3, 3, 5, 5)]),
  polygonFeature([square(10, 0, 20, 10)]),
]);

describe('reading Natural Earth geometry', () => {
  it('reads polygons as opaque INDICES, with no room for a country name', () => {
    const regions = readRegions(TWO_REGIONS);
    expect(regions).toHaveLength(2);
    expect(regions[0]?.index).toBe(0);
    expect(regions[1]?.index).toBe(1);
    // The type has exactly two fields. There is nowhere to put a name or a code, which is
    // ADR 0024 Decision 4 enforced by shape rather than by review.
    expect(Object.keys(regions[0] ?? {}).sort()).toEqual(['index', 'rings']);
  });

  it('places a point in the region that contains it', () => {
    const regions = readRegions(TWO_REGIONS);
    expect(regionIndexAt(regions, { lat: 5, lng: 1 })).toBe(0);
    expect(regionIndexAt(regions, { lat: 5, lng: 15 })).toBe(1);
    expect(regionIndexAt(regions, { lat: 50, lng: 50 })).toBeNull();
  });

  it('treats an inner ring as a HOLE, so a lake is not land', () => {
    // Pooling inner and outer rings and flipping parity is what buys this for free.
    const regions = readRegions(TWO_REGIONS);
    expect(regionIndexAt(regions, { lat: 4, lng: 4 })).toBeNull();
    expect(regionIndexAt(regions, { lat: 2, lng: 2 })).toBe(0);
  });

  it('rejects a point outside the bounding box without walking the ring', () => {
    const ring = readLand(collection([polygonFeature([square(0, 0, 1, 1)])]))[0];
    expect(ring).toBeDefined();
    if (ring === undefined) return;
    expect(pointInRing({ lat: 90, lng: 90 }, ring)).toBe(false);
    expect(pointInRing({ lat: 0.5, lng: 0.5 }, ring)).toBe(true);
  });

  it('reads line and point layers', () => {
    const lines = readLines(
      collection([
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [0, 0],
              [1, 1],
            ],
          },
        },
        {
          type: 'Feature',
          geometry: {
            type: 'MultiLineString',
            coordinates: [
              [
                [2, 2],
                [3, 3],
              ],
              [
                [4, 4],
                [5, 5],
              ],
            ],
          },
        },
      ]),
    );
    expect(lines).toHaveLength(3);

    const points = readPoints(
      collection([{ type: 'Feature', geometry: { type: 'Point', coordinates: [12, 34] } }]),
    );
    expect(points).toEqual([{ lng: 12, lat: 34 }]);
  });

  it('skips a geometry kind it does not handle rather than throwing', () => {
    const regions = readRegions(
      collection([
        { type: 'Feature', geometry: { type: 'GeometryCollection', geometries: [] } },
        { type: 'Feature', geometry: null },
      ]),
    );
    expect(regions.every((r) => r.rings.length === 0)).toBe(true);
  });

  it('refuses anything that is not a FeatureCollection', () => {
    expect(() => readRegions('{"type":"Polygon"}')).toThrow('FeatureCollection');
  });
});

describe('land fraction along a segment', () => {
  const LAND = readLand(collection([polygonFeature([square(0, 0, 10, 10)])]));

  it('is 100 for a segment entirely inland', () => {
    expect(landFractionPercent(LAND, { lat: 2, lng: 2 }, { lat: 8, lng: 8 }, 9, interpolate)).toBe(
      100,
    );
  });

  it('is 0 for a segment entirely at sea', () => {
    expect(
      landFractionPercent(LAND, { lat: 40, lng: 40 }, { lat: 45, lng: 45 }, 9, interpolate),
    ).toBe(0);
  });

  it('is partial for a segment that leaves the coast and comes back', () => {
    // Two inland points either side of open water: the middle samples are at sea.
    const wider = readLand(
      collection([polygonFeature([square(0, 0, 4, 10)]), polygonFeature([square(16, 0, 20, 10)])]),
    );
    const percent = landFractionPercent(
      wider,
      { lat: 5, lng: 2 },
      { lat: 5, lng: 18 },
      9,
      interpolate,
    );
    expect(percent).toBeGreaterThan(0);
    expect(percent).toBeLessThan(100);
  });

  it('ignores the endpoints, because a port sits ON the coast', () => {
    // Both endpoints outside the polygon, the middle inside: still reads as land.
    expect(
      landFractionPercent(LAND, { lat: 5, lng: -1 }, { lat: 5, lng: 11 }, 9, interpolate),
    ).toBeGreaterThan(50);
  });

  it('answers isOnLand directly', () => {
    expect(isOnLand(LAND, { lat: 5, lng: 5 })).toBe(true);
    expect(isOnLand(LAND, { lat: 50, lng: 50 })).toBe(false);
  });
});

/** A 4x4 lattice at one-degree spacing, which is about 111 km a side. */
function lattice(): EdgeNode[] {
  const nodes: EdgeNode[] = [];
  let key = 1000;
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      nodes.push({ lat: 40 + row, lng: 10 + column, key: key++ });
    }
  }
  return nodes;
}

describe('buildEdges', () => {
  const LEDGER = () => createEpsilonLedger();

  it('connects a lattice without connecting everything to everything', () => {
    const nodes = lattice();
    const built = buildEdges({ nodes, land: [], ledger: LEDGER(), skipWaterRejection: true });
    expect(built.edges.length).toBeGreaterThan(nodes.length - 1);
    // A complete graph on 16 nodes is 120 edges. Anything near that means the pruning is dead
    // and every route would look the same, which is what the diversity filter cannot fix.
    expect(built.edges.length).toBeLessThan(60);
  });

  it('emits each undirected edge once, with a < b', () => {
    const built = buildEdges({
      nodes: lattice(),
      land: [],
      ledger: LEDGER(),
      skipWaterRejection: true,
    });
    const keys = built.edges.map((e) => `${String(e.a)}:${String(e.b)}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const edge of built.edges) expect(edge.a).toBeLessThan(edge.b);
  });

  it('gives every edge a positive integer distance', () => {
    const built = buildEdges({
      nodes: lattice(),
      land: [],
      ledger: LEDGER(),
      skipWaterRejection: true,
    });
    for (const edge of built.edges) {
      expect(Number.isInteger(edge.distanceKm)).toBe(true);
      expect(edge.distanceKm).toBeGreaterThan(0);
    }
  });

  it('PRUNES the long side of a triangle a two-hop path already covers', () => {
    // Three collinear nodes: a—b—c. The a—c edge is exactly the two-hop length, so it goes.
    const nodes: EdgeNode[] = [
      { lat: 40, lng: 10, key: 1 },
      { lat: 40, lng: 11, key: 2 },
      { lat: 40, lng: 12, key: 3 },
    ];
    const built = buildEdges({ nodes, land: [], ledger: LEDGER(), skipWaterRejection: true });
    expect(built.prunedTwoHop).toBeGreaterThan(0);
    expect(built.edges.some((e) => e.a === 0 && e.b === 2)).toBe(false);
    expect(built.edges).toHaveLength(2);
  });

  it('REFUSES a corridor whose middle is at sea, and never invents a ferry', () => {
    // Two nodes on separate islands. A ferry between them is the overlay's job, not the
    // generator's: nothing here can know whether a service exists, and inventing one would be
    // indistinguishable from a fact.
    const land = readLand(
      collection([
        polygonFeature([square(9, 39, 11, 41)]),
        polygonFeature([square(19, 39, 21, 41)]),
      ]),
    );
    const nodes: EdgeNode[] = [
      { lat: 40, lng: 10, key: 1 },
      { lat: 40, lng: 20, key: 2 },
    ];
    const built = buildEdges({ nodes, land, ledger: LEDGER() });
    expect(built.rejectedForWater).toBe(1);
    expect(built.edges).toHaveLength(0);
  });

  it('keeps the same corridor when it IS over land — guards the guard', () => {
    const land = readLand(collection([polygonFeature([square(5, 35, 25, 45)])]));
    const nodes: EdgeNode[] = [
      { lat: 40, lng: 10, key: 1 },
      { lat: 40, lng: 20, key: 2 },
    ];
    const built = buildEdges({ nodes, land, ledger: LEDGER() });
    expect(built.rejectedForWater).toBe(0);
    expect(built.edges).toHaveLength(1);
  });

  it('is independent of the order nodes arrive in', () => {
    const nodes = lattice();
    const forward = buildEdges({ nodes, land: [], ledger: LEDGER(), skipWaterRejection: true });
    const reversed = [...nodes].reverse();
    const backward = buildEdges({
      nodes: reversed,
      land: [],
      ledger: LEDGER(),
      skipWaterRejection: true,
    });
    // Compare by the stable node KEY rather than by index, since reversing renumbers everything.
    const asKeys = (edges: readonly { a: number; b: number }[], from: readonly EdgeNode[]) =>
      edges
        .map((e) => {
          const ka = from[e.a]?.key ?? -1;
          const kb = from[e.b]?.key ?? -1;
          return ka < kb ? `${String(ka)}:${String(kb)}` : `${String(kb)}:${String(ka)}`;
        })
        .sort();
    expect(asKeys(backward.edges, reversed)).toEqual(asKeys(forward.edges, nodes));
  });

  it('is deterministic across repeated runs', () => {
    const nodes = lattice();
    const a = buildEdges({ nodes, land: [], ledger: LEDGER(), skipWaterRejection: true });
    const b = buildEdges({ nodes, land: [], ledger: LEDGER(), skipWaterRejection: true });
    expect(b.edges).toEqual(a.edges);
  });
});

describe('analyseConnectivity', () => {
  it('finds one component in a connected chain', () => {
    const report = analyseConnectivity(4, [
      { a: 0, b: 1 },
      { a: 1, b: 2 },
      { a: 2, b: 3 },
    ]);
    expect(report.componentCount).toBe(1);
    expect(report.components[0]).toEqual([0, 1, 2, 3]);
    expect(report.orphans).toEqual([]);
  });

  it('finds two components, which is the fail-closed case', () => {
    const report = analyseConnectivity(4, [
      { a: 0, b: 1 },
      { a: 2, b: 3 },
    ]);
    expect(report.componentCount).toBe(2);
    expect(report.components).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it('names orphan nodes', () => {
    const report = analyseConnectivity(3, [{ a: 0, b: 1 }]);
    expect(report.orphans).toEqual([2]);
    expect(report.componentCount).toBe(2);
  });

  it('calls every edge of a chain a bridge', () => {
    const report = analyseConnectivity(4, [
      { a: 0, b: 1 },
      { a: 1, b: 2 },
      { a: 2, b: 3 },
    ]);
    expect(report.bridges).toEqual([0, 1, 2]);
  });

  it('calls NO edge of a cycle a bridge', () => {
    const report = analyseConnectivity(3, [
      { a: 0, b: 1 },
      { a: 1, b: 2 },
      { a: 2, b: 0 },
    ]);
    expect(report.bridges).toEqual([]);
  });

  it('finds the one bridge joining two cycles', () => {
    const report = analyseConnectivity(6, [
      { a: 0, b: 1 },
      { a: 1, b: 2 },
      { a: 2, b: 0 },
      { a: 3, b: 4 },
      { a: 4, b: 5 },
      { a: 5, b: 3 },
      { a: 2, b: 3 },
    ]);
    expect(report.bridges).toEqual([6]);
    expect(report.leafBranches[0]?.stranded).toBe(3);
  });

  it('ranks a lifeline above a one-node spur', () => {
    // The whole point of leafBranches: a chain contributes many bridges, and the ones worth a
    // written justification are the ones stranding a large side.
    const report = analyseConnectivity(6, [
      { a: 0, b: 1 },
      { a: 1, b: 2 },
      { a: 2, b: 0 },
      { a: 2, b: 3 },
      { a: 3, b: 4 },
      { a: 4, b: 5 },
    ]);
    expect(report.bridges.length).toBeGreaterThan(1);
    const top = report.leafBranches[0];
    const last = report.leafBranches[report.leafBranches.length - 1];
    expect(top?.stranded).toBeGreaterThan(last?.stranded ?? 99);
    expect(last?.stranded).toBe(1);
  });

  it('survives a long chain without blowing the stack', () => {
    // Iterative Tarjan, and a corridor is exactly the chain shape that would break recursion.
    const size = 5000;
    const edges = Array.from({ length: size - 1 }, (_, i) => ({ a: i, b: i + 1 }));
    const report = analyseConnectivity(size, edges);
    expect(report.componentCount).toBe(1);
    expect(report.bridges).toHaveLength(size - 1);
  });

  it('reports a degree histogram', () => {
    const report = analyseConnectivity(4, [
      { a: 0, b: 1 },
      { a: 1, b: 2 },
      { a: 1, b: 3 },
    ]);
    expect(report.degreeOf).toEqual([1, 3, 1, 1]);
    expect(degreeHistogram(report.degreeOf)).toEqual([0, 3, 0, 1]);
  });
});
