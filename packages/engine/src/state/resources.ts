import { clampValue, type ClampEvent } from './clamp-event.ts';

/**
 * The eight tracked resources (engine-spec 1).
 *
 * All are 0-10 except money, which is unbounded above because a run's economy has no
 * natural ceiling, and reputation, which is signed because "how the road treats you" runs
 * in both directions.
 */
export const RESOURCE_KEYS = [
  'money',
  'energy',
  'health',
  'morale',
  'hunger',
  'hygiene',
  'heat',
  'reputation',
] as const;

export type ResourceKey = (typeof RESOURCE_KEYS)[number];
export type Resources = Record<ResourceKey, number>;

export const RESOURCE_BOUNDS: Readonly<
  Record<ResourceKey, { readonly min: number; readonly max: number | null }>
> = {
  money: { min: 0, max: null },
  energy: { min: 0, max: 10 },
  health: { min: 0, max: 10 },
  morale: { min: 0, max: 10 },
  hunger: { min: 0, max: 10 },
  hygiene: { min: 0, max: 10 },
  heat: { min: 0, max: 10 },
  reputation: { min: -5, max: 5 },
};

export type ClampedResources = {
  readonly resources: Resources;
  readonly clamps: readonly ClampEvent[];
};

/**
 * Bring every resource inside its bounds, reporting each clamp.
 *
 * Iterates RESOURCE_KEYS rather than Object.keys(resources): the order is then fixed by
 * source rather than by insertion, which keeps the clamps array in a deterministic order
 * for the digest and the sim.
 */
export function clampResources(resources: Resources): ClampedResources {
  const next: Resources = { ...resources };
  const clamps: ClampEvent[] = [];

  for (const key of RESOURCE_KEYS) {
    const bounds = RESOURCE_BOUNDS[key];
    const { applied, clamp } = clampValue(key, resources[key], bounds.min, bounds.max);
    next[key] = applied;
    if (clamp !== null) clamps.push(clamp);
  }

  return { resources: next, clamps };
}

/** Starting values for a run that has not yet made preparation choices. */
export function createResources(): Resources {
  return {
    money: 0,
    energy: 10,
    health: 10,
    morale: 7,
    hunger: 0,
    hygiene: 8,
    heat: 0,
    reputation: 0,
  };
}
