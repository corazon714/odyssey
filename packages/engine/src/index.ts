/**
 * Public surface of the Odyssey engine.
 *
 * Intentionally empty. Phase 0 ships the toolchain and its guardrails only; state,
 * director, rng, predicate, effects and route land in Phase 1. See docs/PROGRESS.md
 * for the exact next step.
 *
 * Anything exported from here must remain pure TypeScript: no React, React Native,
 * Expo, or DOM/native API may be imported anywhere in this package (CLAUDE.md 2.2),
 * and no `Math.random()` / `Date.now()` may appear (CLAUDE.md 2.3). Both are enforced
 * by eslint.config.mjs and by src/__tests__/purity.test.ts.
 */

export {};
