import { type PendingEvent } from '../state/pending-event.ts';
import { pendingDrop, type PendingDrop } from './pending-drop.ts';
import { MAX_PENDING, MAX_PENDING_PER_EVENT } from './queue-limits.ts';

/**
 * Bring the queue back inside its caps, deterministically.
 *
 * THE ORDER MUST BE TOTAL, not merely a sort. If two entries ever compare equal, the result
 * depends on the input permutation — and the input permutation depends on the order effects
 * happened to be applied in, which is exactly the kind of thing that differs between a replay
 * and the original. `(latestLeg, scheduledAtLeg, eventId, insertionIndex)` ends in an index,
 * so ties are impossible by construction. `evict-pending.test.ts` proves it by evicting from
 * every permutation of the same set and asserting one answer.
 *
 * WHAT GETS EVICTED: the entry due FURTHEST OUT. An entry due soon is a promise about the
 * near future and the most likely to pay off; one due twenty legs away on a twenty-four-leg
 * route is speculative, and if the run ends first it was never going to pay off anyway.
 *
 * The per-event cap runs first, so a single repeated promise cannot crowd out three different
 * ones before the global cap even applies.
 */
export type EvictResult = {
  readonly pending: readonly PendingEvent[];
  readonly dropped: readonly PendingDrop[];
};

type Indexed = { readonly entry: PendingEvent; readonly index: number };

/** Ascending: soonest-due first. Compares strings with `<`, never `localeCompare`. */
function compare(a: Indexed, b: Indexed): number {
  if (a.entry.latestLeg !== b.entry.latestLeg) return a.entry.latestLeg - b.entry.latestLeg;
  if (a.entry.scheduledAtLeg !== b.entry.scheduledAtLeg) {
    return a.entry.scheduledAtLeg - b.entry.scheduledAtLeg;
  }
  if (a.entry.eventId !== b.entry.eventId) return a.entry.eventId < b.entry.eventId ? -1 : 1;
  return a.index - b.index;
}

export function evictPending(
  pending: readonly PendingEvent[],
  atLeg: number,
  maxPending: number = MAX_PENDING,
  maxPerEvent: number = MAX_PENDING_PER_EVENT,
): EvictResult {
  const indexed: Indexed[] = pending.map((entry, index) => ({ entry, index }));
  const ordered = [...indexed].sort(compare);

  const dropped: PendingDrop[] = [];
  const survivors = new Set<number>();
  const perEvent = new Map<string, number>();

  for (const item of ordered) {
    const seen = perEvent.get(item.entry.eventId) ?? 0;
    if (seen >= maxPerEvent) {
      dropped.push(pendingDrop(item.entry, 'evicted-per-event-cap', atLeg));
      continue;
    }
    perEvent.set(item.entry.eventId, seen + 1);
    survivors.add(item.index);
  }

  // Global cap: keep the soonest-due, drop from the tail of the ordering.
  const kept = ordered.filter((item) => survivors.has(item.index));
  for (const item of kept.slice(maxPending)) {
    survivors.delete(item.index);
    dropped.push(pendingDrop(item.entry, 'evicted-global-cap', atLeg));
  }

  // Rebuilt in INSERTION order, not sorted order: the queue's own order is part of the state
  // digest, and re-sorting it on every schedule would churn the digest for no reason.
  return {
    pending: indexed.filter((item) => survivors.has(item.index)).map((item) => item.entry),
    dropped,
  };
}
