import { type ChoiceId, type ComplicationId } from '../ids/content-ids.ts';
import { type Predicate } from '../predicate/predicate.ts';
import { type Choice } from './game-event.ts';

/**
 * One row of `complications.yaml`: a situational layer over an already-selected event.
 *
 * THE PROBLEM THIS SOLVES (08-DIVERSITY-SYSTEMS D2). Twelve events played straight are twelve
 * situations. Twelve events crossed with twenty-five complications are three hundred, at the
 * cost of authoring twenty-five rows once rather than three hundred events. The director
 * attaches at most one per event, so a complication is a modifier on the SITUATION where a
 * `RegistryModifier` is a modifier on the ROLL.
 *
 * NOT THE SAME TYPE AS `director/complication-source.ts`'s `Complication`, and the difference
 * matters. That one is `{ id, labelKey, params }` — a display chip, produced by the Phase 1
 * seam and rendered on the result screen. This is the authored ROW the chip is derived from.
 * Both survive: the seam keeps its shape, and the registry becomes the thing that feeds it.
 */
export type RegistryComplication = {
  /**
   * Required, and load-bearing beyond identification for two reasons: it is the RNG address
   * for selection (content-addressed, so adding a row shifts no other row's draw — ADR 0005
   * §2), and it is what `Presentation.complicationId` persists so a reload resolves the same
   * complication the player already read.
   */
  readonly id: ComplicationId;
  /**
   * Matched against `tagsOf(event)` — the event's tags PLUS `cat:<category>`, so `cat:border`
   * is a usable term for free. Empty matches nothing, which is the opposite of `EventContext`
   * and deliberate: a complication that applied everywhere would be a world rule, not a
   * complication.
   */
  readonly appliesTo: readonly string[];
  readonly requires: Predicate;
  /** Relative likelihood among the rows that match. Positive. */
  readonly weight: number;
  /**
   * A SEPARATE SENTENCE APPENDED TO THE BODY, never interpolated into it.
   *
   * Interpolation would need the complication clause to agree grammatically with a sentence
   * written in four languages — gender, case, and word order all differ, and the translator
   * of the event body cannot see the complication that will be spliced into it. Appending a
   * whole sentence is the only form that survives translation without coupling two keys.
   */
  readonly textKey: string;
  /**
   * NOT a change to any `dc`. Enters `resolveModifiers` as a synthetic row so it is
   * conflict-resolved, collapsed, diminished, CLAMPED and rendered as a chip like everything
   * else. A raw DC adjustment would bypass all four and be a number the player cannot
   * reconstruct — see ADR 0020 decision 3, which made the same call for the search.
   *
   * Sign follows the roll: `d20 + skill + clamp(mods)` against a fixed dc, so a situation that
   * makes things HARDER is a NEGATIVE delta.
   */
  readonly checkDelta: number;
  /** Spliced in after the event's own choices and any universal ones. null = adds nothing. */
  readonly addsChoice: Choice | null;
  /**
   * Removed from the presented list. Declined rather than applied when it would empty the
   * list — an unresolvable event is a content bug becoming a stuck run.
   */
  readonly removesChoice: ChoiceId | null;
};

/**
 * The registry, sorted by id at construction.
 *
 * Sorted for the reason `createModifierRegistry` is: iteration order reaches weighted
 * selection, so leaving it as file order would make which complication you get depend on how
 * someone spelled a filename.
 */
export type ComplicationRegistry = readonly RegistryComplication[];

export const EMPTY_COMPLICATION_REGISTRY: ComplicationRegistry = Object.freeze([]);

export function createComplicationRegistry(
  rows: readonly RegistryComplication[],
): ComplicationRegistry {
  return Object.freeze([...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
}

/**
 * The prefix for a choice a complication adds, unforgeable for the same reason
 * `UNIVERSAL_CHOICE_PREFIX` is: `:` is outside `ID_PATTERN`, so no authored choice id can
 * collide with one. Distinct from `u:` so a report can say which layer added the choice.
 */
export const COMPLICATION_CHOICE_PREFIX = 'c:';
