import { drawWord } from './draw-word.ts';
import { type RngCursors } from './rng-cursors.ts';
import { type RngStream } from './rng-stream.ts';
import { CHECK_DIE_SIDES, type RollModifier, type RollResult } from './roll-result.ts';
import { createStreamKeys } from './stream-key.ts';
import { pickByWeight, totalWeight, type WeightedEntry } from './weighted-pick.ts';

/** 2^32, written as a literal because `**` is implementation-approximated (CLAUDE.md 2.3). */
const UINT32_RANGE = 4294967296;

/**
 * A drainable view over the cursors, not a generator.
 *
 * Every method takes the stream it draws from as its LAST argument, matching
 * docs/engine-spec.md 4's `rng.weightedPick(scored, 'eventPick')`.
 */
export type Rng = {
  nextWord(stream: RngStream): number;
  nextFloat(stream: RngStream): number;
  nextInt(minInclusive: number, maxInclusive: number, stream: RngStream): number;
  pick<T>(items: readonly T[], stream: RngStream): T | null;
  weightedPick<T>(entries: readonly WeightedEntry<T>[], stream: RngStream): T | null;
  roll(dc: number, modifiers: readonly RollModifier[], stream: RngStream): RollResult;
  /** A plain snapshot to write back into RunState. Safe to call more than once. */
  cursors(): RngCursors;
};

/**
 * Build an Rng for one engine call from state alone.
 *
 * The closure here holds only a COPY of the cursors and the derived stream keys, and lives
 * for exactly one advanceLeg/resolveChoice. Drain it with cursors() and store the result;
 * nothing else needs to persist, because drawWord is a pure function of (key, counter).
 *
 * This is why resolveChoice does not accept an injected Rng: a caller-supplied generator
 * whose cursors are not in RunState would break replay, which is the one guarantee the
 * whole engine is built to provide. Seeds are injected at RunInit, which is the boundary
 * where that is safe.
 */
export function createRng(seed: string, cursors: RngCursors): Rng {
  const keys = createStreamKeys(seed);
  const state: RngCursors = { ...cursors };

  const nextWord = (stream: RngStream): number => {
    const word = drawWord(keys[stream], state[stream]);
    state[stream] += 1;
    return word;
  };

  const nextInt = (minInclusive: number, maxInclusive: number, stream: RngStream): number => {
    if (maxInclusive <= minInclusive) return minInclusive;

    const range = maxInclusive - minInclusive + 1;
    // Rejection sampling. Plain `word % range` over-represents the low values whenever
    // range does not divide 2^32 — with range 3 that is a ~1-in-1.4-billion skew, but the
    // director calls this with small ranges constantly and biased selection is exactly the
    // kind of defect a sim report cannot distinguish from bad content.
    //
    // Consequence worth knowing: a call consumes a VARIABLE number of words. That is still
    // deterministic given the cursor, so replay is unaffected.
    const limit = UINT32_RANGE - (UINT32_RANGE % range);
    let word = nextWord(stream);
    while (word >= limit) word = nextWord(stream);

    return minInclusive + (word % range);
  };

  return {
    nextWord,
    nextInt,

    nextFloat: (stream) => nextWord(stream) / UINT32_RANGE,

    pick: (items, stream) => {
      if (items.length === 0) return null;
      return items[nextInt(0, items.length - 1, stream)] ?? null;
    },

    weightedPick: (entries, stream) => {
      const total = totalWeight(entries);
      if (total <= 0) return null;
      return pickByWeight(entries, nextInt(0, total - 1, stream));
    },

    roll: (dc, modifiers, stream) => {
      const die = nextInt(1, CHECK_DIE_SIDES, stream);

      let modifierTotal = 0;
      for (const modifier of modifiers) modifierTotal += modifier.delta;

      const total = die + modifierTotal;
      return {
        die,
        sides: CHECK_DIE_SIDES,
        dc,
        modifiers,
        modifierTotal,
        total,
        success: total >= dc,
        margin: total - dc,
      };
    },

    cursors: () => ({ ...state }),
  };
}
