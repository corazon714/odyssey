import {
  POPULATION_BANDS,
  SEASONALITY_KINDS,
  SERVICE_KINDS,
  TERRAIN_KINDS,
  modeMask,
  serviceMask,
  type GeoEdge,
  type GeoNode,
  type ServiceKind,
  type TransportMode,
} from '@odyssey/engine';
import { z } from 'zod';

import {
  edgeIdSchema,
  intSchema,
  list,
  locationTypeSchema,
  nodeIdSchema,
  nullable,
  transportModeSchema,
} from './common.ts';

/**
 * The authored/derived form of `packages/content/geo/`, and the semantics of what a geo record
 * may say. ADR 0024 is the reasoning; this file is where it is enforced.
 *
 * **Zero `: z.ZodType` annotations, deliberately.** `conformance.test.ts`'s L1 hygiene sweep
 * reads every `.ts` in this directory and pins the set of files carrying one to exactly
 * `['predicate.ts']` — the sole sanctioned case, where only a recursive back-reference is
 * annotated. Nothing here is recursive, and every vocabulary is `z.enum(...)` over the engine's
 * own array, which cannot drift by construction.
 *
 * The four vocabularies below are derived rather than restated for the same reason
 * `beatTypeSchema` is: adding a terrain kind in the engine must not require remembering to add
 * it here.
 */
export const terrainKindSchema = z.enum(TERRAIN_KINDS);
export const serviceKindSchema = z.enum(SERVICE_KINDS);
export const populationBandSchema = z.enum(POPULATION_BANDS);
export const seasonalitySchema = z.enum(SEASONALITY_KINDS);

/**
 * A month index. Authored only for passes and other seasonal closures.
 *
 * Ascending and de-duplicated is a LINT concern rather than a schema one — `content:lint` can
 * name the file and the row; a Zod refinement can only say the array is wrong.
 */
const monthSchema = intSchema.min(1).max(12);

/**
 * A place name — the ONE user-visible string literal this repo permits in content data.
 *
 * CLAUDE.md rule 2.4 is amended for exactly this and one other case, both enumerated in the
 * rule itself so neither spreads (ADR 0028 Decision 1). It holds a real proper noun: the
 * Latin-script local form where the country's primary language uses one, and the GeoNames
 * `asciiname` otherwise.
 *
 * `null` is not an omission — a `border_crossing` node is typed and never named, and
 * `GEO_NAMED_BORDER` makes a non-null name on one an error. The UI composes its label from the
 * type key and the previous node.
 *
 * Note what is NOT here: no `nameKey`. Translations live per locale under `geo.node.<id>.name`
 * and fall back to this field, which is why `i18n/en/` gains no geo keys at all.
 */
const placeNameSchema = z.string().min(1).max(80);

/**
 * One record of `nodes.gen.json`.
 *
 * `name` is carried alongside the engine's `GeoNode` rather than inside it: the engine never
 * sees a place name, which is what keeps `packages/engine/src/route/` independent of ADR 0028.
 */
export type GeoNodeRecord = {
  readonly node: GeoNode;
  readonly name: string | null;
};

export function buildGeoNode(raw: {
  readonly id: GeoNode['id'];
  readonly type: GeoNode['type'];
  readonly terrain: GeoNode['terrain'];
  readonly elevationM: number;
  readonly population: GeoNode['population'];
  readonly services: readonly ServiceKind[];
  readonly closedMonths: readonly number[];
}): GeoNode {
  return {
    id: raw.id,
    type: raw.type,
    terrain: raw.terrain,
    elevationM: raw.elevationM,
    population: raw.population,
    services: serviceMask(raw.services),
    closedMonths: raw.closedMonths,
  };
}

export function buildGeoEdge(raw: {
  readonly id: GeoEdge['id'];
  readonly from: GeoEdge['from'];
  readonly to: GeoEdge['to'];
  readonly distanceKm: number;
  readonly modes: readonly TransportMode[];
  readonly terrainDifficulty: number;
  readonly scenic: number;
  readonly seasonality: GeoEdge['seasonality'];
  readonly tolled: boolean;
  readonly adminBoundary: boolean;
  readonly unavoidable: boolean;
}): GeoEdge {
  return {
    id: raw.id,
    from: raw.from,
    to: raw.to,
    distanceKm: raw.distanceKm,
    modes: modeMask(raw.modes),
    terrainDifficulty: raw.terrainDifficulty,
    scenic: raw.scenic,
    seasonality: raw.seasonality,
    tolled: raw.tolled,
    adminBoundary: raw.adminBoundary,
    unavoidable: raw.unavoidable,
  };
}

export const geoNodeSchema = z
  .strictObject({
    id: nodeIdSchema,
    name: nullable(placeNameSchema),
    type: locationTypeSchema,
    terrain: terrainKindSchema,
    elevationM: intSchema,
    population: populationBandSchema,
    services: list(serviceKindSchema),
    closedMonths: list(monthSchema),
  })
  .transform((raw): GeoNodeRecord => ({ node: buildGeoNode(raw), name: raw.name }));

export const geoEdgeSchema = z
  .strictObject({
    id: edgeIdSchema,
    from: nodeIdSchema,
    to: nodeIdSchema,
    distanceKm: intSchema.positive(),
    modes: z.array(transportModeSchema).min(1).readonly(),
    terrainDifficulty: intSchema.min(0).max(4),
    scenic: intSchema.min(0).max(3),
    seasonality: seasonalitySchema,
    tolled: z.boolean(),
    adminBoundary: z.boolean(),
    unavoidable: z.boolean(),
  })
  .transform((raw): GeoEdge => buildGeoEdge(raw));
