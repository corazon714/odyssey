import {
  CONTAINER_SPECS,
  DRAIN_ORDER,
  countIn,
  createContainer,
  freeSlots,
  type Container,
  type ContainerKind,
  type InventoryState,
} from '../state/container-state.ts';
import { type RunState } from '../state/run-state.ts';
import { type InventoryEntry } from '../state/memory-entries.ts';
import { appliedEffect, type AppliedEffect } from './applied-effect.ts';
import { type Effect } from './effect.ts';

/**
 * The container ops, and the one invariant that holds the item system together.
 *
 * THE DIVERGENCE THIS FIXES. Before containers, `evaluate-state-leaf.ts` SUMMED item counts
 * across stacks while `apply-carried-effects.ts` took the FIRST match. Unreachable in practice
 * — nothing could produce a duplicate stack — but containers make it trivial, and the failure
 * is silent and unfair: with 2 rations in the bag and 2 in the vehicle, `item gte 3` sums to 4
 * and enables the choice, then `countDelta: -3` first-matches the bag and removes 2. The
 * player pays less than the price they were shown, which is design pillar 2 broken quietly.
 *
 * So: the predicate keeps summing across every container, and removals DRAIN across every
 * container in `DRAIN_ORDER` until satisfied. The invariant that makes both tractable is at
 * most ONE entry per item id per container, merged on insert.
 *
 * OVERFLOW FILLS WHAT FITS AND REPORTS THE REST, following the convention `applyItem` already
 * set for removals clamping at zero. `changed: false` only when nothing fit at all. There is
 * no auto-spill into another container: beyond W3's "items are lost, never silently
 * relocated", spill would make an effect's meaning depend on which containers the player
 * happens to have, and the journal could not explain the result.
 */

export type ContainerEffect = Extract<
  Effect,
  { op: 'item' | 'moveItem' | 'loseContainer' | 'grantContainer' }
>;

export type ContainerResult = {
  readonly state: RunState;
  readonly applied: AppliedEffect;
};

export function applyContainerEffect(state: RunState, effect: ContainerEffect): ContainerResult {
  switch (effect.op) {
    case 'item':
      return applyItem(state, effect);
    case 'moveItem':
      return applyMoveItem(state, effect);
    case 'loseContainer':
      return applyLoseContainer(state, effect);
    case 'grantContainer':
      return applyGrantContainer(state, effect);
    default:
      return unreachable(effect, state);
  }
}

function applyItem(state: RunState, effect: Extract<Effect, { op: 'item' }>): ContainerResult {
  return effect.countDelta >= 0 ? addItem(state, effect) : removeItem(state, effect);
}

function addItem(state: RunState, effect: Extract<Effect, { op: 'item' }>): ContainerResult {
  const wanted = effect.countDelta;
  const targets =
    // Nullish, not just null: a save written before containers has no `container` key at all,
    // and `[undefined]` as a target list would index the inventory with undefined.
    effect.container === null || effect.container === undefined
      ? DRAIN_ORDER
      : ([effect.container] as readonly ContainerKind[]);

  let inventory = state.inventory;
  let placed = 0;

  for (const kind of targets) {
    if (placed >= wanted) break;
    const container = inventory[kind];
    if (container === null) continue;
    const room = freeSlots(container);
    if (room <= 0) continue;
    const take = Math.min(room, wanted - placed);
    inventory = withContainer(inventory, kind, put(container, effect.id, take, effect.condition));
    placed += take;
  }

  const changed = placed > 0;
  return {
    state: changed ? { ...state, inventory } : state,
    applied: appliedEffect(effect, changed, {
      id: effect.id,
      requested: wanted,
      applied: placed,
      refused: wanted - placed,
      container: effect.container ?? 'any',
    }),
  };
}

function removeItem(state: RunState, effect: Extract<Effect, { op: 'item' }>): ContainerResult {
  const wanted = -effect.countDelta;
  const targets =
    // Nullish, not just null: a save written before containers has no `container` key at all,
    // and `[undefined]` as a target list would index the inventory with undefined.
    effect.container === null || effect.container === undefined
      ? DRAIN_ORDER
      : ([effect.container] as readonly ContainerKind[]);

  let inventory = state.inventory;
  let taken = 0;

  for (const kind of targets) {
    if (taken >= wanted) break;
    const container = inventory[kind];
    if (container === null) continue;
    const here = countIn(container, effect.id);
    if (here <= 0) continue;
    const take = Math.min(here, wanted - taken);
    inventory = withContainer(inventory, kind, take_(container, effect.id, take));
    taken += take;
  }

  const changed = taken > 0;
  return {
    state: changed ? { ...state, inventory } : state,
    applied: appliedEffect(effect, changed, {
      id: effect.id,
      requested: -wanted,
      applied: -taken,
      container: effect.container ?? 'any',
    }),
  };
}

