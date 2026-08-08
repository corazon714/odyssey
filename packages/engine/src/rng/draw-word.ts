import { fmix32, rotl32 } from './mix32.ts';

/**
 * The single draw: one uint32 from one substream at one cursor position.
 *
 * This is `murmur3Bytes(littleEndian32(counter), key)` with the loop unrolled — exactly one
 * block, no tail, length 4. draw-word.test.ts asserts the equivalence across thousands of
 * inputs, so this specialisation is verified rather than assumed.
 *
 * Two properties the rest of the engine depends on:
 *
 * 1. It is a PURE FUNCTION of (key, counter). Nothing is carried between calls, which is
 *    why RunState can store a bare `Record<RngStream, number>` and still replay exactly —
 *    there is no generator state to serialise (docs/engine-spec.md 1 and 5).
 * 2. For a fixed key, counter -> word is a BIJECTION (murmur3's body step and finaliser are
 *    each invertible), so no value repeats within 2^32 draws of a stream.
 *
 * Together these give the property PROGRESS.md calls the one that matters most: drawing
 * from one substream cannot shift another, because no other stream's output ever depended
 * on this stream's cursor.
 */
export function drawWord(key: number, counter: number): number {
  const C1 = 0xcc9e2d51;
  const C2 = 0x1b873593;

  let k1 = Math.imul(counter >>> 0, C1) >>> 0;
  k1 = rotl32(k1, 15);
  k1 = Math.imul(k1, C2) >>> 0;

  let h1 = ((key >>> 0) ^ k1) >>> 0;
  h1 = rotl32(h1, 13);
  h1 = (Math.imul(h1, 5) + 0xe6546b64) >>> 0;

  // Length of the hashed input, always 4 bytes.
  h1 = (h1 ^ 4) >>> 0;
  return fmix32(h1);
}
