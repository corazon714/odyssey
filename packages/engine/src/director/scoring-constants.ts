import { type EventPriority } from '../content/event-priority.ts';

/**
 * Every tunable in the director, in one file, each with its documented range.
 *
 * Gathered here rather than scattered through the factor functions so that balancing is a
 * diff to ONE file and the sim's before/after is attributable. A constant that lives next to
 * the code that uses it gets tuned by whoever is editing that code, which is how a system
 * ends up with no one able to say why any number is what it is.
 *
 * TWO RULES BIND EVERY FACTOR.
 *
 * 1. **Bounded, with a POSITIVE floor.** Multiplicative composition with an unbounded factor
 *    means one factor silently becomes the only factor. And a factor that can reach zero is
 *    a filter wearing a disguise — the thing design pillar 2 exists to prevent, because a
 *    filter can explain itself and a zero weight cannot.
 * 2. **Rational arithmetic only.** No `Math.pow`, no `exp`, no `**`. All three are
 *    implementation-approximated (ADR 0005 §3), so a golden run computed with them could
 *    differ between V8 and Hermes. `purity.test.ts` enforces this.
 */

/** contextAffinity ∈ [0.50, 2.00] — soft preferences shade, they do not gate. */
export const AFFINITY_MATCH = 1.5;
export const AFFINITY_MISS = 0.75;
export const AFFINITY_MIN = 0.5;
export const AFFINITY_MAX = 2;

/** tensionFit ∈ [0.25, 1.50]. Soft by decision (ADR 0005 §5), not the gate engine-spec 2 implies. */
export const TENSION_IN_BAND = 1.5;
export const TENSION_FALLOFF = 4;
export const TENSION_MIN = 0.25;
/** An event with no declared band is neutral, not penalised. */
export const TENSION_NEUTRAL = 1;

/** novelty ∈ [0.20, 1.00] — 1, ½, ⅓, ¼, ⅕ … floored so a repeat is rare, never impossible. */
export const NOVELTY_MIN = 0.2;

/**
 * BOTH ANTI-REPETITION WINDOWS ARE DENOMINATED IN FIRED EVENTS, and that is a decision.
 *
 * Until M3.12a this block said "over RECENCY_WINDOW **legs**" two lines above "over the last
 * TAG_WINDOW **fired events**", and nothing recorded why one job was measured in two units.
 * It was not a decision, it was an accident that could not show itself while every leg fired
 * exactly one event. The quiet-leg gate (ADR 0029) separates the units, so it had to be settled:
 * both count what the player was actually shown, because a leg that showed nothing does nothing
 * to make a repeat feel further away.
 *
 * `cooldownLegs` is the deliberate exception and stays WALL-CLOCK. It is authored content in a
 * field named `legs`, and it answers a world question ("this storm does not recur for ten legs
 * of travel"), not a presentation one. `hard-filters.ts` carries the argument in full.
 */

/** recency ∈ [0.05, 1.00] — linear recovery over RECENCY_WINDOW fired events. */
export const RECENCY_WINDOW = 6;
export const RECENCY_MIN = 0.05;

/** tagSaturation ∈ [0.25, 1.00] over the last TAG_WINDOW fired events. */
export const TAG_WINDOW = 8;
export const TAG_SATURATION_MIN = 0.25;

/**
 * priorityBoost. `beat` is 1.0 on purpose: the beat GATE already restricted the pool to
 * events that can fill the due slot, so boosting them again would double-count.
 */
export const PRIORITY_BOOST: Readonly<Record<EventPriority, number>> = {
  filler: 0.4,
  normal: 1,
  beat: 1,
  critical: 3,
};

/**
 * Authored weight bounds, and the integer window `weightedPick` accumulates over.
 *
 * The floor of 1 is the invariant that separates scoring from filtering: however badly an
 * event scores, if it survived the filters it remains pickable.
 * `__tests__/scoring.test.ts:86` asserts it, over every event in the pack.
 */
export const WEIGHT_MIN = 1;
export const WEIGHT_MAX = 1000;
export const PICK_WEIGHT_MIN = 1;
export const PICK_WEIGHT_MAX = 1_000_000;

/** Tension: how much of the signal is route progress versus resource strain. */
export const TENSION_STRAIN_SHARE = 2;
export const TENSION_BREATHER = 0.2;
export const TENSION_HIGH_BAND = 0.5;
export const TENSION_CONSECUTIVE_HIGH = 2;
