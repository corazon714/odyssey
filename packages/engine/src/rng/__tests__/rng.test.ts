import { describe, expect, it } from 'vitest';
import { createRng } from '../rng.ts';
import { createRngCursors } from '../rng-cursors.ts';
import { RNG_STREAMS } from '../rng-stream.ts';
import { CHECK_DIE_SIDES } from '../roll-result.ts';

const SEED = 'rng-fixture';
const fresh = (): ReturnType<typeof createRng> => createRng(SEED, createRngCursors());

describe('createRng determinism (PROGRESS.md M1.1)', () => {
  it('produces the same sequence from the same seed and cursors', () => {
    const a = Array.from({ length: 64 }, () => fresh().nextWord('eventPick'));
    expect(new Set(a).size).toBe(1); // each fresh Rng starts over

    const one = fresh();
    const two = fresh();
    const seqOne = Array.from({ length: 64 }, () => one.nextWord('eventPick'));
    const seqTwo = Array.from({ length: 64 }, () => two.nextWord('eventPick'));
    expect(seqOne).toEqual(seqTwo);
  });

  it('produces a different sequence from a different seed', () => {
    const a = Array.from({ length: 16 }, () =>
      createRng('a', createRngCursors()).nextWord('worldTick'),
    );
    const b = Array.from({ length: 16 }, () =>
      createRng('b', createRngCursors()).nextWord('worldTick'),
    );
    expect(a).not.toEqual(b);
  });

  it('resumes exactly where a drained Rng stopped', () => {
    // This IS replay: the app persists cursors(), reloads, and must continue the same run.
    const first = fresh();
    const before = Array.from({ length: 10 }, () => first.nextWord('outcomeRoll'));
    const saved = JSON.parse(JSON.stringify(first.cursors())) as ReturnType<
      typeof createRngCursors
    >;

    const resumed = createRng(SEED, saved);
    const after = Array.from({ length: 10 }, () => resumed.nextWord('outcomeRoll'));

    const straightThrough = fresh();
    const expected = Array.from({ length: 20 }, () => straightThrough.nextWord('outcomeRoll'));

    expect([...before, ...after]).toEqual(expected);
  });
});

describe('createRng cursors', () => {
  it('advances exactly one step per word', () => {
    const rng = fresh();
    rng.nextWord('npcGen');
    rng.nextWord('npcGen');
    rng.nextWord('npcGen');
    expect(rng.cursors().npcGen).toBe(3);
  });

  it('leaves untouched streams at zero', () => {
    const rng = fresh();
    rng.nextWord('npcGen');
    const cursors = rng.cursors();
    for (const stream of RNG_STREAMS) {
      if (stream !== 'npcGen') expect(cursors[stream]).toBe(0);
    }
  });

  it('does not alias the caller cursors', () => {
    // The engine treats RunState as immutable; an Rng that wrote through to the passed
    // record would mutate state behind the caller's back (CLAUDE.md 2.7 and 2.8).
    const cursors = createRngCursors();
    const rng = fresh();
    createRng(SEED, cursors).nextWord('eventPick');
    expect(cursors.eventPick).toBe(0);
    expect(rng.cursors()).not.toBe(rng.cursors());
  });

  it('returns a snapshot that survives JSON', () => {
    const rng = fresh();
    rng.nextWord('routeGen');
    const cursors = rng.cursors();
    expect(JSON.parse(JSON.stringify(cursors))).toEqual(cursors);
  });
});

describe('createRng draws', () => {
  it('nextFloat stays in [0, 1)', () => {
    const rng = fresh();
    for (let i = 0; i < 5000; i += 1) {
      const value = rng.nextFloat('encounterFlavor');
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('nextInt stays within the inclusive range', () => {
    const rng = fresh();
    for (let i = 0; i < 5000; i += 1) {
      const value = rng.nextInt(3, 7, 'skillCheck');
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(7);
    }
  });

  it('nextInt covers the whole range', () => {
    const rng = fresh();
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i += 1) seen.add(rng.nextInt(1, 6, 'skillCheck'));
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('nextInt handles a degenerate range without drawing', () => {
    const rng = fresh();
    expect(rng.nextInt(5, 5, 'worldTick')).toBe(5);
    expect(rng.nextInt(9, 2, 'worldTick')).toBe(9);
    expect(rng.cursors().worldTick).toBe(0);
  });

  it('pick returns null for an empty array', () => {
    expect(fresh().pick([], 'eventPick')).toBeNull();
  });

  it('pick only ever returns a member of the array', () => {
    const rng = fresh();
    const items = ['a', 'b', 'c', 'd'];
    for (let i = 0; i < 500; i += 1) expect(items).toContain(rng.pick(items, 'eventPick'));
  });
});

describe('createRng roll', () => {
  it('rolls within the die', () => {
    const rng = fresh();
    for (let i = 0; i < 2000; i += 1) {
      const result = rng.roll(10, [], 'skillCheck');
      expect(result.die).toBeGreaterThanOrEqual(1);
      expect(result.die).toBeLessThanOrEqual(CHECK_DIE_SIDES);
      expect(result.sides).toBe(CHECK_DIE_SIDES);
    }
  });

  it('sums modifiers and reports the margin', () => {
    const rng = fresh();
    const result = rng.roll(
      12,
      [
        { labelKey: 'check.modifier.smooth_talker', delta: 2 },
        { labelKey: 'check.modifier.hygiene_low', delta: -3 },
      ],
      'skillCheck',
    );

    expect(result.modifierTotal).toBe(-1);
    expect(result.total).toBe(result.die - 1);
    expect(result.margin).toBe(result.total - 12);
    expect(result.success).toBe(result.total >= 12);
  });

  it('carries the modifier chips through for the result screen', () => {
    // Design pillar 2: the player must be able to reconstruct WHY. The labels are i18n
    // keys, never prose (CLAUDE.md 2.4).
    const modifiers = [{ labelKey: 'check.modifier.wanted', delta: -3 }];
    expect(fresh().roll(8, modifiers, 'skillCheck').modifiers).toEqual(modifiers);
  });
});
