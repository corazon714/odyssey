import { describe, expect, it } from 'vitest';
import {
  applyOddsFactors,
  BASE_EVENT_ODDS,
  EVENT_ODDS_MULTIPLIERS,
  fireProbability,
  type EventOdds,
  type EventOddsFactor,
} from '../event-odds.ts';

/**
 * ADR 0029 Decision 2, checked as arithmetic rather than as prose.
 *
 * The ADR's illustration is a 7:3 base, which is NOT `BASE_EVENT_ODDS` — M3.12a fences that at
 * 1:0 and M3.12b sets it from a sweep. Using the ADR's own base here is deliberate: the table
 * below is the published justification for choosing odds over probabilities, and it has to keep
 * being true independently of whatever the base ends up being.
 */
const ADR_BASE: EventOdds = { fire: 70, quiet: 30 };

const FACTORS = Object.keys(EVENT_ODDS_MULTIPLIERS) as EventOddsFactor[];

/** Every subset of the factor set, derived — never a hardcoded count. */
function everyCombination(): readonly (readonly EventOddsFactor[])[] {
  const combos: EventOddsFactor[][] = [];
  for (let mask = 0; mask < 1 << FACTORS.length; mask += 1) {
    combos.push(FACTORS.filter((_, bit) => (mask & (1 << bit)) !== 0));
  }
  return combos;
}

/** The ADR prints whole percents; this is the same rounding, so the table can be compared. */
function percent(odds: EventOdds): number {
  return Math.round(fireProbability(odds) * 100);
}

describe('event odds — the multipliers compose without a clamp', () => {
  it('has factors to check', () => {
    // Anti-vacuous guard: an empty factor set would make every property below pass on nothing.
    expect(FACTORS.length).toBeGreaterThan(0);
    expect(everyCombination().length).toBe(1 << FACTORS.length);
  });

  it.each([
    [['montage'], 41],
    [['emptyTerrain'], 58],
    [[], 70],
    [['urban'], 77],
    [['border'], 81],
    [['border', 'night', 'illicit', 'heat'], 90],
    [['urban', 'border', 'night', 'badWeather', 'illicit', 'heat'], 94],
  ] as const)('reproduces ADR 0029 D2 for %j', (factors, expected) => {
    expect(percent(applyOddsFactors(ADR_BASE, [...factors]))).toBe(expected);
  });

  it('scales the FIRE side only', () => {
    // The mechanism the whole decision rests on. montage ×0.3 on 70:30 is 21:30 — the quiet
    // side is untouched in RATIO terms, which is why nothing can leave [0, 1] and no clamp is
    // needed. Compared as a ratio because the representation carries the ×10 scale.
    const montage = applyOddsFactors(ADR_BASE, ['montage']);
    expect(montage.fire * 30).toBe(21 * montage.quiet);
  });

  it('never reaches certainty from a base that has a quiet side', () => {
    // A probability would have clamped at 1 and killed six of the eight multipliers. Odds
    // cannot: `quiet` stays strictly positive, so P stays strictly below 1 forever.
    for (const combo of everyCombination()) {
      const odds = applyOddsFactors(ADR_BASE, combo);
      expect(odds.quiet).toBeGreaterThan(0);
      expect(fireProbability(odds)).toBeLessThan(1);
      expect(fireProbability(odds)).toBeGreaterThan(0);
    }
  });

  it('stays exact integer arithmetic, inside the safe-integer range', () => {
    // A float multiplier would put 0.7000000000000001 into a value the golden digest covers.
    for (const combo of everyCombination()) {
      const odds = applyOddsFactors(ADR_BASE, combo);
      expect(Number.isSafeInteger(odds.fire)).toBe(true);
      expect(Number.isSafeInteger(odds.quiet)).toBe(true);
    }
  });

  it('is independent of the order the factors are applied in', () => {
    // The caller collects factors in whatever order reads best; if order mattered that would
    // be a replay hazard hiding in a style choice.
    const forward = applyOddsFactors(ADR_BASE, FACTORS);
    const backward = applyOddsFactors(ADR_BASE, [...FACTORS].reverse());
    expect(backward).toEqual(forward);
  });
});

describe('event odds — the degenerate pair', () => {
  it('0:0 resolves to certainty rather than to NaN', () => {
    // Guards the guard first: without the branch this is NaN, and every comparison against NaN
    // is false — so an unguarded gate silences every leg of every run.
    expect(0 / (0 + 0)).toBeNaN();
    expect(fireProbability({ fire: 0, quiet: 0 })).toBe(1);
  });

  it('resolves toward firing, not toward silence', () => {
    // The direction is the decision: a broken pair reproduces the pre-gate loop, which is a
    // game. The other direction is a run of nothing.
    expect(fireProbability({ fire: 0, quiet: 0 })).toBe(1);
    expect(fireProbability({ fire: -1, quiet: 0 })).toBe(1);
  });

  it('treats 0:n as a legitimate never-fire, not as degenerate', () => {
    expect(fireProbability({ fire: 0, quiet: 5 })).toBe(0);
  });
});

describe("BASE_EVENT_ODDS — M3.12a's fence", () => {
  it('is P = 1.0 exactly', () => {
    expect(fireProbability(BASE_EVENT_ODDS)).toBe(1);
  });

  it('stays P = 1.0 under EVERY combination of multipliers', () => {
    // THIS IS WHAT THE FENCE RESTS ON. The gate runs its full code path at M3.12a — factor
    // detection, composition, threshold, draw — and still cannot silence a leg, because the
    // multipliers only ever touch the FIRE side and the quiet side starts at zero. Certainty
    // is restored by the arithmetic, not by a branch that skips the gate, which is why
    // "digests unchanged" proves the M3.12b code path rather than proving it was never run.
    for (const combo of everyCombination()) {
      expect(fireProbability(applyOddsFactors(BASE_EVENT_ODDS, combo))).toBe(1);
    }
  });

  it('would stop being certain the moment the quiet side is non-zero', () => {
    // Guards the guard: if the property above held for any base, it would prove nothing about
    // this one. One point of quiet is enough to break it.
    expect(fireProbability(applyOddsFactors({ fire: 1, quiet: 1 }, ['montage']))).toBeLessThan(1);
  });
});
