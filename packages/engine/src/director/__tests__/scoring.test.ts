import { describe, expect, it } from 'vitest';
import { createContentPack } from '../../content/content-pack.ts';
import { type GameEvent } from '../../content/game-event.ts';
import { eventId } from '../../ids/content-ids.ts';
import { createRunState } from '../../state/create-run-state.ts';
import { createResources } from '../../state/resources.ts';
import { createRunInit } from '../../state/run-init.ts';
import { type HistoryEntry } from '../../state/history-entry.ts';
import { type RunState } from '../../state/run-state.ts';
import { makeRoute } from '../../state/__tests__/support/make-route.ts';
import { loadMiniPack } from '../../__tests__/support/load-fixtures.ts';
import { pickWeight, scoreEvent } from '../score-event.ts';
import {
  PICK_WEIGHT_MIN,
  RECENCY_WINDOW,
  TAG_SATURATION_MIN,
  TAG_WINDOW,
  WEIGHT_MAX,
} from '../scoring-constants.ts';
import { recency, SCORING_FACTORS } from '../scoring-factors.ts';
import { tagsOf } from '../../content/event-tags.ts';
import { tagSaturation } from '../tag-saturation.ts';

const { events, registries } = loadMiniPack();
const PACK = createContentPack(events, registries);

function makeState(overrides: Partial<RunState> = {}): RunState {
  const result = createRunState(createRunInit('scoring-seed', PACK.version, makeRoute()));
  if (!result.ok) throw new Error('fixture route rejected');
  return { ...result.state, status: 'travelling', ...overrides };
}

/** A spread of states wide enough to push every factor toward both of its bounds. */
function statesUnderStress(): readonly RunState[] {
  const base = makeState();
  return [
    base,
    makeState({ tension: 0 }),
    makeState({ tension: 1 }),
    makeState({ tension: 0.5 }),
    makeState({ resources: { ...createResources(), cash: 0, health: 1, morale: 1, heat: 10 } }),
    makeState({ route: { ...makeRoute(), legIndex: 11 } }),
    makeState({
      eventMemory: Object.fromEntries(
        events.map((e) => [e.id, { count: 9, lastLeg: 0, lastChoiceId: null }]),
      ),
    }),
    makeState({
      history: events.slice(0, 8).map((e, i) => ({
        legIndex: i,
        day: 0,
        eventId: e.id,
        choiceId: null,
        textKey: 'k',
        params: {},
        tags: e.tags,
      })),
    }),
  ];
}

describe('scoring factor bounds', () => {
  it.each(SCORING_FACTORS.map((f) => [f.name, f] as const))(
    '%s stays inside its documented range',
    (_name, factor) => {
      for (const state of statesUnderStress()) {
        for (const event of PACK.events) {
          const value = factor.of(event, state);
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(factor.min);
          expect(value).toBeLessThanOrEqual(factor.max);
        }
      }
    },
  );

  it('never lets a factor reach zero', () => {
    // A factor that can hit zero is a filter wearing a disguise — and a filter can explain
    // itself while a zero weight cannot (design pillar 2).
    for (const factor of SCORING_FACTORS) {
      expect(factor.min).toBeGreaterThan(0);
    }
  });
});

describe('pickWeight', () => {
  it('is at least 1 for every event in every state', () => {
    // THE INVARIANT that separates scoring from filtering: an event that survived the filters
    // is always pickable, however badly it scores. The product's lower bound is ~0.000125,
    // which rounds to zero without this floor.
    for (const state of statesUnderStress()) {
      for (const event of PACK.events) {
        expect(pickWeight(event, state), `${event.id}`).toBeGreaterThanOrEqual(PICK_WEIGHT_MIN);
      }
    }
  });

  it('lifts a would-be-zero score to 1', () => {
    const worst = worstCaseEvent();
    const legs = 8;
    const state = makeState({
      tension: 1,
      // `lastLeg` AGREES WITH THE HISTORY BELOW, which it did not until M3.12a. It said 0 while
      // the same event sat in `history` at legs 0..7, i.e. "last fired at leg 0" next to a
      // record of it firing at leg 7 — an incoherent state that could not arise in play. It
      // went unnoticed because `recency` read only `legIndex - lastLeg` and never opened
      // `history`; now that the two windows share a source of truth, the fixture has to be a
      // state the engine could actually reach. Derived from `legs` so it cannot drift again.
      eventMemory: { [worst.id]: { count: 50, lastLeg: legs - 1, lastChoiceId: null } },
      history: Array.from({ length: legs }, (_, i) => ({
        legIndex: i,
        day: 0,
        eventId: worst.id,
        choiceId: null,
        textKey: 'k',
        params: {},
        tags: tagsOf(worst),
      })),
    });

    expect(scoreEvent(worst, state)).toBeLessThan(1);
    expect(pickWeight(worst, state)).toBe(1);
  });

  it('is an integer, so weightedPick accumulates exactly', () => {
    for (const state of statesUnderStress()) {
      for (const event of PACK.events) {
        expect(Number.isInteger(pickWeight(event, state))).toBe(true);
      }
    }
  });

  it('respects the authored weight ceiling', () => {
    for (const event of PACK.events) expect(event.weight).toBeLessThanOrEqual(WEIGHT_MAX);
  });
});

