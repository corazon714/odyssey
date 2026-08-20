/**
 * Zod schemas for the content pack.
 *
 * OWNERSHIP, per ADR 0009 — this is the amendment CLAUDE.md §9 records, and the header this
 * file carried before Phase 2A had it backwards. `packages/engine/src/content/` owns the
 * TypeScript types. This directory owns content SEMANTICS: which fields a YAML file may have,
 * which values are legal, and what an omitted key defaults to. The two are held identical by
 * the assertions in `__tests__/conformance.test.ts`, not by convention — so if the schema and
 * the engine type disagree about shape, the build fails and neither is right.
 *
 * WHAT IS DELIBERATELY NOT EXPORTED HERE: the YAML loader. `packages/content`'s package entry
 * is this file, so anything re-exported from it can reach the app bundle. The loader pulls in
 * `yaml` and `node:fs`, neither of which belongs on a phone — the app consumes a pre-built
 * pack, and only build-time tools parse YAML. Import it from `../loader/load-events.ts`
 * directly, which only `packages/tools` does.
 */

export {
  ID_PATTERN,
  I18N_KEY_PATTERN,
  beatTypeSchema,
  checkTagSchema,
  containerKindSchema,
  checkVisibilitySchema,
  endingIdSchema,
  eventIdSchema,
  eventPrioritySchema,
  flagIdSchema,
  i18nKeySchema,
  intSchema,
  itemIdSchema,
  languageIdSchema,
  list,
  locationTypeSchema,
  npcIdSchema,
  nullable,
  numberOpSchema,
  regionIdSchema,
  resourceKeySchema,
  routeProfileSchema,
  runStatusSchema,
  skillKeySchema,
  timeOfDaySchema,
  traitIdSchema,
  transportModeSchema,
  nodeIdSchema,
  edgeIdSchema,
} from './common.ts';

export {
  buildGeoEdge,
  buildGeoNode,
  geoEdgeSchema,
  geoEdgesFileSchema,
  geoNodeSchema,
  geoNodesFileSchema,
  geoOverlaySchema,
  populationBandSchema,
  seasonalitySchema,
  serviceKindSchema,
  terrainKindSchema,
  type GeoBundle,
  type GeoEdgesFile,
  type GeoNodeRecord,
  type GeoNodesFile,
  type GeoOverlay,
  type GeoOverlayLink,
} from './geo.ts';

export { predicateSchema, type TersePredicate } from './predicate.ts';
export { effectSchema } from './effect.ts';
export { gameEventSchema } from './event.ts';

export {
  REGISTRY_FILES,
  endingDeclarationSchema,
  flagDeclarationSchema,
  itemDeclarationSchema,
  npcDeclarationSchema,
  traitDeclarationSchema,
  type EndingDeclaration,
  type FlagDeclaration,
  type ItemDeclaration,
  type NpcDeclaration,
  type RegistryFile,
  type TraitDeclaration,
} from './declarations.ts';
