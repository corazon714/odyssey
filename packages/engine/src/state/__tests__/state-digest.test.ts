import { describe, expect, it } from 'vitest';
import { flagId } from '../../ids/content-ids.ts';
import { canonicalJson } from '../canonical-json.ts';
import { createRunState } from '../create-run-state.ts';
import { createRunInit } from '../run-init.ts';
import { type RunState } from '../run-state.ts';
import { digestOf, stateDigest } from '../state-digest.ts';
import { makeRoute } from './support/make-route.ts';

function fresh(seed = 'digest-seed'): RunState {
  const result = createRunState(createRunInit(seed, 'content-v1', makeRoute()));
  if (!result.ok) throw new Error('fixture route rejected');
  return result.state;
}

describe('canonicalJson', () => {
  it('sorts object keys', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('is insensitive to insertion order where JSON.stringify is not', () => {
    // The hazard this whole module exists for, with the proof that it is real rather than
    // theoretical: stringify emits string keys in INSERTION order, so two states that are
    // toEqual can serialise differently depending on the order their flags happened to be
    // set in — and a run sets flags in whatever order events fire.
    const first: Record<string, number> = {};
    first['zeta'] = 1;
    first['alpha'] = 2;

    const second: Record<string, number> = {};
    second['alpha'] = 2;
    second['zeta'] = 1;

    expect(JSON.stringify(first)).not.toBe(JSON.stringify(second));
    expect(canonicalJson(first)).toBe(canonicalJson(second));
  });

  it('sorts integer-like keys as strings, not numerically like JSON.stringify', () => {
    // stringify hoists integer-like keys and orders them NUMERICALLY ahead of string keys,
    // so it produces {"2":..,"10":..,"b":..}. canonicalJson sorts every key by UTF-16 code
    // unit, giving "10" < "2". Both are stable; they must not be mixed, and asserting the
    // difference is what stops someone "simplifying" this back to JSON.stringify.
    const record: Record<string, number> = { '10': 1, b: 2, '2': 3 };

    expect(JSON.stringify(record)).toBe('{"2":3,"10":1,"b":2}');
    expect(canonicalJson(record)).toBe('{"10":1,"2":3,"b":2}');
  });

  it('preserves array order', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
    expect(canonicalJson([1, 2, 3])).not.toBe(canonicalJson([3, 2, 1]));
  });

  it('handles nesting, nulls and strings needing escapes', () => {
    expect(canonicalJson({ b: [{ y: null, x: 'a"b' }], a: true })).toBe(
      '{"a":true,"b":[{"x":"a\\"b","y":null}]}',
    );
  });
});

describe('stateDigest', () => {
  it('is 32 lowercase hex characters', () => {
    expect(stateDigest(fresh())).toMatch(/^[0-9a-f]{32}$/);
  });

  it('is stable for the same state', () => {
    expect(stateDigest(fresh())).toBe(stateDigest(fresh()));
  });

  it('changes when one resource changes by 1', () => {
    // GUARD THE GUARD. A digest that never changes passes every replay test vacuously —
    // this is the assertion that gives golden runs their teeth.
    const base = fresh();
    const nudged: RunState = {
      ...base,
      resources: { ...base.resources, morale: base.resources.morale + 1 },
    };
    expect(stateDigest(nudged)).not.toBe(stateDigest(base));
  });

  it('changes when the seed changes', () => {
    expect(stateDigest(fresh('a'))).not.toBe(stateDigest(fresh('b')));
  });

  it('changes when history changes but numbers do not', () => {
    // Replay must prove the same STORY happened, not merely the same balance sheet.
    const base = fresh();
    const withHistory: RunState = {
      ...base,
      history: [
        {
          legIndex: 1,
          day: 0,
          eventId: null,
          choiceId: null,
          textKey: 'events.filler.roadside_quiet.body',
          params: {},
          tags: ['travel'],
        },
      ],
    };
    expect(stateDigest(withHistory)).not.toBe(stateDigest(base));
  });

  it('is insensitive to the order flags were set in', () => {
    const base = fresh();
    const forwards: RunState = {
      ...base,
      flags: {
        [flagId('a_first')]: { value: true, setAtLeg: 1, expiresAtLeg: null },
        [flagId('z_last')]: { value: true, setAtLeg: 2, expiresAtLeg: null },
      },
    };
    const backwards: RunState = {
      ...base,
      flags: {
        [flagId('z_last')]: { value: true, setAtLeg: 2, expiresAtLeg: null },
        [flagId('a_first')]: { value: true, setAtLeg: 1, expiresAtLeg: null },
      },
    };
    expect(stateDigest(forwards)).toBe(stateDigest(backwards));
  });

  it('separates inputs that differ only in structure', () => {
    expect(digestOf(canonicalJson({ a: 1 }))).not.toBe(digestOf(canonicalJson([1])));
    expect(digestOf('')).not.toBe(digestOf('0'));
  });
});
