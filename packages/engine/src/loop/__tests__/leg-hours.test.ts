import { describe, expect, it } from 'vitest';
import { TRANSPORT_MODES } from '../../state/transport-state.ts';
import { legHours } from '../leg-hours.ts';

/**
 * The hours model (M3.8a).
 *
 * The first block is the CALIBRATION, and it is the reason this milestone could be reviewed at
 * all: the three fixture routes must reproduce the flat `HOURS_PER_LEG` this replaced, exactly
 * and stably across the ±1 km that `uniformSplit` produces. If one of those moves, the table is
 * wrong and the sim diff underneath it is meaningless.
 *
 * The second block is the part the calibration did NOT cover, and which moved the fixture
 * baseline: what happens after the transport mode changes mid-run.
 */

describe('calibration — the fixtures reproduce the flat model they replaced', () => {
  // fixture.short is a car route at 62 km/leg; fixture.illicit a truck at 89/90;
  // fixture.scenic a bus at 86/87. The old table read car 5, truck 6, bus 5.
  it.each([
    ['car' as const, 62, 5],
    ['truck' as const, 89, 6],
    ['truck' as const, 90, 6],
    ['bus' as const, 86, 5],
    ['bus' as const, 87, 5],
  ])('%s at %i km costs %i hours', (mode, km, hours) => {
    expect(legHours(km, mode, false)).toBe(hours);
  });

  it('is stable across the ±1 km the split produces, which is what makes it reviewable', () => {
    // The property, not the five cases: a one-kilometre difference must never change the hours
    // of a leg, or `uniformSplit`'s remainder spreading would become a behavioural change.
    for (const [mode, km] of [
      ['car', 62],
      ['truck', 89],
      ['bus', 86],
    ] as const) {
      expect(legHours(km, mode, false)).toBe(legHours(km + 1, mode, false));
    }
  });
});

describe('the shape: an overhead plus a rate', () => {
  it('charges the overhead even for no distance at all', () => {
    // A bus that comes twice a day costs hours before it covers a metre. This is why a 60 km
    // leg is not 20% of a 300 km one.
    expect(legHours(0, 'bus', false)).toBe(3);
    expect(legHours(0, 'car', false)).toBe(4);
  });

  it('gives foot zero overhead, because walking has no schedule to wait for', () => {
    expect(legHours(4, 'foot', false)).toBe(1);
    expect(legHours(40, 'foot', false)).toBe(10);
  });

  it('never costs zero hours, however short the leg', () => {
    // `mulDivRound(1, 1, 4)` is 0, so a one-kilometre walk would otherwise advance the clock by
    // nothing — and `spanPoints` would then charge no hunger, no energy and no time for a leg
    // that happened.
    for (const mode of TRANSPORT_MODES) expect(legHours(0, mode, false)).toBeGreaterThanOrEqual(1);
    expect(legHours(1, 'foot', false)).toBe(1);
  });

  it('is monotone in distance for every mode', () => {
    for (const mode of TRANSPORT_MODES) {
      let previous = 0;
      for (let km = 0; km <= 600; km += 7) {
        const hours = legHours(km, mode, false);
        expect(hours).toBeGreaterThanOrEqual(previous);
        previous = hours;
      }
    }
  });
});

describe('the ceiling, and the incoherence it makes survivable rather than absurd', () => {
  it('caps an ordinary leg at twelve hours', () => {
    expect(legHours(10_000, 'car', false)).toBe(12);
    expect(legHours(450, 'foot', false)).toBe(12);
  });

  it('lets a montage leg swallow a much longer span', () => {
    // A montage is a stretch the journal summarises rather than plays, so compressing it is the
    // entire point. Nothing produces one yet — `montageLegs` is empty everywhere until M3.9.
    expect(legHours(10_000, 'car', true)).toBe(30);
    expect(legHours(62, 'car', true)).toBe(5);
  });

  it('is why walking a leg planned for a vehicle is wrong but not unbounded', () => {
    // ADR 0026 Decision 6, now LIVE rather than hypothetical: `bus_ejection` sets mode to foot,
    // so a leg planned at 86 km by bus is walked. 0 + mulDivRound(86,1,4) = 22 hours, capped at
    // 12. Twelve hours to walk 86 km is still wrong — `legKm` is baked at generation and does
    // not know the player is on foot. Pinned here so the day it is fixed, this test is the one
    // that says what the old behaviour was.
    expect(legHours(86, 'foot', false)).toBe(12);
    expect(legHours(86, 'bus', false)).toBe(5);
  });
});
