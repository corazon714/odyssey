import { type InventoryEntry } from './memory-entries.ts';

/**
 * Where you keep things, and what it costs you when it goes.
 *
 * A flat inventory array cannot express the one thing this game's theft, search and border
 * mechanics all turn on: WHICH things go together when something is lost. A bag stolen as a
 * unit takes everything in it — including, if you kept it there, your passport. That link is
 * the source of the best memory chain the game has, and a flat list cannot represent it.
 *
 * `person` always exists. The other three are acquired and lost in play, so they are
 * nullable, and the difference between `null` and an empty container is real: no bag at all
 * versus an empty one you are still carrying.
 */
export const CONTAINER_KINDS = ['person', 'bag', 'vehicle', 'stash'] as const;
export type ContainerKind = (typeof CONTAINER_KINDS)[number];

export type Container = {
  /**
   * Capacity in UNITS, not stacks. A stack-based cap would make `{ ration, count: 99 }` cost
   * one slot of six, which is not a capacity system. `used` is the sum of `count`.
   */
  readonly slots: number;
  /**
   * Base difficulty of finding anything in here. An item's `concealability` adds to it, so
   * the DC is per-item rather than per-container: a cash belt in a bag is harder to find than
   * the bag's own contents generally are.
   */
  readonly searchDC: number;
  /**
   * INVARIANT: at most one entry per item id. Merged on insert. Without it, "how many rations
   * do I have" has two answers depending on whether you sum or take the first, which is
   * exactly the divergence M2A.5 had to fix between the predicate and the applier.
   */
  readonly items: readonly InventoryEntry[];
};

export type InventoryState = {
  readonly person: Container;
  readonly bag: Container | null;
  readonly vehicle: Container | null;
  readonly stash: Container | null;
};

/**
 * The spec for each container kind, from 09-WORLD-MAP-AND-ITEMS W3.
 *
 * Held in state rather than looked up here, so a future bigger vehicle or a reinforced bag is
 * a preparation choice rather than an engine change. These are what `grantContainer` uses
 * when no explicit spec is given.
 */
export const CONTAINER_SPECS: Readonly<Record<ContainerKind, { slots: number; searchDC: number }>> =
  Object.freeze({
    person: { slots: 6, searchDC: 2 },
    bag: { slots: 10, searchDC: 4 },
    vehicle: { slots: 20, searchDC: 6 },
    stash: { slots: 4, searchDC: 9 },
  });

/**
 * The order containers are drained in when an effect removes items without naming one.
 *
 * Fixed, and fixed HERE rather than at each call site, because it is the thing that makes the
 * `item` predicate and the `item` effect agree: the predicate sums across every container, so
 * a removal has to be able to reach every container in a defined order or the two disagree
 * about what "you have 3" means.
 *
 * Person first: you spend what is to hand before unpacking.
 */
export const DRAIN_ORDER: readonly ContainerKind[] = Object.freeze([
  'person',
  'bag',
  'vehicle',
  'stash',
]);

export function createContainer(kind: ContainerKind): Container {
  const spec = CONTAINER_SPECS[kind];
  return { slots: spec.slots, searchDC: spec.searchDC, items: [] };
}

/** A run that has made no preparation choices carries only what is on them. */
export function createInventory(): InventoryState {
  return { person: createContainer('person'), bag: null, vehicle: null, stash: null };
}

/** Units in use. Counts, not entries — see the note on `slots`. */
export function usedSlots(container: Container): number {
  let used = 0;
  for (const entry of container.items) used += entry.count;
  return used;
}

export function freeSlots(container: Container): number {
  return Math.max(0, container.slots - usedSlots(container));
}

/**
 * How many of `id` are in this container. At most one entry, by invariant.
 *
 * Tolerates `undefined` as well as `null`, because it reads values that arrive from a save
 * file rather than from a constructor — and `undefined` from a missing key is exactly the
 * shape a pre-container save produces.
 */
export function countIn(container: Container | null | undefined, id: string): number {
  if (container === null || container === undefined) return 0;
  for (const entry of container.items) {
    if (entry.id === id) return entry.count;
  }
  return 0;
}

/** How many of `id` the player has anywhere. What the `item` predicate reads. */
export function countEverywhere(inventory: InventoryState, id: string): number {
  let total = 0;
  for (const kind of DRAIN_ORDER) total += countIn(inventory[kind], id);
  return total;
}

/** Every container that exists, in drain order, paired with its kind. */
export function presentContainers(
  inventory: InventoryState,
): readonly { readonly kind: ContainerKind; readonly container: Container }[] {
  const out: { kind: ContainerKind; container: Container }[] = [];
  for (const kind of DRAIN_ORDER) {
    const container = inventory[kind];
    if (container !== null) out.push({ kind, container });
  }
  return out;
}
