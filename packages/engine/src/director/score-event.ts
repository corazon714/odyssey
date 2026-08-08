import { type GameEvent } from '../content/game-event.ts';
import { type RunState } from '../state/run-state.ts';
import { PICK_WEIGHT_MAX, PICK_WEIGHT_MIN } from './scoring-constants.ts';
import { contextAffinity, novelty, priorityBoost, recency, tensionFit } from './scoring-factors.ts';
import { tagSaturation } from './tag-saturation.ts';

/**
 * THE MULTIPLICATION ORDER IS PART OF THE REPLAY CONTRACT.
 *
 * Float multiplication is not associative. Reordering these six changes the last bits of the
 * product, which changes `Math.round`, which changes the integer weight, which changes the
 * pick — and every golden run with it. `scoring-order.test.ts` pins the sequence against
 * `SCORING_FACTORS` so a well-meaning reorder fails a test instead of silently invalidating
 * the fixtures.
 *
 * Written out by hand rather than folded over the array because this runs once per candidate
 * per leg per run: ~6M times in a 20,000-run simulation.
 */
export function scoreEvent(event: GameEvent, state: RunState): number {
  return (
    event.weight *
    contextAffinity(event, state) *
    tensionFit(event, state) *
    novelty(event, state) *
    recency(event, state) *
    tagSaturation(event, state) *
    priorityBoost(event)
  );
}

/**
 * The integer weight `weightedPick` accumulates.
 *
 * Rounding to an integer is what keeps selection exact: integers accumulate losslessly to
 * 2⁵³, whereas float accumulation across a few hundred candidates makes `target < acc`
 * sensitive to summation order and to the last ULP of every factor.
 *
 * THE FLOOR OF 1 IS THE INVARIANT. The product's lower bound is about 0.000125, which rounds
 * to zero — and a zero-weight candidate is an event that passed every filter and then
 * silently could not be chosen. Lifting it to 1 is what makes "filters decide eligibility,
 * scoring decides frequency" true rather than approximately true.
 */
export function pickWeight(event: GameEvent, state: RunState): number {
  const rounded = Math.round(scoreEvent(event, state));
  if (rounded < PICK_WEIGHT_MIN) return PICK_WEIGHT_MIN;
  if (rounded > PICK_WEIGHT_MAX) return PICK_WEIGHT_MAX;
  return rounded;
}
