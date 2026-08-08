import { describe, expect, it } from 'vitest';
import { endingId, eventId, flagId, itemId, npcId } from '../../ids/content-ids.ts';
import { createRunState } from '../../state/create-run-state.ts';
import { createRunInit } from '../../state/run-init.ts';
import { type RunState } from '../../state/run-state.ts';
import { stateDigest } from '../../state/state-digest.ts';
import { makeRoute } from '../../state/__tests__/support/make-route.ts';
import { applyEffects } from '../apply-effects.ts';
import { createEffectContext } from '../effect-context.ts';
import { type Effect } from '../effect.ts';

const CTX = createEffectContext(eventId('source.event'));

function makeState(): RunState {
  const result = createRunState(createRunInit('purity-seed', 'content-v1', makeRoute()));
  if (!result.ok) throw new Error('fixture route rejected');
  return { ...result.state, status: 'travelling' };
}

/** One of every op, so the sweeps below touch every branch of the applier. */
const ALL_EFFECTS: readonly Effect[] = [
  { op: 'resource', key: 'money', delta: 50 },
  { op: 'skill', key: 'stealth', delta: 2 },
  { op: 'flag', id: flagId('wanted'), value: true, ttlLegs: 3 },
  { op: 'clearFlag', id: flagId('wanted') },
  { op: 'relationship', npc: npcId('dmitri'), trustDelta: -1, meet: true, addTags: ['creditor'] },
  { op: 'advanceTime', hours: 6 },
  {
    op: 'scheduleEvent',
    eventId: eventId('later'),
    inLegs: [2, 5],
    requires: null,
    payload: { a: 1 },
  },
  { op: 'unlockEnding', id: endingId('ending.x') },
  { op: 'item', id: itemId('ration'), countDelta: 3, condition: 8 },
  { op: 'transport', change: { field: 'condition', delta: -2 } },
  { op: 'document', change: { field: 'grantPassport', valid: true } },
  { op: 'route', change: { field: 'progressKm', delta: 120 } },
];

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

describe('applier purity (CLAUDE.md 2.8)', () => {
  it('never mutates the input, even deep-frozen', () => {
    // Deep-freezing turns an accidental in-place write into a TypeError under strict mode
    // (module code is always strict), so this fails loudly rather than subtly.
    const state = deepFreeze(makeState());
    const before = stateDigest(state);

    expect(() => applyEffects(state, ALL_EFFECTS, CTX)).not.toThrow();
    expect(stateDigest(state)).toBe(before);
  });

  it('leaves the input digest unchanged for every op individually', () => {
    for (const effect of ALL_EFFECTS) {
      const state = deepFreeze(makeState());
      const before = stateDigest(state);
      applyEffects(state, [effect], CTX);
      expect(stateDigest(state), `mutated by ${effect.op}`).toBe(before);
    }
  });

  it('would catch an in-place write', () => {
    // Guards the guard: deepFreeze must actually be freezing, or every assertion above is
    // vacuous.
    const frozen = deepFreeze(makeState());
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.resources)).toBe(true);
    expect(() => {
      (frozen.resources as { money: number }).money = 999;
    }).toThrow();
  });

  it('produces a result that still round-trips through JSON', () => {
    const { state } = applyEffects(makeState(), ALL_EFFECTS, CTX);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});

describe('structural sharing', () => {
  it('keeps untouched branches identical', () => {
    const state = makeState();
    const { state: next } = applyEffects(state, [{ op: 'resource', key: 'money', delta: 10 }], CTX);

    expect(next).not.toBe(state);
    expect(next.resources).not.toBe(state.resources);
    // Everything else must be the SAME OBJECT, not a copy. Cloning the whole state per
    // effect is pure allocation across 20,000 runs of ~30 legs.
    expect(next.flags).toBe(state.flags);
    expect(next.skills).toBe(state.skills);
    expect(next.route).toBe(state.route);
    expect(next.documents).toBe(state.documents);
    expect(next.history).toBe(state.history);
    expect(next.pendingEvents).toBe(state.pendingEvents);
    expect(next.transport).toBe(state.transport);
  });

  it('rebuilds only the branch each op touches', () => {
    const cases: readonly (readonly [Effect, keyof RunState])[] = [
      [{ op: 'flag', id: flagId('a'), value: true, ttlLegs: null }, 'flags'],
      [
        { op: 'relationship', npc: npcId('n'), trustDelta: 1, meet: true, addTags: [] },
        'relationships',
      ],
      [{ op: 'advanceTime', hours: 3 }, 'clock'],
      [{ op: 'item', id: itemId('i'), countDelta: 1, condition: null }, 'inventory'],
      [{ op: 'document', change: { field: 'grantPassport', valid: true } }, 'documents'],
      [{ op: 'unlockEnding', id: endingId('e') }, 'unlockedEndings'],
      [{ op: 'route', change: { field: 'progressKm', delta: 10 } }, 'route'],
      [{ op: 'transport', change: { field: 'legal', legal: false } }, 'transport'],
    ];

    for (const [effect, branch] of cases) {
      const state = makeState();
      const { state: next } = applyEffects(state, [effect], CTX);
      expect(next[branch], `${effect.op} should rebuild ${branch}`).not.toBe(state[branch]);
      expect(next.resources, `${effect.op} should not touch resources`).toBe(state.resources);
    }
  });
});
