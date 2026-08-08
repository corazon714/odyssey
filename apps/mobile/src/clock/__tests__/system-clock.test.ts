import { describe, expect, it } from '@jest/globals';
import { readSystemTimeMs } from '../system-clock';

describe('readSystemTimeMs', () => {
  it('returns a finite epoch-milliseconds value', () => {
    const now = readSystemTimeMs();

    expect(Number.isFinite(now)).toBe(true);
    // Sanity floor: 2020-01-01. Catches a stubbed-to-zero clock, which would otherwise
    // look plausible in every downstream assertion.
    expect(now).toBeGreaterThan(1_577_836_800_000);
  });

  it('is monotonic across successive reads', () => {
    const first = readSystemTimeMs();
    const second = readSystemTimeMs();

    expect(second).toBeGreaterThanOrEqual(first);
  });
});
