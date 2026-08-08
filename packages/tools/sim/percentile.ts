/**
 * Percentile by integer index — no interpolation, no float arithmetic.
 *
 * Interpolating between neighbours is the textbook definition and the wrong choice here: a
 * reported statistic that depends on float rounding can differ between machines, and the
 * whole point of `pnpm sim:diff` is that a change in the numbers means a change in the
 * ENGINE. Picking an existing element keeps the report exactly reproducible.
 *
 * `values` must already be sorted ascending.
 */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.floor((p * (sorted.length - 1)) / 100);
  return sorted[index] ?? 0;
}

export function ascending(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b);
}
