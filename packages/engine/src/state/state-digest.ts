import { hashString32 } from '../rng/hash-string.ts';
import { canonicalJson } from './canonical-json.ts';
import { type RunState } from './run-state.ts';

/**
 * A 128-bit fingerprint of a run's state, as 32 lowercase hex characters.
 *
 * This is what a golden run compares. Four independent murmur3 passes with different seeds
 * rather than one: a single 32-bit digest collides by birthday at around 65,000 states,
 * which a 20,000-run simulation is squarely inside. 128 bits removes the question.
 *
 * The digest covers the WHOLE state including `history`, so two runs that reached the same
 * numbers by different routes are distinguishable. That is deliberate — replay must prove
 * the same story happened, not merely the same balance sheet.
 */
const DIGEST_SEEDS = [0x00000000, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35] as const;

const HEX = '0123456789abcdef';

function toHex8(word: number): string {
  let out = '';
  for (let shift = 28; shift >= 0; shift -= 4) {
    out += HEX[(word >>> shift) & 0xf] ?? '0';
  }
  return out;
}

export function digestOf(text: string): string {
  return DIGEST_SEEDS.map((seed) => toHex8(hashString32(text, seed))).join('');
}

export function stateDigest(state: RunState): string {
  return digestOf(canonicalJson(state));
}
