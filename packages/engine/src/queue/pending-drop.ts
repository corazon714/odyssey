import { type PendingEvent } from '../state/pending-event.ts';
import { type PendingDropReason } from './queue-limits.ts';

/**
 * A record that something left the queue.
 *
 * ADR 0001 accepts that content bugs in a Quality-Based Narrative are silent, and names
 * "scheduled 2140×, fired 0×" as the shape of the worst of them. A queue that dropped entries
 * quietly would make that line unreadable — you could not tell a payoff that never became
 * eligible from one that was evicted to make room.
 *
 * So every departure is reported, with its reason, and the sim aggregates them.
 */
export type PendingDrop = {
  readonly entry: PendingEvent;
  readonly reason: PendingDropReason;
  readonly atLeg: number;
};

export const NO_DROPS: readonly PendingDrop[] = Object.freeze([]);

export function pendingDrop(
  entry: PendingEvent,
  reason: PendingDropReason,
  atLeg: number,
): PendingDrop {
  return { entry, reason, atLeg };
}
