import { type TerrainKind } from '@odyssey/engine';

import { haversineKm, type LatLng } from './geodesy.ts';
import { cellNeighbourhood, cellOf } from './grid.ts';
import { pointInRing, type BoxedRing } from './read-natural-earth.ts';

/**
 * What kind of ground a place sits on. Physical facts only — CLAUDE.md 11.
 *
 * Four sources, and the ORDER is the decision:
 *
 * 1. **Hard ground — Natural Earth's `Desert` and `Range/mtn` polygons, and anything above
 *    `MOUNTAIN_M`.** These outrank settlement size.
 * 2. **Settlement size.** A metro on unremarkable ground is `urban`, because terrain drives LEG
 *    DENSITY and travel through a conurbation is slow and dense whatever it was built on.
 * 3. **Natural Earth's other named physical regions**, which classify 60.6% of real candidates —
 *    measured, not assumed. The only licence-clean source for steppe, which elevation cannot
 *    express.
 * 4. **Elevation, local relief and distance to coast**, for the rest.
 *
 * ## Why 1 outranks 2, measured
 *
 * It did not, and that was a bug with three symptoms. `isUrban` fired first, so a third of every
 * selected node set came out `urban` — 318 of 720 at planet scale against 3.5% of the candidate
 * pool, because selection deliberately favours big cities and `urban` then erased whatever they
 * were built on. An Alpine metro scored `terrainDifficulty` 0 and `scenic` 0. Moving hard ground
 * ahead of size took mountain from 68 to 124 and desert from 5 to 16.
 *
 * ## Why elevation now outranks the coast
 *
 * `coastKm <= COASTAL_KM` used to be checked before the hill thresholds, so a town 600 m up and
 * 20 km from the sea came out `coast` — difficulty 1, when the ground is plainly difficulty 2.
 * Mediterranean and Norwegian coasts are hill country, and the old order could not say so.
 *
 * ## Why `HILL_M` is 300
 *
 * 500 m sat above the 78th percentile of settlement elevation (p50 is 128 m, p75 is 378 m), so
 * `hill` could only fire for the handful of upland towns that were also inland and outside every
 * named polygon: 23 of 720 nodes, 3.2%, against 6.3% of the candidate pool. 300 m is both the
 * conventional cartographic break for upland and the value that reproduces the pool's own share
 * — 52 of 720, 7.2%. The relief fallback moved 300 -> 200 for the same reason.
 *
 * ## `desert` is empty on the European slice, and that is correct
 *
 * Zero `Desert` polygons overlap `--bbox=-12,36,30,60`. There is no desert in Europe, so a slice
 * with none is honest geography rather than a classifier fault. Judge `desert` at planet scale.
 *
 * `forest` and `marsh` are absent from `TERRAIN_KINDS` because nothing can fill them; see
 * `geo-terrain.ts`.
 */

/**
 * `FEATURECLA` values that carry a terrain signal, mapped to our vocabulary.
 *
 * `Island`, `Island group`, `Geoarea`, `Continent`, `Lake`, `Depression` and the single
 * `Dragons-be-here` are deliberately absent: they say where something is, not what the ground
 * is like. They account for 261 of the layer's 1,047 features.
 */
export const FEATURECLA_TERRAIN: Readonly<Record<string, TerrainKind>> = Object.freeze({
  'Range/mtn': 'mountain',
  Foothills: 'hill',
  Valley: 'hill',
  Gorge: 'hill',
  Plateau: 'steppe',
  Tundra: 'steppe',
  Desert: 'desert',
  Plain: 'plain',
  Lowland: 'plain',
  Basin: 'plain',
  Coast: 'coast',
  'Pen/cape': 'coast',
  Peninsula: 'coast',
  Delta: 'coast',
  Isthmus: 'coast',
});

/** A terrain-bearing polygon, pre-boxed. */
export type TerrainRing = BoxedRing & { readonly kind: TerrainKind };

/** Distance from the sea below which a place counts as coastal, in kilometres. */
export const COASTAL_KM = 25;
/** Elevation at which ground stops being hills and becomes mountains, in metres. */
export const MOUNTAIN_M = 1500;
/** Elevation at which flat ground becomes upland. See the header for why this is 300, not 500. */
export const HILL_M = 300;
/** Height above the local median that makes low ground broken — a gorge cut into a plain. */
export const HILL_RELIEF_M = 200;

