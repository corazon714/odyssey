import { describe, expect, it } from 'vitest';

import { applyOverlay, type Overlay } from '../apply-overlay.ts';
import { type CandidateEdge } from '../build-edges.ts';
import {
  railFollowsCorridor,
  RAIL_CORRIDOR_KM,
  RAIL_SAMPLES,
  RAIL_SAMPLES_REQUIRED,
  RAIL_STATION_KM,
} from '../classify-rail.ts';
import { modesFor, FOOT_MAX_KM, ROAD_MODES } from '../compute-attributes.ts';
import { type LatLng } from '../geodesy.ts';
import { type BoxedRing } from '../read-natural-earth.ts';
import { buildVertexIndex } from '../vertex-index.ts';

/**
 * A railway as a polyline through the given points. Natural Earth's layer is read as vertices,
 * so a line is only ever "near" where it has one — which is why the fixtures below place them
 * densely enough that the corridor test measures the route rather than the sampling.
 */
function line(points: readonly LatLng[]): BoxedRing {
  const ring: readonly (readonly [number, number])[] = points.map((p) => [p.lng, p.lat]);
  return {
    ring,
    minLat: Math.min(...points.map((p) => p.lat)),
    maxLat: Math.max(...points.map((p) => p.lat)),
    minLng: Math.min(...points.map((p) => p.lng)),
    maxLng: Math.max(...points.map((p) => p.lng)),
  };
}

/** Vertices every ~0.1 degree along the equator between two longitudes. */
function alongEquator(fromLng: number, toLng: number): BoxedRing {
  const points: LatLng[] = [];
  for (let lng = fromLng; lng <= toLng; lng += 0.1) points.push({ lat: 0, lng });
  return line(points);
}

const WEST = { lat: 0, lng: 0 };
const EAST = { lat: 0, lng: 10 };

describe('railFollowsCorridor', () => {
  it('accepts a corridor a line follows end to end', () => {
    const index = buildVertexIndex([alongEquator(-1, 11)]);
    expect(railFollowsCorridor(index, WEST, EAST)).toBe(true);
  });

  it('REFUSES a corridor served at both ends with nothing in between', () => {
    // The bug this exists for. Both endpoints are on the network, and the old predicate stopped
    // there — which made `train` true on 93% of slice edges, because every European settlement
    // over 15,000 has a line within reach. Paris and Palermo are both served; there is no train.
    const index = buildVertexIndex([alongEquator(-1, 1), alongEquator(9, 11)]);
    expect(railFollowsCorridor(index, WEST, EAST)).toBe(false);
  });

  it('refuses when an endpoint is off the network however good the middle is', () => {
    const index = buildVertexIndex([alongEquator(-1, 11)]);
    const inland = { lat: RAIL_STATION_KM / 111 + 0.5, lng: 0 };
    expect(railFollowsCorridor(index, inland, EAST)).toBe(false);
  });

  it('refuses a line that runs parallel but too far off to be the same corridor', () => {
    // A line 2 degrees north is ~222 km away: on the map it looks like coverage, and it is a
    // different valley entirely.
    const index = buildVertexIndex([
      alongEquator(-1, 1),
      alongEquator(9, 11),
      line(Array.from({ length: 100 }, (_, i) => ({ lat: 2, lng: i * 0.1 }))),
    ]);
    expect(railFollowsCorridor(index, WEST, EAST)).toBe(false);
  });

  it('is symmetric — a corridor does not carry rail in one direction only', () => {
    const index = buildVertexIndex([alongEquator(-1, 11)]);
    expect(railFollowsCorridor(index, WEST, EAST)).toBe(railFollowsCorridor(index, EAST, WEST));
  });

  it('states its thresholds as a count, so nine samples cannot round a percentage', () => {
    expect(RAIL_SAMPLES_REQUIRED).toBeLessThanOrEqual(RAIL_SAMPLES);
    expect(RAIL_SAMPLES_REQUIRED).toBeGreaterThan(RAIL_SAMPLES / 2);
    // Corridor tolerance must exceed the station gate's usefulness but stay well under the
    // ~222 km "different valley" scale the case above pins.
    expect(RAIL_CORRIDOR_KM).toBeLessThan(RAIL_STATION_KM * 2);
  });
});

