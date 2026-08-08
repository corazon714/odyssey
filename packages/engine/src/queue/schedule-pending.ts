import { type PendingEvent } from '../state/pending-event.ts';
import { evictPending, type EvictResult } from './evict-pending.ts';

/**
 * Append a promise, then bring the queue back inside its caps.
 *
 * Append-then-evict rather than reject-if-full, and the difference matters: the new entry
 * competes on the same total order as everything already queued, so a promise due next leg
 * displaces one due twenty legs out instead of being turned away at the door. Rejecting at
 * the door would make the queue's contents depend on arrival order rather than on value.
 *
 * Duplicates are NOT merged here (ADR 0001, ADR 0008). Merging `[4,12]` with `[2,6]` invents
 * an intent neither author had and destroys the `source` provenance the journal wants —
 * "the guard you bribed at the mountain pass" needs to know which pass. They are deduped at
 * fire time by `consumePending`.
 */
export function schedulePending(
  pending: readonly PendingEvent[],
  entry: PendingEvent,
  atLeg: number,
): EvictResult {
  return evictPending([...pending, entry], atLeg);
}
