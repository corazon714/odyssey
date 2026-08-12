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
 * A coordinate, in degrees. **The only non-integer value in any content file.**
 *
 * `write-artifacts.ts` quantises to 1e-5 degrees (~1 m) so a regeneration diffs cleanly, but
 * the schema does not restate that: a tighter bound here would reject a file the build tool
 * legitimately produced, and the quantisation belongs to the writer.
 */
const latitudeSchema = z.number().min(-90).max(90);
const longitudeSchema = z.number().min(-180).max(180);

/**
 * One record of `nodes.gen.json`.
 *
 * `name` and the coordinates are carried ALONGSIDE the engine's `GeoNode` rather than inside
 * it, and the split is load-bearing in two different directions:
 *
 * - `name` keeps `packages/engine/src/route/` independent of ADR 0028 — the engine never sees
 *   a place name, so `RoutePreview.notableNodes` is `readonly NodeId[]` and never a string.
 * - `lat`/`lng` keep it independent of geometry. The only engine use for a coordinate is a
 *   great-circle or Euclidean A* heuristic, and `purity.test.ts:71` bans `Math.sqrt`/`hypot`/
 *   `atan2` outright, so a coordinate on `GeoNode` would be a trap with no legal consumer.
 *   Distances arrive precomputed in integer kilometres from `packages/tools/geo-build`, where
 *   the purity test does not reach.
 *
 * They are on the RECORD because the file is the map renderer's source (M3.11's
 * `world.simplified.json` is the basemap; these are the pins), and a field the loader silently
 * dropped would be a field nobody could find later.
 */
