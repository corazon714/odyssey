import { describe, expect, it } from 'vitest';
import { drawWord } from '../draw-word.ts';
import { murmur3Bytes } from '../murmur3.ts';

/** The 4-byte little-endian encoding drawWord is specialised over. */
const le32 = (value: number): number[] => [
  value & 0xff,
  (value >>> 8) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 24) & 0xff,
];

const KEYS = [0, 1, 0x9e3779b9, 0xdeadbeef, 0xffffffff, 12345, 0x7fffffff];

describe('drawWord', () => {
  it('equals the general murmur3 over the counter bytes', () => {
    // The whole justification for hand-unrolling the hot path. If this drifts, the fast
    // path silently stops being murmur3 and the published vectors stop meaning anything.
    for (const key of KEYS) {
      for (let counter = 0; counter < 512; counter += 1) {
        expect(drawWord(key, counter)).toBe(murmur3Bytes(le32(counter), key));
      }
    }
  });

  it('agrees with the general implementation at 32-bit boundaries', () => {
    for (const counter of [0, 1, 0x7fffffff, 0x80000000, 0xfffffffe, 0xffffffff]) {
      expect(drawWord(0x9e3779b9, counter)).toBe(murmur3Bytes(le32(counter), 0x9e3779b9));
    }
  });

  it('always returns a uint32', () => {
    for (const key of KEYS) {
      for (let counter = 0; counter < 256; counter += 1) {
        const word = drawWord(key, counter);
        expect(Number.isInteger(word)).toBe(true);
        expect(word).toBeGreaterThanOrEqual(0);
        expect(word).toBeLessThanOrEqual(4294967295);
      }
    }
  });

  it('is injective over a long run of counters for one key', () => {
    // murmur3's body step and finaliser are each bijective, so counter -> word cannot
    // repeat within 2^32. A collision here would mean the mixing is broken.
    const seen = new Set<number>();
    for (let counter = 0; counter < 20000; counter += 1) seen.add(drawWord(0xdeadbeef, counter));
    expect(seen.size).toBe(20000);
  });

  it('is a pure function of its inputs', () => {
    // No hidden state: the same (key, counter) must give the same word forever, which is
    // what lets RunState persist a bare integer per stream.
    expect(drawWord(42, 7)).toBe(drawWord(42, 7));
    expect(drawWord(42, 7)).not.toBe(drawWord(42, 8));
    expect(drawWord(42, 7)).not.toBe(drawWord(43, 7));
  });
});
