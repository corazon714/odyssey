/**
 * Weight-proportional selection, split from the Rng so the arithmetic can be tested without
 * a generator.
 *
 * Weights are INTEGERS and the accumulator is an integer, which is the whole point. Float
 * accumulation across a few hundred candidates makes `target < acc` depend on summation
 * order and on the last ULP of every scoring factor, so reordering a loop somewhere in the
 * director would silently break every golden run. Integers are exact to 2^53; the director
 * rounds its scores before they ever reach here.
 *
 * Non-positive weights are skipped rather than clamped: a zero weight means "not a
 * candidate", and the director is required to express real exclusions as filters instead,
 * so that a rejection has a reason attached (design pillar 2).
 */
export type WeightedEntry<T> = {
  readonly value: T;
  readonly weight: number;
};

export function totalWeight<T>(entries: readonly WeightedEntry<T>[]): number {
  let total = 0;
  for (const entry of entries) {
    if (entry.weight > 0) total += entry.weight;
  }
  return total;
}

/**
 * Select the entry whose cumulative weight band contains `target`.
 *
 * `target` must be in `[0, totalWeight(entries) - 1]`. Iteration order is the caller's
 * array order, so a canonically ordered input is the caller's responsibility — the director
 * sorts its content pack once, at construction.
 */
export function pickByWeight<T>(entries: readonly WeightedEntry<T>[], target: number): T | null {
  let accumulated = 0;

  for (const entry of entries) {
    if (entry.weight <= 0) continue;
    accumulated += entry.weight;
    if (target < accumulated) return entry.value;
  }

  // Only reachable if target was out of range. Returning null rather than throwing keeps
  // the engine's no-throw contract; callers treat null as "nothing eligible".
  return null;
}
