import { describe, expect, it } from 'vitest';
import { createRunState } from '../../state/create-run-state.ts';
import { createRunInit } from '../../state/run-init.ts';
import { ALL_REFS_KNOWN, createPredicateContext } from '../../predicate/predicate-context.ts';
import { type PredicateContext } from '../../predicate/predicate-context.ts';
import { loadFixtureRouteEntries } from '../../__tests__/support/load-fixtures.ts';
import { DEFAULT_TUNABLES, mulDivRound } from '../modifier-tunables.ts';
import { createModifierRegistry, type RegistryModifier } from '../registry-modifier.ts';
import { resolveModifiers } from '../resolve-modifiers.ts';

/**
 * The pipeline's ORDER and its arithmetic are balance contract, the same way the director's
 * multiplication order is. These tests pin the counterexamples that make each ordering
 * decision load-bearing — reordering any step makes one of them fail with a different total.
 */

const ROUTE = loadFixtureRouteEntries()[0];

function ctx(): PredicateContext {
  if (ROUTE === undefined) throw new Error('no fixture route');
  const created = createRunState(createRunInit('mods', 'v', ROUTE.route));
  if (!created.ok) throw new Error('route rejected');
  return createPredicateContext(created.state, ALL_REFS_KNOWN, 'test:0');
}

function row(over: Partial<RegistryModifier> & { id: string; delta: number }): RegistryModifier {
  return {
    appliesTo: ['social'],
    when: { kind: 'always' },
    labelKey: `check.modifier.${over.id}`,
    sourceKind: 'condition',
    conflictsWith: [],
    priority: 10,
    stacks: true,
    ...over,
  };
}

const CHECK = { tags: ['social'] as const };

function totalOf(rows: readonly RegistryModifier[]): number {
  return resolveModifiers(CHECK, createModifierRegistry(rows), [], ctx()).total;
}

describe('step 1 — tag intersection', () => {
  it('takes only rows whose appliesTo intersects the check tags', () => {
    const result = resolveModifiers(
      { tags: ['social'] },
      createModifierRegistry([
        row({ id: 'yes', delta: 2, appliesTo: ['social'] }),
        row({ id: 'no', delta: 5, appliesTo: ['mechanics'] }),
      ]),
      [],
      ctx(),
    );
    expect(result.modifiers.map((m) => m.id)).toEqual(['yes']);
    expect(result.total).toBe(2);
  });

  it('skips a row whose `when` fails', () => {
    expect(totalOf([row({ id: 'never_applies', delta: 4, when: { kind: 'never' } })])).toBe(0);
  });
});

describe('step 3 before step 4 — conflicts resolve before the non-stacking collapse', () => {
  it('preserves the authored conflict target rather than whatever survived a collapse', () => {
    // A(+3, weather, prio 1), B(+2, weather, prio 9), C(-4, conflicts with A, prio 5).
    // 3-then-4: C beats A, A drops; collapse over {B} keeps B  -> -2.
    // 4-then-3: collapse keeps A (strongest), drops B; C beats A -> -4.
    // Both defensible; this order keeps the conflict a statement about the modifier the
    // author actually named.
    const result = resolveModifiers(
      CHECK,
      createModifierRegistry([
        row({ id: 'a_strong', delta: 3, sourceKind: 'context', stacks: false, priority: 1 }),
        row({ id: 'b_weak', delta: 2, sourceKind: 'context', stacks: false, priority: 9 }),
        row({ id: 'c_counter', delta: -4, priority: 5, conflictsWith: ['a_strong'] }),
      ]),
      [],
      ctx(),
    );
    expect(result.total).toBe(-2);
    expect(result.suppressed.map((s) => s.id)).toContain('a_strong');
  });

  it('logs the loser and who beat it', () => {
    const result = resolveModifiers(
      CHECK,
      createModifierRegistry([
        row({ id: 'loser', delta: 3, priority: 1 }),
        row({ id: 'winner', delta: -1, priority: 9, conflictsWith: ['loser'] }),
      ]),
      [],
      ctx(),
    );
    expect(result.suppressed).toEqual([
      {
        id: 'loser',
        labelKey: 'check.modifier.loser',
        rawDelta: 3,
        reason: 'conflict',
        lostTo: 'winner',
      },
    ]);
  });
});

