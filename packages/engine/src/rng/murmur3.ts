import { fmix32, rotl32 } from './mix32.ts';

/**
 * MurmurHash3 x86_32 over a byte sequence.
 *
 * This is the reference-shaped, general implementation. The hot path — one draw from one
 * substream — is drawWord() in draw-word.ts, which is this function hand-specialised to a
 * single 4-byte block. draw-word.test.ts asserts the two agree, so the fast path is checked
 * against the general one rather than trusted.
 *
 * Why murmur3 rather than the SplitMix64 named in the original Phase 1 brief: see
 * docs/adr/0005. The short version is that a counter-based draw must mix BOTH the stream
 * key and the counter. `splitmix64(streamKey + counter * GAMMA)` mixes only their sum,
 * which makes two streams whose keys differ by k*GAMMA produce sequences that overlap
 * after k draws — isolation by luck instead of by construction.
 */
export function murmur3Bytes(bytes: readonly number[], seed: number): number {
  const C1 = 0xcc9e2d51;
  const C2 = 0x1b873593;

  let h1 = seed >>> 0;
  const blockEnd = bytes.length - (bytes.length % 4);

  for (let i = 0; i < blockEnd; i += 4) {
    // Little-endian, matching the reference implementation's memcpy on x86.
    let k1 =
      ((bytes[i] ?? 0) |
        ((bytes[i + 1] ?? 0) << 8) |
        ((bytes[i + 2] ?? 0) << 16) |
        ((bytes[i + 3] ?? 0) << 24)) >>>
      0;

    k1 = Math.imul(k1, C1) >>> 0;
    k1 = rotl32(k1, 15);
    k1 = Math.imul(k1, C2) >>> 0;

    h1 = (h1 ^ k1) >>> 0;
    h1 = rotl32(h1, 13);
    h1 = (Math.imul(h1, 5) + 0xe6546b64) >>> 0;
  }

  // Tail: 1-3 leftover bytes get the k1 treatment but skip the h1 mixing round.
  let tail = 0;
  const remaining = bytes.length % 4;

  if (remaining === 3) tail = (tail ^ ((bytes[blockEnd + 2] ?? 0) << 16)) >>> 0;
  if (remaining >= 2) tail = (tail ^ ((bytes[blockEnd + 1] ?? 0) << 8)) >>> 0;
  if (remaining >= 1) {
    tail = (tail ^ (bytes[blockEnd] ?? 0)) >>> 0;
    tail = Math.imul(tail, C1) >>> 0;
    tail = rotl32(tail, 15);
    tail = Math.imul(tail, C2) >>> 0;
    h1 = (h1 ^ tail) >>> 0;
  }

  h1 = (h1 ^ bytes.length) >>> 0;
  return fmix32(h1);
}
