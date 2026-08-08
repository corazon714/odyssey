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
} from './content/game-event.ts';
export { collectRefs, type ContentRef, type ContentRefKind } from './content/collect-refs.ts';
export {
  contentVersion,
  createContentPack,
  EMPTY_REGISTRIES,
  type ContentPack,
  type ContentRegistries,
} from './content/content-pack.ts';
export { ALWAYS, NEVER, type Predicate, type PredicateKind } from './predicate/predicate.ts';
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
