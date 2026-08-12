import { describe, expect, it } from 'vitest';
import { loadFixtureRouteEntries } from '../../__tests__/support/load-fixtures.ts';
import { ALL_REFS_KNOWN, createPredicateContext } from '../../predicate/predicate-context.ts';
import { type PredicateContext } from '../../predicate/predicate-context.ts';
import { createRng } from '../../rng/rng.ts';
import { createRngCursors } from '../../rng/rng-cursors.ts';
import { type RollModifier } from '../../rng/roll-result.ts';
import { createRunInit } from '../../state/run-init.ts';
import { createRunState } from '../../state/create-run-state.ts';
import { collapseChips } from '../collapse-chips.ts';
import { DEFAULT_TUNABLES } from '../modifier-tunables.ts';
import {
  createModifierRegistry,
  MODIFIER_SOURCE_KINDS,
  type ModifierSourceKind,
  type RegistryModifier,
} from '../registry-modifier.ts';
import { resolveModifiers, type LocalModifier } from '../resolve-modifiers.ts';
import { type ModifierResolution } from '../resolved-modifier.ts';

/**
 * THE COLLAPSE MUST NOT MOVE THE MATHS — asserted as a property, not as an example.
 *
 * An example test here would prove nothing useful: the interesting inputs are the ones where
 * diminishing returns and the clamp have already redistributed magnitudes across rows, and
 * those are hard to hand-pick and easy to hand-pick favourably. So the registry is GENERATED —
 * from the engine's own seeded PRNG, so the corpus is identical on every machine and every
 * run — and every generated resolution is checked against the same seven invariants.
 *
 * The load-bearing one is roll neutrality: a roll fed the collapsed chips must produce the
 * same `RollResult` as a roll fed the original rows, from the same cursor. That is what
 * "no roll outcome may change" means operationally, and it holds because `rng.roll` draws its
 * die BEFORE it reads the modifier list and consumes a word count independent of its length.
 */

const ROUTE = loadFixtureRouteEntries()[0];

function ctx(): PredicateContext {
  if (ROUTE === undefined) throw new Error('no fixture route');
  const created = createRunState(createRunInit('collapse', 'v', ROUTE.route));
  if (!created.ok) throw new Error('route rejected');
  return createPredicateContext(created.state, ALL_REFS_KNOWN, 'test:0');
}

const CONTEXT = ctx();
const CHECK = { tags: ['social'] as const };

type GeneratedCase = {
  readonly seed: string;
  readonly rows: readonly RegistryModifier[];
  readonly locals: readonly LocalModifier[];
};

/**
 * Deterministic case generator.
 *
 * Deltas reach ±9 and counts reach 14 on purpose: the clamp is ±6/−8 and diminishing returns
 * starts at 3, so a generator that stayed inside those bounds would never produce a resolution
 * where apportionment had rewritten the per-row numbers — which is exactly the case the sum
 * guarantee is fragile in.
 */
function generateCase(index: number): GeneratedCase {
  const seed = `collapse:${String(index)}`;
  const rng = createRng(seed, createRngCursors());
  const rowCount = rng.nextInt(1, 14, 'eventPick');
  const ids: string[] = [];
  const rows: RegistryModifier[] = [];

  for (let i = 0; i < rowCount; i += 1) {
    const id = `gen_${String(index)}_${String(i)}`;
    const kindIndex = rng.nextInt(0, MODIFIER_SOURCE_KINDS.length - 1, 'eventPick');
    const kind: ModifierSourceKind = MODIFIER_SOURCE_KINDS[kindIndex] ?? 'condition';
    // A conflict target is drawn from rows already emitted, so the graph is acyclic by
    // construction and every named id resolves.
    const conflicts =
      ids.length > 0 && rng.nextInt(0, 4, 'eventPick') === 0
        ? [ids[rng.nextInt(0, ids.length - 1, 'eventPick')] ?? '']
        : [];

    rows.push({
      id,
      appliesTo: ['social'],
      when: { kind: 'always' },
      delta: rng.nextInt(-9, 9, 'eventPick'),
      labelKey: `check.modifier.${id}`,
      sourceKind: kind,
      conflictsWith: conflicts,
      priority: rng.nextInt(0, 20, 'eventPick'),
      stacks: rng.nextInt(0, 3, 'eventPick') !== 0,
    });
    ids.push(id);
  }

  const localCount = rng.nextInt(0, 3, 'eventPick');
  const locals: LocalModifier[] = [];
  for (let i = 0; i < localCount; i += 1) {
    const id = `local_${String(index)}_${String(i)}`;
    locals.push({ id, labelKey: `check.modifier.${id}`, delta: rng.nextInt(-6, 6, 'eventPick') });
  }

  return { seed, rows, locals };
}

const CASE_COUNT = 600;
const CASES: readonly GeneratedCase[] = Array.from({ length: CASE_COUNT }, (_, i) =>
  generateCase(i),
);
const RESOLUTIONS: readonly ModifierResolution[] = CASES.map((generated) =>
  resolveModifiers(CHECK, createModifierRegistry(generated.rows), generated.locals, CONTEXT),
);

