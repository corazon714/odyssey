import { describe, expect, it } from 'vitest';
import { createRunState } from '../create-run-state.ts';
import { createRunInit } from '../run-init.ts';
import { uniformSplit } from '../uniform-split.ts';
import { validateRoute } from '../validate-route.ts';
import { makeRoute } from './support/make-route.ts';

/**
 * `legKm` and `montageLegs` — the M3.7 fields, at uniform values.
 *
 * The values are uniform everywhere today and M3.9 replaces them with terrain-density sizing.
 * What is pinned here is the INVARIANT, not the numbers: the parts sum to the whole. That
 * survives the M3.9 rewrite, which is the point of asserting it now rather than then.
 */

describe('uniformSplit sums to exactly the distance it was given', () => {
  it('is exact on a clean division', () => {
    expect(uniformSplit(620, 10)).toEqual([62, 62, 62, 62, 62, 62, 62, 62, 62, 62]);
  });

  it('is exact when the division has a remainder', () => {
    // 2140/24 is 89.16…, so four legs must carry the extra kilometre.
    const split = uniformSplit(2140, 24);
    expect(split).toHaveLength(24);
    expect(split.reduce((a, b) => a + b, 0)).toBe(2140);
    expect([...new Set(split)].sort((a, b) => a - b)).toEqual([89, 90]);
  });

  it('spreads the remainder rather than clumping it at the front', () => {
    // Cosmetic today, load-bearing at M3.8: `legHours` divides `legKm` by speed, so a
    // front-loaded remainder puts a deterministic duration bump on the opening legs of every
    // route. `[91,91,91,90,…]` would pass the sum assertion above and fail this one.
    const split = uniformSplit(2140, 24);
    const firstFour = split.slice(0, 4);
    expect(firstFour).not.toEqual([90, 90, 90, 90]);
    expect(split.indexOf(90)).toBeGreaterThan(0);
  });

  it('is exact across a sweep, which is the property M3.9 must not break', () => {
    for (let legCount = 1; legCount <= 60; legCount += 1) {
      for (const totalKm of [0, 1, 97, 620, 1380, 2140, 13007]) {
        const split = uniformSplit(totalKm, legCount);
        expect(split).toHaveLength(legCount);
        expect(split.reduce((a, b) => a + b, 0)).toBe(totalKm);
        expect(split.every((km) => Number.isInteger(km) && km >= 0)).toBe(true);
      }
    }
  });

  it('returns nothing for a route with no legs rather than dividing by zero', () => {
    expect(uniformSplit(500, 0)).toEqual([]);
    expect(uniformSplit(500, -3)).toEqual([]);
  });
});

describe('validateRoute rejects a route whose legs do not add up', () => {
  it('accepts the uniform route the builder produces', () => {
    expect(validateRoute(makeRoute())).toBeNull();
    expect(validateRoute(makeRoute({ legCount: 24, totalKm: 2140 }))).toBeNull();
  });

  it('rejects a legKm array of the wrong length', () => {
    const error = validateRoute(makeRoute({ legCount: 12, legKm: [1, 2, 3] }));
    expect(error?.code).toBe('route/leg-count-mismatch');
  });

  it('rejects legs that sum to the wrong distance', () => {
    // The failure it stops: a route arriving one kilometre short forever, which presents as a
    // run that never completes rather than as a bad number.
    const short = uniformSplit(900, 12).map((km, i) => (i === 0 ? km - 1 : km));
    const error = validateRoute(makeRoute({ legCount: 12, totalKm: 900, legKm: short }));
    expect(error?.code).toBe('route/leg-distance-mismatch');
    expect(error?.params).toMatchObject({ sum: 899, totalKm: 900 });
  });

  it('rejects a negative leg even when the total still balances', () => {
    const balanced = uniformSplit(900, 12).map((km, i) => (i === 0 ? -km : i === 1 ? km * 3 : km));
    expect(balanced.reduce((a, b) => a + b, 0)).toBe(900);
    const error = validateRoute(makeRoute({ legCount: 12, totalKm: 900, legKm: balanced }));
    expect(error?.code).toBe('route/leg-distance-mismatch');
  });

  it('rejects a montage leg outside the route', () => {
    expect(validateRoute(makeRoute({ legCount: 12, montageLegs: [12] }))?.code).toBe(
      'route/montage-out-of-range',
    );
    expect(validateRoute(makeRoute({ legCount: 12, montageLegs: [-1] }))?.code).toBe(
      'route/montage-out-of-range',
    );
  });

  it('rejects montage legs that are not ascending and unique', () => {
    expect(validateRoute(makeRoute({ legCount: 12, montageLegs: [5, 3] }))?.code).toBe(
      'route/montage-out-of-range',
    );
    expect(validateRoute(makeRoute({ legCount: 12, montageLegs: [4, 4] }))?.code).toBe(
      'route/montage-out-of-range',
    );
  });

  it('accepts an ascending montage list', () => {
    expect(validateRoute(makeRoute({ legCount: 12, montageLegs: [2, 5, 9] }))).toBeNull();
  });
});

describe('a created run carries both fields', () => {
  it('reaches RunState rather than stopping at the validator', () => {
    // `canonicalJson` serialises `Object.keys`, so a field that never reaches the state
    // contributes nothing to the digest and fails silently. Asserted on the built state.
    const created = createRunState(
      createRunInit('leg-km-test', 'content-v1', makeRoute({ legCount: 12, totalKm: 900 })),
    );
    if (!created.ok) throw new Error(`route rejected: ${created.error.code}`);

    expect(created.state.route.legKm).toHaveLength(12);
    expect(created.state.route.legKm.reduce((a, b) => a + b, 0)).toBe(900);
    expect(created.state.route.montageLegs).toEqual([]);
  });
});
