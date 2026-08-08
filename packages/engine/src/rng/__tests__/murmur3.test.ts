import { describe, expect, it } from 'vitest';
import { hashString32 } from '../hash-string.ts';
import { murmur3Bytes } from '../murmur3.ts';

/**
 * Checked against PUBLISHED MurmurHash3 x86_32 vectors, not against this implementation's
 * own output.
 *
 * That distinction is the reason murmur3 was chosen over a hand-rolled mixer (docs/adr/
 * 0005). A test comparing an implementation to values it produced itself is a regression
 * test — it detects change. These vectors come from outside the repo, so they detect being
 * WRONG, which is the failure mode that matters when the same seed has to replay
 * identically on V8, on Hermes, and on whatever ships next.
 *
 * The inputs below deliberately cover all four tail lengths: "abcd" is one whole block with
 * no tail, "a"/"ab"/"abc" are 1/2/3 tail bytes, and "Hello, world!" is three blocks plus a
 * one-byte tail.
 */
const VECTORS: readonly { readonly input: string; readonly seed: number; readonly hash: number }[] =
  [
    { input: '', seed: 0, hash: 0x00000000 },
    { input: 'a', seed: 0, hash: 0x3c2569b2 },
    { input: 'ab', seed: 0, hash: 0x9bbfd75f },
    { input: 'abc', seed: 0, hash: 0xb3dd93fa },
    { input: 'abcd', seed: 0, hash: 0x43ed676a },
    { input: 'Hello, world!', seed: 0, hash: 0xc0363e43 },
  ];

describe('murmur3Bytes', () => {
  it.each(VECTORS.map((v) => [v.input === '' ? '(empty)' : v.input, v]))(
    'matches the published vector for %s',
    (_label, vector) => {
      expect(hashString32(vector.input, vector.seed)).toBe(vector.hash);
    },
  );

  it('hashes the empty input to the finalised seed', () => {
    // Derivable from the algorithm rather than recalled: with no bytes there is no body and
    // no tail, so the result is fmix32(seed ^ 0). fmix32(0) is 0 because every step of it
    // is a multiply or xor of zero.
    expect(murmur3Bytes([], 0)).toBe(0);
  });

  it('returns a uint32 for every vector', () => {
    for (const vector of VECTORS) {
      const hash = hashString32(vector.input, vector.seed);
      expect(Number.isInteger(hash)).toBe(true);
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThanOrEqual(4294967295);
    }
  });

  it('changes completely when one input bit changes', () => {
    // Avalanche smoke test: a single flipped byte should not leave a recognisable prefix.
    const a = murmur3Bytes([1, 2, 3, 4, 5, 6, 7, 8], 0);
    const b = murmur3Bytes([1, 2, 3, 4, 5, 6, 7, 9], 0);
    expect(a).not.toBe(b);
    expect(a >>> 24).not.toBe(b >>> 24);
  });

  it('distinguishes the seed', () => {
    expect(murmur3Bytes([1, 2, 3, 4], 0)).not.toBe(murmur3Bytes([1, 2, 3, 4], 1));
  });
});
