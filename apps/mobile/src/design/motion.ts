/**
 * MOTION TOKENS. Every duration and every easing in the app comes from here.
 *
 * CLAUDE.md rule 10: all durations derive from motion tokens passed through the global speed
 * scale. **This is the only file in `apps/mobile/` permitted to contain a raw duration number**,
 * and the lint rule that enforces that lands with the rest of the motion system — until it does,
 * this rule rests on review and this comment.
 *
 * ## Durations are named for what they DO, not for how long they take
 *
 * `enter` rather than `d220`. A token named after its value is a magic number with extra steps:
 * the first time a designer wants entries slower, `d220` either becomes a lie or gets renamed at
 * every call site. The value is balance; the name is the contract.
 *
 * ## Why this file exists before the art direction is chosen
 *
 * It does not encode a direction. It encodes the SHAPE the motion system needs — a closed set of
 * semantic durations, a closed set of easings, and a speed scale every consumer multiplies
 * through. The values below are the ones the round-2 bake-off used, so the frame-budget spike
 * measures something real rather than something invented; a chosen direction will retune them
 * without changing a single call site.
 */

/** The semantic duration vocabulary, in milliseconds at speed scale 1.0. */
export const DURATIONS = {
  /** A value ticking to a new number, a colour crossfade. Below this, motion reads as a glitch. */
  micro: 120,
  /** Impact: a stamp landing, a die settling on its face. Deliberately short. */
  impact: 160,
  /** An element arriving on a screen that is already there. */
  enter: 220,
  /** An element leaving. Shorter than `enter` — nobody waits to watch something go. */
  exit: 180,
  /** Text revealing, a meter filling. The only token a player watches on purpose. */
  reveal: 320,
  /** One event to the next: the signature transition. The most expensive token in the set. */
  transition: 440,
} as const;

export type DurationToken = keyof typeof DURATIONS;

/**
 * Cubic-bezier control points, as tuples rather than as `Easing` objects.
 *
 * A tuple is inert data: it can be shared with a worklet, printed in the motion lab, and asserted
 * in a test without importing Reanimated. Call sites turn it into `Easing.bezier(...)`.
 */
export const EASINGS = {
  /** Arrivals. Fast out of the gate, settles without overshoot. */
  entrance: [0.16, 1, 0.3, 1],
  /** Departures. Accelerates away; there is nothing to land on. */
  exit: [0.5, 0, 0.75, 0],
  /** Anything that has to feel mechanical rather than organic — a wipe, a sweep. */
  linear: [0, 0, 1, 1],
  /** The general-purpose in-out, for a move that both starts and ends on screen. */
  standard: [0.4, 0, 0.2, 1],
} as const;

export type EasingToken = keyof typeof EASINGS;

/**
 * The global speed scale. **Instant is 0, not "very fast"**, and that is load-bearing: a
 * `withTiming(v, { duration: 0 })` completes on the next frame with its completion callback
 * intact, so a sequence built on tokens keeps working at Instant with no branch anywhere. Any
 * animation that needs an `if (instant)` has been built wrong.
 */
export const SPEED_SCALES = {
  full: 1,
  fast: 0.5,
  instant: 0,
} as const;

export type SpeedName = keyof typeof SPEED_SCALES;
export const SPEED_NAMES = Object.keys(SPEED_SCALES) as readonly SpeedName[];

/**
 * The auto-shortening factor and the viewing count that triggers it (CLAUDE.md rule 10).
 *
 * **The count lives in the APP, never in `RunState`.** `RunState` is deeply readonly and feeds
 * `stateDigest`, so a per-sequence view counter there would move every golden run and make a
 * presentation preference part of `(seed, choiceSequence, contentVersion)` reproducibility.
 */
export const AUTO_SHORTEN_AFTER_VIEWS = 3;
export const AUTO_SHORTEN_FACTOR = 0.6;

/**
 * A token duration in milliseconds, at a given speed scale.
 *
 * `Math.round`, because a fractional millisecond is not a thing any animation driver wants and
 * an unrounded value makes two sequences that should be simultaneous drift by sub-frame amounts.
 *
 * Marked `worklet` so it can be called from the UI thread inside an animated style without a
 * round trip to JS — which is the whole reason durations are computed from a scalar rather than
 * looked up in a table built on the JS side.
 */
export function durationOf(token: DurationToken, scale: number, views = 0): number {
  'worklet';
  const shortened = views >= AUTO_SHORTEN_AFTER_VIEWS ? AUTO_SHORTEN_FACTOR : 1;
  return Math.round(DURATIONS[token] * scale * shortened);
}
