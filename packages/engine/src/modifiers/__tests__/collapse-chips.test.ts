import { describe, expect, it } from 'vitest';
import { loadFixtureRouteEntries } from '../../__tests__/support/load-fixtures.ts';
import { ALL_REFS_KNOWN, createPredicateContext } from '../../predicate/predicate-context.ts';
import { type PredicateContext } from '../../predicate/predicate-context.ts';
import { createRng } from '../../rng/rng.ts';
import { createRngCursors } from '../../rng/rng-cursors.ts';
import { type RollModifier } from '../../rng/roll-result.ts';
import { createRunInit } from '../../state/run-init.ts';
import { createRunState } from '../../state/create-run-state.ts';
import {
  CHIP_OVERFLOW_LABEL_KEY,
  collapseChips,
  MAX_MODIFIER_CHIPS,
  type ModifierChip,
} from '../collapse-chips.ts';
import { runSkillCheck } from '../../loop/run-skill-check.ts';
import { DEFAULT_TUNABLES } from '../modifier-tunables.ts';
import {
  createModifierRegistry,
  MODIFIER_SOURCE_KINDS,
  type ModifierSourceKind,
  type RegistryModifier,
} from '../registry-modifier.ts';
import { resolveModifiers, type LocalModifier } from '../resolve-modifiers.ts';
import { type ModifierResolution, type ResolvedModifier } from '../resolved-modifier.ts';
import { type SkillCheck } from '../../content/game-event.ts';

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

/** The one chip with no single kind, or `undefined` when the bound did not bite. */
function overflowOf(chips: readonly ModifierChip[]): ModifierChip | undefined {
  return chips.find((chip) => chip.sourceKind === null);
}

