import { collectModifiers, type ModifierSource } from '../effects/modifier-source.ts';
import { resolveModifiers, type LocalModifier } from '../modifiers/resolve-modifiers.ts';
import { type ModifierRegistry } from '../modifiers/registry-modifier.ts';
import { type ModifierResolution } from '../modifiers/resolved-modifier.ts';
import { type SkillCheck } from '../content/game-event.ts';
import { type PredicateContext } from '../predicate/predicate-context.ts';
import { type Rng } from '../rng/rng.ts';
import { type RollModifier, type RollResult } from '../rng/roll-result.ts';

export type CheckOutcome = {
  readonly roll: RollResult;
  /** Presentation-ready chips, ordered and annotated. Feeds the Phase 7B dice animation. */
  readonly resolution: ModifierResolution;
};

/**
 * Roll a check: `d20 + skill + clamp(modifiers, −maxPenalty .. +maxBonus)`.
 *
 * THE SKILL BYPASSES THE CLAMP, and that is a design decision, not an oversight. The
 * pipeline's ±6/−8 bounds exist to stop a pile of situational modifiers deciding an outcome
 * on their own; the character's own competence is not situational. Putting the skill through
 * the pipeline would cap it at +6 alongside everything else, so a skill-10 specialist and a
 * skill-6 generalist would roll identically once either had any gear — which flattens
 * progression to no benefit. Settled with the human before the pipeline was written.
 *
 * The skill still appears as a CHIP, first and unmodified, because design pillar 2 requires
 * the total be reconstructable from what is on screen.
 */
export function runSkillCheck(
  check: SkillCheck,
  ctx: PredicateContext,
  rng: Rng,
  sources: readonly ModifierSource[],
  registry: ModifierRegistry,
): CheckOutcome {
  const skillLevel = ctx.state.skills[check.skill];

  // Choice-local modifiers still arrive through the Phase 1 seam, which already evaluates
  // each one's `when`. They enter the pipeline as exceptions that outrank registry rows.
  const locals: LocalModifier[] = collectModifiers(check, ctx, sources).map(
    (modifier): LocalModifier => ({
      id: modifier.labelKey,
      labelKey: modifier.labelKey,
      delta: modifier.delta,
    }),
  );

  const resolution = resolveModifiers(check, registry, locals, ctx);

  const modifiers: RollModifier[] = [
    { labelKey: `check.modifier.skill.${check.skill}`, delta: skillLevel },
    ...resolution.modifiers.map((m): RollModifier => ({ labelKey: m.labelKey, delta: m.delta })),
  ];

  return { roll: rng.roll(check.dc, modifiers, 'skillCheck'), resolution };
}
