import { describe, expect, it } from 'vitest';
import { itemId } from '../../ids/content-ids.ts';
import { ALL_REFS_KNOWN, createPredicateContext } from '../../predicate/predicate-context.ts';
import { evaluatePredicate } from '../../predicate/evaluate-predicate.ts';
import { countEverywhere, createContainer } from '../../state/container-state.ts';
import { createRunState } from '../../state/create-run-state.ts';
import { createRunInit } from '../../state/run-init.ts';
import { type RunState } from '../../state/run-state.ts';
import { loadFixtureRouteEntries } from '../../__tests__/support/load-fixtures.ts';
import { applyEffect, applyEffects } from '../apply-effects.ts';
import { createEffectContext } from '../effect-context.ts';
import { eventId } from '../../ids/content-ids.ts';

const ROUTE = loadFixtureRouteEntries()[0];
const CTX = createEffectContext(eventId('test.container'));

function base(): RunState {
  if (ROUTE === undefined) throw new Error('no fixture route');
  const created = createRunState(createRunInit('containers', 'v', ROUTE.route));
  if (!created.ok) throw new Error(`route rejected: ${created.error.code}`);
  return created.state;
}

/** Rations split across two containers — the state that used to break the item system. */
function split(): RunState {
  const state = base();
  return {
    ...state,
    inventory: {
      ...state.inventory,
      person: {
        ...createContainer('person'),
        items: [{ id: itemId('ration'), count: 2, condition: null }],
      },
      vehicle: {
        ...createContainer('vehicle'),
        items: [{ id: itemId('ration'), count: 2, condition: null }],
      },
    },
  };
}

describe('THE DIVERGENCE — the predicate and the applier must agree', () => {
  it('a removal takes exactly what the predicate promised, across containers', () => {
    // The bug this exists to prevent, concretely: 2 rations on your person and 2 in the
    // vehicle. `item gte 3` SUMS to 4 and enables the choice; the old applier took the FIRST
    // matching stack and removed 2. The player paid less than the price they were shown,
    // silently — design pillar 2 broken without an error anywhere.
    const state = split();
    const ctx = createPredicateContext(state, ALL_REFS_KNOWN, 'test:0');

    const promised = evaluatePredicate(
      { kind: 'item', id: itemId('ration'), cmp: { op: 'gte', value: 3 }, in: null },
      ctx,
    );
    expect(promised.value).toBe(true);

    const after = applyEffect(
      state,
      { op: 'item', id: itemId('ration'), countDelta: -3, condition: null, container: null },
      CTX,
    );

    expect(countEverywhere(after.state.inventory, 'ration')).toBe(1);
    expect(after.applied.params['applied']).toBe(-3);
  });

  it('holds as a property: after removing n, the total is max(0, before - n)', () => {
    // Swept rather than spot-checked, because the failure mode is arithmetic and quiet.
    for (let n = 0; n <= 6; n += 1) {
      const after = applyEffect(
        split(),
        { op: 'item', id: itemId('ration'), countDelta: -n, condition: null, container: null },
        CTX,
      );
      expect(countEverywhere(after.state.inventory, 'ration'), `removing ${String(n)}`).toBe(
        Math.max(0, 4 - n),
      );
    }
  });

  it('drains in a fixed order — person first', () => {
    const after = applyEffect(
      split(),
      { op: 'item', id: itemId('ration'), countDelta: -2, condition: null, container: null },
      CTX,
    );
    expect(after.state.inventory.person.items).toEqual([]);
    expect(after.state.inventory.vehicle?.items[0]?.count).toBe(2);
  });

  it('`in` narrows a removal to one container', () => {
    const after = applyEffect(
      split(),
      { op: 'item', id: itemId('ration'), countDelta: -2, condition: null, container: 'vehicle' },
      CTX,
    );
    expect(after.state.inventory.person.items[0]?.count).toBe(2);
    expect(after.state.inventory.vehicle?.items).toEqual([]);
  });
});

