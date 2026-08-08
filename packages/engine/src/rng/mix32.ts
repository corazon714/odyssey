/**
 * 32-bit mixing primitives, written so every operation is exactly specified by ECMAScript.
 *
 * `Math.imul` is the only multiplication used here. Plain `*` on two uint32 operands
 * overflows the 53-bit float mantissa and silently drops the low bits a hash depends on —
 * the resulting values are still deterministic, just wrong, which is the worst failure mode
 * available. `Math.imul` is defined as exact 32-bit wrapping multiplication.
 *
 * `>>> 0` after each step keeps the value in the unsigned 32-bit range rather than the
 * signed range that `| 0` would produce. Mixing the two is how sign errors creep in.
 *
 * Nothing in this directory may use Math.pow or `**`: both are implementation-approximated
 * (see src/__tests__/purity.test.ts), so an engine that used them could produce a different
 * golden run on Hermes than on V8. Every constant below is written as a literal for the
 * same reason.
 */

/** Rotate left within 32 bits. `bits` must be in 0..31. */
export function rotl32(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

/**
 * MurmurHash3's finalizer — the avalanche step that makes one changed input bit flip
 * roughly half the output bits. Bijective, so it never collapses two counters onto one
 * value.
 */
export function fmix32(value: number): number {
  let h = value >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h;
}
