import { describe, expect, it } from 'vitest';
import { advanceClock, createClock, timeOfDayFor, TIMES_OF_DAY } from '../clock-state.ts';

describe('advanceClock', () => {
  it('advances within a day', () => {
    expect(advanceClock({ day: 0, hour: 8, weekday: 1 }, 5)).toEqual({
      day: 0,
      hour: 13,
      weekday: 1,
    });
  });

  it('rolls over midnight', () => {
    expect(advanceClock({ day: 2, hour: 22, weekday: 6 }, 4)).toEqual({
      day: 3,
      hour: 2,
      weekday: 0,
    });
  });

  it('handles multi-day jumps', () => {
    // A detained outcome can cost 14+ hours; a ferry can cost days.
    expect(advanceClock({ day: 0, hour: 10, weekday: 0 }, 72)).toEqual({
      day: 3,
      hour: 10,
      weekday: 3,
    });
  });

  it('wraps the weekday over many weeks', () => {
    const after = advanceClock({ day: 0, hour: 0, weekday: 5 }, 24 * 30);
    expect(after.day).toBe(30);
    expect(after.weekday).toBe((5 + 30) % 7);
    expect(after.weekday).toBeGreaterThanOrEqual(0);
    expect(after.weekday).toBeLessThanOrEqual(6);
  });

  it('never moves time backwards', () => {
    // An effect subtracting hours would let a run revisit a past day and silently break
    // every expiresAtLeg/expiresDay deadline.
    const clock = { day: 4, hour: 9, weekday: 2 } as const;
    expect(advanceClock(clock, -10)).toEqual(clock);
    expect(advanceClock(clock, 0)).toEqual(clock);
  });

  it('truncates fractional hours rather than producing a fractional clock', () => {
    expect(advanceClock({ day: 0, hour: 0, weekday: 0 }, 1.9).hour).toBe(1);
  });

  it('is pure', () => {
    const clock = createClock(3, 6);
    advanceClock(clock, 100);
    expect(clock).toEqual({ day: 0, hour: 6, weekday: 3 });
  });
});

describe('timeOfDayFor', () => {
  it('covers all 24 hours with a known band', () => {
    for (let hour = 0; hour < 24; hour += 1) {
      expect(TIMES_OF_DAY).toContain(timeOfDayFor(hour));
    }
  });

  it('maps the band boundaries', () => {
    expect(timeOfDayFor(5)).toBe('morning');
    expect(timeOfDayFor(11)).toBe('morning');
    expect(timeOfDayFor(12)).toBe('afternoon');
    expect(timeOfDayFor(16)).toBe('afternoon');
    expect(timeOfDayFor(17)).toBe('evening');
    expect(timeOfDayFor(21)).toBe('evening');
    expect(timeOfDayFor(22)).toBe('night');
    expect(timeOfDayFor(4)).toBe('night');
    expect(timeOfDayFor(0)).toBe('night');
  });
});
