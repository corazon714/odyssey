/**
 * Public surface of the Odyssey engine.
 *
 * Phase 1 M1 ships the seeded RNG. State, predicate, effects, director, queue and loop
 * follow in M2-M11; see docs/PROGRESS.md for the exact next step.
 *
 * Everything exported here must remain pure TypeScript: no React, React Native, Expo, or
 * DOM/native API may be imported anywhere in this package (CLAUDE.md 2.2), and no
 * `Math.random()` / `Date.now()` may appear (CLAUDE.md 2.3). Both are enforced by
 * eslint.config.mjs and by src/__tests__/purity.test.ts, which also bans the
 * implementation-approximated and locale-dependent APIs that would make a golden run
 * disagree between V8 and Hermes.
 *
 * Relative imports carry an explicit `.ts` extension so this file runs under bare Node,
 * which is how CI proves rule 2.2 executably (`node packages/engine/src/index.ts`).
 */

export { createRng, type Rng } from './rng/rng.ts';
export { createRngCursors, ALL_RNG_STREAMS, type RngCursors } from './rng/rng-cursors.ts';
export { RNG_STREAMS, type RngStream } from './rng/rng-stream.ts';
export { CHECK_DIE_SIDES, type RollModifier, type RollResult } from './rng/roll-result.ts';
export { createStreamKeys, deriveKey, streamKey, type StreamKeys } from './rng/stream-key.ts';
export { pickByWeight, totalWeight, type WeightedEntry } from './rng/weighted-pick.ts';