function sumDeltas(entries: readonly { readonly delta: number }[]): number {
  let sum = 0;
  for (const entry of entries) sum += entry.delta;
  return sum;
}

describe('collapseChips — the generated corpus is worth asserting over', () => {
  it('exercises folding, clamping and both signs', () => {
    // Anti-vacuous. Every property below passes trivially on a corpus of empty resolutions or
    // one where no group ever has two members, so the corpus itself is checked first.
    const folded = RESOLUTIONS.flatMap((r) => r.chips).filter((chip) => chip.count > 1);
    const clamped = RESOLUTIONS.filter((r) => r.modifiers.some((m) => m.capped));
    const diminished = RESOLUTIONS.filter((r) => r.modifiers.some((m) => m.diminished));
    const shrunk = RESOLUTIONS.filter((r) => r.chips.length < r.modifiers.length);
    const overBand = RESOLUTIONS.filter((r) => r.modifiers.length > 7);

    expect(folded.length).toBeGreaterThan(200);
    expect(clamped.length).toBeGreaterThan(50);
    expect(diminished.length).toBeGreaterThan(50);
    expect(shrunk.length).toBeGreaterThan(100);
    expect(overBand.length).toBeGreaterThan(50);
    expect(RESOLUTIONS.some((r) => r.total > 0)).toBe(true);
    expect(RESOLUTIONS.some((r) => r.total < 0)).toBe(true);
  });
});

