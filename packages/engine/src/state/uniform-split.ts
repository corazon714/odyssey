/**
 * Split a distance into `legCount` integer kilometres that sum to EXACTLY `totalKm`.
 *
 * **Cumulative-floor**, the same allocator ADR 0026 chose for `arrivalLegOfEdge`, and chosen
 * here for two properties that "divide, then add the remainder to the first `rem` legs" does
 * not have:
 *
 * - **The sum is exact by construction rather than by correction.** Each element is
 *   `floor((i+1)·total/n) − floor(i·total/n)`, so the series telescopes to `floor(total)` and
 *   there is no fix-up pass to get wrong. `Σ legKm === totalKm` is the invariant `validateRoute`
 *   enforces, and an allocator that satisfies it only after a correction step is one refactor
 *   away from not satisfying it.
 * - **The remainder spreads evenly instead of clumping at the front.** That is cosmetic today,
 *   when nothing reads `legKm`, and it stops being cosmetic at M3.8: `legHours` divides `legKm`
 *   by speed, so a front-loaded remainder would put a deterministic duration bump on the opening
 *   legs of every route in the game.
 *
 * Integer arithmetic throughout — no `Math.round` on a ratio, which is where a
 * platform-dependent half-even/half-up difference would enter a value that feeds the digest.
 */
export function uniformSplit(totalKm: number, legCount: number): number[] {
  if (legCount <= 0) return [];

  const out = new Array<number>(legCount);
  let previous = 0;
  for (let i = 0; i < legCount; i += 1) {
    const boundary = Math.floor(((i + 1) * totalKm) / legCount);
    out[i] = boundary - previous;
    previous = boundary;
  }
  return out;
}
