/**
 * Spherical geometry. **THE ONLY MODULE IN THE REPO THAT MAY USE TRANSCENDENTALS.**
 *
 * `packages/engine/src/__tests__/purity.test.ts` bans `Math.sin`, `Math.atan2`, `Math.sqrt` and
 * friends outright, because ECMAScript marks them implementation-approximated and V8 and Hermes
 * may differ in the last bit — which would break golden-run replay in a way no local test sees.
 * That test walks `packages/engine/src` only, so this file is legal.
 *
 * **Legal is not stable.** A Node upgrade can shift a last-bit result, flip a `<` at a selection
 * boundary, and rewrite both generated artifacts on a pull request that touched nothing. Two
 * things contain that:
 *
 * 1. every distance leaves here QUANTISED to an integer kilometre, so the shipped data cannot
 *    carry a float at all;
 * 2. every *decision* boundary goes through `EpsilonLedger`, which resolves a near-tie by an
 *    integer key instead of by the float and **counts how often it had to**. That count is
 *    printed by `--stage=audit`. Until it is zero and stable across Node majors, `geo:build
 *    --check` cannot be a blocking CI gate. ADR 0024 Decision 6.
 */

/** IUGG mean radius. The value is a convention, not a measurement, so it is pinned here. */
export const EARTH_RADIUS_KM = 6371;

const DEGREES_TO_RADIANS = Math.PI / 180;

export type LatLng = {
  readonly lat: number;
  readonly lng: number;
};

export function toRadians(degrees: number): number {
  return degrees * DEGREES_TO_RADIANS;
}

/**
 * Great-circle distance in EXACT KILOMETRES (a float).
 *
 * Callers that persist a distance must round it — see `distanceKm`. This variant exists for
 * comparisons made before quantisation, which is exactly where the epsilon rule applies.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const latA = toRadians(a.lat);
  const latB = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(latA) * Math.cos(latB) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The persisted form: integer kilometres, minimum 1 so no edge can ever weigh zero. */
export function distanceKm(a: LatLng, b: LatLng): number {
  return Math.max(1, Math.round(haversineKm(a, b)));
}

/** Initial bearing in degrees, 0-359. Used to bucket neighbours into sectors. */
export function bearingDegrees(from: LatLng, to: LatLng): number {
  const dLng = toRadians(to.lng - from.lng);
  const latA = toRadians(from.lat);
  const latB = toRadians(to.lat);
  const y = Math.sin(dLng) * Math.cos(latB);
  const x = Math.cos(latA) * Math.sin(latB) - Math.sin(latA) * Math.cos(latB) * Math.cos(dLng);
  const degrees = Math.atan2(y, x) / DEGREES_TO_RADIANS;
  return Math.round((degrees + 360) % 360) % 360;
}

/**
 * A point a given fraction along the great circle from `a` to `b`.
 *
 * Coordinates are quantised to 1e-5 degrees — about a metre — so a waypoint's position is a
 * fixed decimal rather than whatever the last bit of `sin` produced today.
 */
export function interpolate(a: LatLng, b: LatLng, fraction: number): LatLng {
  const d = haversineKm(a, b) / EARTH_RADIUS_KM;
  if (d === 0) return { lat: quantise(a.lat), lng: quantise(a.lng) };
  const A = Math.sin((1 - fraction) * d) / Math.sin(d);
  const B = Math.sin(fraction * d) / Math.sin(d);
  const latA = toRadians(a.lat);
  const latB = toRadians(b.lat);
  const lngA = toRadians(a.lng);
  const lngB = toRadians(b.lng);
  const x = A * Math.cos(latA) * Math.cos(lngA) + B * Math.cos(latB) * Math.cos(lngB);
  const y = A * Math.cos(latA) * Math.sin(lngA) + B * Math.cos(latB) * Math.sin(lngB);
  const z = A * Math.sin(latA) + B * Math.sin(latB);
  return {
    lat: quantise(Math.atan2(z, Math.sqrt(x * x + y * y)) / DEGREES_TO_RADIANS),
    lng: quantise(Math.atan2(y, x) / DEGREES_TO_RADIANS),
  };
}

/** Fixed 1e-5 degrees. Every coordinate that reaches a file goes through this. */
export function quantise(degrees: number): number {
  return Math.round(degrees * 100000) / 100000;
}

/**
 * Records how often a decision fell inside the band where a float could not be trusted.
 *
 * A ledger rather than a boolean because the number is the finding: one epsilon resolution in a
 * 1,200-node build is a curiosity, four hundred means the selection is balanced on a knife edge
 * and `--check` will flap on the next Node release.
 */
export type EpsilonLedger = {
  /** Compare two measurements. Inside the band, `tieBreak` decides and the event is counted. */
  compare(a: number, b: number, scale: number, tieBreak: number): number;
  readonly resolutions: number;
  readonly sites: ReadonlyMap<string, number>;
  at(site: string): EpsilonLedger;
};

/** Relative width of the untrustworthy band. One part in a million of the scale being compared. */
export const EPSILON_RELATIVE = 1e-6;

export function createEpsilonLedger(): EpsilonLedger {
  const sites = new Map<string, number>();
  let resolutions = 0;
  let current = 'unnamed';

  const ledger: EpsilonLedger = {
    compare(a: number, b: number, scale: number, tieBreak: number): number {
      const band = Math.abs(scale) * EPSILON_RELATIVE;
      if (Math.abs(a - b) < band) {
        resolutions += 1;
        sites.set(current, (sites.get(current) ?? 0) + 1);
        return tieBreak;
      }
      return a < b ? -1 : 1;
    },
    get resolutions(): number {
      return resolutions;
    },
    get sites(): ReadonlyMap<string, number> {
      return sites;
    },
    at(site: string): EpsilonLedger {
      current = site;
      return ledger;
    },
  };

  return ledger;
}
