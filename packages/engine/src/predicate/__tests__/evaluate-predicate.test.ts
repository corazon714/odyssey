import { describe, expect, it } from 'vitest';
import {
  eventId,
  flagId,
  itemId,
  languageId,
  npcId,
  regionId,
  traitId,
} from '../../ids/content-ids.ts';
import { createResources } from '../../state/resources.ts';
import { evaluatePredicate } from '../evaluate-predicate.ts';
import { type Predicate } from '../predicate.ts';
import { makeContext, NO_REFS_KNOWN } from './support/make-context.ts';

const value = (predicate: Predicate, ctx = makeContext()): boolean =>
  evaluatePredicate(predicate, ctx).value;

describe('logical nodes', () => {
  it('always and never', () => {
    expect(value({ kind: 'always' })).toBe(true);
    expect(value({ kind: 'never' })).toBe(false);
  });

  it('all requires every child', () => {
    expect(value({ kind: 'all', of: [{ kind: 'always' }, { kind: 'always' }] })).toBe(true);
    expect(value({ kind: 'all', of: [{ kind: 'always' }, { kind: 'never' }] })).toBe(false);
  });

  it('any requires one child', () => {
    expect(value({ kind: 'any', of: [{ kind: 'never' }, { kind: 'always' }] })).toBe(true);
    expect(value({ kind: 'any', of: [{ kind: 'never' }, { kind: 'never' }] })).toBe(false);
  });

  it('treats an empty all as true and an empty any as false', () => {
    // Follows from every/some, and matches what an author writing an empty list expects.
    expect(value({ kind: 'all', of: [] })).toBe(true);
    expect(value({ kind: 'any', of: [] })).toBe(false);
  });

  it('not inverts, and nests', () => {
    expect(value({ kind: 'not', of: { kind: 'always' } })).toBe(false);
    expect(value({ kind: 'not', of: { kind: 'not', of: { kind: 'always' } } })).toBe(true);
  });

  it('does not short-circuit, so every child is traced', () => {
    // A short-circuiting `all` would show one reason where three applied — the opposite of
    // design pillar 2.
    const result = evaluatePredicate(
      { kind: 'all', of: [{ kind: 'never' }, { kind: 'never' }, { kind: 'never' }] },
      makeContext(),
    );
    expect(result.trace.children).toHaveLength(3);
  });
});

describe('resource, skill and inventory leaves', () => {
  it('compares a resource with each operator', () => {
    const ctx = makeContext({ resources: { ...createResources(), money: 30 } });
    expect(value({ kind: 'resource', key: 'money', cmp: { op: 'gte', value: 30 } }, ctx)).toBe(
      true,
    );
    expect(value({ kind: 'resource', key: 'money', cmp: { op: 'gt', value: 30 } }, ctx)).toBe(
      false,
    );
    expect(value({ kind: 'resource', key: 'money', cmp: { op: 'eq', value: 30 } }, ctx)).toBe(true);
    expect(value({ kind: 'resource', key: 'money', cmp: { op: 'neq', value: 30 } }, ctx)).toBe(
      false,
    );
    expect(value({ kind: 'resource', key: 'money', cmp: { op: 'lte', value: 30 } }, ctx)).toBe(
      true,
    );
    expect(value({ kind: 'resource', key: 'money', cmp: { op: 'lt', value: 30 } }, ctx)).toBe(
      false,
    );
  });

  it('reports actual alongside required', () => {
    const ctx = makeContext({ resources: { ...createResources(), money: 12 } });
    const { trace } = evaluatePredicate(
      { kind: 'resource', key: 'money', cmp: { op: 'gte', value: 30 } },
      ctx,
    );
    expect(trace.params).toEqual({ key: 'money', required: 30, actual: 12 });
  });

  it('compares a skill', () => {
    const ctx = makeContext();
    expect(value({ kind: 'skill', key: 'stealth', cmp: { op: 'gte', value: 1 } }, ctx)).toBe(false);
  });

  it('checks a language', () => {
    const ctx = makeContext();
    expect(value({ kind: 'language', id: languageId('ru') }, ctx)).toBe(false);
  });

  it('checks a trait', () => {
    const ctx = makeContext({ traits: [traitId('smooth_talker')] });
    expect(value({ kind: 'trait', id: traitId('smooth_talker') }, ctx)).toBe(true);
    expect(value({ kind: 'trait', id: traitId('paranoid') }, ctx)).toBe(false);
  });

  it('sums item counts across stacks', () => {
    const ctx = makeContext({
      inventory: [
        { id: itemId('ration'), count: 2, condition: null },
        { id: itemId('ration'), count: 3, condition: null },
      ],
    });
    expect(value({ kind: 'item', id: itemId('ration'), cmp: { op: 'gte', value: 5 } }, ctx)).toBe(
      true,
    );
    expect(value({ kind: 'item', id: itemId('ration'), cmp: { op: 'gte', value: 6 } }, ctx)).toBe(
      false,
    );
  });
});

