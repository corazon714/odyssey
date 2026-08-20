import { describe, expect, it } from 'vitest';

import { edgeId, type GeoPath } from '@odyssey/engine';

import { graphFromArtifacts, DIVERSITY_PASS_THRESHOLD } from '../audit-diversity.ts';
import {
  classifyDiversity,
  endpointDegree,
  forcedEdges,
  structuralFloorPercent,
} from '../route-structure.ts';

/**
 * A diamond with a stalk: A-B and A-C rejoin at D, and D-E is the only way to E.
 *
 * Chosen so the two things this module separates are separable BY EYE. Any route from A to E
 * must take D-E, so D-E is forced; the A..D half has two genuinely distinct options. Making
 * D-E long and the diamond short puts the floor above the ceiling, and shortening D-E puts it
 * below — which is exactly the difference between Chongjin-Jeju City and Palermo-Riyadh.
 */
function graphWithStalk(stalkKm: number): ReturnType<typeof graphFromArtifacts> {
  const node = (id: string, name: string): Record<string, unknown> => ({
    id,
    n: name,
    t: 'city',
    tr: 'plain',
    e: 10,
    p: 'medium',
    s: ['fuel'],
    cm: [],
  });
  const edge = (id: string, a: string, b: string, d: number): Record<string, unknown> => ({
    id,
    a,
    b,
    d,
    m: ['car', 'bus'],
    td: 1,
    sc: 1,
    sz: 'all_year',
    tl: false,
    ab: false,
    uv: false,
  });
  return graphFromArtifacts(
    JSON.stringify({
      nodes: [
        node('n.city.ga', 'Ayton'),
        node('n.city.gb', 'Beeton'),
        node('n.city.gc', 'Ceeton'),
        node('n.city.gd', 'Deeton'),
        node('n.city.ge', 'Eeton'),
      ],
    }),
    JSON.stringify({
      edges: [
        edge('e.a__b', 'n.city.ga', 'n.city.gb', 100),
        edge('e.a__c', 'n.city.ga', 'n.city.gc', 110),
        edge('e.b__d', 'n.city.gb', 'n.city.gd', 100),
        edge('e.c__d', 'n.city.gc', 'n.city.gd', 110),
        edge('e.d__e', 'n.city.gd', 'n.city.ge', stalkKm),
      ],
    }),
  );
}

const SHORT_STALK = graphWithStalk(50);

const pathOf = (
  graph: ReturnType<typeof graphFromArtifacts>,
  km: number,
  ...ids: readonly string[]
): GeoPath => ({
  nodes: [],
  edges: ids.map((id) => {
    const found = graph.edgeIndex.get(edgeId(id));
    if (found === undefined) throw new Error(`no such edge: ${id}`);
    return found;
  }),
  cost: 1,
  distanceKm: km,
});

describe('endpointDegree', () => {
  it('counts every incident edge', () => {
    // Deeton joins both diamond arms and the stalk.
    const deeton = SHORT_STALK.nodes.findIndex((n) => String(n.id) === 'n.city.gd');
    expect(endpointDegree(SHORT_STALK, deeton)).toBe(3);
  });

  it('reports 1 for a node hanging off a single edge — the case that forces every route', () => {
    const eeton = SHORT_STALK.nodes.findIndex((n) => String(n.id) === 'n.city.ge');
    expect(endpointDegree(SHORT_STALK, eeton)).toBe(1);
  });
});

describe('forcedEdges', () => {
  it('returns the edges present in every path and nothing else', () => {
    const viaB = pathOf(SHORT_STALK, 250, 'e.a__b', 'e.b__d', 'e.d__e');
    const viaC = pathOf(SHORT_STALK, 270, 'e.a__c', 'e.c__d', 'e.d__e');
    const stalk = SHORT_STALK.edgeIndex.get(edgeId('e.d__e'));
    expect(forcedEdges([viaB, viaC])).toEqual([stalk]);
  });

  it('is empty when the paths share nothing', () => {
    const ab = pathOf(SHORT_STALK, 100, 'e.a__b');
    const ac = pathOf(SHORT_STALK, 110, 'e.a__c');
    expect(forcedEdges([ab, ac])).toEqual([]);
  });

  it('is empty for a single path, because one route forces nothing it can be compared to', () => {
    expect(forcedEdges([pathOf(SHORT_STALK, 250, 'e.a__b', 'e.b__d', 'e.d__e')])).toEqual([]);
  });
});

describe('structuralFloorPercent', () => {
  it('normalises the forced distance by the SHORTEST path, not the longest', () => {
    // Forced = the 50 km stalk. Shortest route is 250 km, so the floor is 50/250 = 20%.
    // Against the 270 km route it would read 18%, and taking the smaller would understate a
    // structural failure — which is the whole reason the shortest is the denominator.
    const viaB = pathOf(SHORT_STALK, 250, 'e.a__b', 'e.b__d', 'e.d__e');
    const viaC = pathOf(SHORT_STALK, 270, 'e.a__c', 'e.c__d', 'e.d__e');
    expect(structuralFloorPercent(SHORT_STALK, [viaB, viaC])).toBe(20);
  });

  it('rises with the forced share, so a longer stalk on the same diamond floors higher', () => {
    const long = graphWithStalk(600);
    const viaB = pathOf(long, 800, 'e.a__b', 'e.b__d', 'e.d__e');
    const viaC = pathOf(long, 820, 'e.a__c', 'e.c__d', 'e.d__e');
    // 600 forced of an 800 km shortest route.
    expect(structuralFloorPercent(long, [viaB, viaC])).toBe(75);
    // And that is the regime the classifier must call structural — derived from the threshold
    // rather than written as 70, so retuning the ceiling cannot leave this test asserting a stale
    // relationship.
    expect(structuralFloorPercent(long, [viaB, viaC])).toBeGreaterThan(DIVERSITY_PASS_THRESHOLD);
  });

  it('is zero when nothing is shared', () => {
    const ab = pathOf(SHORT_STALK, 100, 'e.a__b');
    const ac = pathOf(SHORT_STALK, 110, 'e.a__c');
    expect(structuralFloorPercent(SHORT_STALK, [ab, ac])).toBe(0);
  });
});

describe('classifyDiversity', () => {
  const ceiling = DIVERSITY_PASS_THRESHOLD;

  it('calls a single route `single` rather than passing or failing it', () => {
    expect(classifyDiversity(1, 0, 0, ceiling)).toBe('single');
  });

  it("passes at exactly the ceiling, matching `acceptByDiversity`'s `>` test", () => {
    expect(classifyDiversity(3, ceiling, 0, ceiling)).toBe('pass');
  });

  it('blames the GRAPH when the floor alone breaches — no filter could have passed it', () => {
    expect(classifyDiversity(5, ceiling + 10, ceiling + 1, ceiling)).toBe('structural');
  });

  it('blames the FILTER when the floor left room and the overlap used it anyway', () => {
    expect(classifyDiversity(5, ceiling + 15, ceiling - 36, ceiling)).toBe('filter');
  });

  it('blames the filter at the boundary where the floor is exactly the ceiling', () => {
    // A floor AT the ceiling is still passable — `acceptByDiversity` admits equality — so a
    // breach above it is the filter's doing. `>` rather than `>=` in `classifyDiversity` is what
    // makes this hold, and it is the same off-by-one the filter itself is careful about.
    expect(classifyDiversity(5, ceiling + 1, ceiling, ceiling)).toBe('filter');
  });
});