describe('collapseChips — the delta is preserved exactly, for every resolution', () => {
  it('sums the chips to the same total as the rows', () => {
    const mismatched: string[] = [];
    for (const [index, resolution] of RESOLUTIONS.entries()) {
      const rows = sumDeltas(resolution.modifiers);
      const chips = sumDeltas(resolution.chips);
      if (rows !== resolution.total || chips !== resolution.total) {
        mismatched.push(
          `case ${String(index)}: rows ${String(rows)}, chips ${String(chips)}, total ${String(resolution.total)}`,
        );
      }
    }
    expect(mismatched).toEqual([]);
  });

  it('sums each chip to its own members, in delta and in rawDelta', () => {
    const mismatched: string[] = [];
    for (const [index, resolution] of RESOLUTIONS.entries()) {
      const byId = new Map(resolution.modifiers.map((m) => [m.id, m]));
      for (const chip of resolution.chips) {
        let delta = 0;
        let rawDelta = 0;
        for (const id of chip.memberIds) {
          const member = byId.get(id);
          if (member === undefined) {
            mismatched.push(`case ${String(index)}: chip names unknown member ${id}`);
            continue;
          }
          delta += member.delta;
          rawDelta += member.rawDelta;
        }
        if (delta !== chip.delta || rawDelta !== chip.rawDelta) {
          mismatched.push(`case ${String(index)}: ${chip.sourceKind} chip does not sum`);
        }
        if (chip.count !== chip.memberIds.length) {
          mismatched.push(`case ${String(index)}: ${chip.sourceKind} count != members`);
        }
      }
    }
    expect(mismatched).toEqual([]);
  });

  it('loses no row and duplicates none — the chips PARTITION the rows', () => {
    const broken: string[] = [];
    for (const [index, resolution] of RESOLUTIONS.entries()) {
      const members = resolution.chips.flatMap((chip) => chip.memberIds);
      const unique = new Set(members);
      if (unique.size !== members.length) broken.push(`case ${String(index)}: duplicated member`);
      const rowIds = resolution.modifiers.map((m) => m.id);
      if (members.length !== rowIds.length) broken.push(`case ${String(index)}: count differs`);
      for (const id of rowIds) {
        if (!unique.has(id)) broken.push(`case ${String(index)}: row ${id} reached no chip`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('never exceeds the total the clamp allows', () => {
    for (const resolution of RESOLUTIONS) {
      expect(sumDeltas(resolution.chips)).toBeLessThanOrEqual(DEFAULT_TUNABLES.maxBonus);
      expect(sumDeltas(resolution.chips)).toBeGreaterThanOrEqual(-DEFAULT_TUNABLES.maxPenalty);
    }
  });
});

describe('collapseChips — no roll outcome moves', () => {
  it('rolls identically off the chips and off the rows, from the same cursor', () => {
    // THE POINT OF THE WHOLE CHANGE, stated as a test: whatever the screen renders, the die and
    // the verdict are the same. Two independent Rngs on one seed and one cursor set, so any
    // difference could only come from the modifier list.
    const differed: string[] = [];
    for (const [index, resolution] of RESOLUTIONS.entries()) {
      const generated = CASES[index];
      if (generated === undefined) continue;
      const dc = 8 + (index % 9);

      const fromRows: RollModifier[] = resolution.modifiers.map((m) => ({
        labelKey: m.labelKey,
        delta: m.delta,
      }));
      const fromChips: RollModifier[] = resolution.chips.map((c) => ({
        labelKey: c.labelKey,
        delta: c.delta,
      }));

      const a = createRng(generated.seed, createRngCursors()).roll(dc, fromRows, 'skillCheck');
      const b = createRng(generated.seed, createRngCursors()).roll(dc, fromChips, 'skillCheck');

      if (
        a.die !== b.die ||
        a.modifierTotal !== b.modifierTotal ||
        a.total !== b.total ||
        a.success !== b.success ||
        a.margin !== b.margin
      ) {
        differed.push(
          `case ${String(index)}: ${String(a.total)}/${String(a.success)} vs ${String(b.total)}/${String(b.success)}`,
        );
      }
    }
    expect(differed).toEqual([]);
  });
});

describe('collapseChips — the render list is well formed', () => {
  it('emits at most one chip per sourceKind, and never more chips than rows', () => {
    for (const resolution of RESOLUTIONS) {
      const kinds = resolution.chips.map((chip) => chip.sourceKind);
      expect(new Set(kinds).size).toBe(kinds.length);
      expect(resolution.chips.length).toBeLessThanOrEqual(resolution.modifiers.length);
      expect(resolution.chips.length).toBeLessThanOrEqual(MODIFIER_SOURCE_KINDS.length);
    }
  });

  it('keeps a lone row its own label and gives a folded group the kind key', () => {
    const wrong: string[] = [];
    for (const [index, resolution] of RESOLUTIONS.entries()) {
      const byId = new Map(resolution.modifiers.map((m) => [m.id, m]));
      for (const chip of resolution.chips) {
        const expected =
          chip.count === 1
            ? (byId.get(chip.memberIds[0] ?? '')?.labelKey ?? '')
            : `check.kind.${chip.sourceKind}`;
        if (chip.labelKey !== expected) {
          wrong.push(`case ${String(index)}: ${chip.labelKey} != ${expected}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('ORs the diminished and capped flags across the group', () => {
    const wrong: string[] = [];
    for (const [index, resolution] of RESOLUTIONS.entries()) {
      const byId = new Map(resolution.modifiers.map((m) => [m.id, m]));
      for (const chip of resolution.chips) {
        const members = chip.memberIds.map((id) => byId.get(id));
        const diminished = members.some((m) => m?.diminished === true);
        const capped = members.some((m) => m?.capped === true);
        if (chip.diminished !== diminished || chip.capped !== capped) {
          wrong.push(`case ${String(index)}: ${chip.sourceKind} flags`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('orders by magnitude then sourceKind, with no tie possible', () => {
    for (const resolution of RESOLUTIONS) {
      for (let i = 1; i < resolution.chips.length; i += 1) {
        const previous = resolution.chips[i - 1];
        const current = resolution.chips[i];
        if (previous === undefined || current === undefined) continue;
        const magPrevious = Math.abs(previous.delta);
        const magCurrent = Math.abs(current.delta);
        expect(magPrevious).toBeGreaterThanOrEqual(magCurrent);
        if (magPrevious === magCurrent) {
          expect(previous.sourceKind < current.sourceKind).toBe(true);
        }
      }
    }
  });

  it('is a total function of the input ORDER as well as the set', () => {
    // The rows arrive sorted, but the collapse must not depend on that: rotating the finished
    // row list must produce the same chips, because a comparator that bottoms out on a unique
    // key cannot see input order.
    for (const resolution of RESOLUTIONS.slice(0, 100)) {
      const rows = resolution.modifiers;
      if (rows.length < 2) continue;
      const reference = JSON.stringify(
        collapseChips(rows).map((c) => ({ ...c, memberIds: [...c.memberIds].sort() })),
      );
      for (let shift = 1; shift < Math.min(rows.length, 5); shift += 1) {
        const rotated = [...rows.slice(shift), ...rows.slice(0, shift)];
        const shuffled = JSON.stringify(
          collapseChips(rotated).map((c) => ({ ...c, memberIds: [...c.memberIds].sort() })),
        );
        expect(shuffled).toBe(reference);
      }
    }
  });

  it('collapses nothing when every row is its own kind, and everything when none is', () => {
    // The two ends of the range, so the generated corpus is not the only evidence.
    const distinct = MODIFIER_SOURCE_KINDS.slice(0, 5).map((kind, i): RegistryModifier => ({
      id: `d${String(i)}`,
      appliesTo: ['social'],
      when: { kind: 'always' },
      delta: 1,
      labelKey: `check.modifier.d${String(i)}`,
      sourceKind: kind,
      conflictsWith: [],
      priority: 10,
      stacks: true,
    }));
    const spread = resolveModifiers(CHECK, createModifierRegistry(distinct), [], CONTEXT);
    expect(spread.chips.length).toBe(spread.modifiers.length);
    expect(spread.chips.every((chip) => chip.count === 1)).toBe(true);

    const same = distinct.map((row) => ({ ...row, sourceKind: 'condition' as const }));
    const piled = resolveModifiers(CHECK, createModifierRegistry(same), [], CONTEXT);
    expect(piled.chips.length).toBe(1);
    expect(piled.chips[0]?.labelKey).toBe('check.kind.condition');
    expect(piled.chips[0]?.count).toBe(piled.modifiers.length);
    expect(piled.chips[0]?.delta).toBe(piled.total);
  });
});
