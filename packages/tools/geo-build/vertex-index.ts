import { haversineKm, type LatLng } from './geodesy.ts';
import { cellNeighbourhood, cellOf } from './grid.ts';
import { type BoxedRing } from './read-natural-earth.ts';

/**
 * "How far is the nearest vertex of this line layer", as a bounded search.
 *
 * Vertices rather than segments: at 10m resolution the vertex spacing is far finer than any
 * threshold we test against, so the error is immaterial and the index is an order of magnitude
 * simpler. Bucketing by grid cell turns an O(all vertices) scan into a nine-cell one.
 *
 * Generic because two layers need exactly this — the coastline, for `coast` terrain and the
 * coastal score bonus, and the railways, for the `train` mode. It lived inside
 * `classify-terrain.ts` as `buildCoastIndex`/`distanceToCoastKm` when the coast was the only
 * caller; the rail corridor test is the second, and duplicating it would have been the
 * duplicated-logic failure CLAUDE.md 8 names.
 *
 * **Kilometres, never degrees.** The predicate this replaced compared `dLng^2 + dLat^2` against
 * a constant, which is a CIRCLE IN DEGREES and therefore an ellipse on the ground: at 55N a
 * quarter-degree is 28 km north-south but 16 km east-west. Haversine costs more and means what
 * it says.
 */
export type VertexIndex = ReadonlyMap<number, readonly LatLng[]>;

export function buildVertexIndex(lines: readonly BoxedRing[]): VertexIndex {
  const index = new Map<number, LatLng[]>();
  for (const boxed of lines) {
    for (const position of boxed.ring) {
      const point = { lng: position[0], lat: position[1] };
      const cell = cellOf(point);
      const bucket = index.get(cell);
      if (bucket === undefined) index.set(cell, [point]);
      else bucket.push(point);
    }
  }
  return index;
}

/** Kilometres to the nearest vertex, or `Infinity` when no cell in the neighbourhood holds one. */
export function nearestVertexKm(index: VertexIndex, point: LatLng): number {
  let best = Number.POSITIVE_INFINITY;
  for (const cell of cellNeighbourhood(cellOf(point))) {
    for (const vertex of index.get(cell) ?? []) {
      const km = haversineKm(point, vertex);
      if (km < best) best = km;
    }
  }
  return best;
}