describe('document leaves', () => {
  it('distinguishes no passport from an invalid one', () => {
    const none = makeContext();
    const invalid = makeContext({
      documents: {
        passport: { present: true, valid: false, flagged: false },
        visas: {},
        tickets: [],
      },
    });

    expect(value({ kind: 'passport', present: true, valid: null, flagged: null }, none)).toBe(
      false,
    );
    expect(value({ kind: 'passport', present: true, valid: null, flagged: null }, invalid)).toBe(
      true,
    );
    expect(value({ kind: 'passport', present: true, valid: true, flagged: null }, invalid)).toBe(
      false,
    );
  });

  it('treats a null field as "do not care"', () => {
    const ctx = makeContext({
      documents: {
        passport: { present: true, valid: true, flagged: true },
        visas: {},
        tickets: [],
      },
    });
    expect(value({ kind: 'passport', present: null, valid: null, flagged: null }, ctx)).toBe(true);
  });

  it('honours visa expiry against the clock', () => {
    const region = regionId('schengen');
    const ctx = makeContext({
      clock: { day: 10, hour: 9, weekday: 3 },
      documents: {
        passport: null,
        visas: { [region]: { valid: true, expiresDay: 5 } },
        tickets: [],
      },
    });
    expect(value({ kind: 'visa', region, valid: true }, ctx)).toBe(false);
    expect(
      evaluatePredicate({ kind: 'visa', region, valid: true }, ctx).trace.params,
    ).toMatchObject({
      expired: true,
    });
  });
});

describe('memory leaves', () => {
  it('reads a set flag, whatever its value', () => {
    const ctx = makeContext({
      flags: {
        [flagId('wanted')]: { value: false, setAtLeg: 0, expiresAtLeg: null },
        [flagId('debt')]: { value: 120, setAtLeg: 0, expiresAtLeg: null },
      },
    });
    // A flag set to `false` is still SET — conflating the two breaks "you already tried this".
    expect(value({ kind: 'flag', id: flagId('wanted'), cmp: { op: 'isSet' } }, ctx)).toBe(true);
    expect(
      value({ kind: 'flag', id: flagId('wanted'), cmp: { op: 'eq', value: false } }, ctx),
    ).toBe(true);
    expect(value({ kind: 'flag', id: flagId('missing'), cmp: { op: 'notSet' } }, ctx)).toBe(true);
    expect(
      value(
        { kind: 'flag', id: flagId('debt'), cmp: { op: 'number', cmp: { op: 'gt', value: 100 } } },
        ctx,
      ),
    ).toBe(true);
  });

  it('treats an expired flag as unset', () => {
    const ctx = makeContext({
      route: { ...makeContext().state.route, legIndex: 5 },
      flags: { [flagId('bribed_here')]: { value: true, setAtLeg: 4, expiresAtLeg: 5 } },
    });
    expect(value({ kind: 'flag', id: flagId('bribed_here'), cmp: { op: 'isSet' } }, ctx)).toBe(
      false,
    );
  });

  it('defaults an unmet npc to zero trust', () => {
    const ctx = makeContext();
    expect(
      value({ kind: 'relationship', npc: npcId('dmitri'), cmp: { op: 'lt', value: 0 } }, ctx),
    ).toBe(false);
    expect(value({ kind: 'npcMet', npc: npcId('dmitri'), met: false }, ctx)).toBe(true);
  });

  it('defaults an unseen event to count 0 and lastLeg -1', () => {
    const ctx = makeContext();
    const unseen = eventId('transit.bus_ejection');
    expect(
      value(
        { kind: 'eventMemory', event: unseen, field: 'count', cmp: { op: 'eq', value: 0 } },
        ctx,
      ),
    ).toBe(true);
    // lastLeg defaults to -1, not 0, so "seen recently" is false at leg 0.
    expect(
      value(
        { kind: 'eventMemory', event: unseen, field: 'lastLeg', cmp: { op: 'gte', value: 0 } },
        ctx,
      ),
    ).toBe(false);
  });
});

