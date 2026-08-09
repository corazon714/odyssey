import { type ComplicationId, type EventId } from '../ids/content-ids.ts';

/**
 * What the player is currently looking at. NOT in engine-spec 1 — added deliberately.
 *
 * `resolveChoice` has to know which event the choice belongs to. Without this field the
 * caller must pass the eventId back in, which puts a piece of engine state in the app layer
 * and makes it possible for the UI to answer a question the engine never asked (CLAUDE.md
 * 2.7). Keeping it in RunState also means the loop's position survives a save: closing the
 * app mid-event and reopening it lands on the same event rather than silently skipping it.
 *
 * `kind: 'none'` is the state between legs. `kind: 'uneventful'` is a leg the director could
 * not fill — a real, presentable outcome rather than an error (see the relaxation ladder).
 */
export type Presentation =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'event';
      readonly eventId: EventId;
      readonly presentedAtLeg: number;
      /** Relaxation rung the director reached, 0 = nothing relaxed. Fed to the sim. */
      readonly rung: number;
      /**
       * The complication the director attached, or null. PERSISTED rather than recomputed, and
       * that is the decision this field exists to record.
       *
       * `resolveChoice` runs on a LATER call than `advanceLeg`, against a state selection never
       * saw: `advance-leg.ts` rewrites `pendingEvents`, `route.beatSchedule` and `rngCursors`
       * after `selectEvent` returns. Re-deriving there is stable only by accident — no
       * predicate kind reads the queue TODAY, and nothing says one never will. The two call
       * sites also build different `chanceScope`s (route id vs event id), so a `{ chance: p }`
       * inside a complication's `requires` would answer differently at each.
       *
       * The decisive case is reload. `reconcileContent` TOLERATES a `contentVersion` mismatch,
       * so a player who closes the app mid-event and reopens after an update would have the
       * complication re-derived against the NEW `complications.yaml` — silently changing the DC
       * and the choices they already read. A persisted id that no longer resolves degrades to
       * no-complication in one `Map.get`, which is the same policy the queue already applies to
       * a pending event whose target vanished. See ADR 0021.
       */
      readonly complicationId: ComplicationId | null;
    }
  | { readonly kind: 'uneventful'; readonly presentedAtLeg: number; readonly reasonKey: string };

export const NO_PRESENTATION: Presentation = Object.freeze({ kind: 'none' });
