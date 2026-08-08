/**
 * A record that a value hit a bound.
 *
 * Clamping silently with Math.min/Math.max would be the obvious implementation and is the
 * wrong one: "money floors at 0 in 60% of runs after leg 15" is a BALANCE FINDING, and a
 * silent clamp makes it invisible to the simulation harness. engine-spec 6 asks the sim to
 * report resource trajectories; those numbers mean much less without knowing how often the
 * trajectory was being held up by a floor.
 *
 * So every clamp is recorded and returned alongside the new value. Callers that do not care
 * can ignore the array; the sim aggregates it.
 */
export type ClampEvent = {
  readonly key: string;
  readonly requested: number;
  readonly applied: number;
  readonly bound: 'min' | 'max';
  readonly limit: number;
};

export const NO_CLAMPS: readonly ClampEvent[] = Object.freeze([]);

/**
 * Clamp one value, reporting whether a bound was hit. `max: null` means unbounded above —
 * money has no ceiling (engine-spec 1).
 */
export function clampValue(
  key: string,
  requested: number,
  min: number,
  max: number | null,
): { readonly applied: number; readonly clamp: ClampEvent | null } {
  if (requested < min) {
    return { applied: min, clamp: { key, requested, applied: min, bound: 'min', limit: min } };
  }
  if (max !== null && requested > max) {
    return { applied: max, clamp: { key, requested, applied: max, bound: 'max', limit: max } };
  }
  return { applied: requested, clamp: null };
}