describe('multiplication order is part of the replay contract', () => {
  it('pins the factor sequence', () => {
    // Float multiplication is not associative. Reordering changes the last bits, which
    // changes Math.round, which changes the pick, which breaks every golden run.
    expect(SCORING_FACTORS.map((f) => f.name)).toEqual([
      'contextAffinity',
      'tensionFit',
      'novelty',
      'recency',
      'tagSaturation',
      'priorityBoost',
    ]);
  });

  it('scoreEvent agrees with a fold over SCORING_FACTORS in that order', () => {
    // The hand-written multiplication in scoreEvent is the hot path; this is what keeps it
    // honest against the declared order rather than against a comment.
    for (const state of statesUnderStress()) {
      for (const event of PACK.events) {
        const folded = SCORING_FACTORS.reduce(
          (acc, factor) => acc * factor.of(event, state),
          event.weight,
        );
        expect(scoreEvent(event, state)).toBe(folded);
      }
    }
  });

  it('would notice a reordering', () => {
    // Guards the guard: if float multiplication were associative here, the test above could
    // not fail and would prove nothing. This finds a state where order genuinely matters.
    const a = 0.1;
    const b = 0.2;
    const c = 0.3;
    expect(a * b * c).not.toBe(c * b * a * (1 + Number.EPSILON));
  });
});

describe('recency windows over FIRED EVENTS, not over legs (ADR 0029 addendum)', () => {
  const SUBJECT = 'rest.pickpocket_victim';
  const FILLER = 'filler.long_hours';

  /**
   * The subject fires at leg 0; then `quiet` silenced legs, then `fired` legs that drew
   * something else. Both counts are what the two candidate units disagree about, so every
   * assertion below is a statement about which one the factor reads.
   */
  const after = (fired: number, quiet: number): RunState => {
    const subject = find(SUBJECT);
    const other = find(FILLER);
    const entries: HistoryEntry[] = [
      {
        legIndex: 0,
        day: 0,
        eventId: subject.id,
        choiceId: null,
        textKey: 'k',
        params: {},
        tags: [],
      },
    ];

    for (let i = 0; i < quiet; i += 1) {
      entries.push({
        legIndex: entries.length,
        day: 0,
        eventId: null,
        choiceId: null,
        textKey: 'q',
        params: {},
        tags: [],
      });
    }
    for (let i = 0; i < fired; i += 1) {
      entries.push({
        legIndex: entries.length,
        day: 0,
        eventId: other.id,
        choiceId: null,
        textKey: 'k',
        params: {},
        tags: [],
      });
    }

    return makeState({
      route: { ...makeRoute(), legIndex: entries.length },
      eventMemory: { [subject.id]: { count: 1, lastLeg: 0, lastChoiceId: null } },
      history: entries,
    });
  };

  it('is 1 for an event the run has never seen', () => {
    expect(recency(find(SUBJECT), makeState())).toBe(1);
  });

  it('recovers fully after RECENCY_WINDOW draws, counting the current one', () => {
    // `gap` is inclusive of the draw being scored — 1 means "the very next draw" — so
    // RECENCY_WINDOW - 1 intervening events is exactly full recovery. That off-by-one is what
    // keeps the new form arithmetically identical to `legIndex - lastLeg` when nothing is quiet.
    expect(recency(find(SUBJECT), after(RECENCY_WINDOW - 1, 0))).toBe(1);
    expect(recency(find(SUBJECT), after(RECENCY_WINDOW - 2, 0))).toBeLessThan(1);
  });

  it('does not let quiet legs age a repeat out of the window', () => {
    // REGRESSION. These two states span the SAME number of legs and differ only in whether the
    // legs in between showed the player anything. Under `legIndex - lastLeg` both read a gap of
    // RECENCY_WINDOW + 1 and both returned 1 — the penalty silently switched off because time
    // passed rather than because anything happened.
    const quiet = after(1, RECENCY_WINDOW - 1);
    const loud = after(RECENCY_WINDOW, 0);

    expect(quiet.route.legIndex).toBe(loud.route.legIndex);
    expect(recency(find(SUBJECT), loud)).toBe(1);
    expect(recency(find(SUBJECT), quiet)).toBeLessThan(1);
  });

  it('is unchanged by how many quiet legs sit between the same draws', () => {
    // Guards the guard: if the value above were reachable without the quiet entries mattering,
    // the regression test would prove nothing. Same draws, wildly different leg span, same answer.
    const subject = find(SUBJECT);
    expect(recency(subject, after(2, 0))).toBe(recency(subject, after(2, 40)));
  });
});

