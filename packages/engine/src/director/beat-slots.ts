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
 * `filledType` is the beat type of the event that fired, or null. Exactly one slot can be
 * filled per leg because exactly one event fires per leg.
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
