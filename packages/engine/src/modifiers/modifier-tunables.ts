/**
 * Every tunable number in the modifier pipeline, in one object.
 *
 * ALL INTEGER ARITHMETIC, and that is not fussiness. M7 established all-rational arithmetic
 * for the director because float multiplication feeding a comparison is a cross-engine replay
 * hazard, and Hermes is still unverified (ADR 0012 §3). The same applies here, with a second
 * reason: these numbers are rendered as dice chips in Phase 7B, and `+1.7999999999999998` is
 * not a chip. Diminishing returns is therefore a rational `NUM/DEN`, never `× 0.6`.
 */
export type ModifierTunables = {
  /** Same-sign modifiers beyond this many contribute at the reduced rate. */
  readonly diminishAfter: number;
  /** Reduced rate as an exact fraction: 3/5 = 60%. */
  readonly diminishNum: number;
  readonly diminishDen: number;
  /** Total bonus ceiling and total penalty floor, as magnitudes. */
  readonly maxBonus: number;
  readonly maxPenalty: number;
};

export const DEFAULT_TUNABLES: ModifierTunables = Object.freeze({
  diminishAfter: 3,
  diminishNum: 3,
  diminishDen: 5,
  maxBonus: 6,
  maxPenalty: 8,
});

/**
 * `round(value × num / den)`, half away from zero, in exact integer arithmetic.
 *
 * ROUNDING, NOT TRUNCATION, and a test found the difference. Truncating sends 60% of 1 to
 * ZERO, so a fourth modifier worth `+1` would contribute nothing at all — the same
 * "free modifier past the third" pathology that computing the reduction over the tail SUM
 * (rather than per entry) was introduced to remove, just at a smaller scale. Half-up keeps a
 * small tail worth something while still discounting it.
 *
 * The `2×a + b` form avoids relying on float rounding semantics: every operand here is a
 * small integer, exactly representable, and IEEE-754 division is correctly rounded and
 * exactly specified by ECMAScript — unlike `Math.pow`, which is implementation-approximated
 * and banned by `purity.test.ts`. Bit-identical on V8 and Hermes alike.
 */
export function mulDivRound(value: number, num: number, den: number): number {
  const scaled = value * num;
  const sign = scaled < 0 ? -1 : 1;
  return sign * Math.trunc((2 * Math.abs(scaled) + den) / (2 * den));
}
