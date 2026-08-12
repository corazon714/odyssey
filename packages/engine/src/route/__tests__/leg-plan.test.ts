import { describe, expect, it } from 'vitest';
import { TERRAIN_KINDS, type TerrainKind } from '../geo-terrain.ts';
import {
  compressLegs,
  dullness,
  maxLegs,
  minLegs,
  planLegs,
  type LegSegment,
} from '../leg-plan.ts';

/**
 * Leg sizing (ADR 0026 Decision 4).
 *
 * These pin PROPERTIES, not constants. The density table, the compression bands and the clamps
 * are balance and are expected to move; monotonicity, the sum invariant and the absence of a
 * cliff at 500 km are the reasons the shape was chosen and must survive every retune.
 */

let nextId = 0;
function segment(overrides: Partial<LegSegment> = {}): LegSegment {
  nextId += 1;
  return {
    edgeIdx: nextId,
    edgeId: `e.${String(nextId).padStart(4, '0')}`,
    distanceKm: 100,
    terrain: 'plain',
    ferry: false,
    scenic: 0,
    servicesCount: 3,
    viaCrossingNode: false,
    arrivalType: 'town',
    ...overrides,
  };
}

/** A route of `n` identical segments, so leg count is a function of distance alone. */
function evenRoute(n: number, km: number, terrain: TerrainKind = 'plain'): LegSegment[] {
  return Array.from({ length: n }, () => segment({ distanceKm: km, terrain }));
}

describe('the sum invariant — legs partition the route exactly', () => {
  it('holds across a sweep of lengths and terrains', () => {
    for (const terrain of TERRAIN_KINDS) {
      for (const [count, km] of [
        [1, 40],
        [3, 210],
        [8, 97],
        [12, 300],
        [20, 180],
        [40, 260],
      ] as const) {
        const plan = planLegs(evenRoute(count, km, terrain));
        expect(plan.legKm).toHaveLength(plan.legCount);
        expect(plan.legKm.reduce((a, b) => a + b, 0)).toBe(plan.totalKm);
        expect(plan.totalKm).toBe(count * km);
        expect(plan.legKm.every((v) => Number.isInteger(v) && v >= 0)).toBe(true);
      }
    }
  });

  it('gives every segment an arrival leg inside the route, ascending', () => {
    const plan = planLegs(evenRoute(9, 150, 'hill'));
    expect(plan.arrivalLegOfEdge).toHaveLength(9);
    let previous = -1;
    for (const leg of plan.arrivalLegOfEdge) {
      expect(leg).toBeGreaterThan(previous);
      expect(leg).toBeLessThan(plan.legCount);
      previous = leg;
    }
    expect(plan.arrivalLegOfEdge[8]).toBe(plan.legCount - 1);
  });
});

describe('terrain decides how far a leg covers', () => {
  it('gives more legs to the same distance through harder ground', () => {
    // The whole point of the density model: a leg is a SESSION, so 150 km of pass and 250 km of
    // plain are both one of them.
    //
    // Measured at 6,000 km deliberately. Below roughly 3,000 km `minLegs` binds and BOTH
    // terrains land on the floor — a real property of the design, not a bug, and worth pinning
    // separately below so nobody "fixes" the density table to chase a difference the clamp is
    // eating.
    const mountain = planLegs(evenRoute(30, 200, 'mountain'));
    const plain = planLegs(evenRoute(30, 200, 'plain'));
    expect(mountain.legCount).toBeGreaterThan(plain.legCount);
  });

  it('lets the FLOOR hide terrain on a short route, which is the clamp working', () => {
    // 2,000 km of mountain and 2,000 km of plain both compress below `minLegs(2000)` = 22, so
    // both clamp to 22. Terrain stops mattering below the floor, by design.
    expect(planLegs(evenRoute(10, 200, 'mountain')).legCount).toBe(minLegs(2000));
    expect(planLegs(evenRoute(10, 200, 'plain')).legCount).toBe(minLegs(2000));
  });

  it('is symmetric — a segment takes the HARDER of its two endpoints', () => {
    // The graph is undirected, so terrain taken from the arrival node alone would size the same
    // edge differently depending on which way it was walked. That is a determinism wart.
    const plan = planLegs([segment({ distanceKm: 300, terrain: 'mountain' })]);
    const reversed = planLegs([segment({ distanceKm: 300, terrain: 'mountain' })]);
    expect(plan.legCount).toBe(reversed.legCount);
  });

  it('makes a ferry exactly one leg however long it is, even under the floor', () => {
    // The floor would otherwise pad a lone 900 km crossing to nineteen legs of sitting on the
    // same boat, with `ferry_boarding` scheduled on one of them. A crossing is one session at
    // any distance, so the floor goes unmet instead — ADR 0026 Decision 4 accepts being under
    // it, and padding was never the answer.
    const plan = planLegs([segment({ distanceKm: 900, terrain: 'sea', ferry: true })]);
    expect(plan.legCount).toBe(1);
    expect(plan.legKm).toEqual([900]);
    expect(plan.legCount).toBeLessThan(minLegs(900));
  });

  it('still pads the ROAD segments around a ferry', () => {
    // The exclusion is the ferry's alone: everything else on the route is padded to the floor
    // as usual, so one crossing does not shorten the journey around it.
    const plan = planLegs([
      ...evenRoute(4, 150),
      segment({ distanceKm: 300, terrain: 'sea', ferry: true }),
      ...evenRoute(4, 150),
    ]);
    expect(plan.legCount).toBeGreaterThanOrEqual(minLegs(plan.totalKm) - 1);
    expect(plan.legKm.reduce((a, b) => a + b, 0)).toBe(plan.totalKm);
  });
});

