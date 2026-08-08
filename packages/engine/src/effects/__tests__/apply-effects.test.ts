import { describe, expect, it } from 'vitest';
import { endingId, eventId, flagId, itemId, npcId, regionId } from '../../ids/content-ids.ts';
import { createRunState } from '../../state/create-run-state.ts';
import { createResources } from '../../state/resources.ts';
import { createRunInit } from '../../state/run-init.ts';
import { type RunState } from '../../state/run-state.ts';
import { makeRoute } from '../../state/__tests__/support/make-route.ts';
import { applyEffect, applyEffects } from '../apply-effects.ts';
import { createEffectContext } from '../effect-context.ts';
import { EFFECT_OPS, type Effect } from '../effect.ts';

const CTX = createEffectContext(eventId('border.bribe_attempt'));

function makeState(overrides: Partial<RunState> = {}): RunState {
  const result = createRunState(createRunInit('effects-seed', 'content-v1', makeRoute()));
  if (!result.ok) throw new Error('fixture route rejected');
  return { ...result.state, status: 'travelling', ...overrides };
}

const apply = (effect: Effect, state = makeState()): ReturnType<typeof applyEffect> =>
  applyEffect(state, effect, CTX);

describe('resource and skill effects', () => {
  it('applies a delta', () => {
    const state = makeState({ resources: { ...createResources(), cash: 100 } });
    const { state: next, applied } = apply({ op: 'resource', key: 'cash', delta: -40 }, state);

    expect(next.resources.cash).toBe(60);
    expect(applied.changed).toBe(true);
    expect(applied.params).toMatchObject({ requested: -40, applied: -40, after: 60 });
  });

  it('clamps AND reports what actually happened', () => {
    // The distinction the whole AppliedEffect type exists for: spending 40 when you hold 12
    // spends 12, and a log recording -40 would make the sim's money trajectory a lie.
    const state = makeState({ resources: { ...createResources(), cash: 12 } });
    const { state: next, applied } = apply({ op: 'resource', key: 'cash', delta: -40 }, state);

    expect(next.resources.cash).toBe(0);
    expect(applied.params).toMatchObject({ requested: -40, applied: -12 });
    expect(applied.clamps).toEqual([
      { key: 'cash', requested: -28, applied: 0, bound: 'min', limit: 0 },
    ]);
  });

  it('is a noop at a bound', () => {
    const state = makeState({ resources: { ...createResources(), cash: 0 } });
    const { state: next, applied } = apply({ op: 'resource', key: 'cash', delta: -5 }, state);

    expect(next).toBe(state);
    expect(applied.changed).toBe(false);
    expect(applied.labelKey).toBe('effect.resource.noop');
  });

  it('clamps skills to 0..10', () => {
    const { state } = apply({ op: 'skill', key: 'negotiation', delta: 99 });
    expect(state.skills.negotiation).toBe(10);
  });
});

describe('flag effects', () => {
  it('sets a flag with its origin leg', () => {
    const state = makeState({ route: { ...makeRoute(), legIndex: 4 } });
    const { state: next } = applyEffect(
      state,
      { op: 'flag', id: flagId('bribed'), value: true, ttlLegs: null },
      CTX,
    );
    expect(next.flags[flagId('bribed')]).toEqual({
      value: true,
      setAtLeg: 4,
      expiresAtLeg: null,
    });
  });

  it('converts ttlLegs to an absolute expiry', () => {
    const state = makeState({ route: { ...makeRoute(), legIndex: 4 } });
    const { state: next } = applyEffect(
      state,
      { op: 'flag', id: flagId('bribed_here'), value: true, ttlLegs: 1 },
      CTX,
    );
    expect(next.flags[flagId('bribed_here')]?.expiresAtLeg).toBe(5);
  });

  it('is a noop when re-set to the same value and lifetime', () => {
    const first = apply({ op: 'flag', id: flagId('x'), value: true, ttlLegs: null });
    const second = applyEffect(
      first.state,
      { op: 'flag', id: flagId('x'), value: true, ttlLegs: null },
      CTX,
    );
    expect(second.state).toBe(first.state);
    expect(second.applied.changed).toBe(false);
  });

  it('renews a temporary flag when the ttl differs', () => {
    // Not a noop: renewing is how a per-border flag survives into a second attempt.
    const first = apply({ op: 'flag', id: flagId('x'), value: true, ttlLegs: 1 });
    const second = applyEffect(
      first.state,
      { op: 'flag', id: flagId('x'), value: true, ttlLegs: 3 },
      CTX,
    );
    expect(second.applied.changed).toBe(true);
  });

  it('clears a flag, and clearing an absent one is a noop', () => {
    const set = apply({ op: 'flag', id: flagId('x'), value: 1, ttlLegs: null });
    const cleared = applyEffect(set.state, { op: 'clearFlag', id: flagId('x') }, CTX);
    expect(cleared.state.flags[flagId('x')]).toBeUndefined();

    const again = applyEffect(cleared.state, { op: 'clearFlag', id: flagId('x') }, CTX);
    expect(again.state).toBe(cleared.state);
    expect(again.applied.changed).toBe(false);
  });
});

