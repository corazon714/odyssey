import { describe, expect, it } from 'vitest';
import { flagId } from '../../ids/content-ids.ts';
import { type RollModifier } from '../../rng/roll-result.ts';
import {
  choiceModifierSource,
  collectModifiers,
  PHASE_1_MODIFIER_SOURCES,
  type ModifierSource,
  type SkillCheckSpec,
} from '../modifier-source.ts';
import { makeContext } from '../../predicate/__tests__/support/make-context.ts';

/**
 * The seam ships EMPTY, NOT ABSENT. These tests exist to prove it is wired — that Phase 2 can
 * append a registry source without touching the call site — rather than to test arithmetic.
 */

const CHECK: SkillCheckSpec = {
  skill: 'negotiation',
  dc: 5,
  modifiers: [
    { labelKey: 'check.modifier.smooth_talker', delta: 2, when: null },
    {
      labelKey: 'check.modifier.wanted',
      delta: -3,
      when: { kind: 'flag', id: flagId('wanted'), cmp: { op: 'isSet' } },
    },
  ],
};

describe('choiceModifierSource', () => {
  it('applies unconditional modifiers', () => {
    const modifiers = choiceModifierSource.modifiersFor(CHECK, makeContext());
    expect(modifiers).toEqual([{ labelKey: 'check.modifier.smooth_talker', delta: 2 }]);
  });

  it('gates conditional modifiers on world state', () => {
    const ctx = makeContext({
      flags: { [flagId('wanted')]: { value: true, setAtLeg: 0, expiresAtLeg: null } },
    });
    expect(choiceModifierSource.modifiersFor(CHECK, ctx)).toEqual([
      { labelKey: 'check.modifier.smooth_talker', delta: 2 },
      { labelKey: 'check.modifier.wanted', delta: -3 },
    ]);
  });

  it('emits i18n keys, never prose (CLAUDE.md 2.4)', () => {
    for (const modifier of choiceModifierSource.modifiersFor(CHECK, makeContext())) {
      expect(modifier.labelKey).toMatch(/^check\.modifier\.[a-z_]+$/);
    }
  });
});

describe('collectModifiers — the seam', () => {
  it('is inert with an empty source list', () => {
    expect(collectModifiers(CHECK, makeContext(), [])).toEqual([]);
  });

  it('returns exactly the choice source in Phase 1', () => {
    expect(collectModifiers(CHECK, makeContext(), PHASE_1_MODIFIER_SOURCES)).toEqual(
      choiceModifierSource.modifiersFor(CHECK, makeContext()),
    );
  });

  it('reaches a stub source appended after the built-in one', () => {
    // THIS is the assertion that matters: Phase 2's registry and quirk sources plug in here,
    // and if the seam were decorative this test could not be written.
    const registryStub: ModifierSource = {
      id: 'registry-stub',
      modifiersFor: (): readonly RollModifier[] => [
        { labelKey: 'check.modifier.night_crossing', delta: -1 },
      ],
    };

    const modifiers = collectModifiers(CHECK, makeContext(), [
      ...PHASE_1_MODIFIER_SOURCES,
      registryStub,
    ]);

    expect(modifiers).toContainEqual({ labelKey: 'check.modifier.night_crossing', delta: -1 });
    expect(modifiers).toHaveLength(2);
  });

  it('orders by source then declaration, not by iteration accident', () => {
    // The total is commutative; the CHIP ORDER on the result screen is not, so it has to be
    // a function of the content.
    const first: ModifierSource = { id: 'a', modifiersFor: () => [{ labelKey: 'a1', delta: 1 }] };
    const second: ModifierSource = { id: 'b', modifiersFor: () => [{ labelKey: 'b1', delta: 1 }] };

    expect(collectModifiers(CHECK, makeContext(), [first, second]).map((m) => m.labelKey)).toEqual([
      'a1',
      'b1',
    ]);
    expect(collectModifiers(CHECK, makeContext(), [second, first]).map((m) => m.labelKey)).toEqual([
      'b1',
      'a1',
    ]);
  });

  it('is deterministic across repeated collection', () => {
    const ctx = makeContext();
    expect(collectModifiers(CHECK, ctx, PHASE_1_MODIFIER_SOURCES)).toEqual(
      collectModifiers(CHECK, ctx, PHASE_1_MODIFIER_SOURCES),
    );
  });
});
