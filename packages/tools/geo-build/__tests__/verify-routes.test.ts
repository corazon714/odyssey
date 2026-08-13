import { describe, expect, it } from 'vitest';

import { edgeId, nodeId, type GeoPath } from '@odyssey/engine';

import { graphFromArtifacts } from '../audit-diversity.ts';
import {
  factsFor,
  illicitCashDominates,
  readNames,
  verifyPair,
  type PreviewFacts,
} from '../verify-routes.ts';

/**
 * A four-node line: A - X - B, plus C hanging off A, where X is a border crossing and A-X is a
 * tolled ferry over hard ground. Small enough that every counted field is checkable by eye.
 */
const NODES = JSON.stringify({
  nodes: [
    { id: 'n.city.g1', n: 'Ayton', t: 'city', tr: 'plain', e: 10, p: 'large', s: ['fuel'], cm: [] },
    {
      id: 'n.border.ba',
      n: null,
      t: 'border_crossing',
      tr: 'hill',
      e: 20,
      p: 'none',
      s: ['fuel'],
      cm: [],
    },
    {
      id: 'n.city.g2',
      n: 'Beeton',
      t: 'city',
      tr: 'plain',
      e: 30,
      p: 'large',
      s: ['fuel'],
      cm: [],
    },
    { id: 'n.city.g3', n: 'Ceeton', t: 'town', tr: 'coast', e: 5, p: 'small', s: ['fuel'], cm: [] },
  ],
});

const EDGES = JSON.stringify({
  edges: [
    {
      id: 'e.a__x',
      a: 'n.city.g1',
      b: 'n.border.ba',
      d: 100,
      m: ['ferry'],
      td: 4,
      sc: 1,
      sz: 'all_year',
      tl: true,
      ab: true,
      uv: true,
    },
    {
      id: 'e.x__b',
      a: 'n.border.ba',
      b: 'n.city.g2',
      d: 50,
      m: ['car', 'bus'],
      td: 1,
      sc: 1,
      sz: 'all_year',
      tl: false,
      ab: true,
      uv: false,
    },
    {
      id: 'e.a__c',
      a: 'n.city.g1',
      b: 'n.city.g3',
      d: 20,
      m: ['car', 'bus'],
      td: 0,
      sc: 2,
      sz: 'all_year',
      tl: false,
      ab: false,
      uv: false,
    },
  ],
});

const GRAPH = graphFromArtifacts(NODES, EDGES);
const { byName, nameOf } = readNames(NODES, GRAPH);

describe('readNames', () => {
  it('maps a settlement name to its GRAPH index, not its artifact position', () => {
    expect(byName.get('Ayton')).toBe(1);
    expect(byName.get('Beeton')).toBe(2);
  });

  it('never maps a border crossing, because it has no name to map', () => {
    // GEO_NAMED_BORDER keeps `n` null on crossings. A lookup that resolved one would mean a
    // crossing had been given a real place's name.
    expect([...byName.keys()]).not.toContain('(crossing)');
    expect(nameOf[0]).toBe('(crossing)');
  });
});

/** Resolve by ID, never by position — `createGeoGraph` sorts, the artifact order is not it. */
const at = (id: string): number => {
  const found = GRAPH.edgeIndex.get(edgeId(id));
  if (found === undefined) throw new Error(`no such edge: ${id}`);
  return found;
};
const AYTON = GRAPH.nodeIndex.get(nodeId('n.city.g1')) ?? -1;
const BEETON = GRAPH.nodeIndex.get(nodeId('n.city.g2')) ?? -1;

function pathOf(...ids: readonly string[]): GeoPath {
  return { nodes: [], edges: ids.map(at), cost: 999, distanceKm: 0 };
}