describe('step 4 — non-stacking collapse keeps the strongest per sourceKind', () => {
  it('drops the weaker sibling and reports it', () => {
    const result = resolveModifiers(
      CHECK,
      createModifierRegistry([
        row({ id: 'weak', delta: 1, sourceKind: 'item', stacks: false }),
        row({ id: 'strong', delta: 3, sourceKind: 'item', stacks: false }),
        row({ id: 'other_kind', delta: 1, sourceKind: 'flag', stacks: false }),
      ]),
      [],
      ctx(),
    );
    expect(result.total).toBe(4);
    expect(result.suppressed.map((s) => `${s.id}->${s.lostTo}`)).toEqual(['weak->strong']);
  });
});

describe('step 5 — diminishing returns', () => {
  it('leaves the first three of a sign untouched', () => {
    expect(totalOf([1, 1, 1].map((d, i) => row({ id: `m${String(i)}`, delta: d })))).toBe(3);
  });

  it('does NOT let a fourth small modifier through free', () => {
    // The bug a per-entry `trunc(delta * 3/5)` would have shipped: trunc(0.6) === 0, so four
    // +1s would total +3 and EIGHT +1s would also total +3, making every modifier past the
    // third free in exactly the many-small-modifiers case DR exists to control. Computing the
    // reduction once over the tail SUM fixes it.
    const four = totalOf([1, 1, 1, 1].map((d, i) => row({ id: `m${String(i)}`, delta: d })));
    const eight = totalOf(
      Array.from({ length: 8 }, (_, i) => row({ id: `m${String(i)}`, delta: 1 })),
    );
    expect(four).toBeGreaterThan(3);
    expect(eight).toBeGreaterThan(four);
  });

  it('reduces the tail at exactly the declared fraction', () => {
    // Five +2s: head 3 x 2 = 6, tail 2 x 2 = 4, reduced to trunc(4 * 3/5) = 2. Total 8,
    // then clamped to the +6 ceiling.
    const result = resolveModifiers(
      CHECK,
      createModifierRegistry(
        Array.from({ length: 5 }, (_, i) => row({ id: `m${String(i)}`, delta: 2 })),
      ),
      [],
      ctx(),
    );
    expect(mulDivRound(4, DEFAULT_TUNABLES.diminishNum, DEFAULT_TUNABLES.diminishDen)).toBe(2);
    expect(result.total).toBe(DEFAULT_TUNABLES.maxBonus);
    expect(result.modifiers.some((m) => m.diminished)).toBe(true);
  });

  it('treats the two signs as independent sequences', () => {
    // Three positives and three negatives: neither sequence reaches the threshold, so nothing
    // diminishes. Sharing one sequence would wrongly discount half of them.
    const rows = [
      ...[3, 2, 1].map((d, i) => row({ id: `p${String(i)}`, delta: d })),
      ...[3, 2, 1].map((d, i) => row({ id: `n${String(i)}`, delta: -d })),
    ];
    const result = resolveModifiers(CHECK, createModifierRegistry(rows), [], ctx());
    expect(result.modifiers.every((m) => !m.diminished)).toBe(true);
    expect(result.total).toBe(0);
  });
});

