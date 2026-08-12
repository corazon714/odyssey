import {
  serviceMask,
  type GeoEdge,
  type GeoNode,
  type LocationType,
  type PopulationBand,
  type ServiceKind,
  type TerrainKind,
  type TransportMode,
} from '@odyssey/engine';

/**
 * Turn measured facts into the fields the engine reads. ADR 0024 Decision 4.
 *
 * Everything here is derived from settlement size, physical type or geometry. Nothing reads a
 * country, and the functions are shaped so there is nowhere to put one: the inputs are a
 * population count, an elevation, a terrain kind and a pair of coordinates.
 */

/** GeoNames population -> band. The bands are the mechanic; the raw count is not. */
export function populationBandOf(population: number): PopulationBand {
  if (population >= 2000000) return 'metro';
  if (population >= 500000) return 'large';
  if (population >= 100000) return 'medium';
  if (population >= 25000) return 'small';
  if (population > 0) return 'hamlet';
  return 'none';
}

/**
 * Settlement size -> `LocationType`. A waypoint is typed by its terrain instead; see
 * `waypointTypeOf`.
 */
export function settlementTypeOf(band: PopulationBand): LocationType {
  if (band === 'metro' || band === 'large' || band === 'medium') return 'city';
  if (band === 'small') return 'town';
  return 'village';
}

/** A derived waypoint takes its character from the ground, since nobody lives there. */
export function waypointTypeOf(terrain: TerrainKind, hasServices: boolean): LocationType {
  if (hasServices) return 'rest_stop';
  if (terrain === 'desert' || terrain === 'mountain' || terrain === 'steppe') return 'wilderness';
  return 'roadside';
}

/**
 * **The services table, published in ADR 0024 Decision 4 so it is reviewable.**
 *
 * GeoNames carries no services data, so this is a derivation rather than a record — and an
 * underived one would be an unreviewable judgement about a real place. Every input is
 * settlement size or physical type.
 */
export function servicesFor(type: LocationType, band: PopulationBand): number {
  const byType: Partial<Record<LocationType, readonly ServiceKind[]>> = {
    border_crossing: ['fuel'],
    rest_stop: ['fuel', 'lodging'],
    roadside: [],
    wilderness: [],
  };
  const override = byType[type];
  if (override !== undefined) return serviceMask(override);

  const bySize: Record<PopulationBand, readonly ServiceKind[]> = {
    metro: ['fuel', 'lodging', 'medical', 'market', 'transit', 'repair'],
    large: ['fuel', 'lodging', 'medical', 'market', 'transit', 'repair'],
    medium: ['fuel', 'lodging', 'medical', 'market', 'repair'],
    small: ['fuel', 'lodging', 'market', 'repair'],
    hamlet: ['fuel', 'market'],
    none: [],
  };
  const base = [...bySize[band]];
  // A port is a transport hub whatever its size, and something there can fix a vehicle.
  if (type === 'port') {
    for (const extra of ['transit', 'repair'] as const) {
      if (!base.includes(extra)) base.push(extra);
    }
  }
  return serviceMask(base);
}

/**
 * How hard the ground is, 0-4. Read by `safest` (which refuses >= 3) and by the leg model.
 *
 * A property of rock and water, not of anybody who lives on it.
 */
export function terrainDifficultyOf(a: TerrainKind, b: TerrainKind): number {
  const rank: Record<TerrainKind, number> = {
    urban: 0,
    plain: 0,
    coast: 1,
    steppe: 1,
    hill: 2,
    desert: 3,
    mountain: 4,
    sea: 1,
  };
  // The harder of the two ends: a road out of a plain into a mountain range is a mountain road.
  return Math.max(rank[a], rank[b]);
}

/** How much is worth seeing, 0-3. Drives the `scenic` profile and montage selection. */
export function scenicOf(a: TerrainKind, b: TerrainKind): number {
  const rank: Record<TerrainKind, number> = {
    mountain: 3,
    coast: 3,
    hill: 2,
    sea: 2,
    steppe: 1,
    desert: 1,
    plain: 1,
    urban: 0,
  };
  return Math.max(rank[a], rank[b]);
}

/**
 * Modes a corridor supports.
 *
 * `road` is the default and is expressed as the concrete modes that use one. `train` is added
 * only where Natural Earth's railways run near BOTH ends — a proximity predicate, which is all
 * a display-scale rail layer honestly supports. **`ferry` is never added here**: sea crossings
 * are authored in the overlay, because nothing in the geometry knows whether a service exists.
 */
export const ROAD_MODES: readonly TransportMode[] = ['bus', 'car', 'truck', 'rideshare'];
export const RAIL_PROXIMITY_DEGREES = 0.25;

/**
 * How long a corridor can be and still be one you could WALK — about three days at forty
 * kilometres a day, which is a real thing on a long overland journey.
 *
 * **`foot` used to be offered on every corridor, and it broke `cheapest` completely.**
 * `FARE_PER_100KM.foot` is 0, so `cheapest` chose to walk all 257 land edges of the slice — a
 * 2,478 km one included. Its cost then reduced to `0.23 x distance` against `fastest`'s
 * `0.86 x distance`: the same ordering in different units, which is the affine collapse ADR 0025
 * Decision 2 names, and it returned `fastest`'s identical path on 170 of 200 pairs.
 *
 * The comment on `FARE_PER_100KM` claimed the opposite — that a free fare plus "a fortnight of
 * subsistence" was one of the four things keeping the two apart. It could not be: subsistence is
 * charged against elapsed time, time is distance over speed, so the whole term is proportional to
 * distance and cannot reorder anything. That claim has been corrected at source.
 *
 * Choosing to walk 350 km is not a route plan a road-trip game should offer, so the fix is also
 * the honest model. A player who loses their vehicle still walks — that is the run loop's
 * business, and `TRANSPORT_MODES` keeps `foot` for it.
 */
export const FOOT_MAX_KM = 120;

export function modesFor(hasRailAtBothEnds: boolean, distanceKm: number): readonly TransportMode[] {
  const modes = distanceKm <= FOOT_MAX_KM ? (['foot', ...ROAD_MODES] as const) : ROAD_MODES;
  return hasRailAtBothEnds ? [...modes, 'train'] : modes;
}

/**
 * Seasonality, from elevation alone.
 *
 * A high pass closes in winter. That is a fact about snow, and it is the only seasonality the
 * geometry can support — everything else (flood plains, monsoon roads) is authored in the
 * overlay where a human can say why.
 */
export const WINTER_CLOSED_M = 2000;

export function seasonalityOf(maxElevationM: number): GeoEdge['seasonality'] {
  return maxElevationM >= WINTER_CLOSED_M ? 'winter_closed' : 'all_year';
}

export type NodeFacts = {
  readonly id: GeoNode['id'];
  readonly type: LocationType;
  readonly terrain: TerrainKind;
  readonly elevationM: number;
  readonly population: PopulationBand;
  readonly closedMonths: readonly number[];
};

export function buildNode(facts: NodeFacts): GeoNode {
  return {
    id: facts.id,
    type: facts.type,
    terrain: facts.terrain,
    elevationM: facts.elevationM,
    population: facts.population,
    services: servicesFor(facts.type, facts.population),
    closedMonths: facts.closedMonths,
  };
}
