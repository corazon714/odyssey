import { type CheckTag } from '../modifiers/check-tag.ts';
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
 * ordered list of sources. Phase 1 passes exactly one — `choiceModifierSource`.
 *
 * THE PLAN WAS THAT PHASE 2 WOULD APPEND `registryModifierSource` AND `quirkModifierSource`
 * HERE. IT DID NOT. Corrected 2026-08-08 after the claim was checked against the diff.
 * M2A.3 (`8013aac`) instead threaded the registry as a fifth parameter to `runSkillCheck`
 * and resolved it in `modifiers/resolve-modifiers.ts`, because the registry needs the
 * six-step pipeline — conflicts, non-stacking collapse, diminishing returns, both clamps —
 * and a `ModifierSource` returns a flat `RollModifier[]` with nowhere to carry `rawDelta`,
 * the diminished flag or the clamp share that pillar 2 needs on the result screen.
 * `PHASE_1_MODIFIER_SOURCES` still holds exactly one entry, and quirks are still Phase 2B.
 *
 * What DID survive is the weaker and genuinely useful property: `resolveChoice`'s own
 * signature never moved, because the registry rides on the `pack` argument that was already
 * there. Callers of `resolveChoice` — `advanceLeg`, `replayRun`, the sim harness, the future
 * app layer — were untouched. That is the claim to make; "no change at the call site" is not,
 * and does not survive `git diff 8013aac^ 8013aac -- loop/resolve-choice.ts`.
 *
 * The seam is still live and still tested, so a genuinely flat per-choice source (a quirk,
 * most likely) can still be appended without touching the resolver.
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
  /**
   * What KIND of contest this is. Required, with no default, because it is the only thing the
   * modifier registry can key on — a check with no tags draws no registry modifiers at all
   * and the author would never notice, since the check still rolls. See `modifiers/check-tag.ts`.
   */
  readonly tags: readonly CheckTag[];
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
    check.modifiers.forEach((modifier, index) => {
      // The path is REQUIRED, not decoration. `evaluatePredicate` defaults it to the root
      // `'r'`, and the chance address is derived from (scope, path) — so calling it without
      // one made every `{chance}` gate in every modifier, on one event on one leg, share a
      // single address and return a single answer. Harmless with one hand-authored modifier
      // per choice; catastrophic once a registry can put the same gate on twenty rows.
      // Addressed by the modifier's own labelKey, which is unique within a choice, rather
      // than by index alone — an index-only address shifts when a modifier is inserted.
      const path = `c${String(index)}:${modifier.labelKey}`;
      if (modifier.when !== null && !evaluatePredicate(modifier.when, ctx, path).value) return;
      out.push({ labelKey: modifier.labelKey, delta: modifier.delta });
    });
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
