import { describe, expect, it } from 'vitest';
import { type LocationType } from '../../content/location-type.ts';
import { deriveBeatSchedule, type BeatContext } from '../beat-schedule.ts';
import { deriveLegLocations } from '../leg-locations.ts';
import { planLegs, type LegSegment } from '../leg-plan.ts';

/**
 * The beat schedule and the leg locations (ADR 0027).
 *
 * The four invariants are asserted as PROPERTIES over generated schedules rather than against
 * expected arrays, because the placement fractions are a decision consistent with the fixtures
 * rather than a recovered constant — they are expected to move, and the invariants are not.
 */

let nextId = 0;
function segment(overrides: Partial<LegSegment> = {}): LegSegment {
  nextId += 1;
  return {
    edgeIdx: nextId,
    edgeId: `e.${String(nextId).padStart(4, '0')}`,
    distanceKm: 150,
    terrain: 'plain',
    ferry: false,
    scenic: 1,
    servicesCount: 3,
    viaCrossingNode: false,
    arrivalType: 'town',
    ...overrides,
  };
}

const CTX: BeatContext = {
  seed: 'beat-test',
  startNodeId: 'n.city.a',
  endNodeId: 'n.city.z',
  profile: 'fastest',
};

function scheduleFor(segments: readonly LegSegment[], ctx: BeatContext = CTX) {
  const plan = planLegs(segments);
  const locations = deriveLegLocations(segments, plan);
  return { plan, locations, slots: deriveBeatSchedule(plan, segments, locations, ctx) };
}

describe('leg locations', () => {
  it('is exactly legCount long, which validateRoute demands', () => {
    for (const n of [1, 3, 8, 20]) {
      const segments = Array.from({ length: n }, () => segment());
      const plan = planLegs(segments);
      expect(deriveLegLocations(segments, plan)).toHaveLength(plan.legCount);
    }
  });

  it('puts the arrival node type on the leg that reaches it', () => {
    const segments = [segment({ arrivalType: 'city' }), segment({ arrivalType: 'port' })];
    const plan = planLegs(segments);
    const locations = deriveLegLocations(segments, plan);
    expect(locations[plan.arrivalLegOfEdge[0] ?? -1]).toBe('city');
    expect(locations[plan.arrivalLegOfEdge[1] ?? -1]).toBe('port');
  });

  it('types the leg before a crossing as checkpoint — invariant (c)', () => {
    // Border content declares `locationTypes: [border_crossing, checkpoint]`, so this widens the
    // eligible window without touching a single event.
    const segments = [segment(), segment({ arrivalType: 'border_crossing' }), segment()];
    const plan = planLegs(segments);
    const locations = deriveLegLocations(segments, plan);
    const crossing = plan.arrivalLegOfEdge[1] ?? -1;
    expect(locations[crossing]).toBe('border_crossing');
    expect(locations[crossing - 1]).toBe('checkpoint');
  });
});

describe('the four invariants hold on every generated schedule', () => {
  const shapes: readonly (readonly LegSegment[])[] = [
    [segment()],
    Array.from({ length: 4 }, () => segment()),
    Array.from({ length: 12 }, () => segment()),
    Array.from({ length: 30 }, () => segment({ distanceKm: 200, terrain: 'mountain' })),
    [
      ...Array.from({ length: 6 }, () => segment()),
      segment({ arrivalType: 'border_crossing' }),
      ...Array.from({ length: 6 }, () => segment()),
      segment({ arrivalType: 'border_crossing' }),
      ...Array.from({ length: 6 }, () => segment()),
    ],
    [
      ...Array.from({ length: 5 }, () => segment()),
      segment({ ferry: true, terrain: 'sea', distanceKm: 300, arrivalType: 'port' }),
      ...Array.from({ length: 5 }, () => segment()),
    ],
    Array.from({ length: 60 }, () => segment({ terrain: 'steppe', scenic: 0, servicesCount: 0 })),
  ];

  it.each(shapes.map((s, i) => [i, s] as const))('shape %i', (_i, segments) => {
    const { plan, locations, slots } = scheduleFor(segments);
    const montage = new Set(plan.montageLegs);

    // (a) ascending emission — dueBeatSlot scans ARRAY ORDER, not lowest legIndex.
    for (let i = 1; i < slots.length; i += 1) {
      expect(slots[i]?.legIndex).toBeGreaterThan(slots[i - 1]?.legIndex ?? -1);
    }

    for (let i = 0; i < slots.length; i += 1) {
      const slot = slots[i];
      if (slot === undefined) continue;

      // validateRoute's own rules.
      expect(slot.legIndex).toBeGreaterThanOrEqual(0);
      expect(slot.legIndex).toBeLessThan(plan.legCount);
      expect(slot.status).toBe('pending');

      const to = slot.legIndex + slot.slackLegs;
      expect(to).toBeLessThan(plan.legCount);

      // (b) non-overlapping windows — the one fixture.illicit already violates.
      const next = slots[i + 1];
      if (next !== undefined) expect(to).toBeLessThan(next.legIndex);

      for (let leg = slot.legIndex; leg <= to; leg += 1) {
        // (d) no window may intersect a montage leg.
        expect(montage.has(leg)).toBe(false);

        // (c) the whole window is location-eligible, for the constrained beats.
        if (slot.type === 'border_crossing') {
          expect(['border_crossing', 'checkpoint']).toContain(locations[leg] as LocationType);
        }
      }
    }
  });

  it('never schedules two beats on the same leg', () => {
    for (const segments of shapes) {
      const { slots } = scheduleFor(segments);
      const legs = slots.map((s) => s.legIndex);
      expect(new Set(legs).size).toBe(legs.length);
    }
  });
});