describe('relationship, schedule and ending effects', () => {
  it('accumulates trust and dedupes tags', () => {
    const first = apply({
      op: 'relationship',
      npc: npcId('dmitri'),
      trustDelta: 1,
      meet: true,
      addTags: ['creditor'],
    });
    const second = applyEffect(
      first.state,
      {
        op: 'relationship',
        npc: npcId('dmitri'),
        trustDelta: -3,
        meet: false,
        addTags: ['creditor', 'angry'],
      },
      CTX,
    );

    const entry = second.state.relationships[npcId('dmitri')];
    expect(entry?.trust).toBe(-2);
    expect(entry?.met).toBe(true);
    expect(entry?.tags).toEqual(['creditor', 'angry']);
  });

  it('converts inLegs offsets to an absolute window and records provenance', () => {
    const state = makeState({ route: { ...makeRoute(), legIndex: 4 } });
    const { state: next } = applyEffect(
      state,
      {
        op: 'scheduleEvent',
        eventId: eventId('border.guard_remembers'),
        inLegs: [4, 12],
        requires: null,
        payload: null,
      },
      CTX,
    );

    expect(next.pendingEvents).toEqual([
      {
        eventId: 'border.guard_remembers',
        earliestLeg: 8,
        latestLeg: 16,
        scheduledAtLeg: 4,
        source: 'border.bribe_attempt',
        requires: null,
        payload: null,
      },
    ]);
  });

  it('keeps duplicate schedules separate rather than merging windows', () => {
    // Merging [4,12] with [2,6] would invent an intent neither author had and destroy the
    // `source` the journal wants (ADR 0001). Dedupe happens at FIRE time, in M8.
    const effect: Effect = {
      op: 'scheduleEvent',
      eventId: eventId('e'),
      inLegs: [4, 12],
      requires: null,
      payload: null,
    };
    const first = apply(effect);
    const second = applyEffect(first.state, effect, CTX);
    expect(second.state.pendingEvents).toHaveLength(2);
  });

  it('unlocks an ending once', () => {
    const first = apply({ op: 'unlockEnding', id: endingId('ending.detained') });
    expect(first.state.unlockedEndings).toEqual(['ending.detained']);

    const second = applyEffect(
      first.state,
      { op: 'unlockEnding', id: endingId('ending.detained') },
      CTX,
    );
    expect(second.state).toBe(first.state);
    expect(second.applied.changed).toBe(false);
  });
});

describe('item and document effects', () => {
  it('adds, stacks and removes items', () => {
    const added = apply({
      op: 'item',
      id: itemId('ration'),
      countDelta: 2,
      condition: null,
      container: null,
    });
    expect(added.state.inventory.person.items).toEqual([
      { id: 'ration', count: 2, condition: null },
    ]);

    const more = applyEffect(
      added.state,
      { op: 'item', id: itemId('ration'), countDelta: 1, condition: null, container: null },
      CTX,
    );
    expect(more.state.inventory.person.items[0]?.count).toBe(3);

    const gone = applyEffect(
      more.state,
      { op: 'item', id: itemId('ration'), countDelta: -9, condition: null, container: null },
      CTX,
    );
    expect(gone.state.inventory.person.items).toEqual([]);
  });

  it('is a noop removing an item that is not carried', () => {
    const state = makeState();
    const { state: next, applied } = apply(
      { op: 'item', id: itemId('nothing'), countDelta: -1, condition: null, container: null },
      state,
    );
    expect(next).toBe(state);
    expect(applied.changed).toBe(false);
  });

  it('distinguishes losing a passport from never having one', () => {
    const never = makeState();
    const lostWithout = applyEffect(
      never,
      { op: 'document', change: { field: 'losePassport' } },
      CTX,
    );
    expect(lostWithout.applied.changed).toBe(false);
    expect(lostWithout.state.documents.passport).toBeNull();

    const granted = applyEffect(
      never,
      { op: 'document', change: { field: 'grantPassport', valid: true } },
      CTX,
    );
    const lost = applyEffect(
      granted.state,
      { op: 'document', change: { field: 'losePassport' } },
      CTX,
    );
    expect(lost.state.documents.passport).toEqual({
      present: false,
      valid: true,
      flagged: false,
      container: 'person',
    });
  });

  it('grants and expires a visa', () => {
    const { state } = apply({
      op: 'document',
      change: { field: 'visa', region: regionId('schengen'), valid: true, expiresDay: 30 },
    });
    expect(state.documents.visas[regionId('schengen')]).toEqual({ valid: true, expiresDay: 30 });
  });
});

