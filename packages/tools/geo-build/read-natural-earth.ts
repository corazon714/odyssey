import { type LatLng } from './geodesy.ts';

/**
 * Read the Natural Earth GeoJSON layers, and answer the three geometric questions the pipeline
 * asks of them. Public domain — no attribution obligation (`docs/geo-data-licensing.md` §3.1).
 *
 * ## Regions are OPAQUE INDICES, never names
 *
 * Border detection needs to know that two points fall in *different* administrative polygons.
 * It does not need to know which. So a polygon carries an integer index and nothing else, and
 * there is nowhere in this module's output to put a country name or code — ADR 0024 Decision 4
 * enforced by the shape of the type rather than by review. The index is build-time only; it
 * never reaches a shipped file.
 *
 * ## Planar ray casting, and where it is wrong
 *
 * Rings are treated as planar in degrees. That is wrong near the poles and wrong across the
 * antimeridian, and it is fine here because Natural Earth splits its polygons at ±180 and
 * because the consumers are "which side of a boundary is this" and "is this point on land" over
 * populated latitudes. **A candidate at |lat| > 84 or within a degree of the antimeridian gets
 * an unreliable answer**; the node set excludes both by construction (ADR 0024 excludes
 * Antarctica, and `continentOf` returns `other` there).
 */

type Position = readonly [number, number];
type Ring = readonly Position[];

/**
 * A CLOSED union, deliberately. A catch-all arm would widen `type` to `string` and defeat every
 * narrowing below, and the failure mode of a geometry kind we do not handle is that it matches
 * no arm and is skipped — which is the correct behaviour for `GeometryCollection` anyway.
 */
type GeoJsonGeometry =
  | { readonly type: 'Polygon'; readonly coordinates: readonly Ring[] }
  | { readonly type: 'MultiPolygon'; readonly coordinates: readonly (readonly Ring[])[] }
  | { readonly type: 'LineString'; readonly coordinates: Ring }
  | { readonly type: 'MultiLineString'; readonly coordinates: readonly Ring[] }
  | { readonly type: 'Point'; readonly coordinates: Position };

type GeoJsonFeature = {
  readonly type: 'Feature';
  readonly geometry: GeoJsonGeometry | null;
};

type GeoJsonFeatureCollection = {
  readonly type: 'FeatureCollection';
  readonly features: readonly GeoJsonFeature[];
};

/** A ring with its bounding box precomputed, because the box rejects almost every query. */
export type BoxedRing = {
  readonly ring: Ring;
  readonly minLat: number;
  readonly maxLat: number;
  readonly minLng: number;
  readonly maxLng: number;
};

/** One administrative area, identified ONLY by position in the file. */
export type Region = {
  readonly index: number;
  readonly rings: readonly BoxedRing[];
};

export type Polylines = readonly BoxedRing[];

