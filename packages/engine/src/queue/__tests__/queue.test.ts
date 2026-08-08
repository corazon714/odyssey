import { describe, expect, it } from 'vitest';
import { createContentPack } from '../../content/content-pack.ts';
import { eventId } from '../../ids/content-ids.ts';
import { createRunState } from '../../state/create-run-state.ts';
import { createRunInit } from '../../state/run-init.ts';
import { type PendingEvent } from '../../state/pending-event.ts';
import { type RunState } from '../../state/run-state.ts';
import { makeRoute } from '../../state/__tests__/support/make-route.ts';
import { loadMiniPack } from '../../__tests__/support/load-fixtures.ts';
import { evictPending } from '../evict-pending.ts';
import { consumePending, expirePending } from '../expire-pending.ts';
import { MAX_PENDING, MAX_PENDING_PER_EVENT } from '../queue-limits.ts';
import { rebasePendingEvents } from '../rebase-pending.ts';
import { schedulePending } from '../schedule-pending.ts';
import { unresolvedThreads } from '../unresolved-threads.ts';

const { events, registries } = loadMiniPack();
const PACK = createContentPack(events, registries);

function entry(overrides: Partial<PendingEvent> = {}): PendingEvent {
  return {
    eventId: eventId('border.guard_remembers'),
    earliestLeg: 4,
    latestLeg: 12,
    scheduledAtLeg: 0,
    source: eventId('border.bribe_attempt'),
    requires: null,
    payload: null,
    ...overrides,
  };
}

function makeState(overrides: Partial<RunState> = {}): RunState {
  const result = createRunState(createRunInit('queue-seed', PACK.version, makeRoute()));
  if (!result.ok) throw new Error('fixture route rejected');
  return { ...result.state, status: 'travelling', ...overrides };
}

/** Every permutation of a small array — the only honest way to test a "total" order. */
function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 1) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    const head = items[i];
    if (head === undefined) continue;
    for (const tail of permutations(rest)) out.push([head, ...tail]);
  }
  return out;
}

describe('evictPending — the total order', () => {
  it('produces the same survivors from every input permutation', () => {
    // If two entries ever compare equal the result depends on arrival order, which differs
    // between a replay and the original run. The order ends in an insertion index so ties are
    // impossible by construction; this proves it rather than assuming it.
    const set: PendingEvent[] = [
      entry({ eventId: eventId('a'), latestLeg: 10, scheduledAtLeg: 1 }),
      entry({ eventId: eventId('b'), latestLeg: 10, scheduledAtLeg: 1 }),
      entry({ eventId: eventId('c'), latestLeg: 5, scheduledAtLeg: 1 }),
      entry({ eventId: eventId('d'), latestLeg: 10, scheduledAtLeg: 0 }),
    ];

    const answers = new Set(
      permutations(set).map((order) =>
        evictPending(order, 0, 2)
          .pending.map((e) => e.eventId)
          .sort()
          .join(','),
      ),
    );

    expect(answers.size).toBe(1);
  });

  it('keeps the soonest-due and evicts the furthest out', () => {
    const kept = evictPending(
      [
        entry({ eventId: eventId('far'), latestLeg: 30 }),
        entry({ eventId: eventId('soon'), latestLeg: 5 }),
      ],
      0,
      1,
    );
    expect(kept.pending.map((e) => e.eventId)).toEqual(['soon']);
    expect(kept.dropped[0]?.reason).toBe('evicted-global-cap');
  });

  it('applies the per-event cap before the global one', () => {
    // Otherwise one repeated promise could crowd out three different ones before the global
    // cap even applies.
    const many = Array.from({ length: 6 }, (_, i) =>
      entry({ eventId: eventId('same'), latestLeg: 5 + i }),
    );
    const result = evictPending(many, 0);

    expect(result.pending).toHaveLength(MAX_PENDING_PER_EVENT);
    expect(result.dropped.every((d) => d.reason === 'evicted-per-event-cap')).toBe(true);
  });

  it('preserves insertion order among survivors', () => {
    // The queue's own order is part of the state digest; re-sorting on every schedule would
    // churn it for no reason.
    const set = [
      entry({ eventId: eventId('z'), latestLeg: 20 }),
      entry({ eventId: eventId('a'), latestLeg: 30 }),
    ];
    expect(evictPending(set, 0).pending.map((e) => e.eventId)).toEqual(['z', 'a']);
  });

  it('is a no-op below the caps, and records nothing', () => {
    const result = evictPending([entry()], 0);
    expect(result.pending).toHaveLength(1);
    expect(result.dropped).toEqual([]);
  });
});

