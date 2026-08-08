import { type ContentPack } from '../content/content-pack.ts';
import { type EventId } from '../ids/content-ids.ts';
import { type RunState } from '../state/run-state.ts';

/**
 * Reconcile a save against a content pack it was not written for.
 *
 * THE OPPOSITE POLICY TO REPLAY, on purpose. `replayRun` REFUSES a `contentVersion` mismatch,
 * because a tolerant replay proves nothing about determinism. This tolerates one, because
 * content ships in every app update and refusing would delete every in-progress 30-leg run the
 * moment a player updates. Both are correct; they answer different questions.
 *
 * What is dropped and what is kept is decided by whether the data is CONTENT or RUNTIME:
 *
 *   pendingEvents   DROPPED when the target no longer exists. It is a promise about content;
 *                   with the content gone the promise cannot be kept (ADR 0001 — a vanished
 *                   scheduleEvent target is a no-op, never a broken link).
 *   eventMemory     KEPT even for removed events. Dropping loses "you have seen this" if the
 *                   event ever returns, and the entry costs nothing.
 *   history         KEPT VERBATIM. It holds i18n keys, so a removed event degrades to a
 *                   missing key at render time, which i18n-check catches. Rewriting a run's
 *                   own past to match today's content would be the worse failure.
 *   flags           KEPT. Flags are runtime data with no registry to be missing from, and an
 *                   old save may legitimately carry a retired one.
 *   unlockedEndings KEPT. What a player earned is not content's to revoke.
 *
 * `beatSchedule` slots whose type the new pack cannot fill are left alone — they will slide
 * and expire through the normal path, which is already reported.
 */
export type ContentReconciliation = {
  readonly state: RunState;
  readonly droppedPending: readonly EventId[];
  readonly unknownEventMemory: readonly EventId[];
  readonly unfillableBeats: readonly string[];
  readonly changed: boolean;
};

export function reconcileContent(state: RunState, pack: ContentPack): ContentReconciliation {
  const droppedPending: EventId[] = [];
  const pendingEvents = state.pendingEvents.filter((entry) => {
    if (pack.byId.has(entry.eventId)) return true;
    droppedPending.push(entry.eventId);
    return false;
  });

  // Reported, NOT removed. The sim counts these as content drift; the run keeps its memory.
  const unknownEventMemory = Object.keys(state.eventMemory)
    .filter((id) => !pack.byId.has(id as EventId))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)) as EventId[];

  const unfillableBeats = state.route.beatSchedule
    .filter((slot) => slot.status !== 'filled' && slot.status !== 'expired')
    .map((slot) => slot.type)
    .filter((type) => !pack.byBeatType.has(type));

  const changed = droppedPending.length > 0 || state.contentVersion !== pack.version;

  return {
    state: changed ? { ...state, contentVersion: pack.version, pendingEvents } : state,
    droppedPending,
    unknownEventMemory,
    unfillableBeats: [...new Set(unfillableBeats)],
    changed,
  };
}
