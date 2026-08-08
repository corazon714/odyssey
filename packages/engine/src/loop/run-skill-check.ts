import { type SkillCheck } from '../content/game-event.ts';
import { collectModifiers, type ModifierSource } from '../effects/modifier-source.ts';
import { type PredicateContext } from '../predicate/predicate-context.ts';
import { type Rng } from '../rng/rng.ts';
import { type RollModifier, type RollResult } from '../rng/roll-result.ts';

/**
 * Resolve a skill check.
 *
 * NOTE WHAT THIS DOES NOT DO: it never reads `check.modifiers` directly. Modifiers arrive
 * through `collectModifiers` over an ordered list of sources, which is the seam Phase 2's
 * `modifiers.yaml` and `quirks.yaml` plug into with no change here (ADR 0008 §5).
 *
 * The SKILL enters as just another labelled modifier. `rng.roll` knows nothing about skills,
 * which keeps the generator free of game rules and — more usefully — puts the skill on the
 * result screen as a chip alongside everything else, so the player sees "negotiation +4"
 * next to "no visa −3" rather than one being invisible arithmetic.
 */
export function runSkillCheck(
  check: SkillCheck,
  ctx: PredicateContext,
  rng: Rng,
  sources: readonly ModifierSource[],
): RollResult {
  const skillLevel = ctx.state.skills[check.skill];

  const modifiers: RollModifier[] = [
    { labelKey: `check.modifier.skill.${check.skill}`, delta: skillLevel },
    ...collectModifiers(check, ctx, sources),
  ];

  return rng.roll(check.dc, modifiers, 'skillCheck');
}
