import { describe, expect, it } from 'vitest';

import { ID_PATTERN } from '@odyssey/content';

import { type CandidateEdge } from '../build-edges.ts';
import {
  CONTROLLED_SHARE_PERCENT,
  crossingId,
  placeBorders,
  type BorderInput,
} from '../place-borders.ts';
import { type BoxedRing, type Region } from '../read-natural-earth.ts';
import { type LatLng } from '../geodesy.ts';
import { type PopulationBand } from '@odyssey/engine';

/**
 * Two adjacent square regions meeting at longitude 10, spanning latitude 40-50. Everything east
 * of 10 is region 1, everything west is region 0 — so the boundary a bisection must find sits at
 * a longitude a test can assert against.
 */
function square(west: number, east: number): BoxedRing {
  const ring: readonly (readonly number[])[] = [
    [west, 40],
    [east, 40],
    [east, 50],
    [west, 50],
    [west, 40],
  ];
  return { ring: ring as BoxedRing['ring'], minLat: 40, maxLat: 50, minLng: west, maxLng: east };
}

const REGIONS: readonly Region[] = [
  { index: 0, rings: [square(0, 10)] },
  { index: 1, rings: [square(10, 20)] },
];

type Fixture = {
  readonly points: LatLng[];
  readonly ids: string[];
  readonly populations: PopulationBand[];
  readonly regionAt: (number | null)[];
};

/** Four settlements: two in region 0, two in region 1. */
function fixture(): Fixture {
  return {
    points: [
      { lat: 45, lng: 2 },
      { lat: 45, lng: 8 },
      { lat: 45, lng: 12 },
      { lat: 45, lng: 18 },
    ],
    ids: ['n.city.g1', 'n.city.g2', 'n.city.g3', 'n.city.g4'],
    populations: ['large', 'large', 'large', 'large'],
    regionAt: [0, 0, 1, 1],
  };
}

function input(edges: readonly CandidateEdge[], over: Partial<Fixture> = {}): BorderInput {
  return { ...fixture(), ...over, edges, regions: REGIONS };
}

/** Great-circle km per degree of longitude at 45N, near enough for a fixture assertion. */
const KM_PER_DEGREE_AT_45N = 78.7;

describe('crossingId', () => {
  it('is independent of the order the two endpoints are given in', () => {
    expect(crossingId('n.city.g1', 'n.city.g2')).toBe(crossingId('n.city.g2', 'n.city.g1'));
  });

  it('produces an id the content schema will accept', () => {
    // A raw hex digest starts with a digit about 62% of the time and ID_PATTERN requires every
    // dot-segment to begin with a letter. The `b` prefix is load-bearing, not decoration.
    for (const [a, b] of [
      ['n.city.g1', 'n.city.g2'],
      ['n.city.g99', 'n.city.g100'],
      ['n.city.g2988507', 'n.city.g2950159'],
    ]) {
      expect(crossingId(a ?? '', b ?? '')).toMatch(ID_PATTERN);
    }
  });

  it('distinguishes different pairs', () => {
    expect(crossingId('n.city.g1', 'n.city.g2')).not.toBe(crossingId('n.city.g1', 'n.city.g3'));
  });
});