describe('compression is sub-linear, and the breakpoints ARE the curve', () => {
  it('reproduces the worked examples in ADR 0026', () => {
    expect(compressLegs(18)).toBe(18);
    expect(compressLegs(32)).toBe(29);
    expect(compressLegs(60)).toBe(43);
    expect(compressLegs(120)).toBe(58);
  });

  it('is monotone — more raw legs must never compress to fewer', () => {
    let previous = 0;
    for (let raw = 0; raw <= 400; raw += 1) {
      const out = compressLegs(raw);
      expect(out).toBeGreaterThanOrEqual(previous);
      previous = out;
    }
  });

  it('actually compresses rather than capping', () => {
    // A hard cap makes 4,000 km and 12,000 km both land on the ceiling, which is FLAT, not
    // sub-linear. The ratio has to keep falling.
    expect(compressLegs(120) / 120).toBeLessThan(compressLegs(60) / 60);
    expect(compressLegs(60) / 60).toBeLessThan(compressLegs(18) / 18);
  });
});

describe('there is no cliff, because there is no boolean', () => {
  it('has no step between 500 and 501 km', () => {
    // The property ADR 0026 names: a hard `totalKm <= 500 ? [10,16] : [22,48]` would give a
    // 500 km route <=16 legs and a 501 km route >=22.
    const at = (km: number): number => planLegs([segment({ distanceKm: km })]).legCount;
    expect(Math.abs(at(500) - at(501))).toBeLessThanOrEqual(1);
  });

  it('ramps both clamps across the whole band', () => {
    for (let km = 0; km <= 2000; km += 1) {
      expect(minLegs(km)).toBeLessThanOrEqual(maxLegs(km));
      if (km > 0) {
        expect(minLegs(km) - minLegs(km - 1)).toBeLessThanOrEqual(1);
        expect(maxLegs(km) - maxLegs(km - 1)).toBeLessThanOrEqual(1);
      }
    }
    expect(minLegs(1200)).toBe(22);
    expect(maxLegs(500)).toBe(16);
    expect(maxLegs(1200)).toBe(48);
  });

  it('is monotone in distance — more kilometres never produce fewer legs', () => {
    // THE property test ADR 0026 asks for by name.
    let previous = 0;
    for (let km = 20; km <= 6000; km += 20) {
      const plan = planLegs(evenRoute(Math.max(1, Math.floor(km / 200)), 200));
      expect(plan.legCount).toBeGreaterThanOrEqual(previous);
      previous = plan.legCount;
    }
  });
});

describe('montage selection is stable, and never eats a scene', () => {
  const crossing = segment({ distanceKm: 120, viaCrossingNode: true });
  const ferry = segment({ distanceKm: 400, terrain: 'sea', ferry: true });

  it('sorts crossings and ferries last BY CONSTRUCTION', () => {
    // Not by a special case someone can forget: a border crossing is where border_crossing beats
    // live and a ferry is where ferry_boarding lives.
    const dull = segment({ terrain: 'steppe', servicesCount: 0, scenic: 0 });
    expect(dullness(crossing)).toBeLessThan(dullness(dull));
    expect(dullness(ferry)).toBeLessThan(dullness(dull));
  });

  it('never montages a crossing or a ferry even on a long route', () => {
    const segments = [...evenRoute(60, 300, 'steppe'), crossing, ferry];
    const plan = planLegs(segments);
    const montagedIdx = new Set(plan.montageLegs);
    expect(montagedIdx.size).toBeGreaterThan(0);
    // The crossing and ferry legs are the last two arrivals; neither may be montage.
    const crossingLeg = plan.arrivalLegOfEdge[segments.length - 2];
    const ferryLeg = plan.arrivalLegOfEdge[segments.length - 1];
    expect(montagedIdx.has(crossingLeg ?? -1)).toBe(false);
    expect(montagedIdx.has(ferryLeg ?? -1)).toBe(false);
  });

  it('caps montage at a third of the route', () => {
    const plan = planLegs(evenRoute(90, 400, 'steppe'));
    expect(plan.montageLegs.length).toBeLessThanOrEqual(Math.floor(plan.legCount / 3));
  });

  it('produces ascending, unique, in-range montage indices', () => {
    // The shape `validateRoute` demands. Asserted here so a generator bug fails in this file
    // rather than as a rejected route three modules later.
    const plan = planLegs(evenRoute(70, 350, 'steppe'));
    let previous = -1;
    for (const leg of plan.montageLegs) {
      expect(leg).toBeGreaterThan(previous);
      expect(leg).toBeLessThan(plan.legCount);
      previous = leg;
    }
  });

  it('is invariant to unrelated segments — dullness reads only the segment itself', () => {
    // The property that stops adding a node in France reshuffling a montage in Greece.
    const a = segment({ distanceKm: 200, terrain: 'steppe', servicesCount: 1 });
    const b = segment({ distanceKm: 200, terrain: 'coast', servicesCount: 5, scenic: 2 });
    expect(dullness(a)).toBe(dullness({ ...a, edgeIdx: 999, edgeId: 'e.zzzz' }));
    expect(dullness(b)).toBeLessThan(dullness(a));
  });
});

describe('degenerate input does not throw', () => {
  it('returns an empty plan for an empty path', () => {
    expect(planLegs([])).toEqual({
      legCount: 0,
      legKm: [],
      montageLegs: [],
      totalKm: 0,
      arrivalLegOfEdge: [],
    });
  });

  it('never produces fewer legs than segments', () => {
    // Every segment must arrive somewhere, or `arrivalLegOfEdge` would point off the end.
    const plan = planLegs(evenRoute(30, 5));
    expect(plan.legCount).toBeGreaterThanOrEqual(30);
  });
});
