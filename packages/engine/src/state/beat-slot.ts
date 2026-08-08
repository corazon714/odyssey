import { type BeatType } from '../content/beat-type.ts';

/**
 * A typed claim on a leg — never a pointer to an event.
 *
 * `legIndex` is a concrete integer, not a fraction. "Beats are never at fixed leg indices"
 * is a statement about the GENERATOR, which places them at fractions of legCount with
 * seeded jitter; the stored artefact has to be concrete or it is neither filterable nor
 * replayable nor inspectable.
 *
 * Generation is out of Phase 1 (leg density needs terrain data and sim tuning), so the
 * schedule arrives via RunInit and the engine validates it. Consumption — the beat gate,
 * sliding, expiry — lands in M9.
 *
 * `slackLegs` is how far forward an unfillable slot may slide before expiring. Sliding
 * rather than dropping is deliberate: a missed beat is a pacing failure the slot can absorb,
 * whereas firing the wrong event is a coherence failure that cannot be undone.
 */
export const BEAT_SLOT_STATUSES = ['pending', 'filled', 'slid', 'expired'] as const;
export type BeatSlotStatus = (typeof BEAT_SLOT_STATUSES)[number];

export type BeatSlot = {
  readonly legIndex: number;
  readonly type: BeatType;
  readonly slackLegs: number;
  readonly status: BeatSlotStatus;
};