function boxOf(ring: Ring): BoxedRing {
  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;
  for (const position of ring) {
    const lng = position[0];
    const lat = position[1];
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return { ring, minLat, maxLat, minLng, maxLng };
}

function parseCollection(text: string): GeoJsonFeatureCollection {
  const parsed = JSON.parse(text) as GeoJsonFeatureCollection;
  if (parsed.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) {
    throw new Error('not a GeoJSON FeatureCollection');
  }
  return parsed;
}

/** Every ring of a Polygon / MultiPolygon feature, outer and inner alike. */
function ringsOf(geometry: GeoJsonGeometry | null): readonly Ring[] {
  if (geometry === null) return [];
  if (geometry.type === 'Polygon') return geometry.coordinates;
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat();
  return [];
}

export function readRegions(text: string): readonly Region[] {
  return parseCollection(text).features.map((feature, index) => ({
    index,
    rings: ringsOf(feature.geometry).map(boxOf),
  }));
}

/** Land is read as ONE region: the question is "on land or not", not "which landmass". */
export function readLand(text: string): readonly BoxedRing[] {
  return parseCollection(text).features.flatMap((feature) => ringsOf(feature.geometry).map(boxOf));
}

export function readLines(text: string): Polylines {
  const out: BoxedRing[] = [];
  for (const feature of parseCollection(text).features) {
    const geometry = feature.geometry;
    if (geometry === null) continue;
    if (geometry.type === 'LineString') out.push(boxOf(geometry.coordinates));
    else if (geometry.type === 'MultiLineString') {
      for (const line of geometry.coordinates) out.push(boxOf(line));
    }
  }
  return out;
}

export function readPoints(text: string): readonly LatLng[] {
  const out: LatLng[] = [];
  for (const feature of parseCollection(text).features) {
    const geometry = feature.geometry;
    if (geometry?.type !== 'Point') continue;
    out.push({ lng: geometry.coordinates[0], lat: geometry.coordinates[1] });
  }
  return out;
}

/**
 * Ray casting, counting crossings of a horizontal ray to the east.
 *
 * A point inside an inner ring (a lake, an enclave) crosses that ring an odd number of times as
 * well as the outer one, so the parity flips back to "outside" — which is the correct answer for
 * both, and the reason inner and outer rings are pooled rather than distinguished.
 */
export function pointInRing(point: LatLng, boxed: BoxedRing): boolean {
  if (
    point.lat < boxed.minLat ||
    point.lat > boxed.maxLat ||
    point.lng < boxed.minLng ||
    point.lng > boxed.maxLng
  ) {
    return false;
  }
  let inside = false;
  const ring = boxed.ring;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (a === undefined || b === undefined) continue;
    const aLng = a[0];
    const aLat = a[1];
    const bLng = b[0];
    const bLat = b[1];
    if (aLat > point.lat !== bLat > point.lat) {
      const at = ((bLng - aLng) * (point.lat - aLat)) / (bLat - aLat) + aLng;
      if (point.lng < at) inside = !inside;
    }
  }
  return inside;
}

export function pointInRegion(point: LatLng, region: Region): boolean {
  let inside = false;
  for (const ring of region.rings) {
    if (pointInRing(point, ring)) inside = !inside;
  }
  return inside;
}

/**
 * Which region contains a point, or null.
 *
 * Returns the FIRST match in file order. Natural Earth's admin-0 polygons do overlap in disputed
 * areas, and picking the first is a stable, arbitrary rule rather than an adjudication — which
 * is exactly what CLAUDE.md 11 wants from us. The index is opaque, so nothing downstream can
 * turn this into a claim about who owns anywhere.
 */
export function regionIndexAt(regions: readonly Region[], point: LatLng): number | null {
  for (const region of regions) {
    if (pointInRegion(point, region)) return region.index;
  }
  return null;
}

export function isOnLand(land: readonly BoxedRing[], point: LatLng): boolean {
  let inside = false;
  for (const ring of land) {
    if (pointInRing(point, ring)) inside = !inside;
  }
  return inside;
}

/**
 * Fraction of sampled points along a segment that fall on land, as an integer percentage.
 *
 * Sampling rather than exact intersection because the answer needed is "is this plausibly a road
 * corridor", and an exact ring intersection would be both slower and more precise than the input
 * deserves — a 50m-resolution coastline cannot support a claim about a 3 km strait.
 *
 * Endpoints are excluded: a port sits ON the coast and would score as half-water for reasons
 * that say nothing about the corridor between two ports.
 */
export function landFractionPercent(
  land: readonly BoxedRing[],
  a: LatLng,
  b: LatLng,
  samples: number,
  interpolate: (a: LatLng, b: LatLng, fraction: number) => LatLng,
): number {
  if (samples <= 0) return 100;
  let onLand = 0;
  for (let i = 1; i <= samples; i += 1) {
    const fraction = i / (samples + 1);
    if (isOnLand(land, interpolate(a, b, fraction))) onLand += 1;
  }
  return Math.floor((onLand * 100) / samples);
}

/** Shortest distance from a point to any vertex of any line, in degrees. A cheap proximity test. */
export function nearestLineDegrees(lines: Polylines, point: LatLng): number {
  let best = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    if (
      point.lat < line.minLat - best ||
      point.lat > line.maxLat + best ||
      point.lng < line.minLng - best ||
      point.lng > line.maxLng + best
    ) {
      continue;
    }
    for (const position of line.ring) {
      const dLng = position[0] - point.lng;
      const dLat = position[1] - point.lat;
      const d2 = dLng * dLng + dLat * dLat;
      if (d2 < best * best) best = Math.sqrt(d2);
    }
  }
  return best;
}
