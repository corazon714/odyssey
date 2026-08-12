/**
 * Public surface of the Odyssey engine.
 *
 * Phase 1 M1 ships the seeded RNG. State, predicate, effects, director, queue and loop
 * follow in M2-M11; see docs/PROGRESS.md for the exact next step.
 *
 * Everything exported here must remain pure TypeScript: no React, React Native, Expo, or
 * DOM/native API may be imported anywhere in this package (CLAUDE.md 2.2), and no
 * `Math.random()` / `Date.now()` may appear (CLAUDE.md 2.3). Both are enforced by
 * eslint.config.mjs and by src/__tests__/purity.test.ts, which also bans the
 * implementation-approximated and locale-dependent APIs that would make a golden run
 * disagree between V8 and Hermes.
 *
 * Relative imports carry an explicit `.ts` extension so this file runs under bare Node,
 * which is how CI proves rule 2.2 executably (`node packages/engine/src/index.ts`).
 */

export {
  engineError,
  ENGINE_ERROR_CODES,
  type EngineError,
  type EngineErrorCode,
} from './errors/engine-error.ts';

export { type Brand } from './ids/brand.ts';
export * from './ids/content-ids.ts';

export { CHECK_TAGS, SKILL_IMPLIES_TAG, type CheckTag } from './modifiers/check-tag.ts';
export {
  CONTAINER_KINDS,
  CONTAINER_SPECS,
  DRAIN_ORDER,
  countEverywhere,
  countIn,
  createContainer,
  createInventory,
  freeSlots,
  presentContainers,
  usedSlots,
  type Container,
  type ContainerKind,
  type InventoryState,
} from './state/container-state.ts';
export {
  DEFAULT_TUNABLES,
  mulDivRound,
  type ModifierTunables,
} from './modifiers/modifier-tunables.ts';
export {
  EMPTY_MODIFIER_REGISTRY,
  MODIFIER_SOURCE_KINDS,
  createModifierRegistry,
  type ModifierRegistry,
  type ModifierSourceKind,
  type RegistryModifier,
} from './modifiers/registry-modifier.ts';
export {
  resolveModifiers,
  type CheckLike,
  type LocalModifier,
} from './modifiers/resolve-modifiers.ts';
export {
  collapseChips,
  CHIP_OVERFLOW_LABEL_KEY,
  MAX_MODIFIER_CHIPS,
  type ModifierChip,
} from './modifiers/collapse-chips.ts';
export {
  EMPTY_RESOLUTION,
  type ModifierResolution,
  type ResolvedModifier,
  type SuppressedModifier,
} from './modifiers/resolved-modifier.ts';
export { BEAT_TYPES, type BeatType } from './content/beat-type.ts';
export { EVENT_PRIORITIES, type EventPriority } from './content/event-priority.ts';
export { LOCATION_TYPES, type LocationType } from './content/location-type.ts';
export {
  ANY_CONTEXT,
  CHECK_VISIBILITIES,
  type CheckVisibility,
  type Choice,
  type EventContext,
  type GameEvent,
  type Outcome,
  type SkillCheck,
  type SkillCheckCoversSpec,
} from './content/game-event.ts';
export { type SearchSpec } from './content/search-spec.ts';
export {
  COMPLICATION_CHOICE_PREFIX,
  createComplicationRegistry,
  EMPTY_COMPLICATION_REGISTRY,
  type ComplicationRegistry,
  type RegistryComplication,
} from './content/registry-complication.ts';
export { presentedChoices } from './content/presented-choices.ts';
export { ATTACH_PERCENT, selectComplication } from './director/select-complication.ts';
export {
  createUniversalChoiceRegistry,
  EMPTY_UNIVERSAL_CHOICE_REGISTRY,
  MAX_UNIVERSAL_PER_EVENT,
  UNIVERSAL_CHOICE_PREFIX,
  type UniversalChoice,
  type UniversalChoiceRegistry,
} from './content/universal-choice.ts';
export {
  injectUniversalChoices,
  type InjectionResult,
  type ShadowedInjection,
} from './content/inject-universal-choices.ts';
export { tagsOf } from './content/event-tags.ts';
export {
  collectFlagUsage,
  collectRefs,
  type ContentRef,
  type ContentRefKind,
  type FlagUsage,
} from './content/collect-refs.ts';
export {
  contentVersion,
  createContentPack,
  EMPTY_REGISTRIES,
  type ContentPack,
  type ContentRegistries,
} from './content/content-pack.ts';
export {
  ALWAYS,
  NEVER,
  PREDICATE_KINDS,
  type Predicate,
  type PredicateKind,
  type PredicateKindsAreExhaustive,
} from './predicate/predicate.ts';
export {
  compareNumber,
  NUMBER_OPS,
  type NumberCmp,
  type NumberOp,
} from './predicate/number-cmp.ts';
export { compareFlag, type FlagCmp } from './predicate/flag-cmp.ts';
export {
  EMPTY_REASONS,
  leafReason,
  NO_PARAMS,
  unknownRefReason,
  type ReasonNode,
  type ReasonParams,
} from './predicate/reason-node.ts';
export {
  ALL_REFS_KNOWN,
  chanceAddress,
  createPredicateContext,
  type ContentRefs,
  type PredicateContext,
} from './predicate/predicate-context.ts';
export { evaluatePredicate, type PredicateResult } from './predicate/evaluate-predicate.ts';
export { describeReason, type ReasonLine } from './predicate/describe-reason.ts';
export { hasFlag, readFlag } from './state/flag-access.ts';

