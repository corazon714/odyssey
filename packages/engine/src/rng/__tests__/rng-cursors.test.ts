import { describe, expect, it } from 'vitest';
import { ALL_RNG_STREAMS, createRngCursors } from '../rng-cursors.ts';
import { RNG_STREAMS } from '../rng-stream.ts';

describe('createRngCursors', () => {
  it('starts every stream at zero', () => {
    const cursors = createRngCursors();
    for (const stream of RNG_STREAMS) expect(cursors[stream]).toBe(0);
  });

  it('has exactly the keys in RNG_STREAMS and no others', () => {
    // The literal in createRngCursors catches a MISSING stream at compile time. This
    // catches the other direction — a leftover key for a stream that was removed.
    expect(Object.keys(createRngCursors()).sort()).toEqual([...RNG_STREAMS].sort());
  });

  it('includes the eight documented streams', () => {
    // Pinned explicitly: adding or removing one changes the save format and needs a
    // SAVE_VERSION bump plus a migration (see rng-stream.ts).
    expect([...RNG_STREAMS].sort()).toEqual([
      'chanceGate',
      'encounterFlavor',
      'eventPick',
      'npcGen',
      'outcomeRoll',
      'routeGen',
      'skillCheck',
      'worldTick',
    ]);
  });

  it('returns a fresh object each call', () => {
    const a = createRngCursors();
    a.eventPick = 7;
    expect(createRngCursors().eventPick).toBe(0);
  });

  it('round-trips through JSON unchanged', () => {
    // docs/engine-spec.md 1: no functions, Maps, Sets, Dates or class instances anywhere in
    // persisted state. A plain Record of numbers is the entire point of this type.
    const cursors = createRngCursors();
    cursors.eventPick = 12;
    cursors.chanceGate = 0;
    expect(JSON.parse(JSON.stringify(cursors))).toEqual(cursors);
  });

  it('exposes the stream list for exhaustive iteration', () => {
    expect(ALL_RNG_STREAMS).toEqual(RNG_STREAMS);
  });
});
