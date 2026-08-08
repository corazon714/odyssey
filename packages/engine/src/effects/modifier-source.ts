import { evaluatePredicate } from '../predicate/evaluate-predicate.ts';
import { type PredicateContext } from '../predicate/predicate-context.ts';
import { type Predicate } from '../predicate/predicate.ts';
import { type RollModifier } from '../rng/roll-result.ts';
import { type SkillKey } from '../state/skills.ts';

/**
 * THE SEAM FOR THE MODIFIER REGISTRY. Ships empty, not absent.
 *
 * CLAUDE.md 9 describes four registries — modifiers, complications, universal-choices,
 * quirks — that multiply a small authoring corpus into a large play space. They are Phase 2
 * CONTENT and explicitly out of Phase 1. But their integration points must exist now, or
 * Phase 2 rewrites the check resolver instead of plugging into it.
 *
 * So `runSkillCheck` (M6) never reads `check.modifiers` directly. It collects from an
 * ordered list of sources. Phase 1 passes exactly one — `choiceModifierSource`. Phase 2
 * appends `registryModifierSource` (modifiers.yaml, auto-injected by check tag) and
 * `quirkModifierSource` (an NPC's personality traits registering as modifiers) with NO
 * change at the call site.
 */
export type CheckModifier = {
  readonly labelKey: string;
  readonly delta: number;
  /** null = always applies. Otherwise gated on world state. */
  readonly when: Predicate | null;
};

export type SkillCheckSpec = {
  readonly skill: SkillKey;
  readonly dc: number;
  readonly modifiers: readonly CheckModifier[];
};

export type ModifierSource = {
  readonly id: string;
  modifiersFor(check: SkillCheckSpec, ctx: PredicateContext): readonly RollModifier[];
};

/** The one source Phase 1 has: modifiers authored on the choice itself. */
export const choiceModifierSource: ModifierSource = Object.freeze({
  id: 'choice',
  modifiersFor(check: SkillCheckSpec, ctx: PredicateContext): readonly RollModifier[] {
    const out: RollModifier[] = [];
    for (const modifier of check.modifiers) {
      if (modifier.when !== null && !evaluatePredicate(modifier.when, ctx).value) continue;
      out.push({ labelKey: modifier.labelKey, delta: modifier.delta });
    }
    return out;
  },
});

export const PHASE_1_MODIFIER_SOURCES: readonly ModifierSource[] = Object.freeze([
  choiceModifierSource,
]);

/**
 * Collect from every source, in source order then declaration order.
 *
 * The total is commutative, but the TRACE is not: these become the chips the result screen
 * renders, so their order has to be a function of the content rather than of iteration
 * accident. Sorting by (source index, modifier index) is stable and needs no comparator on
 * strings — which would otherwise have been a `localeCompare` waiting to happen.
 */
export function collectModifiers(
  check: SkillCheckSpec,
  ctx: PredicateContext,
  sources: readonly ModifierSource[],
): readonly RollModifier[] {
  const out: RollModifier[] = [];
  for (const source of sources) {
    for (const modifier of source.modifiersFor(check, ctx)) out.push(modifier);
  }
  return out;
}
