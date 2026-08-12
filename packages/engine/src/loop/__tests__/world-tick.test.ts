import { describe, expect, it } from 'vitest';
import { createRng } from '../../rng/rng.ts';
import { createRngCursors } from '../../rng/rng-cursors.ts';
import { createRunState } from '../../state/create-run-state.ts';
import { createRunInit } from '../../state/run-init.ts';
import { createTransport } from '../../state/transport-state.ts';
import { type RunState } from '../../state/run-state.ts';
import { type TransportMode } from '../../state/transport-state.ts';
import { loadFixtureRouteEntries } from '../../__tests__/support/load-fixtures.ts';
import { healthCost, moraleCost, spanPoints, worldTick } from '../world-tick.ts';

/**
 * The drift curve had no test at all before M2A.0, which is how it stayed structurally wrong
 * long enough to reach a sim report (ADR 0014). These tests pin the SHAPE of the curve, not
 * its constants — the constants are balance and are expected to move; the properties below
 * are the reasons the shape was chosen and must not.
 */

const ROUTE = loadFixtureRouteEntries()[0];

function stateWith(mode: TransportMode, overrides: Partial<RunState> = {}): RunState {
  if (ROUTE === undefined) throw new Error('no fixture route');
  const created = createRunState({
    ...createRunInit('world-tick', 'test-version', ROUTE.route),
    transport: { ...createTransport(mode), vehicleId: 'v', legal: true },
    startHour: 0,
    weather: 'clear',
  });
  if (!created.ok) throw new Error(`route rejected: ${created.error.code}`);
  return { ...created.state, ...overrides };
}

const rng = (): ReturnType<typeof createRng> => createRng('world-tick', createRngCursors());

describe('spanPoints — the accumulator the drift uses instead of state', () => {
  it('loses nothing to rounding across a contiguous sequence of spans', () => {
    // THE property. A per-leg `floor(hours / per)` discards the remainder every leg and
    // quietly halves the rate; charging against the clock span carries it.
    const spans = [5, 4, 6, 5, 9, 3, 7, 4, 5, 6, 8, 5];
    for (const per of [4, 5, 6, 7, 9, 12]) {
      let elapsed = 0;
      let total = 0;
      for (const hours of spans) {
        total += spanPoints(elapsed, hours, per);
        elapsed += hours;
      }
      expect(total, `per=${String(per)}`).toBe(Math.floor(elapsed / per));
    }
  });

  it('quantises, so an identical leg can cost differently depending on when it happens', () => {
    // This is the variance the old curve had none of. Same mode, same hours, different phase.
    const costs = new Set([0, 1, 2, 3, 4, 5].map((start) => spanPoints(start, 4, 6)));
    expect(costs.size).toBeGreaterThan(1);
  });

  it('never returns a negative and is monotonic in hours', () => {
    for (let before = 0; before < 24; before += 1) {
      let previous = 0;
      for (let hours = 0; hours <= 12; hours += 1) {
        const points = spanPoints(before, hours, 6);
        expect(points).toBeGreaterThanOrEqual(previous);
        previous = points;
      }
    }
  });
});

describe('graded penalties', () => {
  it('costs nothing below the hunger threshold, however long the leg', () => {
    for (const hours of [1, 5, 9, 24]) expect(healthCost(7, 0, hours)).toBe(0);
  });

  it('charges starvation twice as fast as hunger over the same span', () => {
    // Both rungs are per-hour, so this compares rates rather than per-leg constants.
    const span = 40;
    expect(healthCost(10, 0, span)).toBe(2 * healthCost(8, 0, span));
  });

  it('makes a long haul on an empty stomach cost more than a short hop', () => {
    // The per-leg version charged these the same, which is why the population lost health in
    // lockstep once it was past the threshold.
    expect(healthCost(8, 0, 12)).toBeGreaterThan(healthCost(8, 0, 3));
  });

  it('does NOT grade morale, because energy floors at 0', () => {
    // Deliberate asymmetry, and the measured reason is in world-tick.ts: a second rung on a
    // FLOORED meter is a penalty the whole population takes on the same leg, so it
    // synchronises the collapse rather than spreading it. Measured at leg 15, adding one
    // drove morale from 0/2/6 to 0/0/0.
    expect(moraleCost(2)).toBe(0);
    expect(moraleCost(1)).toBe(1);
    expect(moraleCost(0)).toBe(1);
  });
});