describe('factsFor', () => {
  it('counts distance, hops, borders, ferry and toll along a path', () => {
    const facts = factsFor(GRAPH, 'fastest', pathOf('e.a__x', 'e.x__b'));
    expect(facts.km).toBe(150);
    expect(facts.hops).toBe(2);
    // ONE border, not two: both edges touch the same crossing node, and a corridor split in
    // half by a post is one crossing rather than two.
    expect(facts.borders).toBe(1);
    expect(facts.ferryHops).toBe(1);
    expect(facts.tolledHops).toBe(1);
    expect(facts.hardest).toBe(4);
  });

  it('reports zero for a path that touches none of them', () => {
    const facts = factsFor(GRAPH, 'scenic', pathOf('e.a__c'));
    expect(facts).toMatchObject({ km: 20, hops: 1, borders: 0, ferryHops: 0, tolledHops: 0 });
  });
});

describe('verifyPair', () => {
  it('names both ends and reports the routes it found', () => {
    const report = verifyPair(GRAPH, 'test', AYTON, BEETON, nameOf);
    expect(report.from).toBe('Ayton');
    expect(report.to).toBe('Beeton');
    expect(report.routes.length).toBeGreaterThan(0);
  });

  it('reports `illicit` refusing a ferry-only corridor rather than hiding it', () => {
    // `illicit` masks train and ferry — they are ticketed. Ayton reaches Beeton only across the
    // ferry, so illicit cannot get there at rung 0, and the report must say so.
    const report = verifyPair(GRAPH, 'test', AYTON, BEETON, nameOf);
    expect(report.refused).toContain('illicit');
  });

  it('calls a single-route pair diverse rather than failing it', () => {
    // One route cannot overlap anything. Counting that as a diversity failure would report the
    // graph's shape as a filter fault.
    const report = verifyPair(GRAPH, 'test', AYTON, BEETON, nameOf);
    if (report.routes.length < 2) expect(report.diversityOk).toBe(true);
  });

  it('does not flag illicit dominance when illicit cannot route at all', () => {
    const report = verifyPair(GRAPH, 'test', AYTON, BEETON, nameOf);
    expect(report.illicitDominates).toBe(false);
  });

  it('reports the degree of both endpoints, which is what names a structural failure', () => {
    const report = verifyPair(GRAPH, 'test', AYTON, BEETON, nameOf);
    // Ayton carries the ferry to the crossing and the road to Ceeton; Beeton is a dead end.
    expect(report.fromDegree).toBe(2);
    expect(report.toDegree).toBe(1);
  });

  it('gives a cause for every pair, and never `filter` when only one route exists', () => {
    const report = verifyPair(GRAPH, 'test', AYTON, BEETON, nameOf);
    expect(['single', 'pass', 'structural', 'filter']).toContain(report.cause);
    if (report.routes.length < 2) expect(report.cause).toBe('single');
  });
});

describe('illicitCashDominates', () => {
  const preview = (
    profile: 'illicit' | 'fastest' | 'cheapest',
    recommendedCash: number,
  ): PreviewFacts => ({
    profile,
    totalKm: 100,
    legCount: 10,
    montageLegCount: 0,
    travelHours: 24,
    crossings: 0,
    hasFerry: false,
    recommendedCash,
    startingMode: 'car',
  });

  it('is true only when illicit undercuts EVERY alternative', () => {
    expect(illicitCashDominates([preview('illicit', 100), preview('fastest', 200)])).toBe(true);
  });

  it('is false when one alternative is cheaper, even if others are not', () => {
    // The failure this guards is `some` in place of `every`: one expensive alternative would
    // otherwise be enough to call the illicit route dominant.
    expect(
      illicitCashDominates([
        preview('illicit', 150),
        preview('fastest', 200),
        preview('cheapest', 120),
      ]),
    ).toBe(false);
  });

  it('is false on a tie, because "strictly better" has to be strict', () => {
    expect(illicitCashDominates([preview('illicit', 100), preview('fastest', 100)])).toBe(false);
  });

  it('is false when there is no illicit route, and when it is the only route', () => {
    expect(illicitCashDominates([preview('fastest', 100)])).toBe(false);
    expect(illicitCashDominates([preview('illicit', 100)])).toBe(false);
  });
});
