import { type EventId } from '../ids/content-ids.ts';
import { type PendingEvent } from '../state/pending-event.ts';
import { pendingDrop, type PendingDrop } from './pending-drop.ts';

/**
 * Remove entries whose window has closed.
 *
 * Run once per leg. Without it the queue only ever grows, `unresolvedThreads` reports promises
 * that were kept as if they were broken, and the eviction caps start firing on entries that
 * should already have gone.
 *
 * An expired entry is a real signal, not noise: it means an event was scheduled, its window
 * came and went, and it never became eligible. That is the "scheduled N×, fired 0×" case, and
 * it is why the drop is recorded rather than filtered away.
 */
export type ExpireResult = {
  readonly pending: readonly PendingEvent[];
  readonly dropped: readonly PendingDrop[];
};

export function expirePending(pending: readonly PendingEvent[], legIndex: number): ExpireResult {
  const survivors: PendingEvent[] = [];
  const dropped: PendingDrop[] = [];

  for (const entry of pending) {
    if (legIndex > entry.latestLeg) dropped.push(pendingDrop(entry, 'expired', legIndex));
    else survivors.push(entry);
  }

  return { pending: survivors, dropped };
}

/**
 * Consume the queue entry that just fired, and drop its siblings.
 *
 * THIS IS THE DEDUPE-AT-FIRE-TIME half of ADR 0001's decision to keep duplicate schedules
 * separate. Three bribes queue three promises; one of them is kept, and the other two are
 * dropped as `superseded` rather than lingering to fire the same payoff twice.
 *
 * Without this the queue never shrinks on success either — the entry stays, and only
 * `maxOccurrences` stops the event re-firing every leg of its window. That is a filter doing
 * the queue's job, and it would leave every fired promise showing up as an unresolved thread
 * in the journal.
 */
export function consumePending(
  pending: readonly PendingEvent[],
  eventId: EventId,
  legIndex: number,
): ExpireResult {
  const survivors: PendingEvent[] = [];
  const dropped: PendingDrop[] = [];
  let fired = false;

  for (const entry of pending) {
    if (entry.eventId !== eventId) {
      survivors.push(entry);
      continue;
    }
    // The first match is the one that fired; the rest were promises about the same thing.
    dropped.push(pendingDrop(entry, fired ? 'superseded' : 'fired', legIndex));
    fired = true;
  }

  return { pending: survivors, dropped };
}