function applyMoveItem(
  state: RunState,
  effect: Extract<Effect, { op: 'moveItem' }>,
): ContainerResult {
  const from = state.inventory[effect.from];
  const to = state.inventory[effect.to];

  const available = countIn(from, effect.id);
  const room = to === null ? 0 : freeSlots(to);
  const moved = Math.min(effect.count, available, room);

  if (from === null || to === null || moved <= 0) {
    return {
      state,
      applied: appliedEffect(effect, false, {
        id: effect.id,
        requested: effect.count,
        applied: 0,
        available,
        room,
      }),
    };
  }

  let inventory = withContainer(state.inventory, effect.from, take_(from, effect.id, moved));
  // Re-read the destination: `from` and `to` are the same container when an author moves an
  // item onto itself, and writing the stale copy back would duplicate it.
  const destination = inventory[effect.to];
  if (destination !== null) {
    inventory = withContainer(
      inventory,
      effect.to,
      put(destination, effect.id, moved, conditionOf(from, effect.id)),
    );
  }

  return {
    state: { ...state, inventory },
    applied: appliedEffect(effect, true, {
      id: effect.id,
      requested: effect.count,
      applied: moved,
      from: effect.from,
      to: effect.to,
    }),
  };
}

function applyLoseContainer(
  state: RunState,
  effect: Extract<Effect, { op: 'loseContainer' }>,
): ContainerResult {
  const container = state.inventory[effect.container];
  if (container === null) {
    return { state, applied: appliedEffect(effect, false, { container: effect.container }) };
  }

  const lostItems = container.items.reduce((sum, entry) => sum + entry.count, 0);

  // THE MEMORY CHAIN. Papers kept in the lost container go with it — a stolen bag takes the
  // passport that was in it. `present: false`, never `null`: losing it opens recovery events,
  // whereas null means the run never issued one.
  const passport = state.documents.passport;
  const lostPassport = passport !== null && passport.container === effect.container;

  const documents = {
    ...state.documents,
    passport: lostPassport ? { ...passport, present: false } : passport,
    tickets: state.documents.tickets.filter((ticket) => ticket.container !== effect.container),
  };

  return {
    state: {
      ...state,
      inventory: { ...state.inventory, [effect.container]: null },
      documents,
    },
    applied: appliedEffect(effect, true, {
      container: effect.container,
      items: lostItems,
      passport: lostPassport,
    }),
  };
}

function applyGrantContainer(
  state: RunState,
  effect: Extract<Effect, { op: 'grantContainer' }>,
): ContainerResult {
  if (state.inventory[effect.container] !== null) {
    return { state, applied: appliedEffect(effect, false, { container: effect.container }) };
  }

  const spec = CONTAINER_SPECS[effect.container];
  const container: Container = {
    slots: effect.slots ?? spec.slots,
    searchDC: effect.searchDC ?? spec.searchDC,
    items: [],
  };

  return {
    state: { ...state, inventory: { ...state.inventory, [effect.container]: container } },
    applied: appliedEffect(effect, true, {
      container: effect.container,
      slots: container.slots,
      searchDC: container.searchDC,
    }),
  };
}

/** Merge `count` of `id` into a container, honouring the one-entry-per-id invariant. */
function put(container: Container, id: string, count: number, condition: number | null): Container {
  const index = container.items.findIndex((entry) => entry.id === id);
  const items = [...container.items];
  const existing = index >= 0 ? items[index] : undefined;

  if (existing === undefined) {
    items.push({ id: id as InventoryEntry['id'], count, condition });
  } else {
    items[index] = {
      id: existing.id,
      count: existing.count + count,
      // null PRESERVES the existing condition rather than clearing it.
      condition: condition ?? existing.condition,
    };
  }
  return { ...container, items };
}

/** Remove `count` of `id`. An entry reaching zero is deleted, not left at zero. */
function take_(container: Container, id: string, count: number): Container {
  const index = container.items.findIndex((entry) => entry.id === id);
  const existing = index >= 0 ? container.items[index] : undefined;
  if (existing === undefined) return container;

  const items = [...container.items];
  const remaining = existing.count - count;
  if (remaining <= 0) items.splice(index, 1);
  else items[index] = { ...existing, count: remaining };

  return { ...container, items };
}

function conditionOf(container: Container | null, id: string): number | null {
  if (container === null) return null;
  return container.items.find((entry) => entry.id === id)?.condition ?? null;
}

function withContainer(
  inventory: InventoryState,
  kind: ContainerKind,
  container: Container,
): InventoryState {
  return { ...inventory, [kind]: container };
}

function unreachable(effect: never, state: RunState): ContainerResult {
  const op = (effect as { readonly op?: unknown } | null)?.op;
  return {
    state,
    applied: {
      ...appliedEffect(effect, false),
      labelKey: 'effect.unknown-op',
      params: { op: typeof op === 'string' ? op : 'unknown' },
    },
  };
}

export { createContainer };