describe('tagSaturation', () => {
  it('is 1 with no history', () => {
    expect(tagSaturation(PACK.events[0] as GameEvent, makeState())).toBe(1);
  });

  it('falls as a theme repeats', () => {
    const event = find('border.bribe_attempt');
    const withHistory = (times: number): RunState =>
      makeState({
        history: Array.from({ length: times }, (_, i) => ({
          legIndex: i,
          day: 0,
          eventId: event.id,
          choiceId: null,
          textKey: 'k',
          params: {},
          tags: ['authority'],
        })),
      });

    expect(tagSaturation(event, withHistory(1))).toBeCloseTo(0.5, 5);
    expect(tagSaturation(event, withHistory(2))).toBeCloseTo(1 / 3, 5);
    expect(tagSaturation(event, withHistory(3))).toBeCloseTo(0.25, 5);
  });

  it('uses the MOST saturated tag, not the product', () => {
    // A six-tag event in a busy window would collapse to near-zero under a product, becoming
    // a filter in disguise. `max` keeps it a shading factor.
    const event = find('border.bribe_attempt'); // tags: authority, money, risk, corruption
    const state = makeState({
      history: ['authority', 'cash', 'risk', 'corruption'].map((tag, i) => ({
        legIndex: i,
        day: 0,
        // A REAL id, not null. Since ADR 0029 `eventId: null` marks a leg where nothing fired,
        // and `tagSaturation` skips those — these entries are meant to be fired events.
        eventId: event.id,
        choiceId: null,
        textKey: 'k',
        params: {},
        tags: [tag],
      })),
    });
    // Each tag appears once, so max saturation is 1 -> 1/2. A product would give 1/16.
    expect(tagSaturation(event, state)).toBeCloseTo(0.5, 5);
  });

  it('never drops below its floor', () => {
    const event = find('border.bribe_attempt');
    const state = makeState({
      // Length derived from the window, not hardcoded: the floor is reached by filling it.
      history: Array.from({ length: TAG_WINDOW }, (_, i) => ({
        legIndex: i,
        day: 0,
        // See above — a fired event carries an id, and only a fired event counts here.
        eventId: event.id,
        choiceId: null,
        textKey: 'k',
        params: {},
        tags: ['authority'],
      })),
    });
    expect(tagSaturation(event, state)).toBe(TAG_SATURATION_MIN);
  });

  it('windows over FIRED events, not over history entries (ADR 0029 D6)', () => {
    // REGRESSION. `history` carries quiet legs since the gate landed, and `slice(-TAG_WINDOW)`
    // over ENTRIES let them push fired events out of the anti-repetition window — shrinking it
    // from TAG_WINDOW fired events to about 5.6 at a 30% quiet share. The gate would then have
    // WORSENED the repeat rate it was partly meant to help, and the two effects would have
    // cancelled in the sim rather than showing up as the regression they are.
    const event = find('border.bribe_attempt');
    const repeats = 2; // below the floor's reach, so the difference is visible rather than clamped

    const entry = (i: number, fired: boolean): HistoryEntry => ({
      legIndex: i,
      day: 0,
      eventId: fired ? event.id : null,
      choiceId: null,
      textKey: 'k',
      params: {},
      tags: fired ? ['authority'] : [],
    });

    // A saturated run, then enough quiet legs to fill the window on their own. Counts derived
    // from TAG_WINDOW: the tail alone has to be able to evict every fired entry.
    const history = [
      ...Array.from({ length: repeats }, (_, i) => entry(i, true)),
      ...Array.from({ length: TAG_WINDOW }, (_, i) => entry(repeats + i, false)),
    ];

    // Slicing entries sees only the quiet tail — zero `authority`, factor 1, no penalty at all.
    expect(tagSaturation(event, makeState({ history }))).toBeCloseTo(1 / (1 + repeats), 5);
  });

  it('is unaffected by how many quiet legs sit between the fired ones', () => {
    // Guards the guard: if the value above were reachable without the quiet entries mattering,
    // the regression test would prove nothing. Same fired events, no quiet legs, same answer.
    const event = find('border.bribe_attempt');
    const repeats = 2;
    const history: HistoryEntry[] = Array.from({ length: repeats }, (_, i) => ({
      legIndex: i,
      day: 0,
      eventId: event.id,
      choiceId: null,
      textKey: 'k',
      params: {},
      tags: ['authority'],
    }));

    expect(tagSaturation(event, makeState({ history }))).toBeCloseTo(1 / (1 + repeats), 5);
  });

  it('folds category in as a synthetic tag', () => {
    expect(tagsOf(find('border.bribe_attempt'))).toContain('cat:border');
  });
});

function find(id: string): GameEvent {
  const event = PACK.byId.get(eventId(id));
  if (event === undefined) throw new Error(`fixture missing ${id}`);
  return event;
}

function worstCaseEvent(): GameEvent {
  const event = PACK.fillers[0];
  if (event === undefined) throw new Error('fixture has no fillers');
  return event;
}