describe('world effects', () => {
  it('advances the clock', () => {
    const { state } = apply({ op: 'advanceTime', hours: 20 });
    expect(state.clock).toEqual({ day: 1, hour: 4, weekday: 1 });
  });

  it('refuses to move time backwards', () => {
    const state = makeState();
    const { state: next, applied } = apply({ op: 'advanceTime', hours: -8 }, state);
    expect(next).toBe(state);
    expect(applied.changed).toBe(false);
  });

  it('changes transport mode, meters and legality', () => {
    const mode = apply({
      op: 'transport',
      change: { field: 'mode', mode: 'truck', vehicleId: 'v1' },
    });
    expect(mode.state.transport.mode).toBe('truck');

    const fuel = applyEffect(
      mode.state,
      { op: 'transport', change: { field: 'fuel', delta: -99 } },
      CTX,
    );
    expect(fuel.state.transport.fuel).toBe(0);
    expect(fuel.applied.clamps).toHaveLength(1);

    const legal = applyEffect(
      fuel.state,
      { op: 'transport', change: { field: 'legal', legal: false } },
      CTX,
    );
    expect(legal.state.transport.legal).toBe(false);
  });

  it('clamps route progress to the route', () => {
    const { state } = apply({ op: 'route', change: { field: 'progressKm', delta: 99_999 } });
    expect(state.route.progressKm).toBe(900);
  });

  it('updates a beat slot status, and noops on an unknown leg', () => {
    const hit = apply({
      op: 'route',
      change: { field: 'beatStatus', legIndex: 6, status: 'filled' },
    });
    expect(hit.state.route.beatSchedule.find((s) => s.legIndex === 6)?.status).toBe('filled');

    const miss = apply({
      op: 'route',
      change: { field: 'beatStatus', legIndex: 99, status: 'filled' },
    });
    expect(miss.applied.changed).toBe(false);
  });
});

describe('applyEffects', () => {
  it('records one entry per effect, even for noops', () => {
    // The invariant that makes a silently dropped effect impossible.
    const effects: Effect[] = [
      { op: 'resource', key: 'cash', delta: 10 },
      { op: 'resource', key: 'cash', delta: 0 },
      { op: 'clearFlag', id: flagId('absent') },
    ];
    const { applied } = applyEffects(makeState(), effects, CTX);

    expect(applied).toHaveLength(3);
    expect(applied.map((a) => a.changed)).toEqual([true, false, false]);
  });

  it('threads state through in order', () => {
    const { state } = applyEffects(
      makeState({ resources: { ...createResources(), cash: 0 } }),
      [
        { op: 'resource', key: 'cash', delta: 100 },
        { op: 'resource', key: 'cash', delta: -30 },
      ],
      CTX,
    );
    expect(state.resources.cash).toBe(70);
  });

  it('returns the same state object when every effect is a noop', () => {
    const state = makeState();
    const { state: next } = applyEffects(state, [{ op: 'clearFlag', id: flagId('absent') }], CTX);
    expect(next).toBe(state);
  });

  it('handles an empty list', () => {
    const state = makeState();
    const result = applyEffects(state, [], CTX);
    expect(result.state).toBe(state);
    expect(result.applied).toEqual([]);
  });

  it('covers every declared op', () => {
    // Guards against an op existing in the union but never being exercised here.
    const byOp: Record<string, Effect> = {
      resource: { op: 'resource', key: 'cash', delta: 1 },
      skill: { op: 'skill', key: 'stealth', delta: 1 },
      flag: { op: 'flag', id: flagId('f'), value: true, ttlLegs: null },
      clearFlag: { op: 'clearFlag', id: flagId('f') },
      relationship: { op: 'relationship', npc: npcId('n'), trustDelta: 1, meet: true, addTags: [] },
      advanceTime: { op: 'advanceTime', hours: 1 },
      scheduleEvent: {
        op: 'scheduleEvent',
        eventId: eventId('e'),
        inLegs: [1, 2],
        requires: null,
        payload: null,
      },
      unlockEnding: { op: 'unlockEnding', id: endingId('x') },
      item: { op: 'item', id: itemId('i'), countDelta: 1, condition: null, container: null },
      transport: { op: 'transport', change: { field: 'legal', legal: false } },
      document: { op: 'document', change: { field: 'grantPassport', valid: true } },
      route: { op: 'route', change: { field: 'progressKm', delta: 10 } },
      // Order matters here and nowhere else in this map: the container ops act on each
      // other's output. Grant a bag, move the item `item` just added into it, then lose the
      // bag — so all three report `changed`, and the sequence is also the memory chain in
      // miniature.
      grantContainer: { op: 'grantContainer', container: 'bag', slots: null, searchDC: null },
      moveItem: { op: 'moveItem', id: itemId('i'), count: 1, from: 'person', to: 'bag' },
      loseContainer: { op: 'loseContainer', container: 'bag' },
    };

    expect(Object.keys(byOp).sort()).toEqual([...EFFECT_OPS].sort());

    const { applied } = applyEffects(makeState(), Object.values(byOp), CTX);
    expect(applied).toHaveLength(EFFECT_OPS.length);
    expect(applied.every((a) => a.changed)).toBe(true);
  });
});
