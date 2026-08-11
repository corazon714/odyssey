import { type LatLng } from './geodesy.ts';

/**
 * An equal-AREA grid over the sphere, used to make "how crowded is here" a measurable thing.
 *
 * Longitude splits evenly, which is easy. Latitude does not: a 4.5-degree band at the equator
 * covers far more ground than one at 70N, so a naive lat/lng grid would call the Arctic dense
 * and the tropics sparse purely as an artefact of the projection. Splitting on equal increments
 * of `sin(lat)` gives every cell the same area, which is the only way the density classes below
 * mean anything.
 *
 * 72 x 40 = 2,880 cells, of which roughly 840 contain land. About 40 lines and no `h3-js`.
 *
 * **`densityClass` is derived from CANDIDATE DENSITY, never from a country.** That is a
 * CLAUDE.md 11 constraint, not a convenience: "how many settlements are near here" is a physical
 * fact about the map, while "which country is this" is the thing the rule forbids us reading.
 */
export const GRID_LON_COLUMNS = 72;
export const GRID_LAT_BANDS = 40;

export const DENSITY_CLASSES = ['urban', 'settled', 'sparse', 'empty'] as const;
export type DensityClass = (typeof DENSITY_CLASSES)[number];

/** Poisson-disk radius per density class, in kilometres. ADR 0024 Decision 2. */
export const DENSITY_RADIUS_KM: Readonly<Record<DensityClass, number>> = Object.freeze({
  urban: 55,
  settled: 110,
  sparse: 190,
  empty: 300,
});

/** Candidate counts per cell that separate the classes. Measured, then pinned — see `--stage=audit`. */
const DENSITY_THRESHOLDS: readonly { readonly min: number; readonly cls: DensityClass }[] = [
  { min: 40, cls: 'urban' },
  { min: 12, cls: 'settled' },
  { min: 3, cls: 'sparse' },
  { min: 0, cls: 'empty' },
];

/**
 * Cell id as `band * GRID_LON_COLUMNS + column`, so it is a small integer and sorts stably.
 *
 * `Math.sin` appears here, which is why this module lives in `packages/tools` — see
 * `geodesy.ts`. A point exactly on a band boundary lands in the lower band by the `floor`, and
 * that is a decision the epsilon rule does NOT need to police: the boundary is a fixed rational
 * in sine space, and a candidate one metre either side of it is genuinely in one cell or the
 * other. Nothing downstream compares two cells for near-equality.
 */
export function cellOf(point: LatLng): number {
  const lat = Math.min(90, Math.max(-90, point.lat));
  const lng = ((((point.lng + 180) % 360) + 360) % 360) - 180;

  const column = Math.min(GRID_LON_COLUMNS - 1, Math.floor(((lng + 180) / 360) * GRID_LON_COLUMNS));
  // sin(lat) is uniform in area, so equal slices of it are equal slices of the sphere.
  const sinFraction = (Math.sin((lat * Math.PI) / 180) + 1) / 2;
  const band = Math.min(GRID_LAT_BANDS - 1, Math.floor(sinFraction * GRID_LAT_BANDS));
  return band * GRID_LON_COLUMNS + column;
}

export function densityClassFor(candidatesInCell: number): DensityClass {
  for (const threshold of DENSITY_THRESHOLDS) {
    if (candidatesInCell >= threshold.min) return threshold.cls;
  }
  return 'empty';
}

/** Count candidates per cell. The input to every density decision downstream. */
export function occupancy(points: readonly LatLng[]): ReadonlyMap<number, number> {
  const counts = new Map<number, number>();
  for (const point of points) {
    const cell = cellOf(point);
    counts.set(cell, (counts.get(cell) ?? 0) + 1);
  }
  return counts;
}

/**
 * The eight neighbouring cells plus the cell itself, for bucketed nearest-neighbour search.
 *
 * Longitude wraps; latitude clamps. Callers still measure real distances — this only bounds how
 * many candidates they have to measure against, turning an O(n^2) sweep over 25,000 rows into
 * something that finishes.
 */
export function cellNeighbourhood(cell: number): readonly number[] {
  const band = Math.floor(cell / GRID_LON_COLUMNS);
  const column = cell % GRID_LON_COLUMNS;
  const out: number[] = [];
  for (let dBand = -1; dBand <= 1; dBand += 1) {
    const b = band + dBand;
    if (b < 0 || b >= GRID_LAT_BANDS) continue;
    for (let dColumn = -1; dColumn <= 1; dColumn += 1) {
      const c = (((column + dColumn) % GRID_LON_COLUMNS) + GRID_LON_COLUMNS) % GRID_LON_COLUMNS;
      out.push(b * GRID_LON_COLUMNS + c);
    }
  }
  // Sorted and de-duplicated: at the poles the wrap can produce the same cell twice, and an
  // unsorted neighbourhood would make a downstream "first match wins" depend on this order.
  return [...new Set(out)].sort((a, b) => a - b);
}
