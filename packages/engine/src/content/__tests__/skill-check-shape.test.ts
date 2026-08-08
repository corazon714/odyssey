import { describe, expect, it } from 'vitest';
import { collectModifiers, type SkillCheckSpec } from '../../effects/modifier-source.ts';
import { PHASE_1_MODIFIER_SOURCES } from '../../effects/modifier-source.ts';
import { type SkillCheck, type SkillCheckCoversSpec } from '../game-event.ts';

/**
 * `SkillCheck` was `SkillCheckSpec & { visibility }` until Phase 2A M2A.1, when it was
 * flattened so the content schema can seal it with `.strictObject` — an intersection cannot
 * be made strict, so a misspelled key would have parsed clean. See the doc comment on
 * `SkillCheck`, and `packages/content/__tests__/zod-idioms.test.ts` for the measurement.
 *
 * Flattening removed the compiler's guarantee that the two stay in step. These tests are the
 * replacement.
 */
describe('SkillCheck / SkillCheckSpec (flattened, M2A.1)', () => {
  it('still covers SkillCheckSpec exactly', () => {
    // Identity, not `extends`: this fails on a WIDENED spec as well as a narrowed one, which
    // is what the old intersection gave for free.
    const covers: SkillCheckCoversSpec = true;
    expect(covers).toBe(true);
  });

  it('is structurally accepted wherever a SkillCheckSpec is required', () => {
    // The load-bearing consequence: ModifierSource takes a spec, and runSkillCheck hands it a
    // SkillCheck. If flattening had broken assignability this would not compile.
    const check: SkillCheck = {
      skill: 'negotiation',
      dc: 12,
      modifiers: [],
      visibility: 'partial',
    };
    const spec: SkillCheckSpec = check;
    expect(spec.dc).toBe(12);
    expect(collectModifiers(check, undefined as never, PHASE_1_MODIFIER_SOURCES)).toEqual([]);
  });
});
