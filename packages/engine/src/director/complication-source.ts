import { type GameEvent } from '../content/game-event.ts';
import { type Rng } from '../rng/rng.ts';
import { type RunState } from '../state/run-state.ts';
import { type TextParams } from '../text-params.ts';

/**
 * THE SECOND PHASE 2 SEAM. Ships empty, not absent.
 *
 * `complications.yaml` is one of CLAUDE.md §9's four registries — situational layers attached
 * to an already-selected event, which is how a small authoring corpus multiplies into a large
 * play space. The registry is Phase 2 CONTENT and out of scope; its integration point is not,
 * because adding it later without a seam means rewriting the director rather than plugging
 * into it.
 *
 * IT DRAWS FROM `encounterFlavor`, NOT `eventPick`. This is the payoff of the counter-based
 * RNG (ADR 0005 §1): Phase 2 can add complications that consume randomness without shifting a
 * single `eventPick` value, so the golden runs written in M10 survive the registries landing.
 * `complication-source.test.ts` asserts exactly that.
 */
export type Complication = {
  readonly id: string;
  readonly labelKey: string;
  readonly params: TextParams;
};

export type ComplicationSource = {
  readonly id: string;
  complicationsFor(event: GameEvent, state: RunState, rng: Rng): readonly Complication[];
};

/** Phase 1 attaches none. The list is the extension point, not this constant. */
export const PHASE_1_COMPLICATION_SOURCES: readonly ComplicationSource[] = Object.freeze([]);

/**
 * Collect from every source, in source order then declaration order.
 *
 * Same ordering rule as `collectModifiers`: the total is order-independent but the DISPLAY is
 * not, and chip order on the result screen must be a function of content rather than of
 * iteration accident.
 */
export function collectComplications(
  event: GameEvent,
  state: RunState,
  rng: Rng,
  sources: readonly ComplicationSource[],
): readonly Complication[] {
  if (sources.length === 0) return EMPTY_COMPLICATIONS;

  const out: Complication[] = [];
  for (const source of sources) {
    for (const complication of source.complicationsFor(event, state, rng)) out.push(complication);
  }
  return out;
}

export const EMPTY_COMPLICATIONS: readonly Complication[] = Object.freeze([]);