describe('applyOverlay — tolled corridors', () => {
  const ids = ['n.city.g1', 'n.city.g2', 'n.city.g3'];
  const points: readonly LatLng[] = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 1 },
    { lat: 0, lng: 2 },
  ];
  const edges: readonly CandidateEdge[] = [
    { a: 0, b: 1, distanceKm: 111 },
    { a: 1, b: 2, distanceKm: 111 },
  ];
  const run = (overlay: Overlay): ReturnType<typeof applyOverlay> =>
    applyOverlay(overlay, ids, points, edges);

  it('marks a corridor the generator produced', () => {
    const result = run({
      tolled: [{ from: 'n.city.g1', to: 'n.city.g2', reason: 'a ticket motorway' }],
    });
    expect(result.issues).toEqual([]);
    expect(result.tolled.has('0:1')).toBe(true);
    expect(result.tolled.has('1:2')).toBe(false);
  });

  it('does not care which way round the two ends are named', () => {
    const result = run({
      tolled: [{ from: 'n.city.g2', to: 'n.city.g1', reason: 'the same road, named backwards' }],
    });
    expect(result.tolled.has('0:1')).toBe(true);
  });

  it('reports a row naming a node the selector dropped', () => {
    const result = run({
      tolled: [{ from: 'n.city.g1', to: 'n.city.g999', reason: 'gone' }],
    });
    expect(result.tolled.size).toBe(0);
    expect(result.issues[0]).toContain('not in the node set');
  });

  it('reports a row whose corridor the generator does not produce as STALE', () => {
    // The staleness that accumulates unnoticed: a toll on a road that no longer exists prices
    // nothing, and reads as pricing that is there.
    const result = run({
      tolled: [{ from: 'n.city.g1', to: 'n.city.g3', reason: 'no such corridor' }],
    });
    expect(result.tolled.size).toBe(0);
    expect(result.issues[0]).toContain('STALE');
  });

  it('resolves against the POST-overlay edge set, so a forced corridor can be tolled', () => {
    const result = run({
      forcedCorridors: [{ from: 'n.city.g1', to: 'n.city.g3', reason: 'a bridge' }],
      tolled: [{ from: 'n.city.g1', to: 'n.city.g3', reason: 'and the bridge charges' }],
    });
    expect(result.issues).toEqual([]);
    expect(result.tolled.has('0:2')).toBe(true);
  });

  it('reports a toll on a corridor the overlay itself just forbade', () => {
    const result = run({
      forbiddenCorridors: [{ from: 'n.city.g1', to: 'n.city.g2', reason: 'impassable' }],
      tolled: [{ from: 'n.city.g1', to: 'n.city.g2', reason: 'a toll on a road we deleted' }],
    });
    expect(result.tolled.size).toBe(0);
    expect(result.issues.some((i) => i.includes('STALE'))).toBe(true);
  });

  it('marks nothing when no tolls are declared', () => {
    expect(run({}).tolled.size).toBe(0);
  });
});

describe('modesFor — a corridor offers foot only where walking it is a plan', () => {
  it('offers foot on a short corridor', () => {
    expect(modesFor(false, FOOT_MAX_KM)).toContain('foot');
  });

  it('does NOT offer foot on a long one', () => {
    // The bug: `FARE_PER_100KM.foot` is 0, so `cheapest` chose to walk all 257 land edges of the
    // slice, a 2,478 km one included. Its cost then reduced to 0.23 x distance against
    // `fastest`'s 0.86 x distance — the same ordering in different units, which returned the
    // identical path on 170 of 200 pairs.
    expect(modesFor(false, FOOT_MAX_KM + 1)).not.toContain('foot');
    expect(modesFor(true, 2478)).not.toContain('foot');
  });

  it('always offers the road modes, and train only where a line follows', () => {
    expect(modesFor(false, 900)).toEqual(ROAD_MODES);
    expect(modesFor(true, 900)).toContain('train');
    expect(modesFor(false, 900)).not.toContain('train');
  });

  it('never offers ferry — sea crossings are authored, never derived', () => {
    for (const km of [10, FOOT_MAX_KM, 900]) {
      for (const rail of [true, false]) expect(modesFor(rail, km)).not.toContain('ferry');
    }
  });
});
