import { type TerrainKind } from '@odyssey/engine';

import { haversineKm, type LatLng } from './geodesy.ts';
import { cellNeighbourhood, cellOf } from './grid.ts';
import { pointInRing, type BoxedRing } from './read-natural-earth.ts';

/**
 * What kind of ground a place sits on. Physical facts only — CLAUDE.md 11.
 *
 * Three sources in priority order, and the order is the decision:
 *
 * 1. **Settlement size.** A metro is `urban` whatever the rock underneath, because the terrain
 *    field drives LEG DENSITY and travel through a conurbation is slow and dense regardless of
 *    what it was built on.
 * 2. **Natural Earth's named physical regions**, which classify 60.6% of real candidates —
 *    measured, not assumed. This is the only licence-clean source for desert and steppe, which
 *    elevation cannot express.
 * 3. **Elevation, local relief and distance to coast**, for the remaining 39.4%.
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
export const HILL_M = 500;

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

export function classifyTerrain(input: TerrainInput, rings: readonly TerrainRing[]): TerrainKind {
  if (input.isUrban) return 'urban';

  // Named physical regions, first match in file order. Overlaps are real — a desert can sit on a
  // plateau — and taking the first is a stable, arbitrary rule rather than an adjudication.
  for (const ring of rings) {
    if (pointInRing(input.point, ring)) return ring.kind;
  }

  if (input.dem >= MOUNTAIN_M) return 'mountain';
  if (input.coastKm <= COASTAL_KM) return 'coast';
  if (input.dem >= HILL_M) return 'hill';
  // Relief catches a place that is low but broken — a river gorge on a plain.
  if (Math.abs(input.dem - input.localMedianDem) >= 300) return 'hill';
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
