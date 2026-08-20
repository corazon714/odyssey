import { describe, expect, it } from 'vitest';
import { createContentPack } from '../../content/content-pack.ts';
import { type BeatSlot } from '../../state/beat-slot.ts';
import { type RouteState } from '../../state/route-state.ts';
import { makeRoute } from '../../state/__tests__/support/make-route.ts';
import { loadMiniPack } from '../../__tests__/support/load-fixtures.ts';
import { advanceBeatSchedule, dueBeatSlot, isSlotOpen, unfillableBeats } from '../beat-slots.ts';

const { events, registries } = loadMiniPack();
const PACK = createContentPack(events, registries);

const slot = (overrides: Partial<BeatSlot> = {}): BeatSlot => ({
  legIndex: 5,
  type: 'midpoint_crisis',
  slackLegs: 2,
  status: 'pending',
  ...overrides,
});

const routeWith = (...slots: BeatSlot[]): RouteState =>
  makeRoute({ legCount: 24, beatSchedule: slots, legLocations: Array(24).fill('roadside') });

describe('isSlotOpen', () => {
  it('is open across the whole slack window, not just the scheduled leg', () => {
    const s = slot({ legIndex: 5, slackLegs: 2 });
    expect(isSlotOpen(s, 4)).toBe(false);
    expect(isSlotOpen(s, 5)).toBe(true);
    expect(isSlotOpen(s, 6)).toBe(true);
    expect(isSlotOpen(s, 7)).toBe(true);
    expect(isSlotOpen(s, 8)).toBe(false);
  });

  it('is closed once filled or expired', () => {
    expect(isSlotOpen(slot({ status: 'filled' }), 5)).toBe(false);
    expect(isSlotOpen(slot({ status: 'expired' }), 5)).toBe(false);
  });

  it('stays open after sliding', () => {
    // The whole point of sliding: the slot is still fillable on a later leg.
    expect(isSlotOpen(slot({ status: 'slid' }), 6)).toBe(true);
  });

  it('has zero width when slackLegs is zero', () => {
    const tight = slot({ legIndex: 5, slackLegs: 0 });
    expect(isSlotOpen(tight, 5)).toBe(true);
    expect(isSlotOpen(tight, 6)).toBe(false);
  });
});

describe('dueBeatSlot', () => {
  it('finds the open slot for the leg', () => {
    expect(dueBeatSlot(routeWith(slot({ legIndex: 5 })), 5)?.type).toBe('midpoint_crisis');
  });

  it('returns null when nothing is open', () => {
    expect(dueBeatSlot(routeWith(slot({ legIndex: 5 })), 1)).toBeNull();
  });
});

describe('advanceBeatSchedule', () => {
  it('fills the slot the fired event belongs to', () => {
    const update = advanceBeatSchedule(routeWith(slot()), 5, 'midpoint_crisis');
    expect(update.filled).toBe('midpoint_crisis');
    expect(update.beatSchedule[0]?.status).toBe('filled');
    expect(update.slid).toEqual([]);
    expect(update.expired).toEqual([]);
  });

  it('slides an unfilled slot that still has slack', () => {
    const update = advanceBeatSchedule(routeWith(slot({ legIndex: 5, slackLegs: 2 })), 5, null);
    expect(update.slid).toEqual(['midpoint_crisis']);
    expect(update.beatSchedule[0]?.status).toBe('slid');
    // legIndex NEVER moves — the original is what a pacing report wants to know.
    expect(update.beatSchedule[0]?.legIndex).toBe(5);
  });

  it('expires a slot at the end of its slack', () => {
    const update = advanceBeatSchedule(routeWith(slot({ legIndex: 5, slackLegs: 2 })), 7, null);
    expect(update.expired).toEqual(['midpoint_crisis']);
    expect(update.beatSchedule[0]?.status).toBe('expired');
  });

  it('expires immediately when there is no slack', () => {
    const update = advanceBeatSchedule(routeWith(slot({ legIndex: 5, slackLegs: 0 })), 5, null);
    expect(update.expired).toEqual(['midpoint_crisis']);
  });

  it('a filled slot cannot be re-filled on a later leg', () => {
    // The M9 defect this closes: before slot consumption a beat stayed `pending` forever.
    const filled = advanceBeatSchedule(routeWith(slot()), 5, 'midpoint_crisis');
    const again = advanceBeatSchedule(routeWith(...filled.beatSchedule), 6, 'midpoint_crisis');
    expect(again.filled).toBeNull();
    expect(again.beatSchedule[0]?.status).toBe('filled');
  });

  it('leaves slots outside their window untouched', () => {
    const route = routeWith(slot({ legIndex: 20, slackLegs: 1 }));
    const update = advanceBeatSchedule(route, 5, null);
    expect(update.beatSchedule[0]).toBe(route.beatSchedule[0]);
    expect(update.slid).toEqual([]);
  });

  it('fills at most one slot per leg', () => {
    const update = advanceBeatSchedule(
      routeWith(slot({ legIndex: 5 }), slot({ legIndex: 5, slackLegs: 3 })),
      5,
      'midpoint_crisis',
    );
    expect(update.beatSchedule.filter((s) => s.status === 'filled')).toHaveLength(1);
  });

  it('a quiet leg cannot slide or expire anything (ADR 0029 D3)', () => {
    // The rewritten invariant at the top of `advanceBeatSchedule`. A quiet leg reaches this
    // function with `filledType: null`, and it can only BE quiet on a leg with no open slot —
    // `advanceLeg` checks `dueBeatSlot` before it draws the gate. So the schedule is untouched,
    // and the beat-miss rate keeps measuring content rather than starting to measure the odds.
    const route = routeWith(slot({ legIndex: 5, slackLegs: 2 }));
    const quietLeg = 9; // outside the window, which is what "no open slot" means here
    expect(dueBeatSlot(route, quietLeg)).toBeNull();

    const update = advanceBeatSchedule(route, quietLeg, null);
    expect(update).toEqual({
      beatSchedule: route.beatSchedule,
      filled: null,
      slid: [],
      expired: [],
    });
  });

  it('is pure', () => {
    const route = routeWith(slot());
    const before = JSON.stringify(route);
    advanceBeatSchedule(route, 5, 'midpoint_crisis');
    expect(JSON.stringify(route)).toBe(before);
  });
});

describe('unfillableBeats', () => {
  it('is empty when the pack can fill everything the route schedules', () => {
    expect(unfillableBeats(routeWith(slot({ type: 'midpoint_crisis' })), PACK)).toEqual([]);
  });

  it('names a beat type no event can fill', () => {
    // A silent content bug otherwise: the slot opens, nothing is eligible, it slides, it
    // expires, and the only trace is a beat-miss rate that looks like a balance problem.
    expect(unfillableBeats(routeWith(slot({ type: 'ferry_boarding' })), PACK)).toEqual([
      'ferry_boarding',
    ]);
  });

  it('is reported by the pack itself', () => {
    // The fixture pack fills three of the six declared beat types.
    expect([...PACK.unfillableBeatTypes].sort()).toEqual([
      'approach',
      'departure',
      'ferry_boarding',
    ]);
  });
});
