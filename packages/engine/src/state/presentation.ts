import { type EventId } from '../ids/content-ids.ts';

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
    }
  | { readonly kind: 'uneventful'; readonly presentedAtLeg: number; readonly reasonKey: string };

export const NO_PRESENTATION: Presentation = Object.freeze({ kind: 'none' });
