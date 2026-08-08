/**
 * The shape of a resolved die roll.
 *
 * `modifiers` is carried through verbatim so the result screen can render the chips that
 * design pillar 2 requires — "no visa · night crossing · nervous demeanor" — and so the
 * journal can record why a check went the way it did. Every label is an i18n KEY; a
 * user-visible string here would be a rule 2.4 violation.
 */
export type RollModifier = {
  readonly labelKey: string;
  readonly delta: number;
};

export type RollResult = {
  readonly die: number;
  readonly sides: number;
  readonly dc: number;
  readonly modifiers: readonly RollModifier[];
  readonly modifierTotal: number;
  readonly total: number;
  readonly success: boolean;
  /** total - dc. Negative on failure; how badly is a signal outcomes can branch on. */
  readonly margin: number;
};

/**
 * BALANCE PARAMETER, not a settled rule.
 *
 * docs/engine-spec.md 2 shows `dc: 5` with modifiers in the +/-2..3 range but never states
 * the die, and how a skill enters the total is a design decision that needs simulation to
 * settle. d20 is the placeholder because one point of modifier equals a legible 5%, which
 * suits pillar 2. Expect M7/M10 to change this number once the sim can measure check
 * outcome distributions — it is deliberately the ONLY place the die appears.
 *
 * Note what roll() does NOT know about: skills. run-skill-check (M6) passes a skill in as
 * just another labelled modifier, which keeps the RNG free of game rules.
 */
export const CHECK_DIE_SIDES = 20;