describe('schedulePending', () => {
  it('lets a soon-due arrival displace a far-out incumbent', () => {
    // Append-then-evict, not reject-if-full: the newcomer competes on value rather than being
    // turned away at the door.
    const full = Array.from({ length: MAX_PENDING }, (_, i) =>
      entry({ eventId: eventId(`e${String(i)}`), latestLeg: 100 + i }),
    );
    const result = schedulePending(full, entry({ eventId: eventId('urgent'), latestLeg: 2 }), 0);

    expect(result.pending.map((e) => e.eventId)).toContain('urgent');
    expect(result.pending).toHaveLength(MAX_PENDING);
    expect(result.dropped).toHaveLength(1);
  });

  it('keeps duplicates separate rather than merging windows', () => {
    // Merging [4,12] with [2,6] would invent an intent neither author had and destroy the
    // `source` provenance the journal needs (ADR 0001).
    const first = schedulePending([], entry({ earliestLeg: 4, latestLeg: 12 }), 0);
    const second = schedulePending(
      first.pending,
      entry({ earliestLeg: 2, latestLeg: 6, source: eventId('other.event') }),
      0,
    );

    expect(second.pending).toHaveLength(2);
    expect(second.pending.map((e) => e.earliestLeg)).toEqual([4, 2]);
    expect(second.pending.map((e) => e.source)).toEqual(['border.bribe_attempt', 'other.event']);
  });
});

describe('expirePending and consumePending', () => {
  it('drops entries whose window has closed, and records why', () => {
    const result = expirePending([entry({ latestLeg: 5 }), entry({ latestLeg: 20 })], 10);
    expect(result.pending).toHaveLength(1);
    expect(result.dropped[0]?.reason).toBe('expired');
    expect(result.dropped[0]?.atLeg).toBe(10);
  });

  it('keeps an entry on the last leg of its window', () => {
    expect(expirePending([entry({ latestLeg: 10 })], 10).pending).toHaveLength(1);
  });

  it('consumes the fired entry and supersedes its siblings', () => {
    // The dedupe-at-fire-time half of ADR 0001's keep-duplicates-separate decision.
    const target = eventId('border.guard_remembers');
    const queue = [
      entry({ eventId: target, scheduledAtLeg: 1 }),
      entry({ eventId: eventId('unrelated') }),
      entry({ eventId: target, scheduledAtLeg: 4 }),
    ];

    const result = consumePending(queue, target, 9);
    expect(result.pending.map((e) => e.eventId)).toEqual(['unrelated']);
    expect(result.dropped.map((d) => d.reason)).toEqual(['fired', 'superseded']);
  });

  it('is a no-op for an event that is not queued', () => {
    const queue = [entry()];
    expect(consumePending(queue, eventId('nothing'), 0).pending).toEqual(queue);
  });
});

