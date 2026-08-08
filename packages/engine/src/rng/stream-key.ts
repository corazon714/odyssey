import { hashString32 } from './hash-string.ts';
import { type RngStream } from './rng-stream.ts';
import { type RngCursors } from './rng-cursors.ts';

/**
 * Fixed hash seed for key derivation. Any constant works; this one is the fractional part
 * of the golden ratio scaled to 32 bits, the conventional choice. It is part of the replay
 * contract — changing it changes every stream key and therefore every run ever recorded.
 */
const KEY_SEED = 0x9e3779b9;

/**
 * The key for one substream of one run: `hash(seed + ':' + stream)`, per
 * docs/engine-spec.md 5.
 *
 * Two different streams of the same run get unrelated keys, and the same stream of two
 * different runs does too, because murmur3's avalanche means a one-character change to the
 * input decorrelates the output entirely.
 */
export function streamKey(seed: string, stream: RngStream): number {
  return hashString32(`${seed}:${stream}`, KEY_SEED);
}

/** All eight keys for a run. Derived once in createRng, never persisted. */
export type StreamKeys = RngCursors;

export function createStreamKeys(seed: string): StreamKeys {
  return {
    eventPick: streamKey(seed, 'eventPick'),
    outcomeRoll: streamKey(seed, 'outcomeRoll'),
    skillCheck: streamKey(seed, 'skillCheck'),
    npcGen: streamKey(seed, 'npcGen'),
    encounterFlavor: streamKey(seed, 'encounterFlavor'),
    worldTick: streamKey(seed, 'worldTick'),
    routeGen: streamKey(seed, 'routeGen'),
    chanceGate: streamKey(seed, 'chanceGate'),
  };
}

/**
 * Derive a sub-key from an existing key and a label.
 *
 * This is what makes cursor-free addressing possible. A `{ chance: p }` predicate computes
 * `deriveKey(keys.chanceGate, `${eventId}:${legIndex}:${nodePath}`)` and draws at that index
 * without advancing anything — so the answer is stable when the same predicate is evaluated
 * twice in a leg (the director needs that to explain its reasoning), and adding content
 * cannot shift any other stream. See docs/adr/0005.
 */
export function deriveKey(key: number, label: string): number {
  return hashString32(label, key);
}
