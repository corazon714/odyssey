import { describe, expect, it } from 'vitest';
import {
  choiceId,
  endingId,
  eventId,
  flagId,
  itemId,
  npcId,
  traitId,
} from '../../ids/content-ids.ts';
import { createRunInit } from '../run-init.ts';
import { createRunState } from '../create-run-state.ts';
import { type RunState } from '../run-state.ts';
import { stateDigest } from '../state-digest.ts';
import { makeRoute } from './support/make-route.ts';

/**
 * engine-spec 1: RunState must be fully JSON-serialisable — no functions, Maps, Sets, Dates
 * or class instances. Save, load and golden-run replay are all built on that.
 *
 * This is the ONLY place the rule can actually be enforced. A type cannot express it (a Map
 * is a perfectly good object as far as TypeScript is concerned), and a lint rule would have
 * to guess. A round trip cannot be argued with.
 */

function fresh(): RunState {
  const result = createRunState(createRunInit('serialise-me', 'content-v1', makeRoute()));
  if (!result.ok) throw new Error(`fixture route rejected: ${result.error.code}`);
  return result.state;
}

/** A state with every memory mechanism populated — the empty one proves much less. */
function populated(): RunState {
  const base = fresh();
  return {
    ...base,
    status: 'travelling',
    weather: 'rain',
    tension: 0.42,
    traits: [traitId('smooth_talker')],
    inventory: [{ id: itemId('spare_tyre'), count: 1, condition: 6 }],
    unlockedEndings: [endingId('ending.detained_at_border')],
    flags: {
      [flagId('passport_lost')]: { value: true, setAtLeg: 3, expiresAtLeg: null },
      [flagId('owes:dmitri')]: { value: 120, setAtLeg: 5, expiresAtLeg: 18 },
      [flagId('cover_story')]: { value: 'student', setAtLeg: 0, expiresAtLeg: null },
    },
    relationships: {
      [npcId('dmitri')]: { trust: -2, met: true, lastSeenLeg: 5, tags: ['creditor'] },
    },
    eventMemory: {
      [eventId('transit.bus_ejection')]: { count: 2, lastLeg: 7, lastChoiceId: choiceId('plead') },
    },
    pendingEvents: [
      {
        eventId: eventId('border.guard_remembers'),
        earliestLeg: 8,
        latestLeg: 16,
        scheduledAtLeg: 4,
        source: eventId('border.bribe_attempt'),
        requires: { kind: 'always' },
        payload: { guard: 'archetype_a' },
      },
    ],
    history: [
      {
        legIndex: 3,
        day: 1,
        eventId: eventId('rest.pickpocket_victim'),
        choiceId: choiceId('chase'),
        textKey: 'events.rest.pickpocket_victim.out.lost',
        params: { amount: 40 },
        tags: ['theft', 'money'],
      },
    ],
    presentation: {
      kind: 'event',
      eventId: eventId('border.bribe_attempt'),
      presentedAtLeg: 4,
      rung: 0,
    },
  };
}

describe('RunState serialisability (engine-spec 1)', () => {
  it('round-trips a fresh state unchanged', () => {
    const state = fresh();
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('round-trips a fully populated state unchanged', () => {
    const state = populated();
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('keeps the digest identical across a round trip', () => {
    // toEqual would not catch a Map becoming {} — both sides would be {}. The digest is
    // computed from the ORIGINAL, so a lossy round trip shows up as a mismatch.
    const state = populated();
    const revived = JSON.parse(JSON.stringify(state)) as RunState;
    expect(stateDigest(revived)).toBe(stateDigest(state));
  });

  it('contains no value JSON cannot represent', () => {
    const offenders: string[] = [];

    const walk = (value: unknown, path: string): void => {
      if (value === null) return;
      if (value instanceof Map || value instanceof Set || value instanceof Date) {
        offenders.push(`${path}: ${value.constructor.name}`);
        return;
      }
      if (typeof value === 'function' || typeof value === 'symbol') {
        offenders.push(`${path}: ${typeof value}`);
        return;
      }
      if (typeof value === 'undefined') {
        // undefined does not survive stringify; the no-optional-properties rule exists to
        // keep it out of state entirely.
        offenders.push(`${path}: undefined`);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item, i) => walk(item, `${path}[${i}]`));
        return;
      }
      if (typeof value === 'object') {
        if (Object.getPrototypeOf(value) !== Object.prototype) {
          offenders.push(`${path}: non-plain object`);
          return;
        }
        for (const [key, item] of Object.entries(value)) walk(item, `${path}.${key}`);
      }
    };

    walk(populated(), 'state');
    expect(offenders).toEqual([]);
  });

  it('still flags a Map if one is smuggled in', () => {
    // Guards the guard: the walker above passes trivially if it stops descending.
    const offenders: string[] = [];
    const smuggled = { flags: new Map([['a', 1]]) };

    const walk = (value: unknown, path: string): void => {
      if (value instanceof Map) offenders.push(path);
      else if (value !== null && typeof value === 'object') {
        for (const [key, item] of Object.entries(value)) walk(item, `${path}.${key}`);
      }
    };

    walk(smuggled, 'state');
    expect(offenders).toEqual(['state.flags']);
  });
});
