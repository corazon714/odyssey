import { continentOf, type Continent } from './continent.ts';
import { cellOf, type DensityClass } from './grid.ts';
import { quantise, type LatLng } from './geodesy.ts';

/**
 * Read the GeoNames `cities15000` dump into candidates.
 *
 * Tab-separated with no quoting and no escapes, which is why `split('\t')` is sufficient and no
 * CSV dependency is needed — ADR 0024 Decision 5 makes that a policy rather than a happy
 * accident. The column order is the published `geoname` table layout and is asserted by
 * `COLUMNS` below so a format change fails loudly instead of silently shifting every field.
 *
 * Licence: CC BY 4.0, attribution binding on distribution — `docs/geo-data-licensing.md`.
 */

/** Published column order of the GeoNames main table. Index positions we actually consume. */
const COLUMNS = {
  geonameid: 0,
  name: 1,
  asciiname: 2,
  latitude: 4,
  longitude: 5,
  featureClass: 6,
  featureCode: 7,
  countryCode: 8,
  population: 14,
  elevation: 15,
  dem: 16,
} as const;

const EXPECTED_FIELDS = 19;

export type Candidate = {
  readonly geonameid: number;
  /** UTF-8 name as published. Resolved to the shipped form by ADR 0028's rule at M3.5. */
  readonly name: string;
  readonly asciiname: string;
  readonly lat: number;
  readonly lng: number;
  /** `PPLC`, `PPLA`, `PPLA2`, `PPL`, ... A settlement attribute, never a country attribute. */
  readonly featureCode: string;
  /**
   * BUILD-TIME ONLY. Used to detect that an edge crosses an administrative boundary, then
   * discarded — ADR 0024 Decision 4 forbids it reaching any shipped file, on any node type.
   */
  readonly countryCode: string;
  readonly population: number;
  /** Digital elevation model metres. Preferred over `elevation`, which is frequently null. */
  readonly dem: number;
  readonly cell: number;
  readonly continent: Continent;
};

export type ReadResult = {
  readonly candidates: readonly Candidate[];
  /** Lines that could not be read, with the reason. Reported, never silently skipped. */
  readonly rejected: readonly string[];
};

/**
 * Parse the dump text.
 *
 * Only feature class `P` (populated places) is kept: the file also carries administrative
 * regions and, in the wider dumps, hydrographic and terrain features, none of which is a place
 * a traveller stops.
 */
export function readGeonames(text: string): ReadResult {
  const candidates: Candidate[] = [];
  const rejected: string[] = [];

  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (line === '' || line.startsWith('#')) continue;

    const fields = line.split('\t');
    if (fields.length < EXPECTED_FIELDS) {
      rejected.push(`expected ${String(EXPECTED_FIELDS)} fields, got ${String(fields.length)}`);
      continue;
    }
    if (fields[COLUMNS.featureClass] !== 'P') continue;

    const geonameid = Number(fields[COLUMNS.geonameid]);
    const lat = Number(fields[COLUMNS.latitude]);
    const lng = Number(fields[COLUMNS.longitude]);
    const population = Number(fields[COLUMNS.population]);
    const demRaw = fields[COLUMNS.dem];
    const dem = demRaw === undefined || demRaw === '' ? 0 : Number(demRaw);

    if (!Number.isFinite(geonameid) || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      rejected.push(`unparseable id or coordinates: ${line.slice(0, 60)}`);
      continue;
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      rejected.push(`coordinates out of range: ${String(lat)},${String(lng)}`);
      continue;
    }

    const point: LatLng = { lat: quantise(lat), lng: quantise(lng) };
    candidates.push({
      geonameid,
      name: fields[COLUMNS.name] ?? '',
      asciiname: fields[COLUMNS.asciiname] ?? '',
      lat: point.lat,
      lng: point.lng,
      featureCode: fields[COLUMNS.featureCode] ?? '',
      countryCode: fields[COLUMNS.countryCode] ?? '',
      population: Number.isFinite(population) ? population : 0,
      dem: Number.isFinite(dem) ? dem : 0,
      cell: cellOf(point),
      continent: continentOf(point),
    });
  }

  // Sorted by geonameid so the pipeline's input order is a property of the DATA rather than of
  // the file, and a re-download that reorders lines cannot change what gets selected.
  return {
    candidates: [...candidates].sort((a, b) => a.geonameid - b.geonameid),
    rejected,
  };
}

/** Candidates inside a bounding box, for the vertical slice. `--bbox=minLng,minLat,maxLng,maxLat`. */
export type BoundingBox = {
  readonly minLng: number;
  readonly minLat: number;
  readonly maxLng: number;
  readonly maxLat: number;
};

export function withinBox(
  candidates: readonly Candidate[],
  box: BoundingBox,
): readonly Candidate[] {
  return candidates.filter(
    (c) => c.lat >= box.minLat && c.lat <= box.maxLat && c.lng >= box.minLng && c.lng <= box.maxLng,
  );
}

export type DensityIndex = {
  readonly byCell: ReadonlyMap<number, number>;
  classOf(candidate: Candidate): DensityClass;
};