export type GeoNodeRecord = {
  readonly node: GeoNode;
  readonly name: string | null;
  readonly lat: number;
  readonly lng: number;
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

/**
 * THE ON-DISK FORM IS TERSE, AND THIS SCHEMA IS WHERE THAT IS WRITTEN DOWN.
 *
 * `write-artifacts.ts` emits `{"id":…,"n":…,"y":…,"x":…,"t":…}` rather than full key names,
 * because ~1,200 nodes and ~2,860 edges pay for every character of every key. So the schema's
 * INPUT is the terse form and its OUTPUT is canonical — the same terse->canonical shape
 * `predicate.ts` uses, for the same reason: one definition of what is on disk, transformed at
 * the boundary, so nothing downstream ever handles a two-letter key.
 *
 * Writing the schema over canonical keys and mapping separately was the alternative. It makes
 * the record shape TWO declarations — the mapping and the schema — which drift the first time
 * a field is added, and the drift is silent because a `strictObject` over canonical keys still
 * parses whatever the mapper handed it.
 *
 * **Nothing links this to `write-artifacts.ts` at compile time**; they are in different
 * packages and the writer builds strings. `geo.test.ts` parses the COMMITTED artifacts through
 * these schemas, and that round trip is the only thing that catches a writer/schema
 * disagreement. Do not delete it in favour of a synthetic fixture.
 */
export const geoNodeSchema = z
  .strictObject({
    id: nodeIdSchema,
    n: nullable(placeNameSchema),
    y: latitudeSchema,
    x: longitudeSchema,
    t: locationTypeSchema,
    tr: terrainKindSchema,
    e: intSchema,
    p: populationBandSchema,
    s: list(serviceKindSchema),
    cm: list(monthSchema),
  })
  .transform((raw): GeoNodeRecord => ({
    node: buildGeoNode({
      id: raw.id,
      type: raw.t,
      terrain: raw.tr,
      elevationM: raw.e,
      population: raw.p,
      services: raw.s,
      closedMonths: raw.cm,
    }),
    name: raw.n,
    lat: raw.y,
    lng: raw.x,
  }));

export const geoEdgeSchema = z
  .strictObject({
    id: edgeIdSchema,
    a: nodeIdSchema,
    b: nodeIdSchema,
    d: intSchema.positive(),
    m: z.array(transportModeSchema).min(1).readonly(),
    td: intSchema.min(0).max(4),
    sc: intSchema.min(0).max(3),
    sz: seasonalitySchema,
    tl: z.boolean(),
    ab: z.boolean(),
    uv: z.boolean(),
  })
  .transform((raw): GeoEdge =>
    buildGeoEdge({
      id: raw.id,
      from: raw.a,
      to: raw.b,
      distanceKm: raw.d,
      modes: raw.m,
      terrainDifficulty: raw.td,
      scenic: raw.sc,
      seasonality: raw.sz,
      tolled: raw.tl,
      adminBoundary: raw.ab,
      unavoidable: raw.uv,
    }),
  );

/**
 * THE FILE ENVELOPES, AND WHY THE METADATA KEYS ARE DECLARED RATHER THAN STRIPPED.
 *
 * Every schema in this package is `strictObject` (ADR 0009 §2, `common.ts`), so a file-level
 * schema must account for every key the file carries — and all three geo files carry metadata:
 * `_format` on both `.gen.json`s, plus `digest`/`count` on nodes and `nodesDigest`/`count` on
 * edges. The overlay's `_comment`/`_tolledComment` are gone by a different route: they became
 * real `#` comments when it moved to YAML at M3.6, which is what YAML is for.
 *
 * The tempting fix was to delete the headers so a strict schema would pass. They are the only
 * record of what the abbreviations mean, where the data came from, and which licence it
 * carries — the last of which is a legal claim, not a nicety. Declaring them costs four lines.
 *
 * `_format` is `list(...)`, not required: it is documentation for humans, so an artifact
 * written without one should still LOAD. `digest` and `count` are required, because they are
 * integrity claims and an absent claim is not the same as a satisfied one — `count` is checked
 * against the array in `load-geo.ts` and `digest` by `GEO_NODES_DIGEST_STALE`.
 */
const digestSchema = z.string().regex(/^[0-9a-f]{16}$/, 'a 16-hex-character digest');

export const geoNodesFileSchema = z.strictObject({
  _format: list(z.string()),
  digest: digestSchema,
  count: intSchema.min(0),
  nodes: z.array(geoNodeSchema).readonly(),
});

export const geoEdgesFileSchema = z.strictObject({
  _format: list(z.string()),
  nodesDigest: digestSchema,
  count: intSchema.min(0),
  edges: z.array(geoEdgeSchema).readonly(),
});

/**
 * `overlay.yaml` — the one geo file a human edits.
 *
 * Every row names NODE IDS and is re-applied against a freshly generated candidate graph on
 * every build, so it is declared intent rather than a patch and cannot rot silently. `reason`
 * is REQUIRED and non-empty on every row: an undocumented override is indistinguishable from a
 * mistake six months later, and this file's comments are its whole value.
 *
 * `reason` is deliberately NOT an i18n key — it never reaches a player. CLAUDE.md rule 2.4
 * governs user-visible strings, and a build-time justification read only by whoever regenerates
 * the slice is not one.
 */
const overlayLinkSchema = z.strictObject({
  from: nodeIdSchema,
  to: nodeIdSchema,
  reason: z.string().min(1),
  seasonality: nullable(seasonalitySchema),
});

const criticalEdgeSchema = z.strictObject({
  edge: edgeIdSchema,
  reason: z.string().min(1),
});

export const geoOverlaySchema = z.strictObject({
  forcedCorridors: list(overlayLinkSchema),
  ferries: list(overlayLinkSchema),
  forbiddenCorridors: list(overlayLinkSchema),
  tolled: list(overlayLinkSchema),
  criticalEdges: list(criticalEdgeSchema),
});

export type GeoNodesFile = z.infer<typeof geoNodesFileSchema>;
export type GeoEdgesFile = z.infer<typeof geoEdgesFileSchema>;
export type GeoOverlay = z.infer<typeof geoOverlaySchema>;
export type GeoOverlayLink = z.infer<typeof overlayLinkSchema>;

/** Everything `packages/content/geo/` holds, once parsed. `null` where the file is absent. */
export type GeoBundle = {
  readonly nodes: readonly GeoNodeRecord[];
  readonly edges: readonly GeoEdge[];
  readonly overlay: GeoOverlay;
  /** The `digest` header of `nodes.gen.json`, as WRITTEN — never as recomputed. */
  readonly nodesDigest: string;
  /** The `nodesDigest` header of `edges.gen.json`. Equal to the above unless one file is stale. */
  readonly edgesNodesDigest: string;
};
