/**
 * How hard an event competes for a leg.
 *
 * `beat` is not "more important than normal" — it is a different POOL. A beat event is only
 * eligible when a matching beat slot is due, and excluded otherwise, so its weight competes
 * with other beats rather than with ordinary events. That is why its scoring boost is 1.0:
 * the gate already did the work (see the M7 scoring table).
 *
 * `filler` is the ladder's floor. Rung 6 falls back to filler-only, so a pack needs at least
 * two per transport mode or the director drops through to `uneventful` more often than the
 * 2% target allows.
 */
export const EVENT_PRIORITIES = ['filler', 'normal', 'beat', 'critical'] as const;

export type EventPriority = (typeof EVENT_PRIORITIES)[number];
