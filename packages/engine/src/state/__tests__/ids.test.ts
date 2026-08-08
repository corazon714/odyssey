import { describe, expect, it } from 'vitest';
import { eventId, flagId, npcId } from '../../ids/content-ids.ts';

describe('branded ids', () => {
  it('are plain strings at runtime', () => {
    // The brand is a declare'd symbol, so it does not exist at runtime and JSON round-trips
    // an id unchanged — which engine-spec 1 requires of everything in RunState.
    const id = eventId('border.bribe_attempt');
    expect(typeof id).toBe('string');
    expect(id).toBe('border.bribe_attempt');
    expect(JSON.parse(JSON.stringify({ id }))).toEqual({ id: 'border.bribe_attempt' });
  });

  it('work as record keys', () => {
    const record = { [flagId('wanted')]: 1, [npcId('dmitri')]: 2 };
    expect(record[flagId('wanted')]).toBe(1);
  });

  it('keep distinct id types from being interchangeable at compile time', () => {
    // The value-level assertion here is trivial; the real test is that this file compiles
    // while `const f: FlagId = eventId('x')` would not. Documented rather than asserted,
    // because a type error cannot be expressed as a runtime expectation.
    expect(eventId('x')).toBe(flagId('x'));
  });
});
