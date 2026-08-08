/**
 * Bounds on the consequence queue.
 *
 * `RunState` is persisted to a phone, and a pathological run — one that keeps re-entering the
 * event that schedules a payoff — must not be able to grow it without limit. These are the
 * only two numbers that stop that, so they live together.
 *
 * The per-event cap exists because duplicates are kept SEPARATE (ADR 0001, ADR 0008): merging
 * `[4,12]` with `[2,6]` would invent an intent neither author had, so instead three bribes
 * queue three entries and one of them fires. Without a per-event cap, "keep them separate"
 * would mean an unbounded pile of the same promise.
 */
export const MAX_PENDING = 32;
export const MAX_PENDING_PER_EVENT = 3;

/** Why an entry left the queue. Every departure is recorded; none is silent. */
export const PENDING_DROP_REASONS = [
  'expired',
  'evicted-global-cap',
  'evicted-per-event-cap',
  'rebase-no-room',
  'fired',
  'superseded',
] as const;

export type PendingDropReason = (typeof PENDING_DROP_REASONS)[number];