describe('worldTick', () => {
  it('always costs time, even on a leg where nothing happens', () => {
    const before = stateWith('car');
    const after = worldTick(before, rng());
    expect(after.clock.day * 24 + after.clock.hour).toBeGreaterThan(
      before.clock.day * 24 + before.clock.hour,
    );
  });

  it('charges a walker more energy than a train passenger over the same run', () => {
    // Mode-dependence is the point of the rewrite: a flat per-leg cost charged a four-hour
    // train ride exactly what it charged a nine-hour walk.
    const drain = (mode: TransportMode): number => {
      let state = stateWith(mode);
      const generator = rng();
      for (let leg = 0; leg < 8; leg += 1) state = worldTick(state, generator);
      return 10 - state.resources.energy;
    };
    expect(drain('foot')).toBeGreaterThan(drain('train'));
  });

  it('does not touch health while hunger is below the threshold', () => {
    const state = stateWith('car');
    const after = worldTick(state, rng());
    expect(after.resources.hunger).toBeLessThan(8);
    expect(after.resources.health).toBe(state.resources.health);
  });

  it('bleeds health faster while starving than while merely hungry', () => {
    const base = stateWith('car');
    const lost = (hunger: number): number => {
      let state: RunState = { ...base, resources: { ...base.resources, hunger } };
      const generator = rng();
      const before = state.resources.health;
      // Several legs, because the rungs are per-hour: one short leg can round to zero.
      for (let leg = 0; leg < 6; leg += 1) {
        state = worldTick(state, generator);
        state = { ...state, resources: { ...state.resources, hunger } };
      }
      return before - state.resources.health;
    };
    expect(lost(10)).toBeGreaterThan(lost(8));
    expect(lost(8)).toBeGreaterThan(lost(7));
    expect(lost(7)).toBe(0);
  });

  it('is a pure function of (state, rng) and does not mutate its input', () => {
    const before = stateWith('car');
    const snapshot = JSON.stringify(before);
    worldTick(before, rng());
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe('hygiene is graded, and was the last cliff in the file (M3.8b)', () => {
  it('accrues against the clock span rather than a per-leg threshold', () => {
    // The old rule was `hours >= 6 ? -1 : 0`. Under it a 5-hour leg cost nothing and a 6-hour
    // leg cost a point, so hygiene was a step function of a continuous quantity — and under a
    // flat HOURS_PER_LEG it fired for truck and for nobody else, which made rule 3 of this
    // file's header ("penalties are GRADED, not cliffs") false about this one meter.
    const before = stateWith('car');
    const after = worldTick(before, rng());
    expect(after.resources.hygiene).toBeLessThan(before.resources.hygiene);
  });

  it('loses nothing to rounding across a contiguous sequence, like hunger', () => {
    // The property that distinguishes a graded drain from a cliff: two short legs cost what one
    // long one does. A per-leg `floor(hours / 6)` would discard the remainder every leg.
    const spans = [5, 5, 4, 6, 5, 4, 5, 6];
    let elapsed = 0;
    let total = 0;
    for (const hours of spans) {
      total += spanPoints(elapsed, hours, 6);
      elapsed += hours;
    }
    expect(total).toBe(Math.floor(spans.reduce((a, b) => a + b, 0) / 6));
  });

  it('charges a long leg more than a short one, which the cliff could not', () => {
    // Charged from the same starting phase so the comparison is about duration alone.
    expect(spanPoints(0, 12, 6)).toBeGreaterThan(spanPoints(0, 5, 6));
    expect(spanPoints(0, 12, 6)).toBe(2);
    expect(spanPoints(0, 5, 6)).toBe(0);
  });

  it('floors at zero rather than going negative', () => {
    // Hygiene is 0..10 and is NOT a run-end condition (`check-run-end.ts` tests health and
    // morale only). A run that bottoms out keeps travelling, which is why the corpus sat at 0
    // for most of every run under the cliff model too — grading moved WHEN it floors, not
    // whether. That is the measured reason M3.8b barely moved completion.
    let state = stateWith('foot', { resources: { ...stateWith('foot').resources, hygiene: 1 } });
    for (let leg = 0; leg < 5; leg += 1) state = worldTick(state, rng());
    expect(state.resources.hygiene).toBe(0);
  });
});