describe('placeBorders', () => {
  it('ignores an edge whose ends sit in the same region', () => {
    const result = placeBorders(input([{ a: 0, b: 1, distanceKm: 472 }]));
    expect(result.boundaryEdges).toBe(0);
    expect(result.crossings).toHaveLength(0);
  });

  it('positions the crossing at the polygon boundary, not at the midpoint', () => {
    // Node 1 is at lng 8 and node 2 at lng 12; the boundary is at lng 10, which is HALF way.
    // So this pair alone cannot tell a bisection from a midpoint. Node 0 -> node 2 spans lng
    // 2 to 12, where the boundary sits at 80% of the span and a midpoint would be wrong.
    const distanceKm = Math.round(10 * KM_PER_DEGREE_AT_45N);
    const result = placeBorders(input([{ a: 0, b: 2, distanceKm }]));
    expect(result.crossings).toHaveLength(1);

    const crossing = result.crossings[0];
    expect(crossing?.point.lng).toBeCloseTo(10, 3);
    // 8 of the 10 degrees lie west of the boundary.
    expect(crossing?.distanceFromA).toBeGreaterThan(Math.round(distanceKm * 0.78));
    expect(crossing?.distanceFromA).toBeLessThan(Math.round(distanceKm * 0.82));
  });

  it('leaves both halves at least 1 km so neither can round to zero', () => {
    // The boundary is 1 degree from node 2, so the far half is a small fraction of the whole.
    const result = placeBorders(input([{ a: 0, b: 2, distanceKm: 3 }]));
    const crossing = result.crossings[0];
    expect(crossing).toBeDefined();
    expect(crossing?.distanceFromA).toBeGreaterThanOrEqual(1);
    expect(3 - (crossing?.distanceFromA ?? 0)).toBeGreaterThanOrEqual(1);
  });

  it('refuses to split an edge too short to carry two positive distances, and says so', () => {
    const result = placeBorders(input([{ a: 0, b: 2, distanceKm: 1 }]));
    expect(result.crossings).toHaveLength(0);
    expect(result.uncontrolled).toBe(1);
    // Loud: an uncontrolled boundary edge is closed to four of five profiles.
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toContain('cannot carry a crossing');
  });

  it('selects a low-scoring boundary edge when it is the only link between two regions', () => {
    // The connectivity floor must beat the score ranking. Edge 0-2 is long and joins two
    // hamlets, so it ranks last; it is also the only way across, and a score-only rule would
    // strand region 1 from four of five profiles.
    const edges: readonly CandidateEdge[] = [
      { a: 0, b: 1, distanceKm: 472 },
      { a: 2, b: 3, distanceKm: 472 },
      { a: 0, b: 2, distanceKm: 1400 },
    ];
    const result = placeBorders(
      input(edges, { populations: ['hamlet', 'hamlet', 'hamlet', 'hamlet'] }),
    );
    expect(result.requiredForConnectivity).toBe(1);
    expect(result.crossings.map((c) => c.parentEdge)).toEqual([2]);
  });

  it('leaves the lowest-ranked boundary edges uncontrolled once connectivity is satisfied', () => {
    // Each region is internally connected FIRST — otherwise every node is its own component and
    // the connectivity floor swallows the whole budget, which is what makes the leftover
    // interesting rather than accidental. Then four parallel crossings between the two regions:
    // one is forced, and the budget decides the rest.
    const edges: readonly CandidateEdge[] = [
      { a: 0, b: 1, distanceKm: 472 },
      { a: 2, b: 3, distanceKm: 472 },
      { a: 0, b: 2, distanceKm: 400 },
      { a: 0, b: 3, distanceKm: 1200 },
      { a: 1, b: 2, distanceKm: 300 },
      { a: 1, b: 3, distanceKm: 900 },
    ];
    const result = placeBorders(input(edges));
    expect(result.boundaryEdges).toBe(4);
    expect(result.requiredForConnectivity).toBe(1);
    expect(result.crossings.length).toBe(Math.floor((4 * CONTROLLED_SHARE_PERCENT) / 100));
    expect(result.uncontrolled).toBe(4 - result.crossings.length);
    // The one dropped is the longest: score is population minus floor(km / 200), so edge 3
    // (1,200 km) ranks last and is the one left to `illicit`.
    expect(result.crossings.map((c) => c.parentEdge).sort((x, y) => x - y)).toEqual([2, 4, 5]);
  });

  it('is invariant to the order the edges are given in', () => {
    // Selection must depend on the score and the index, never on sort stability.
    const edges: readonly CandidateEdge[] = [
      { a: 0, b: 2, distanceKm: 400 },
      { a: 1, b: 3, distanceKm: 400 },
      { a: 1, b: 2, distanceKm: 400 },
    ];
    const forward = placeBorders(input(edges));
    const reversed = placeBorders(input([...edges].reverse()));
    expect(new Set(forward.crossings.map((c) => c.id))).toEqual(
      new Set(reversed.crossings.map((c) => c.id)),
    );
  });

  it('gives the same answer twice — no clock, no randomness, no iteration-order dependency', () => {
    const edges: readonly CandidateEdge[] = [
      { a: 0, b: 2, distanceKm: 400 },
      { a: 1, b: 3, distanceKm: 900 },
    ];
    expect(placeBorders(input(edges))).toEqual(placeBorders(input(edges)));
  });
});
