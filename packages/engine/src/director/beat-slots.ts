import { type BeatType } from '../content/beat-type.ts';
import { type ContentPack } from '../content/content-pack.ts';
import { type BeatSlot } from '../state/beat-slot.ts';
import { type RouteState } from '../state/route-state.ts';

/**
 * The lifecycle of a beat slot: due → filled, or due → slid → expired.
 *
 * `legIndex` NEVER MOVES. A slot is due over the window `[legIndex, legIndex + slackLegs]`,
 * and sliding is expressed by the `slid` status rather than by mutating the leg. The
 * alternative — advancing `legIndex` and decrementing `slackLegs` — reads more naturally right
 * up until you want to report "the midpoint crisis was scheduled for leg 12 and fired at 14",
 * at which point the original is gone. Keeping it fixed costs one comparison and preserves
 * the only number a pacing report actually wants.
 *
 * WHY SLIDE AT ALL. An unfillable slot is a pacing miss the schedule can absorb; firing an
 * event whose context is wrong is a coherence miss that cannot be undone. That asymmetry is
 * also why the beat gate is rung 1 of the relaxation ladder (ADR 0010 §4) — it is the cheapest
 * thing to give up.
 */
export function isSlotOpen(slot: BeatSlot, legIndex: number): boolean {
  if (slot.status === 'filled' || slot.status === 'expired') return false;
  return legIndex >= slot.legIndex && legIndex <= slot.legIndex + slot.slackLegs;
}

/** The slot the director should try to fill this leg, if any. */
export function dueBeatSlot(route: RouteState, legIndex: number): BeatSlot | null {
  for (const slot of route.beatSchedule) {
    if (isSlotOpen(slot, legIndex)) return slot;
  }
  return null;
}

export type BeatScheduleUpdate = {
  readonly beatSchedule: readonly BeatSlot[];
  readonly filled: BeatType | null;
  readonly slid: readonly BeatType[];
  readonly expired: readonly BeatType[];
};

/**
 * Advance every open slot after the director has chosen.
 *
 * `filledType` is the beat type of the event that fired, or null. AT MOST ONE SLOT IS FILLED
 * PER LEG — still true, but no longer for the reason this comment gave until M3.12.
 *
 * The old reason was "because exactly one event fires per leg", and ADR 0029's quiet-leg gate
 * makes that false: a leg can now fire nothing at all. The invariant survives on two
 * independent legs, neither of which is the old one.
 *
 *   1. A leg still presents AT MOST one selection, so `filledType` names at most one type. The
 *      gate removed the floor of one event per leg; it did not raise the ceiling.
 *   2. A leg with an open slot is FORCED-FIRE (ADR 0029 D3) — `advanceLeg` checks `dueBeatSlot`
 *      before it draws the gate — so the gate can only silence a leg that had no slot to fill.
 *      A quiet leg therefore reaches this function with `filledType: null` AND no open slot,
 *      which means the map below is a no-op: nothing fills, nothing slides, nothing expires.
 *
 * That second point is the one worth holding onto. Without it the gate would quietly convert
 * beat MISSES into beat EXPIRIES at whatever rate it silenced legs, and the beat-miss rate — a
 * signal about content — would start measuring the odds instead.
 *
 * A slot that reaches the end of its slack without being filled is EXPIRED AND REPORTED. The
 * sim turns that into a beat-miss rate, which is a balance signal — content that cannot fill
 * its own scheduled beats — rather than an error.
 */
export function advanceBeatSchedule(
  route: RouteState,
  legIndex: number,
  filledType: BeatType | null,
): BeatScheduleUpdate {
  const slid: BeatType[] = [];
  const expired: BeatType[] = [];
  let filled: BeatType | null = null;

  const beatSchedule = route.beatSchedule.map((slot) => {
    if (!isSlotOpen(slot, legIndex)) return slot;

    // The slot the fired event belongs to. `filled === null` guard keeps this to one slot per
    // leg even if a schedule somehow declares two of the same type in one window.
    if (filledType !== null && slot.type === filledType && filled === null) {
      filled = slot.type;
      return { ...slot, status: 'filled' as const };
    }

    if (legIndex >= slot.legIndex + slot.slackLegs) {
      expired.push(slot.type);
      return { ...slot, status: 'expired' as const };
    }

    slid.push(slot.type);
    return slot.status === 'slid' ? slot : { ...slot, status: 'slid' as const };
  });

  return { beatSchedule, filled, slid, expired };
}

/**
 * Beat types a route schedules that the pack has no event to fill.
 *
 * A content bug of exactly the kind ADR 0001 warns is silent: the slot opens, nothing is
 * eligible, it slides, it expires, and the only trace is a beat-miss rate that looks like a
 * balance problem. Surfacing it against the pack turns it back into what it is.
 */
export function unfillableBeats(route: RouteState, pack: ContentPack): readonly BeatType[] {
  const missing = new Set<BeatType>();
  for (const slot of route.beatSchedule) {
    if (!pack.byBeatType.has(slot.type)) missing.add(slot.type);
  }
  return [...missing];
}
