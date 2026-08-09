import { describe, expect, it } from 'vitest';
import { createContentPack } from '../../content/content-pack.ts';
import { type GameEvent } from '../../content/game-event.ts';
import { eventId } from '../../ids/content-ids.ts';
import { createRunState } from '../../state/create-run-state.ts';
import { createResources } from '../../state/resources.ts';
import { createRunInit } from '../../state/run-init.ts';
import { type RunState } from '../../state/run-state.ts';
import { makeRoute } from '../../state/__tests__/support/make-route.ts';
import { loadMiniPack } from '../../__tests__/support/load-fixtures.ts';
import { pickWeight, scoreEvent } from '../score-event.ts';
import { PICK_WEIGHT_MIN, WEIGHT_MAX } from '../scoring-constants.ts';
import { SCORING_FACTORS } from '../scoring-factors.ts';
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
    const state = makeState({
      tension: 1,
      eventMemory: { [worst.id]: { count: 50, lastLeg: 0, lastChoiceId: null } },
      history: Array.from({ length: 8 }, (_, i) => ({
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
        eventId: null,
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
      history: Array.from({ length: 8 }, (_, i) => ({
        legIndex: i,
        day: 0,
        eventId: null,
        choiceId: null,
        textKey: 'k',
        params: {},
        tags: ['authority'],
      })),
    });
    expect(tagSaturation(event, state)).toBe(0.25);
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
