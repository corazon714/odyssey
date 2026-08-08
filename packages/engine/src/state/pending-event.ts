import { type EventId } from '../ids/content-ids.ts';
import { type Predicate } from '../predicate/predicate.ts';

/**
 * The consequence queue — the ONE sanctioned soft pointer between events (ADR 0001).
 *
 * It differs from the forbidden `nextEventId` in every way that matters: it is a request
 * rather than a guarantee, it resolves over a leg RANGE rather than immediately, it carries
 * its own `requires`, and the director may decline it. If the target disappears the entry is
 * dropped — a no-op, not a broken link.
 *
 * `scheduledAtLeg` is the origin, and it is what makes a route change survivable: rebasing
 * shifts the window by the leg delta rather than voiding it. Without it a reroute silently
 * kills every pending consequence, which is exactly the "scheduled 2140x, fired 0x" bug the
 * sim report exists to detect.
 *
 * `source` is provenance. It is why duplicate schedules of the same eventId are kept
 * SEPARATE rather than merged: merging [4,12] and [2,6] into [2,12] invents an intent
 * neither author had, and destroys the fact the journal wants — which guard, at which pass.
 */
export type PendingEvent = {
  readonly eventId: EventId;
  readonly earliestLeg: number;
  readonly latestLeg: number;
  readonly scheduledAtLeg: number;
  readonly source: EventId;
  readonly requires: Predicate | null;
  readonly payload: Readonly<Record<string, string | number | boolean>> | null;
};