describe('world leaves', () => {
  it('matches weather, time of day, profile and status', () => {
    const ctx = makeContext({ weather: 'rain', clock: { day: 0, hour: 23, weekday: 0 } });
    expect(value({ kind: 'weather', anyOf: ['rain', 'fog'] }, ctx)).toBe(true);
    expect(value({ kind: 'timeOfDay', anyOf: ['night'] }, ctx)).toBe(true);
    expect(value({ kind: 'timeOfDay', anyOf: ['morning'] }, ctx)).toBe(false);
    expect(value({ kind: 'routeProfile', anyOf: ['cheapest'] }, ctx)).toBe(true);
    expect(value({ kind: 'status', anyOf: ['travelling'] }, ctx)).toBe(true);
  });

  it('compares leg, day and tension', () => {
    const ctx = makeContext({ tension: 0.6, clock: { day: 4, hour: 9, weekday: 1 } });
    expect(value({ kind: 'leg', cmp: { op: 'eq', value: 0 } }, ctx)).toBe(true);
    expect(value({ kind: 'day', cmp: { op: 'gte', value: 4 } }, ctx)).toBe(true);
    expect(value({ kind: 'tension', cmp: { op: 'gt', value: 0.5 } }, ctx)).toBe(true);
  });

  it('matches transport', () => {
    const ctx = makeContext({
      transport: { mode: 'truck', vehicleId: 'v1', condition: 4, fuel: 2, legal: false },
    });
    expect(value({ kind: 'transportMode', anyOf: ['car', 'truck'] }, ctx)).toBe(true);
    expect(value({ kind: 'transportStat', key: 'fuel', cmp: { op: 'lte', value: 3 } }, ctx)).toBe(
      true,
    );
    expect(value({ kind: 'vehicleLegal', legal: false }, ctx)).toBe(true);
  });
});

describe('unknown content references', () => {
  it('resolves to false with its own node kind', () => {
    const ctx = makeContext({}, NO_REFS_KNOWN);
    const result = evaluatePredicate({ kind: 'trait', id: traitId('gone') }, ctx);

    expect(result.value).toBe(false);
    expect(result.trace.kind).toBe('unknown-ref');
    expect(result.trace.params).toEqual({ refKind: 'trait', id: 'gone' });
  });

  it('covers every content-referencing leaf', () => {
    const ctx = makeContext({}, NO_REFS_KNOWN);
    const cases: Predicate[] = [
      { kind: 'trait', id: traitId('x') },
      { kind: 'item', id: itemId('x'), cmp: { op: 'gte', value: 1 } },
      { kind: 'relationship', npc: npcId('x'), cmp: { op: 'gte', value: 0 } },
      { kind: 'npcMet', npc: npcId('x'), met: true },
      { kind: 'eventMemory', event: eventId('x'), field: 'count', cmp: { op: 'gte', value: 0 } },
    ];

    for (const predicate of cases) {
      expect(evaluatePredicate(predicate, ctx).trace.kind).toBe('unknown-ref');
    }
  });

  it('does NOT treat an unrecognised flag as an unknown ref', () => {
    // Flags are runtime data, not content: an old save may legitimately carry a retired one,
    // and there is no registry for it to be missing from.
    const ctx = makeContext({}, NO_REFS_KNOWN);
    const result = evaluatePredicate(
      { kind: 'flag', id: flagId('whatever'), cmp: { op: 'notSet' } },
      ctx,
    );
    expect(result.trace.kind).toBe('flag');
    expect(result.value).toBe(true);
  });
});
