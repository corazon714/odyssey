import { clampValue, type ClampEvent } from './clamp-event.ts';

/**
 * The eight tracked resources (engine-spec 1).
 *
 * All are 0-10 except money, which is unbounded above because a run's economy has no
 * natural ceiling, and reputation, which is signed because "how the road treats you" runs
 * in both directions.
 */
/**
 * ONE CURRENCY UNIT, THREE FORMS — and only two of them are resources.
 *
 * `cash` is stealable, untraceable and universally accepted; `bank` is none of those and is
 * reachable only where the service exists. The third form, VALUABLES, is deliberately not a
 * key here: it is items with a `value`, because being illiquid is the whole point — a
 * resource counter you can spend anywhere would erase the distinction.
 *
 * No real currencies and no exchange rates. Tedious, a localisation problem, and adds nothing
 * a single abstract unit does not.
 *
 * `money` was renamed to `cash` at SAVE_VERSION 2. Keeping the old name once `bank` existed
 * would have left two keys reading "cash" and "not-cash money", which is exactly the kind of
 * naming that quietly teaches every future author the wrong model.
 */
export const RESOURCE_KEYS = [
  'cash',
  'bank',
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
  cash: { min: 0, max: null },
  // Same unbounded ceiling as cash. Not stealable, traceable, and only usable where the
  // service exists — all three of which are gates elsewhere, not bounds here.
  bank: { min: 0, max: null },
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
    cash: 0,
    bank: 0,
    energy: 10,
    health: 10,
    morale: 7,
    hunger: 0,
    hygiene: 8,
    heat: 0,
    reputation: 0,
  };
}
