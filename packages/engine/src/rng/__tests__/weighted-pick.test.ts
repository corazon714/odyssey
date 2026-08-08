import { describe, expect, it } from 'vitest';
import { createRng } from '../rng.ts';
import { createRngCursors } from '../rng-cursors.ts';
import { pickByWeight, totalWeight, type WeightedEntry } from '../weighted-pick.ts';

const ENTRIES: readonly WeightedEntry<string>[] = [
  { value: 'common', weight: 70 },
  { value: 'uncommon', weight: 25 },
  { value: 'rare', weight: 5 },
];

describe('totalWeight', () => {
  it('sums positive weights', () => {
    expect(totalWeight(ENTRIES)).toBe(100);
  });

  it('ignores zero and negative weights', () => {
    expect(
      totalWeight([
        { value: 'a', weight: 0 },
        { value: 'b', weight: -4 },
      ]),
    ).toBe(0);
  });

  it('is zero for an empty pool', () => {
    expect(totalWeight([])).toBe(0);
  });
});

describe('pickByWeight', () => {
  it('maps each cumulative band to its entry', () => {
    expect(pickByWeight(ENTRIES, 0)).toBe('common');
    expect(pickByWeight(ENTRIES, 69)).toBe('common');
    expect(pickByWeight(ENTRIES, 70)).toBe('uncommon');
    expect(pickByWeight(ENTRIES, 94)).toBe('uncommon');
    expect(pickByWeight(ENTRIES, 95)).toBe('rare');
    expect(pickByWeight(ENTRIES, 99)).toBe('rare');
  });

  it('skips non-positive weights entirely', () => {
    const withZero: WeightedEntry<string>[] = [
      { value: 'never', weight: 0 },
      { value: 'always', weight: 3 },
    ];
    expect(pickByWeight(withZero, 0)).toBe('always');
    expect(pickByWeight(withZero, 2)).toBe('always');
  });

  it('returns null rather than throwing when the target is out of range', () => {
    expect(pickByWeight(ENTRIES, 100)).toBeNull();
    expect(pickByWeight([], 0)).toBeNull();
  });
});

describe('rng.weightedPick distribution (PROGRESS.md M1.5)', () => {
  it('is stable for a fixed seed', () => {
    const counts = (seed: string): Record<string, number> => {
      const rng = createRng(seed, createRngCursors());
      const tally: Record<string, number> = { common: 0, uncommon: 0, rare: 0 };
      for (let i = 0; i < 10000; i += 1) {
        const picked = rng.weightedPick(ENTRIES, 'eventPick');
        if (picked !== null) tally[picked] = (tally[picked] ?? 0) + 1;
      }
      return tally;
    };

    // Reproducibility is the assertion that matters; the exact numbers come from the
    // generator, so they are pinned by re-running rather than by hand.
    const first = counts('distribution-fixture');
    expect(counts('distribution-fixture')).toEqual(first);

    // And the shape must actually track the weights, or a broken pick would still be
    // "stable" — the guard against a vacuous pass.
    expect(first['common']).toBeGreaterThan(first['uncommon'] ?? 0);
    expect(first['uncommon']).toBeGreaterThan(first['rare'] ?? 0);
  });

  it('lands within a few percent of the declared weights', () => {
    const rng = createRng('proportions', createRngCursors());
    const tally: Record<string, number> = { common: 0, uncommon: 0, rare: 0 };
    for (let i = 0; i < 40000; i += 1) {
      const picked = rng.weightedPick(ENTRIES, 'eventPick');
      if (picked !== null) tally[picked] = (tally[picked] ?? 0) + 1;
    }

    expect((tally['common'] ?? 0) / 40000).toBeCloseTo(0.7, 1);
    expect((tally['uncommon'] ?? 0) / 40000).toBeCloseTo(0.25, 1);
    expect((tally['rare'] ?? 0) / 40000).toBeCloseTo(0.05, 1);
  });

  it('returns null when nothing has positive weight', () => {
    const rng = createRng('empty', createRngCursors());
    expect(rng.weightedPick([], 'eventPick')).toBeNull();
    expect(rng.weightedPick([{ value: 'x', weight: 0 }], 'eventPick')).toBeNull();
  });

  it('does not consume a draw when the pool is empty', () => {
    const rng = createRng('empty', createRngCursors());
    rng.weightedPick([], 'eventPick');
    expect(rng.cursors().eventPick).toBe(0);
  });
});
