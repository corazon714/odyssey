/**
 * The per-leg event-fire gate, expressed as ODDS rather than as a probability (ADR 0029 D2).
 *
 * WHY ODDS. The brief's eight multipliers do not work on a probability. With a base P of 0.55,
 * `border × night × weather × illicit × heat` is 2.6 — clamped — and six of the eight become
 * dead levers; any base high enough for montage ×0.3 to leave a playable leg is a base every
 * positive multiplier clamps against. On odds they all compose and NOTHING CLAMPS ANYWHERE:
 * a multiplier scales the FIRE side only, so 70:30 under montage ×0.3 is 21:30 (P = 41%) and
 * under border ×1.8 is 126:30 (P = 81%). Neither can leave the interval, because odds have no
 * upper end to leave.
 *
 * WHY INTEGERS. A ×1.4 written as a float would put `0.7000000000000001` into a value the
 * golden digest is computed over, and CLAUDE.md 2.3 requires the run to reproduce on V8,
 * Hermes and CI alike. The multipliers are therefore stored SCALED (×1.4 is 14) and applied as
 * `fire × 14`, `quiet × 10` — exact integer arithmetic, no rounding step to disagree about.
 *
 * The composition is ORDER-INDEPENDENT by construction: `fire` is multiplied by the product of
 * the factors and `quiet` by `MULTIPLIER_SCALE` once per factor, so the result depends on the
 * SET, never on the sequence. That is what lets the caller collect factors in whatever order
 * reads best without it becoming a replay hazard.
 *
 * Magnitude: the worst realistic case is the six positive multipliers on a 70:30 base, which
 * is `70 × 14 × 18 × 12 × 12 × 13 × 14` ≈ 4.6 × 10⁸ against `30 × 10⁶`. All eight together are
 * ≈ 8.3 × 10⁹ : 3.0 × 10⁹. Both are comfortably inside 2⁵³, so no reduction step is needed and
 * none is performed — a gcd pass would be one more place for the two milestones to differ.
 */

/**
 * Fire-to-quiet odds. `fire / (fire + quiet)` is the probability an event fires this leg.
 *
 * A pair rather than two loose numbers because the two sides are only meaningful together:
 * `fire` alone says nothing, and the ratio is the whole quantity.
 */
export type EventOdds = {
  readonly fire: number;
  readonly quiet: number;
};

/**
 * M3.12a'S FENCE. 1:0 is P = 1.0 EXACTLY — every leg fires, which is what the loop did before
 * the gate existed, so every golden digest must be unchanged by this milestone.
 *
 * It is a fence rather than a placeholder: certainty is restored by the ARITHMETIC (a zero
 * quiet side can never become non-zero, since multipliers only touch `fire`), not by a branch
 * that skips the gate. The code path M3.12b runs is therefore fully exercised here, which is
 * the only way "digests unchanged" proves anything.
 *
 * M3.12b replaces this with a swept value and regenerates the goldens once, at the end.
 */
export const BASE_EVENT_ODDS: EventOdds = Object.freeze({ fire: 1, quiet: 0 });

/**
 * The denominator the multipliers are written over: ×1.4 is stored as 14, ×0.3 as 3.
 *
 * Applying a factor multiplies `fire` by the stored numerator and `quiet` by this, which is
 * `(fire × 1.4) : quiet` done without ever holding 1.4 as a double.
 */
const MULTIPLIER_SCALE = 10;

/**
 * The eight multipliers, ONE FROZEN RECORD (ADR 0029 D2) — not eight two-element arrays, and
 * deliberately not in the star-exported `scoring-constants.ts`, because an array reachable
 * from the barrel is an unclassified vocabulary to the conformance sweep's L2.
 *
 * `heat` is the RESOURCE — the player's wanted level — and NOT the `heat` member of `WEATHERS`.
 * The two share a name in this codebase and a leg can carry both at once; the weather one
 * reaches these odds through `badWeather`.
 */
export const EVENT_ODDS_MULTIPLIERS = Object.freeze({
  urban: 14,
  border: 18,
  night: 12,
  badWeather: 12,
  illicit: 13,
  heat: 14,
  emptyTerrain: 6,
  montage: 3,
});

export type EventOddsFactor = keyof typeof EVENT_ODDS_MULTIPLIERS;

/**
 * Compose a factor set onto a base. Each factor should appear at most once — applying one
 * twice squares it, which is arithmetically honest and never what a caller means.
 */
export function applyOddsFactors(odds: EventOdds, factors: readonly EventOddsFactor[]): EventOdds {
  let fire = odds.fire;
  let quiet = odds.quiet;

  for (const factor of factors) {
    fire *= EVENT_ODDS_MULTIPLIERS[factor];
    quiet *= MULTIPLIER_SCALE;
  }

  return { fire, quiet };
}

/**
 * The probability the fire side represents.
 *
 * THE GUARD IS NOT DEFENSIVE PADDING. `0 : 0` is the one pair with no answer — `0 / (0 + 0)`
 * is NaN, and every comparison against NaN is false, so an unguarded gate would silence EVERY
 * leg of every run and read as a total content failure rather than as a bad constant. The same
 * branch also absorbs a negative total, which no multiplier can produce but a mis-set base
 * could.
 *
 * It resolves to CERTAINTY, not to silence, and that direction is the decision: a broken odds
 * pair then reproduces the pre-gate loop, which is a game, where the other direction is a run
 * of nothing. `0 : n` with n > 0 is NOT degenerate — it is a legitimate "never fires" and
 * returns 0.
 */
export function fireProbability(odds: EventOdds): number {
  const total = odds.fire + odds.quiet;
  if (total <= 0) return 1;
  return odds.fire / total;
}
