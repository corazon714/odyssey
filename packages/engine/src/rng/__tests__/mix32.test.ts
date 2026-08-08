import { describe, expect, it } from 'vitest';
import { fmix32, rotl32 } from '../mix32.ts';

describe('rotl32', () => {
  it('rotates rather than shifting', () => {
    // The top bit must reappear at the bottom; a plain << would drop it.
    expect(rotl32(0x80000000, 1)).toBe(1);
    expect(rotl32(1, 31)).toBe(0x80000000);
  });

  it('is the identity at zero', () => {
    expect(rotl32(0x12345678, 0)).toBe(0x12345678);
  });

  it('returns unsigned values', () => {
    // `|` yields a SIGNED 32-bit result in JS, so without the >>> 0 this returns negatives
    // and every downstream multiply is subtly wrong.
    for (let bits = 0; bits < 32; bits += 1) {
      expect(rotl32(0xdeadbeef, bits)).toBeGreaterThanOrEqual(0);
    }
  });

  it('composes to a full turn', () => {
    expect(rotl32(rotl32(0xdeadbeef, 13), 19)).toBe(0xdeadbeef);
  });
});

describe('fmix32', () => {
  it('maps zero to zero', () => {
    // Every step is a multiply or xor of zero. Derived, not recalled.
    expect(fmix32(0)).toBe(0);
  });

  it('returns a uint32', () => {
    for (const value of [1, 0x7fffffff, 0x80000000, 0xffffffff, 0xdeadbeef]) {
      const mixed = fmix32(value);
      expect(mixed).toBeGreaterThanOrEqual(0);
      expect(mixed).toBeLessThanOrEqual(4294967295);
    }
  });

  it('is injective across a large sample', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 20000; i += 1) seen.add(fmix32(i));
    expect(seen.size).toBe(20000);
  });

  it('avalanches adjacent inputs', () => {
    expect(fmix32(1)).not.toBe(fmix32(2));
    expect(fmix32(1) >>> 24).not.toBe(fmix32(2) >>> 24);
  });
});