/** How many chips the grouping WOULD have produced, computed independently of the collapse. */
function kindCount(resolution: ModifierResolution): number {
  return new Set(resolution.modifiers.map((m) => m.sourceKind)).size;
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

  it('actually TRIPS the seven-chip bound often enough to prove anything', () => {
    // The bound is the whole subject of the block below, and every property in it passes
    // vacuously on a corpus where no resolution ever exceeds seven kinds. So the corpus is
    // checked for the case first, in both directions: it must overflow sometimes and NOT
    // overflow sometimes, or the "iff" test proves one half of an implication.
    const overflowed = RESOLUTIONS.filter((r) => overflowOf(r.chips) !== undefined);
    const untouched = RESOLUTIONS.filter((r) => overflowOf(r.chips) === undefined);

    expect(overflowed.length).toBeGreaterThan(30);
    expect(untouched.length).toBeGreaterThan(30);
    // A fold of exactly two groups is the tightest case and the one where an off-by-one in
    // KEEP_CHIPS hides; a fold of many is where the summing goes wrong.
    expect(overflowed.some((r) => (overflowOf(r.chips)?.count ?? 0) === 2)).toBe(true);
    expect(overflowed.some((r) => (overflowOf(r.chips)?.count ?? 0) > 3)).toBe(true);
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
      // `null` is a legal value here — on the ONE overflow chip — so uniqueness covers it too:
      // a second null would mean two overflow chips.
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
        if (chip.sourceKind === null) {
          if (chip.labelKey !== CHIP_OVERFLOW_LABEL_KEY) {
            wrong.push(`case ${String(index)}: overflow labelled ${chip.labelKey}`);
          }
          continue;
        }
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

  it('orders by magnitude, then row count, then sourceKind, with no tie possible', () => {
    // The third key is what makes it a TOTAL order: there is exactly one group per kind, so
    // `sourceKind` cannot tie, so the comparator never returns 0 and the result cannot depend
    // on the order groups happened to be emitted in. The second key is a design choice rather
    // than a correctness one — at equal magnitude the chip covering three rows accounts for
    // more of the world than the chip covering one, and equal magnitudes are the common case.
    for (const resolution of RESOLUTIONS) {
      const kindChips = resolution.chips.filter((chip) => chip.sourceKind !== null);
      for (let i = 1; i < kindChips.length; i += 1) {
        const previous = kindChips[i - 1];
        const current = kindChips[i];
        if (previous === undefined || current === undefined) continue;
        const magPrevious = Math.abs(previous.delta);
        const magCurrent = Math.abs(current.delta);
        expect(magPrevious).toBeGreaterThanOrEqual(magCurrent);
        if (magPrevious !== magCurrent) continue;
        if (previous.count !== current.count) {
          expect(previous.count).toBeGreaterThan(current.count);
          continue;
        }
        expect(String(previous.sourceKind) < String(current.sourceKind)).toBe(true);
      }
    }
  });

  it('is a total function of the input ORDER as well as the set', () => {
    // The rows arrive sorted, but the collapse must not depend on that: rotating the finished
    // row list must produce the same chips, because a comparator that bottoms out on a unique
    // key cannot see input order.
    //
    // This is the property the seven-chip bound put the most weight on. Before it, input order
    // could only shuffle a rendered list; now it decides WHICH SIX chips survive, so an
    // order-sensitive comparator would make the tail a function of `Map` iteration rather than
    // of the world. The overflowing cases are therefore taken first and explicitly.
    const overflowing = RESOLUTIONS.filter((r) => overflowOf(r.chips) !== undefined);
    expect(overflowing.length).toBeGreaterThan(30);

    for (const resolution of [...overflowing, ...RESOLUTIONS].slice(0, 200)) {
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

/**
 * THE SEVEN-CHIP BOUND.
 *
 * Grouping by `sourceKind` bounds the list at twelve, not at seven, and the corpus said 94.6%
 * of groups have exactly one member — so the tail is FOLDED rather than grouped harder. Six
 * kind chips survive and the rest become one overflow chip carrying the summed delta and the
 * row count.
 *
 * "By construction" is a claim about a bound, and a bound is exactly the kind of claim a
 * property test can settle, so these assert the ceiling over the whole generated corpus rather
 * than on a picked example — plus the two cases the generator cannot be relied on to produce:
 * a tail that sums to zero, and a check whose roll is built while the chip list is truncated.
 */
describe('collapseChips — the chip list is BOUNDED at seven', () => {
  it('never returns more than MAX_MODIFIER_CHIPS, for any resolution', () => {
    expect(MAX_MODIFIER_CHIPS).toBe(7);
    for (const resolution of RESOLUTIONS) {
      expect(resolution.chips.length).toBeLessThanOrEqual(MAX_MODIFIER_CHIPS);
    }
  });

  it('folds exactly when the kinds exceed the bound, and never otherwise', () => {
    // An "iff", both directions, against a kind count computed from the ROWS rather than read
    // back off the chips — so a collapse that lost a kind cannot make its own test pass.
    const wrong: string[] = [];
    for (const [index, resolution] of RESOLUTIONS.entries()) {
      const kinds = kindCount(resolution);
      const overflow = overflowOf(resolution.chips);
      const shouldFold = kinds > MAX_MODIFIER_CHIPS;
      if (shouldFold !== (overflow !== undefined)) {
        wrong.push(
          `case ${String(index)}: ${String(kinds)} kinds, overflow=${String(overflow !== undefined)}`,
        );
        continue;
      }
      const expected = shouldFold ? MAX_MODIFIER_CHIPS : kinds;
      if (resolution.chips.length !== expected) {
        wrong.push(
          `case ${String(index)}: ${String(resolution.chips.length)} chips, want ${String(expected)}`,
        );
      }
    }
    expect(wrong).toEqual([]);
  });

  it('puts the overflow chip LAST and gives it the overflow label', () => {
    // Pinned rather than re-sorted: its delta is a sum across unrelated kinds, so it is not
    // comparable with the single-cause chips above it. A big footnote must not displace the
    // specific reason the player is looking for.
    for (const resolution of RESOLUTIONS) {
      const overflow = overflowOf(resolution.chips);
      if (overflow === undefined) continue;
      expect(resolution.chips.at(-1)).toBe(overflow);
      expect(overflow.labelKey).toBe(CHIP_OVERFLOW_LABEL_KEY);
      expect(resolution.chips.filter((c) => c.sourceKind === null).length).toBe(1);
    }
  });

  it('NEVER stands for a single row — "and 1 other" is unreachable, not merely unlikely', () => {
    // KEEP_CHIPS is MAX − 1 and the fold only runs above MAX, so the tail is always at least
    // two GROUPS and therefore at least two ROWS. Folding one row would delete its label for no
    // reduction in list length, which is the same argument ADR 0037 used for keeping a
    // single-member group's own label. Asserted so a change to the constants cannot pass quietly.
    for (const resolution of RESOLUTIONS) {
      const overflow = overflowOf(resolution.chips);
      if (overflow === undefined) continue;
      expect(overflow.count).toBeGreaterThanOrEqual(2);
      expect(overflow.memberIds.length).toBe(overflow.count);
    }
  });

  it('RENDERS a tail that sums to exactly zero rather than dropping it', () => {
    // 5.2% of corpus rows contribute 0 after the clamp, so a zero-summing overflow is a real
    // case, not a curiosity. It renders because dropping it would break the partition — the one
    // property that catches a lost row — and because "and six things that counted for nothing"
    // is a reconstruction, which is what pillar 2 asks for.
    //
    // Built as rows rather than through `resolveModifiers`: the clamp cannot be asked for a
    // zero-summing TAIL on demand, and `collapseChips` is a pure function of its argument.
    const deltas = [9, 8, 7, 6, 5, 4, 1, 1, 1, -1, -1, -1];
    const rows = MODIFIER_SOURCE_KINDS.map((kind, i): ResolvedModifier => ({
      id: `z${String(i)}`,
      labelKey: `check.modifier.z${String(i)}`,
      delta: deltas[i] ?? 0,
      rawDelta: deltas[i] ?? 0,
      sourceKind: kind,
      diminished: false,
      capped: false,
    }));

    const chips = collapseChips(rows);
    const overflow = overflowOf(chips);

    expect(chips.length).toBe(MAX_MODIFIER_CHIPS);
    expect(overflow).toBeDefined();
    expect(overflow?.delta).toBe(0);
    expect(overflow?.count).toBe(6);
    expect(sumDeltas(chips)).toBe(sumDeltas(rows));
    // The partition survives the zero: all six tail rows are still named.
    expect([...(overflow?.memberIds ?? [])].sort()).toEqual(['z10', 'z11', 'z6', 'z7', 'z8', 'z9']);
  });

  it('leaves the input array untouched', () => {
    // The fold reads `modifiers` a second time to rebuild the overflow's member list in
    // resolution order. A sort or splice in there would reorder the AUDIT TRAIL, which does
    // feed the roll.
    const rows = MODIFIER_SOURCE_KINDS.map((kind, i): ResolvedModifier => ({
      id: `m${String(i)}`,
      labelKey: `check.modifier.m${String(i)}`,
      delta: 12 - i,
      rawDelta: 12 - i,
      sourceKind: kind,
      diminished: false,
      capped: false,
    }));
    const before = JSON.stringify(rows);
    collapseChips(rows);
    expect(JSON.stringify(rows)).toBe(before);
  });
});

describe('collapseChips — the roll is still built from the ROWS', () => {
  it('feeds runSkillCheck twelve modifiers while the screen shows seven chips', () => {
    // THE HARD CONSTRAINT, asserted at the seam it could actually break at. `RollResult`
    // carries its modifier list verbatim, so counting it proves which list `runSkillCheck`
    // read — and with the bound in place the two lists now have DIFFERENT LENGTHS, which is
    // what makes this test able to fail.
    const rows = MODIFIER_SOURCE_KINDS.map((kind, i): RegistryModifier => ({
      id: `wide_${String(i)}`,
      appliesTo: ['social'],
      when: { kind: 'always' },
      delta: i % 2 === 0 ? 2 : -2,
      labelKey: `check.modifier.wide_${String(i)}`,
      sourceKind: kind,
      conflictsWith: [],
      priority: 10,
      stacks: true,
    }));

    const check: SkillCheck = {
      skill: 'negotiation',
      dc: 12,
      tags: ['social'],
      modifiers: [],
      visibility: 'full',
    };
    const outcome = runSkillCheck(
      check,
      CONTEXT,
      createRng('wide', createRngCursors()),
      [],
      createModifierRegistry(rows),
    );

    expect(outcome.resolution.modifiers.length).toBe(MODIFIER_SOURCE_KINDS.length);
    expect(outcome.resolution.chips.length).toBe(MAX_MODIFIER_CHIPS);
    expect(overflowOf(outcome.resolution.chips)).toBeDefined();

    // +1 for the skill chip runSkillCheck prepends. Built from `modifiers`, so it is 13 and not
    // the 8 a chip-built roll would show.
    expect(outcome.roll.modifiers.length).toBe(MODIFIER_SOURCE_KINDS.length + 1);

    const skillLevel = CONTEXT.state.skills[check.skill];
    expect(outcome.roll.modifierTotal).toBe(skillLevel + outcome.resolution.total);
    expect(sumDeltas(outcome.resolution.chips)).toBe(outcome.resolution.total);
    expect(sumDeltas(outcome.resolution.modifiers)).toBe(outcome.resolution.total);
  });
});
