/**
 * In-game time. Nothing here reads the host clock — CLAUDE.md 2.3 permits exactly one
 * wall-clock read in the repository, and it is in the app layer.
 *
 * Time only moves forward: `advanceClock` treats a negative delta as zero rather than
 * rewinding, because an effect that subtracted hours would let a run revisit a past day and
 * silently break every `expiresAtLeg`/`expiresDay` deadline.
 */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type ClockState = {
  readonly day: number;
  readonly hour: number;
  readonly weekday: Weekday;
};

export const HOURS_PER_DAY = 24;
export const DAYS_PER_WEEK = 7;

export function createClock(startWeekday: Weekday = 0, startHour = 8): ClockState {
  return { day: 0, hour: startHour, weekday: startWeekday };
}

export function advanceClock(clock: ClockState, hours: number): ClockState {
  const delta = hours > 0 ? Math.floor(hours) : 0;
  const totalHours = clock.hour + delta;
  const daysPassed = Math.floor(totalHours / HOURS_PER_DAY);

  return {
    day: clock.day + daysPassed,
    hour: totalHours % HOURS_PER_DAY,
    weekday: ((((clock.weekday + daysPassed) % DAYS_PER_WEEK) + DAYS_PER_WEEK) %
      DAYS_PER_WEEK) as Weekday,
  };
}

/**
 * The four time-of-day bands events filter on (engine-spec 2 `context.timeOfDay`).
 *
 * Boundaries are fixed rather than seasonal: a solar model would make the same seed behave
 * differently at different points on the route, which is a lot of simulation cost for a
 * distinction the player cannot see in a text game.
 */
export const TIMES_OF_DAY = ['morning', 'afternoon', 'evening', 'night'] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];

export function timeOfDayFor(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}
