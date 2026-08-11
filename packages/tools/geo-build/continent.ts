import { type LatLng } from './geodesy.ts';

/**
 * Which landmass a coordinate sits on, from BOUNDING BOXES — never from a country code.
 *
 * This is the one classification the node budget needs (ADR 0024 Decision 2 allocates quotas per
 * continent), and it has to be derived in a way CLAUDE.md 11 permits. A continent is a landmass:
 * a physical fact about where a point is, in the same family as terrain and elevation. A country
 * is a political fact about who administers it, and nothing in the shipped data may carry one.
 *
 * The boxes are coarse and they OVERLAP; first match wins, so the order below is the decision.
 * Coarse is fine because the only consumer is a per-continent quota — a city assigned to the
 * wrong side of a boundary shifts one unit of budget and changes nothing a player can see.
 *
 * `other` is a real answer, not a failure: Antarctica and remote islands fall here and are
 * excluded from the node set (ADR 0024), because a node no route can reach is dead weight in
 * every Dijkstra.
 */
export const CONTINENTS = [
  'europe',
  'asia',
  'africa',
  'north_america',
  'south_america',
  'oceania',
  'other',
] as const;

export type Continent = (typeof CONTINENTS)[number];

type Box = {
  readonly continent: Continent;
  readonly minLat: number;
  readonly maxLat: number;
  readonly minLng: number;
  readonly maxLng: number;
};

/**
 * Ordered, and the order is load-bearing where boxes overlap.
 *
 * Europe before Asia so the Urals-to-Atlantic band resolves west; Africa before Asia so Sinai
 * and the Maghreb resolve south; Central America before South America so the isthmus resolves
 * north, which matters because the Darién is where the two continents stop being connected
 * overland at all.
 */
/**
 * The Mediterranean, as a piecewise latitude threshold by longitude.
 *
 * **No bounding box can separate Europe from Africa here**, and the first attempt proved it:
 * Europe's box ran to 34N, was checked first, and swallowed seven Maghreb-coast nodes into
 * Europe's quota. But a latitude cut alone cannot work either — Crete sits at 35.3N and Tripoli
 * at 32.9N, so any single parallel puts one of them on the wrong continent.
 *
 * What does work is that the African shore *slopes*: ~36N off Morocco, ~37.5N at Tunis, then
 * dropping to ~33N across Libya and ~32N at the Nile. A point south of that line is Africa.
 *
 * Checked against real places: Tangier 35.8N/-5.8 -> Africa · Malaga 36.7N/-4.4 -> Europe ·
 * Tunis 36.8N/10.2 -> Africa · Palermo 38.1N/13.4 -> Europe · Malta 35.9N/14.5 -> Europe ·
 * Tripoli 32.9N/13.2 -> Africa · Crete 35.3N/25 -> Europe · Alexandria 31.2N/29.9 -> Africa.
 *
 * Still geometric: a coordinate in, a landmass out. Nothing reads a country.
 */
const AFRICAN_SHORE: readonly { readonly maxLng: number; readonly northLimit: number }[] = [
  { maxLng: 0, northLimit: 36 },
  { maxLng: 12, northLimit: 37.5 },
  { maxLng: 25, northLimit: 33 },
  { maxLng: 37, northLimit: 32 },
];

function southOfTheMediterranean(point: LatLng): boolean {
  if (point.lng < -18 || point.lng > 37) return false;
  for (const segment of AFRICAN_SHORE) {
    if (point.lng <= segment.maxLng) return point.lat < segment.northLimit;
  }
  return false;
}

const BOXES: readonly Box[] = [
  { continent: 'europe', minLat: 34, maxLat: 72, minLng: -25, maxLng: 40 },
  { continent: 'africa', minLat: -36, maxLat: 38, minLng: -19, maxLng: 52 },
  { continent: 'north_america', minLat: 7, maxLat: 84, minLng: -170, maxLng: -52 },
  { continent: 'south_america', minLat: -56, maxLat: 13, minLng: -82, maxLng: -34 },
  { continent: 'oceania', minLat: -48, maxLat: 0, minLng: 110, maxLng: 180 },
  { continent: 'oceania', minLat: -48, maxLat: -5, minLng: -180, maxLng: -130 },
  { continent: 'asia', minLat: -11, maxLat: 78, minLng: 25, maxLng: 180 },
  { continent: 'asia', minLat: 60, maxLat: 78, minLng: -180, maxLng: -168 },
];

export function continentOf(point: LatLng): Continent {
  // Before the boxes, because Europe's box overlaps the whole North African coast.
  if (southOfTheMediterranean(point)) return 'africa';
  for (const box of BOXES) {
    if (
      point.lat >= box.minLat &&
      point.lat <= box.maxLat &&
      point.lng >= box.minLng &&
      point.lng <= box.maxLng
    ) {
      return box.continent;
    }
  }
  return 'other';
}

/**
 * The node budget from ADR 0024 Decision 2, as data so `--stage=audit` can print measured
 * supply against it rather than against a number in a document nobody re-reads.
 */
export const SETTLEMENT_QUOTA: Readonly<Record<Continent, number>> = Object.freeze({
  asia: 195,
  europe: 150,
  africa: 120,
  north_america: 110,
  south_america: 90,
  oceania: 55,
  other: 0,
});