describe('step 6 — the clamp, and its attribution', () => {
  it('clamps the bonus and the penalty independently', () => {
    const bonus = totalOf(
      Array.from({ length: 4 }, (_, i) => row({ id: `p${String(i)}`, delta: 5 })),
    );
    expect(bonus).toBe(DEFAULT_TUNABLES.maxBonus);

    const penalty = totalOf(
      Array.from({ length: 4 }, (_, i) => row({ id: `n${String(i)}`, delta: -5 })),
    );
    expect(penalty).toBe(-DEFAULT_TUNABLES.maxPenalty);
  });

  it('CHIPS ALWAYS SUM TO THE TOTAL — design pillar 2', () => {
    // The reason apportionment is largest-remainder rather than float-proportional: the
    // player must be able to rebuild the number from what is on screen. Swept across sizes
    // and magnitudes so no single lucky case carries it.
    for (let count = 1; count <= 9; count += 1) {
      for (const magnitude of [1, 2, 3, 5, 7]) {
        const rows = Array.from({ length: count }, (_, i) =>
          row({ id: `m${String(i)}`, delta: magnitude }),
        );
        const result = resolveModifiers(CHECK, createModifierRegistry(rows), [], ctx());
        const summed = result.modifiers.reduce((acc, m) => acc + m.delta, 0);
        expect(summed, `${String(count)} x +${String(magnitude)}`).toBe(result.total);
        expect(result.total).toBeLessThanOrEqual(DEFAULT_TUNABLES.maxBonus);
      }
    }
  });

  it('marks capped entries, and allows one to reach zero', () => {
    // `m=1, S=20, C=6` apportions to 0. There is deliberately no minimum of 1 — a floor
    // would break the sum guarantee above. The chip renders as "0 (was +1, capped)".
    const rows = [row({ id: 'big', delta: 19 }), row({ id: 'tiny', delta: 1 })];
    const result = resolveModifiers(CHECK, createModifierRegistry(rows), [], ctx());
    expect(result.total).toBe(DEFAULT_TUNABLES.maxBonus);
    expect(result.modifiers.find((m) => m.id === 'tiny')?.delta).toBe(0);
    expect(result.modifiers.find((m) => m.id === 'tiny')?.capped).toBe(true);
    expect(result.modifiers.find((m) => m.id === 'tiny')?.rawDelta).toBe(1);
  });
});

describe('determinism', () => {
  it('is a total function of the input SET, not its order', () => {
    // The M8 eviction lesson applied: every comparator bottoms out on id, so shuffling the
    // registry cannot change the result. Tested by shuffling rather than by inspecting.
    const rows = [
      row({ id: 'a', delta: 3, sourceKind: 'item', stacks: false }),
      row({ id: 'b', delta: 3, sourceKind: 'item', stacks: false }),
      row({ id: 'c', delta: -2, priority: 5 }),
      row({ id: 'd', delta: 2, priority: 5, conflictsWith: ['c'] }),
      row({ id: 'e', delta: 1 }),
      row({ id: 'f', delta: 1 }),
    ];
    const reference = JSON.stringify(
      resolveModifiers(CHECK, createModifierRegistry(rows), [], ctx()),
    );
    for (let shift = 1; shift < rows.length; shift += 1) {
      const rotated = [...rows.slice(shift), ...rows.slice(0, shift)];
      expect(
        JSON.stringify(resolveModifiers(CHECK, createModifierRegistry(rotated), [], ctx())),
      ).toBe(reference);
    }
  });

  it('orders chips by magnitude then id', () => {
    const result = resolveModifiers(
      CHECK,
      createModifierRegistry([
        row({ id: 'zz_small', delta: 1 }),
        row({ id: 'aa_big', delta: 3 }),
        row({ id: 'bb_same', delta: 1 }),
      ]),
      [],
      ctx(),
    );
    expect(result.modifiers.map((m) => m.id)).toEqual(['aa_big', 'bb_same', 'zz_small']);
  });
});

describe('choice-local modifiers', () => {
  it('are applied alongside registry rows and outrank a conflicting one', () => {
    const result = resolveModifiers(
      CHECK,
      createModifierRegistry([row({ id: 'registry_row', delta: -2 })]),
      [{ id: 'check.modifier.local', labelKey: 'check.modifier.local', delta: 3 }],
      ctx(),
    );
    expect(result.total).toBe(1);
    expect(result.modifiers.map((m) => m.id)).toContain('check.modifier.local');
  });
});