describe('capacity', () => {
  it('fills what fits and reports the rest rather than dropping or spilling', () => {
    // Person holds 6. Asking for 10 places 6 and refuses 4 — no auto-spill into the vehicle,
    // because that would make an effect's meaning depend on which containers you happen to
    // have, and the journal could not explain the result.
    const state = base();
    const after = applyEffect(
      state,
      { op: 'item', id: itemId('ration'), countDelta: 10, condition: null, container: 'person' },
      CTX,
    );
    expect(after.state.inventory.person.items[0]?.count).toBe(6);
    expect(after.applied.params['applied']).toBe(6);
    expect(after.applied.params['refused']).toBe(4);
    expect(after.applied.changed).toBe(true);
  });

  it('reports changed:false only when NOTHING fit', () => {
    const full = applyEffect(
      base(),
      { op: 'item', id: itemId('ration'), countDelta: 6, condition: null, container: 'person' },
      CTX,
    );
    const overflow = applyEffect(
      full.state,
      { op: 'item', id: itemId('spare_tyre'), countDelta: 1, condition: null, container: 'person' },
      CTX,
    );
    expect(overflow.applied.changed).toBe(false);
    expect(overflow.state).toBe(full.state);
  });

  it('merges into one entry per id rather than creating a second stack', () => {
    // The invariant that makes the predicate and the applier tractable at all.
    const state = applyEffects(
      base(),
      [
        { op: 'item', id: itemId('ration'), countDelta: 2, condition: null, container: 'person' },
        { op: 'item', id: itemId('ration'), countDelta: 3, condition: null, container: 'person' },
      ],
      CTX,
    ).state;
    expect(state.inventory.person.items).toHaveLength(1);
    expect(state.inventory.person.items[0]?.count).toBe(5);
  });
});

describe('THE MEMORY CHAIN — losing a container takes what was in it', () => {
  it('loses the items AND a passport kept there, as present:false not null', () => {
    // The reason the container model exists. `present: false` is recoverable and opens a
    // storyline; `null` means the run never issued a passport at all, which is a different
    // and unrecoverable thing.
    const state = applyEffects(
      base(),
      [
        { op: 'grantContainer', container: 'bag', slots: null, searchDC: null },
        { op: 'document', change: { field: 'grantPassport', valid: true } },
        { op: 'item', id: itemId('ration'), countDelta: 2, condition: null, container: 'bag' },
      ],
      CTX,
    ).state;

    // Papers start on your person, so pack them into the bag first — a real, risky decision.
    const packed = applyEffect(
      {
        ...state,
        documents: {
          ...state.documents,
          passport: { ...state.documents.passport!, container: 'bag' },
        },
      },
      { op: 'loseContainer', container: 'bag' },
      CTX,
    );

    expect(packed.state.inventory.bag).toBeNull();
    expect(packed.state.documents.passport?.present).toBe(false);
    expect(packed.state.documents.passport).not.toBeNull();
    expect(packed.applied.params['passport']).toBe(true);
    expect(packed.applied.params['items']).toBe(2);
  });

  it('leaves a passport carried elsewhere alone', () => {
    const state = applyEffects(
      base(),
      [
        { op: 'grantContainer', container: 'bag', slots: null, searchDC: null },
        { op: 'document', change: { field: 'grantPassport', valid: true } },
      ],
      CTX,
    ).state;
    // Granted passports go on your person, so losing the bag must not touch them.
    const after = applyEffect(state, { op: 'loseContainer', container: 'bag' }, CTX);
    expect(after.state.documents.passport?.present).toBe(true);
  });
});

describe('moveItem and grantContainer', () => {
  it('moves between containers and is bounded by both availability and room', () => {
    const state = applyEffects(
      base(),
      [
        { op: 'grantContainer', container: 'stash', slots: null, searchDC: null },
        { op: 'item', id: itemId('ration'), countDelta: 6, condition: null, container: 'person' },
      ],
      CTX,
    ).state;

    // The stash holds 4, so a 6-unit move is capped at 4 and reported.
    const moved = applyEffect(
      state,
      { op: 'moveItem', id: itemId('ration'), count: 6, from: 'person', to: 'stash' },
      CTX,
    );
    expect(moved.applied.params['applied']).toBe(4);
    expect(moved.state.inventory.stash?.items[0]?.count).toBe(4);
    expect(moved.state.inventory.person.items[0]?.count).toBe(2);
    // Nothing was created or destroyed by moving.
    expect(countEverywhere(moved.state.inventory, 'ration')).toBe(6);
  });

  it('grantContainer is idempotent and uses the spec by default', () => {
    const once = applyEffect(
      base(),
      { op: 'grantContainer', container: 'stash', slots: null, searchDC: null },
      CTX,
    );
    expect(once.state.inventory.stash?.slots).toBe(4);
    expect(once.state.inventory.stash?.searchDC).toBe(9);

    const twice = applyEffect(
      once.state,
      { op: 'grantContainer', container: 'stash', slots: 99, searchDC: 1 },
      CTX,
    );
    expect(twice.applied.changed).toBe(false);
    expect(twice.state.inventory.stash?.slots).toBe(4);
  });
});
