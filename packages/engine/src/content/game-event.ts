import { type ChoiceId, type EventId } from '../ids/content-ids.ts';
import { type Effect } from '../effects/effect.ts';
import { type CheckModifier, type SkillCheckSpec } from '../effects/modifier-source.ts';
import { type SkillKey } from '../state/skills.ts';
import { type Predicate } from '../predicate/predicate.ts';
import { type TimeOfDay } from '../state/clock-state.ts';
import { type RouteProfile } from '../state/route-state.ts';
import { type TransportMode } from '../state/transport-state.ts';
import { type BeatType } from './beat-type.ts';
import { type EventPriority } from './event-priority.ts';
import { type LocationType } from './location-type.ts';

/**
 * An authored event, as the engine sees it AFTER parsing.
 *
 * NO `nextEventId`, and no field that could become one. Events declare `requires` and a
 * `weight`; the director picks from whatever is eligible. The narrative graph is emergent
 * (CLAUDE.md 2.1, ADR 0001), and the single sanctioned soft pointer is the `scheduleEvent`
 * EFFECT — a request over a leg range that the director may decline.
 *
 * ON OPTIONALITY. ADR 0006 §1 allows `?` on "authored content types", meaning the YAML shape
 * Zod accepts. This is the PARSED shape, and it follows the engine-wide rule: `| null` for
 * scalars, empty arrays for lists. M5 ships no schema, so nothing bridges the two yet; when
 * Phase 2 writes it, `.default()` is what turns an omitted YAML key into `null` or `[]`. That
 * keeps exactly one rule inside the engine and pushes YAML ergonomics entirely into the
 * schema layer, where it belongs.
 *
 * An empty constraint array means NO CONSTRAINT, not "matches nothing". `locationTypes: []`
 * is an event that can fire anywhere — the common case, so it is the cheap one to author.
 */
export type EventContext = {
  readonly locationTypes: readonly LocationType[];
  readonly timeOfDay: readonly TimeOfDay[];
  readonly transportModes: readonly TransportMode[];
  readonly weather: readonly string[];
  readonly routeProfiles: readonly RouteProfile[];
};

export const ANY_CONTEXT: EventContext = Object.freeze({
  locationTypes: [],
  timeOfDay: [],
  transportModes: [],
  weather: [],
  routeProfiles: [],
});

/** How much of a check the player is shown before committing (engine-spec 2). */
export const CHECK_VISIBILITIES = ['hidden', 'partial', 'full'] as const;
export type CheckVisibility = (typeof CHECK_VISIBILITIES)[number];

/**
 * FLATTENED, not `SkillCheckSpec & { visibility }`, and the reason is the schema layer.
 *
 * Zod's `z.intersection` does infer an identity-equal intersection, so ADR 0009's assertion
 * would have held either way — that was checked, not assumed
 * (`packages/content/__tests__/zod-idioms.test.ts`). The problem is strictness: a
 * `.strictObject` on either half of an intersection rejects the OTHER half's keys, so an
 * intersection schema can never be sealed, and a misspelled `visibilty:` would parse clean,
 * default, and satisfy every type assertion.
 *
 * `SkillCheckSpec` survives independently — `ModifierSource` consumes it, and a check is
 * structurally assignable to it. `SkillCheckCoversSpec` below is what stops the two drifting:
 * it is stronger than `extends`, failing on a widened spec as well as a narrowed one.
 */
export type SkillCheck = {
  readonly skill: SkillKey;
  readonly dc: number;
  readonly modifiers: readonly CheckModifier[];
  readonly visibility: CheckVisibility;
};

type Identical<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/**
 * `never` if `SkillCheck` minus its presentation field stops matching `SkillCheckSpec`.
 * Asserted in `__tests__/skill-check-shape.test.ts`. It lives in THIS file rather than in
 * `effects/modifier-source.ts` because that direction would cycle — this module already
 * imports from there.
 */
export type SkillCheckCoversSpec =
  Identical<Omit<SkillCheck, 'visibility'>, SkillCheckSpec> extends true ? true : never;

export type Outcome = {
  readonly weight: number;
  /** null = applies whether the check passed or failed, or there was no check. */
  readonly onCheck: 'success' | 'failure' | null;
  readonly requires: Predicate;
  readonly textKey: string;
  /**
   * Alternates chosen by `eventMemory.count` — "you have been here before" variants.
   * Empty means always use `textKey`.
   */
  readonly textVariants: readonly string[];
  readonly effects: readonly Effect[];
};

export type Choice = {
  readonly id: ChoiceId;
  readonly labelKey: string;
  /** Shown but unselectable when false. */
  readonly requires: Predicate;
  /** Not shown at all until true. null = always shown. A reward for state, not a trap. */
  readonly hiddenUnless: Predicate | null;
  /** Paid on selection, before outcomes resolve. */
  readonly costs: readonly Effect[];
  readonly skillCheck: SkillCheck | null;
  readonly outcomes: readonly Outcome[];
};

export type GameEvent = {
  readonly id: EventId;
  readonly version: number;
  readonly category: string;
  readonly tags: readonly string[];
  readonly priority: EventPriority;
  /** Required when priority is 'beat', ignored otherwise. */
  readonly beatType: BeatType | null;
  readonly weight: number;
  /** Soft: a scoring factor, not a gate. Deliberate deviation from engine-spec 2, ADR 0005 §5. */
  readonly tensionBand: readonly [number, number] | null;
  readonly context: EventContext;
  readonly cooldownLegs: number;
  /** null = unlimited. Never relaxed by the fallback ladder — it is authored intent. */
  readonly maxOccurrences: number | null;
  readonly exclusiveGroup: string | null;
  readonly requires: Predicate;
  readonly image: string | null;
  readonly titleKey: string;
  readonly bodyKey: string;
  readonly choices: readonly Choice[];
};