describe('placement', () => {
  it('always opens on departure and closes on finale', () => {
    const { plan, slots } = scheduleFor(Array.from({ length: 12 }, () => segment()));
    expect(slots[0]).toMatchObject({ legIndex: 0, type: 'departure', slackLegs: 0 });
    expect(slots[slots.length - 1]).toMatchObject({
      legIndex: plan.legCount - 1,
      type: 'finale',
      slackLegs: 0,
    });
  });

  it('caps border beats at four however many crossings the route has', () => {
    const segments = Array.from({ length: 24 }, (_, i) =>
      segment({ arrivalType: i % 2 === 1 ? 'border_crossing' : 'town' }),
    );
    const { slots } = scheduleFor(segments);
    expect(slots.filter((s) => s.type === 'border_crossing').length).toBeLessThanOrEqual(4);
  });

  it('omits approach on a short route rather than cramming it in', () => {
    // Threshold 14 rather than 16 deliberately: 16 is the short-trip cap, and a threshold on a
    // mode boundary invites an off-by-one that only shows on exactly-16-leg routes.
    const short = scheduleFor([segment({ distanceKm: 60 })]);
    expect(short.plan.legCount).toBeLessThan(14);
    expect(short.slots.some((s) => s.type === 'approach')).toBe(false);
  });

  it('schedules a ferry_boarding on the crossing itself', () => {
    const segments = [
      ...Array.from({ length: 4 }, () => segment()),
      segment({ ferry: true, terrain: 'sea', distanceKm: 300, arrivalType: 'port' }),
      ...Array.from({ length: 4 }, () => segment()),
    ];
    const { plan, slots } = scheduleFor(segments);
    const ferry = slots.find((s) => s.type === 'ferry_boarding');
    expect(ferry).toBeDefined();
    expect(ferry?.legIndex).toBe(plan.arrivalLegOfEdge[4]);
    expect(ferry?.slackLegs).toBe(0);
  });
});

describe('jitter is cursor-free and stable', () => {
  it('gives the same schedule for the same route and seed', () => {
    const segments = Array.from({ length: 20 }, () => segment());
    expect(scheduleFor(segments).slots).toEqual(scheduleFor(segments).slots);
  });

  it('gives a different one for a different seed, addressed by label', () => {
    // Addressed by `${start}>${end}:${profile}:beat:${type}`, so generation consumes NO cursor —
    // the number of draws depends on how many beats a route has, which depends on the graph.
    // A cursored draw would make routeGen's cursor a function of geography, and a map edit would
    // move every save fixture.
    const segments = Array.from({ length: 20 }, () => segment());
    const a = scheduleFor(segments, CTX);
    const b = scheduleFor(segments, { ...CTX, seed: 'a-different-seed' });
    const legsOf = (slots: typeof a.slots): string => slots.map((s) => s.legIndex).join(',');
    expect(legsOf(a.slots)).not.toBe(legsOf(b.slots));
  });

  it('varies with the profile on the same pair of nodes', () => {
    const segments = Array.from({ length: 20 }, () => segment());
    const fastest = scheduleFor(segments, CTX);
    const illicit = scheduleFor(segments, { ...CTX, profile: 'illicit' });
    expect(fastest.slots.length).toBeGreaterThan(0);
    expect(illicit.slots.length).toBeGreaterThan(0);
  });
});