export { NO_TEXT_PARAMS, type TextParams } from './text-params.ts';
export {
  EFFECT_OPS,
  type DocumentChange,
  type Effect,
  type EffectOp,
  type RouteChange,
  type TransportChange,
} from './effects/effect.ts';
export {
  appliedEffect,
  type AppliedEffect,
  type EffectApplication,
} from './effects/applied-effect.ts';
export { createEffectContext, type EffectContext } from './effects/effect-context.ts';
export { applyEffect, applyEffects } from './effects/apply-effects.ts';
export {
  choiceModifierSource,
  collectModifiers,
  PHASE_1_MODIFIER_SOURCES,
  type CheckModifier,
  type ModifierSource,
  type SkillCheckSpec,
} from './effects/modifier-source.ts';

export { BEAT_SLOT_STATUSES, type BeatSlot, type BeatSlotStatus } from './state/beat-slot.ts';
export { clampValue, NO_CLAMPS, type ClampEvent } from './state/clamp-event.ts';
export {
  advanceClock,
  createClock,
  timeOfDayFor,
  TIMES_OF_DAY,
  type ClockState,
  type TimeOfDay,
  type Weekday,
} from './state/clock-state.ts';
export {
  createDocuments,
  type DocumentsState,
  type PassportState,
  type TicketState,
  type VisaState,
} from './state/documents-state.ts';
export { type HistoryEntry } from './state/history-entry.ts';
export {
  type EventMemoryEntry,
  type FlagEntry,
  type FlagValue,
  type InventoryEntry,
  type RelationshipEntry,
} from './state/memory-entries.ts';
export { type PendingEvent } from './state/pending-event.ts';
export { NO_PRESENTATION, type Presentation } from './state/presentation.ts';
export {
  clampResources,
  createResources,
  RESOURCE_BOUNDS,
  RESOURCE_KEYS,
  type ResourceKey,
  type Resources,
} from './state/resources.ts';
export { ROUTE_PROFILES, type RouteProfile, type RouteState } from './state/route-state.ts';
export { RUN_STATUSES, type RunStatus } from './state/run-status.ts';
export {
  clampSkills,
  createSkills,
  SKILL_KEYS,
  SKILL_MAX,
  SKILL_MIN,
  type SkillKey,
  type Skills,
} from './state/skills.ts';
export {
  createTransport,
  TRANSPORT_MODES,
  type TransportMode,
  type TransportState,
} from './state/transport-state.ts';
export { createRunInit, type RunInit } from './state/run-init.ts';
export { type RunState } from './state/run-state.ts';
export {
  createRunState,
  SAVE_VERSION,
  type CreateRunStateResult,
} from './state/create-run-state.ts';
export { validateRoute } from './state/validate-route.ts';
export { canonicalJson } from './state/canonical-json.ts';
export { digestOf, stateDigest } from './state/state-digest.ts';

export { createRng, type Rng } from './rng/rng.ts';
export { createRngCursors, ALL_RNG_STREAMS, type RngCursors } from './rng/rng-cursors.ts';
export { RNG_STREAMS, type RngStream } from './rng/rng-stream.ts';
export { CHECK_DIE_SIDES, type RollModifier, type RollResult } from './rng/roll-result.ts';
export { createStreamKeys, deriveKey, streamKey, type StreamKeys } from './rng/stream-key.ts';
export { pickByWeight, totalWeight, type WeightedEntry } from './rng/weighted-pick.ts';

export {
  filterEvent,
  RELAX_NOTHING,
  type FilterVerdict,
  type Relaxation,
} from './director/hard-filters.ts';
export {
  duePendingEvents,
  selectEvent,
  type SelectOptions,
  type SelectionResult,
} from './director/select-event.ts';
export * from './director/scoring-constants.ts';
export {
  contextAffinity,
  novelty,
  priorityBoost,
  recency,
  SCORING_FACTORS,
  tensionFit,
} from './director/scoring-factors.ts';
export { tagSaturation } from './director/tag-saturation.ts';
export { pickWeight, scoreEvent } from './director/score-event.ts';
export { FILLER_RUNG, RELAXATION_RUNGS, UNEVENTFUL_RUNG } from './director/relaxation-rung.ts';

