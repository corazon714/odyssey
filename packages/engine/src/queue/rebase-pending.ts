import { type PendingEvent } from '../state/pending-event.ts';
import { pendingDrop, type PendingDrop } from './pending-drop.ts';

/**
 * Move the queue onto a new route.
 *
 * NOTHING CALLS THIS YET, and that is deliberate. Re-routing needs route generation, which is
 * Phase 2. But the queue's shape — absolute leg windows plus `scheduledAtLeg` — was chosen
 * specifically so that a route change could be survived rather than voided, and a shape
 * chosen for a capability nobody has implemented is a shape nobody has checked. The TEST is
 * the deliverable; wiring it is a one-line change when re-routing lands.
 *
 * COMPRESS, DO NOT DROP. An entry whose window falls past the new `legCount` is clamped into
 * the legs that remain rather than discarded. Dropping would produce exactly the failure ADR
 * 0001 names — "scheduled 2140×, fired 0×" — every time a player took a detour, and the
 * long-range payoff rate is a headline number in the sim report precisely because that class
 * of loss is otherwise invisible.
 *
 * An entry whose `earliestLeg` is already behind the current leg is CLAMPED FORWARD, not
 * dropped: the promise is still good, it just becomes due immediately.
 */
export type Rebase = {
  /** How far the current leg moved. Positive when the new route is further along. */
  readonly legDelta: number;
  readonly newLegIndex: number;
  readonly newLegCount: number;
};

export type RebaseResult = {
  readonly pending: readonly PendingEvent[];
  readonly dropped: readonly PendingDrop[];
};

export function rebasePendingEvents(
  pending: readonly PendingEvent[],
  rebase: Rebase,
): RebaseResult {
  const lastLeg = rebase.newLegCount - 1;
  const survivors: PendingEvent[] = [];
  const dropped: PendingDrop[] = [];

  for (const entry of pending) {
    // No legs left at all — the only case where an entry is genuinely unfireable.
    if (lastLeg < rebase.newLegIndex) {
      dropped.push(pendingDrop(entry, 'rebase-no-room', rebase.newLegIndex));
      continue;
    }

    const shiftedEarliest = entry.earliestLeg + rebase.legDelta;
    const shiftedLatest = entry.latestLeg + rebase.legDelta;

    // Compress into the legs that remain, then pull the start forward out of the past.
    const latest = Math.min(shiftedLatest, lastLeg);
    const earliest = Math.max(Math.min(shiftedEarliest, latest), rebase.newLegIndex);

    if (earliest > latest) {
      dropped.push(pendingDrop(entry, 'rebase-no-room', rebase.newLegIndex));
      continue;
    }

    survivors.push({
      ...entry,
      earliestLeg: earliest,
      latestLeg: latest,
      // scheduledAtLeg moves with the window so provenance and eviction order stay meaningful
      // on the new route, but never goes negative.
      scheduledAtLeg: Math.max(0, entry.scheduledAtLeg + rebase.legDelta),
    });
  }

  return { pending: survivors, dropped };
}
