import { describe, expect, it } from 'vitest';
import { createContentPack } from '../../content/content-pack.ts';
import { eventId } from '../../ids/content-ids.ts';
import { createRunState } from '../../state/create-run-state.ts';
import { createResources } from '../../state/resources.ts';
import { createRunInit } from '../../state/run-init.ts';
import { type RunState } from '../../state/run-state.ts';
import { makeRoute } from '../../state/__tests__/support/make-route.ts';
import { loadMiniPack } from '../../__tests__/support/load-fixtures.ts';
import { QUIET_JOURNAL_KEY } from '../quiet-gate.ts';
import { TENSION_BREATHER } from '../scoring-constants.ts';
import { consecutiveHighTension, nextTension } from '../tension.ts';

const { events, registries } = loadMiniPack();
const PACK = createContentPack(events, registries);

function makeState(overrides: Partial<RunState> = {}): RunState {
  const result = createRunState(createRunInit('tension-seed', PACK.version, makeRoute()));
  if (!result.ok) throw new Error('fixture route rejected');
  return { ...result.state, status: 'travelling', ...overrides };
}

/** `border.bribe_attempt` declares tensionBand [0.4, 1.0] — its low end is >= 0.5? No: 0.4. */
const HIGH_TENSION_EVENT = eventId('crisis.breakdown'); // band [0.5, 1.0]

function historyOf(count: number, id = HIGH_TENSION_EVENT): RunState['history'] {
  return Array.from({ length: count }, (_, i) => ({
    legIndex: i,
    day: 0,
    eventId: id,
    choiceId: null,
    textKey: 'k',
    params: {},
    tags: [],
  }));
}

/** What `advanceLeg` appends on a gated leg — the shape `quietHistoryEntry` produces. */
function quietEntry(legIndex: number): RunState['history'][number] {
  return {
    legIndex,
    day: 0,
    eventId: null,
    choiceId: null,
    textKey: QUIET_JOURNAL_KEY,
    params: { leg: legIndex },
    tags: [],
  };
}

describe('nextTension', () => {
  it('stays within 0..1 across extreme states', () => {
    const extremes: RunState[] = [
      makeState(),
      makeState({
        resources: { ...createResources(), health: 0, morale: 0, heat: 10, hunger: 10 },
      }),
      makeState({
        resources: { ...createResources(), health: 10, morale: 10, heat: 0, hunger: 0 },
      }),
      makeState({ route: { ...makeRoute(), legIndex: 11 } }),
      makeState({ route: { ...makeRoute(), legCount: 0 } }),
    ];

    for (const state of extremes) {
      const tension = nextTension(state, PACK);
      expect(Number.isFinite(tension)).toBe(true);
      expect(tension).toBeGreaterThanOrEqual(0);
      expect(tension).toBeLessThanOrEqual(1);
    }
  });

  it('rises with route progress', () => {
    const early = nextTension(makeState({ route: { ...makeRoute(), legIndex: 1 } }), PACK);
    const late = nextTension(makeState({ route: { ...makeRoute(), legIndex: 10 } }), PACK);
    expect(late).toBeGreaterThan(early);
  });

  it('rises with strain, and weights it above progress', () => {
    const comfortable = nextTension(makeState(), PACK);
    const desperate = nextTension(
      makeState({ resources: { ...createResources(), health: 2, morale: 2, heat: 8, hunger: 8 } }),
      PACK,
    );
    expect(desperate).toBeGreaterThan(comfortable);
  });

  it('breathes after two consecutive high-tension events', () => {
    // engine-spec 4. Continuous crisis is desensitisation: if everything is an emergency,
    // nothing is — and the sim sees it as a collapsing completion rate with no single event
    // being unfair.
    const strained = { ...createResources(), health: 4, morale: 4, heat: 6, hunger: 6 };
    const without = nextTension(makeState({ resources: strained, history: historyOf(1) }), PACK);
    const withBreather = nextTension(
      makeState({ resources: strained, history: historyOf(2) }),
      PACK,
    );

    expect(withBreather).toBeLessThan(without);
    expect(without - withBreather).toBeCloseTo(0.2, 5);
  });

  it('is pure', () => {
    const state = makeState();
    const before = JSON.stringify(state);
    nextTension(state, PACK);
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe('consecutiveHighTension', () => {
  it('counts a run of high-band events', () => {
    expect(consecutiveHighTension(makeState({ history: historyOf(3) }), PACK)).toBe(3);
  });

  it('breaks on a low-band or bandless event', () => {
    const mixed = [...historyOf(2), ...historyOf(1, eventId('filler.roadside_quiet'))];
    expect(consecutiveHighTension(makeState({ history: mixed }), PACK)).toBe(0);
  });

  it('breaks on an event missing from the pack rather than throwing', () => {
    // Content changed under a save. Tolerant read, per the reconciliation policy.
    const ghost = historyOf(2, eventId('was.deleted'));
    expect(() => consecutiveHighTension(makeState({ history: ghost }), PACK)).not.toThrow();
    expect(consecutiveHighTension(makeState({ history: ghost }), PACK)).toBe(0);
  });

  it('is zero with no history', () => {
    expect(consecutiveHighTension(makeState(), PACK)).toBe(0);
  });

  it('breaks on a QUIET leg — designed silence ends a streak (ADR 0029 addendum)', () => {
    // The line `if (entry.eventId === null) break` was written for a case that could not
    // happen: until the quiet-leg gate, `advanceLeg` never wrote a history entry and every
    // entry carried an id. Nothing constructed one against this function, so its behaviour was
    // an accident of a dead guard. It is now a decision, and this is the test that makes it one.
    const history = [...historyOf(2), quietEntry(2)];
    expect(consecutiveHighTension(makeState({ history }), PACK)).toBe(0);
  });

  it('so the breather is never spent twice on the same crisis', () => {
    // THE REASON `break` IS RIGHT, measured rather than asserted. The breather exists against
    // continuous crisis; a quiet leg IS the leg off it was going to buy. Easing the next leg as
    // well gives `high, high, nothing, low` — a pacing sag, not a breather. Design pillar 3
    // wants the world to react to where the run IS, and after a quiet leg it is not in crisis.
    const strained = { ...createResources(), health: 4, morale: 4, heat: 6, hunger: 6 };
    const eased = nextTension(makeState({ resources: strained, history: historyOf(2) }), PACK);
    const afterQuiet = nextTension(
      makeState({ resources: strained, history: [...historyOf(2), quietEntry(2)] }),
      PACK,
    );

    expect(afterQuiet).toBeGreaterThan(eased);
    expect(afterQuiet - eased).toBeCloseTo(TENSION_BREATHER, 5);
  });
});
