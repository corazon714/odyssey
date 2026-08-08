import { type ContentPack } from '../content/content-pack.ts';
import { type EventId } from '../ids/content-ids.ts';
import { type RunState } from '../state/run-state.ts';

/**
 * The promises a run ended without keeping.
 *
 * THE QUEUE SURVIVES AN ENDING. It would have been simpler to clear it on `status: 'ended'`,
 * and it would have thrown away the two things it is worth most for:
 *
 *   - **The journal.** "Dmitri never found you" is a better closing line than silence, and
 *     design pillar 1 — consequence over difficulty — is about the story a run leaves behind.
 *   - **The sim.** ADR 0001 names "scheduled 2140×, fired 0×" as the shape of a whole class of
 *     silent content bug. A queue cleared at the end would make it unobservable.
 *
 * `known: false` marks a thread whose target no longer exists in the pack — content changed
 * under a save. Reported rather than filtered, so a content update that orphans a payoff shows
 * up as a number instead of as nothing.
 */
export type UnresolvedThread = {
  readonly eventId: EventId;
  readonly source: EventId;
  readonly scheduledAtLeg: number;
  readonly earliestLeg: number;
  readonly latestLeg: number;
  readonly known: boolean;
  readonly labelKey: string;
};

export function unresolvedThreads(state: RunState, pack: ContentPack): readonly UnresolvedThread[] {
  return state.pendingEvents.map((entry) => ({
    eventId: entry.eventId,
    source: entry.source,
    scheduledAtLeg: entry.scheduledAtLeg,
    earliestLeg: entry.earliestLeg,
    latestLeg: entry.latestLeg,
    known: pack.byId.has(entry.eventId),
    labelKey: `journal.thread.${entry.eventId}`,
  }));
}
