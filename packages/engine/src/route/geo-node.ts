import { type NodeId } from '../ids/content-ids.ts';
import { type LocationType } from '../content/location-type.ts';
import { type TerrainKind } from './geo-terrain.ts';

/**
 * Settlement size, banded. The bands are the mechanic; the raw population is not.
 *
 * A band rather than the GeoNames integer because nothing in the game asks "how many people
 * live here" — the questions are all "is this big enough to have a hospital" and "is this
 * somewhere a checkpoint would bother". Banding also keeps the shipped file small and makes
 * the services derivation (ADR 0024 Decision 4) a five-row table rather than a curve.
 *
 * Ordered ascending, so the index IS the rank — see `populationRank`.
 */
export const POPULATION_BANDS = ['none', 'hamlet', 'small', 'medium', 'large', 'metro'] as const;

export type PopulationBand = (typeof POPULATION_BANDS)[number];

/** Ascending rank, 0..5. Comparisons use this rather than string order. */
export function populationRank(band: PopulationBand): number {
  return POPULATION_BANDS.indexOf(band);
}

/**
 * A place on the map, as the ENGINE sees it.
 *
 * Three omissions, each load-bearing (ADR 0024 Decision 4, ADR 0028 Consequences):
 *
 * - **No `name`.** The name lives in the data file, never in the engine. That is what makes
 *   this module independent of the place-name decision — `RoutePreview.notableNodes` is a
 *   list of ids, and if ADR 0028 were reversed tomorrow no engine code would change.
 * - **No `countryCode`.** There is no game consumer, and point-in-polygon makes a political
 *   assignment for every disputed territory and ships it as fact. It is build-time only.
 * - **No coordinates.** The only engine use would be a great-circle or Euclidean heuristic,
 *   and `purity.test.ts` bans `Math.sqrt`, `Math.hypot` and `Math.atan2` outright. Carrying
 *   them would be carrying a trap. Distances arrive precomputed as integer kilometres from
 *   `packages/tools/geo-build`, where the purity test does not reach.
 *
 * `type` is `LocationType` — the same vocabulary `legLocations` uses — rather than a parallel
 * node-kind enum. That removes a mapping table and makes `deriveLegLocations` a direct read.
 * A mountain pass is `{ type: 'wilderness', terrain: 'mountain', elevationM >= 1500 }`; there
 * is no `pass` type.
 */
export type GeoNode = {
  readonly id: NodeId;
  readonly type: LocationType;
  readonly terrain: TerrainKind;
  /** Integer metres. May be negative — the Dead Sea and the Caspian depression are real. */
  readonly elevationM: number;
  readonly population: PopulationBand;
  /** 6-bit mask over `SERVICE_KINDS` index order. See `geo-services.ts`. */
  readonly services: number;
  /** Months 1-12, ascending. Empty means open all year. */
  readonly closedMonths: readonly number[];
};