describe('rebasePendingEvents', () => {
  const base: Rebase0 = { legDelta: 0, newLegIndex: 0, newLegCount: 24 };
  type Rebase0 = Parameters<typeof rebasePendingEvents>[1];

  it('rebasing by zero is the identity', () => {
    const queue = [entry({ earliestLeg: 4, latestLeg: 12 })];
    expect(rebasePendingEvents(queue, base).pending).toEqual(queue);
  });

  it('shifts windows by the leg delta', () => {
    const result = rebasePendingEvents([entry({ earliestLeg: 4, latestLeg: 12 })], {
      ...base,
      legDelta: 3,
      newLegIndex: 3,
    });
    expect(result.pending[0]).toMatchObject({ earliestLeg: 7, latestLeg: 15, scheduledAtLeg: 3 });
  });

  it('COMPRESSES a window that would fall past the new legCount', () => {
    // Dropping instead would reproduce "scheduled 2140x, fired 0x" every time a player took a
    // detour — which is why the long-range payoff rate is a headline sim number.
    const result = rebasePendingEvents([entry({ earliestLeg: 18, latestLeg: 30 })], {
      legDelta: 0,
      newLegIndex: 5,
      newLegCount: 12,
    });

    expect(result.dropped).toEqual([]);
    expect(result.pending[0]).toMatchObject({ earliestLeg: 11, latestLeg: 11 });
  });

  it('clamps an earliestLeg already in the past rather than dropping it', () => {
    const result = rebasePendingEvents([entry({ earliestLeg: 2, latestLeg: 12 })], {
      legDelta: 0,
      newLegIndex: 7,
      newLegCount: 24,
    });
    expect(result.pending[0]).toMatchObject({ earliestLeg: 7, latestLeg: 12 });
  });

  it('drops only when there is genuinely no leg left', () => {
    const result = rebasePendingEvents([entry()], {
      legDelta: 0,
      newLegIndex: 10,
      newLegCount: 10,
    });
    expect(result.pending).toEqual([]);
    expect(result.dropped[0]?.reason).toBe('rebase-no-room');
  });

  it('never produces an inverted window', () => {
    for (let newCount = 1; newCount <= 30; newCount += 1) {
      for (let delta = -10; delta <= 10; delta += 1) {
        const result = rebasePendingEvents([entry({ earliestLeg: 4, latestLeg: 12 })], {
          legDelta: delta,
          newLegIndex: 3,
          newLegCount: newCount,
        });
        for (const survivor of result.pending) {
          expect(survivor.earliestLeg).toBeLessThanOrEqual(survivor.latestLeg);
          expect(survivor.earliestLeg).toBeGreaterThanOrEqual(3);
          expect(survivor.latestLeg).toBeLessThanOrEqual(newCount - 1);
        }
      }
    }
  });
});

describe('unresolvedThreads — the queue outlives the run', () => {
  it('reports promises still outstanding at an ending', () => {
    // Clearing the queue on `ended` would have been simpler and would have thrown away both
    // the journal line and the sim's only view of a whole class of content bug.
    const state = makeState({ status: 'ended', pendingEvents: [entry()] });
    const threads = unresolvedThreads(state, PACK);

    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({
      eventId: 'border.guard_remembers',
      source: 'border.bribe_attempt',
      known: true,
    });
    expect(threads[0]?.labelKey).toMatch(/^journal\.thread\./);
  });

  it('marks a thread whose target no longer exists', () => {
    const state = makeState({ pendingEvents: [entry({ eventId: eventId('was.deleted') })] });
    expect(unresolvedThreads(state, PACK)[0]?.known).toBe(false);
  });

  it('is empty for a run that kept its promises', () => {
    expect(unresolvedThreads(makeState(), PACK)).toEqual([]);
  });
});

describe('the queue in a real run', () => {
  it('does not leak entries — a fired promise leaves the queue', () => {
    // The defect M8 found: nothing removed a pending entry when it fired, so every kept
    // promise would have surfaced as an unresolved thread, and only maxOccurrences stopped
    // the payoff re-firing every leg of its window.
    const target = eventId('border.guard_remembers');
    const queue = [entry({ eventId: target })];
    const after = consumePending(queue, target, 9);
    expect(after.pending).toEqual([]);
  });

  it('serialises with the rest of the state', () => {
    const state = makeState({ pendingEvents: [entry(), entry({ eventId: eventId('x') })] });
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});