// ── route generation ───────────────────────────────────────────────────────────────────────
// The graph is a PARAMETER, never loaded here: the engine may not read a file, and geography is
// a build-time input rather than pack content because it cannot change how an existing run
// plays. ADR 0024 Decision 3.
export { TERRAIN_KINDS, type TerrainKind } from './route/geo-terrain.ts';
export {
  SERVICE_KINDS,
  hasService,
  serviceCount,
  serviceMask,
  servicesOf,
  type ServiceKind,
} from './route/geo-services.ts';
export {
  POPULATION_BANDS,
  populationRank,
  type GeoNode,
  type PopulationBand,
} from './route/geo-node.ts';
export {
  SEASONALITY_KINDS,
  hasMode,
  modeMask,
  modesOf,
  type GeoEdge,
  type Seasonality,
} from './route/geo-edge.ts';
export {
  createGeoGraph,
  edgeAt,
  nodeAt,
  otherEnd,
  type GeoGraph,
  type GeoGraphResult,
} from './route/geo-graph.ts';
export { createIntHeap, type IntHeap } from './route/int-heap.ts';
export {
  NO_RELAXATION,
  RELAX_ALL_MASKS,
  costFor,
  type CostRelaxation,
  type EdgeCost,
} from './route/cost-function.ts';
export { pathKey, shortestPath, type GeoPath, type ShortestPathOptions } from './route/dijkstra.ts';
export {
  MAX_SPUR_NODES,
  kShortestPaths,
  type YenOptions,
  type YenResult,
} from './route/yen-k-shortest.ts';
export {
  DIVERSITY_MAX_PERCENT,
  DIVERSITY_RUNGS,
  acceptByDiversity,
  overlapPercent,
  type DiversityRung,
  type DiversityVerdict,
} from './route/route-diversity.ts';
export {
  MAX_CANDIDATE_ROUTES,
  MIN_CANDIDATE_ROUTES,
  selectPaths,
  type PathShortfall,
  type RejectedPath,
  type SelectPathsResult,
  type SelectedPath,
} from './route/select-paths.ts';
export {
  generateRoutes,
  type GenerateRoutesResult,
  type RoutePlan,
  type RouteStart,
} from './route/generate-routes.ts';
export { type RoutePreview } from './route/route-preview.ts';
export {
  collectComplications,
  EMPTY_COMPLICATIONS,
  PHASE_1_COMPLICATION_SOURCES,
  type Complication,
  type ComplicationSource,
} from './director/complication-source.ts';
export { consecutiveHighTension, nextTension } from './director/tension.ts';

export { advanceLeg, type AdvanceLegResult } from './loop/advance-leg.ts';
export { pickOutcome, resolveChoice, type ResolveChoiceResult } from './loop/resolve-choice.ts';
export { runSkillCheck } from './loop/run-skill-check.ts';
export { searchCheck } from './loop/search-check.ts';
export { checkRunEnd, type RunEndVerdict } from './loop/check-run-end.ts';
export { worldTick } from './loop/world-tick.ts';
export { locationAtLeg } from './state/route-state.ts';

export {
  MAX_PENDING,
  MAX_PENDING_PER_EVENT,
  PENDING_DROP_REASONS,
  type PendingDropReason,
} from './queue/queue-limits.ts';
export { NO_DROPS, pendingDrop, type PendingDrop } from './queue/pending-drop.ts';
export { evictPending, type EvictResult } from './queue/evict-pending.ts';
export { consumePending, expirePending, type ExpireResult } from './queue/expire-pending.ts';
export { rebasePendingEvents, type Rebase, type RebaseResult } from './queue/rebase-pending.ts';
export { schedulePending } from './queue/schedule-pending.ts';
export { unresolvedThreads, type UnresolvedThread } from './queue/unresolved-threads.ts';

export {
  advanceBeatSchedule,
  dueBeatSlot,
  isSlotOpen,
  unfillableBeats,
  type BeatScheduleUpdate,
} from './director/beat-slots.ts';

export { replayRun, type ReplayResult } from './loop/replay-run.ts';

export { type Migration } from './migrate/migration.ts';
export { MIGRATIONS } from './migrate/migrations.ts';
export { isRunStateShape } from './migrate/run-state-shape.ts';
export { migrateSave, type MigrateResult } from './migrate/migrate-save.ts';
export { reconcileContent, type ContentReconciliation } from './migrate/reconcile-content.ts';