/**
 * Coastline vertices indexed by grid cell, so "how far is the sea" is a bounded search.
 *
 * Vertices rather than segments: at 10m resolution the vertex spacing is far finer than the
 * 25 km threshold, so the error is immaterial and the index is an order of magnitude simpler.
 */
export type CoastIndex = ReadonlyMap<number, readonly LatLng[]>;

export function buildCoastIndex(land: readonly BoxedRing[]): CoastIndex {
  const index = new Map<number, LatLng[]>();
  for (const boxed of land) {
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

/** Kilometres to the nearest coastline vertex, or `Infinity` if none is nearby. */
export function distanceToCoastKm(index: CoastIndex, point: LatLng): number {
  let best = Number.POSITIVE_INFINITY;
  for (const cell of cellNeighbourhood(cellOf(point))) {
    for (const vertex of index.get(cell) ?? []) {
      const km = haversineKm(point, vertex);
      if (km < best) best = km;
    }
  }
  return best;
}

export type TerrainInput = {
  readonly point: LatLng;
  readonly dem: number;
  /** Median elevation of the local neighbours, for the relief fallback. */
  readonly localMedianDem: number;
  readonly isUrban: boolean;
  readonly coastKm: number;
};

/**
 * Named physical region at a point, or null. First match in file order — overlaps are real (a
 * desert can sit on a plateau) and taking the first is a stable, arbitrary rule rather than an
 * adjudication.
 */
export function ringKindAt(point: LatLng, rings: readonly TerrainRing[]): TerrainKind | null {
  for (const ring of rings) {
    if (pointInRing(point, ring)) return ring.kind;
  }
  return null;
}

export function classifyTerrain(input: TerrainInput, rings: readonly TerrainRing[]): TerrainKind {
  const ring = ringKindAt(input.point, rings);

  // 1. Hard ground, ahead of settlement size. A metro in the Alps is a mountain city; calling it
  //    `urban` gave it terrainDifficulty 0 and scenic 0, and both are wrong.
  if (ring === 'mountain' || ring === 'desert') return ring;
  if (input.dem >= MOUNTAIN_M) return 'mountain';

  // 2. Size, for ground with no stronger claim on it.
  if (input.isUrban) return 'urban';

  // 3. Every other named region.
  if (ring !== null) return ring;

  // 4. Elevation BEFORE the coast: upland that happens to be near water is still upland, and the
  //    old order reported a 600 m coastal town as difficulty 1.
  if (input.dem >= HILL_M) return 'hill';
  if (Math.abs(input.dem - input.localMedianDem) >= HILL_RELIEF_M) return 'hill';
  if (input.coastKm <= COASTAL_KM) return 'coast';
  return 'plain';
}

/** Build the terrain ring index from the raw GeoJSON of `ne_10m_geography_regions_polys`. */
export function readTerrainRings(text: string): readonly TerrainRing[] {
  const parsed = JSON.parse(text) as {
    readonly features: readonly {
      readonly properties: Readonly<Record<string, unknown>>;
      readonly geometry: { readonly type: string; readonly coordinates: unknown } | null;
    }[];
  };

  const out: TerrainRing[] = [];
  for (const feature of parsed.features) {
    const featurecla = feature.properties['FEATURECLA'];
    if (typeof featurecla !== 'string') continue;
    const kind = FEATURECLA_TERRAIN[featurecla];
    if (kind === undefined) continue;
    const geometry = feature.geometry;
    if (geometry === null) continue;

    const rings: readonly (readonly (readonly number[])[])[] =
      geometry.type === 'Polygon'
        ? (geometry.coordinates as readonly (readonly (readonly number[])[])[])
        : geometry.type === 'MultiPolygon'
          ? (geometry.coordinates as readonly (readonly (readonly number[])[])[][]).flat()
          : [];

    for (const ring of rings) {
      let minLat = 90;
      let maxLat = -90;
      let minLng = 180;
      let maxLng = -180;
      for (const position of ring) {
        const lng = position[0] ?? 0;
        const lat = position[1] ?? 0;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
      }
      out.push({
        kind,
        ring: ring as readonly (readonly [number, number])[],
        minLat,
        maxLat,
        minLng,
        maxLng,
      });
    }
  }
  return out;
}
