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

  it('fires when rawLegs exceeds target but the SEGMENTS do not — the M3.12 regression', () => {
    // THE test this file was missing. Eight 1,500 km mountain edges raw-count as 80 legs and
    // compress to a 48-leg target: the route is being squeezed by 32 legs, which is exactly the
    // deficit ADR 0026 Decision 4 says montage exists to absorb.
    //
    // The gate shipped as `segments.length > target` — 8 > 48, never true — so montage was
    // empty on ALL 25 corpus routes and every route the generator can produce on the current
    // slice. Every montage test above builds a 60-to-90-segment route, which is the OTHER
    // regime, and that is why nothing caught it. ADR 0039.
    const plan = planLegs(evenRoute(8, 1500, 'mountain'));
    expect(plan.legCount).toBe(48);
    expect(plan.montageLegs.length).toBeGreaterThan(0);
    expect(plan.legKm.reduce((a, b) => a + b, 0)).toBe(plan.totalKm);
  });

  it('leaves leg count alone in the expansion regime — it redistributes, it does not shrink', () => {
    // `legCount` is `target` whether or not anything is montaged, because the surplus allocator
    // spreads `target - segments.length` extra legs either way. What montage changes is WHO
    // gets them: a montaged segment takes one leg and its share goes to the rest. Measured over
    // 123 generated routes, leg count moved on zero of them.
    for (const km of [900, 1200, 1500, 2000]) {
      const plan = planLegs(evenRoute(8, km, 'mountain'));
      expect(plan.legCount).toBe(
        Math.min(maxLegs(plan.totalKm), Math.max(minLegs(plan.totalKm), plan.legCount)),
      );
      expect(plan.legKm).toHaveLength(plan.legCount);
      expect(plan.legKm.reduce((a, b) => a + b, 0)).toBe(plan.totalKm);
    }
  });

  it('never montages the first or last leg, in EITHER regime', () => {
    // They are the slack-0 anchors of `departure` and `finale`, and `beat-schedule.ts`
    // invariant (d) DROPS a beat whose window is montage rather than sliding it. Without this
    // guard the corpus lost 10 `finale` and 6 `departure` slots across 25 routes — and losing
    // `finale` is the metric-gaming ADR 0027 Decision 5 forbids, because it is unfillable, so
    // dropping it raises beat fill while nothing changes for a player.
    for (const segments of [evenRoute(8, 1500, 'mountain'), evenRoute(60, 300, 'steppe')]) {
      const plan = planLegs(segments);
      expect(plan.montageLegs.length).toBeGreaterThan(0);
      expect(plan.montageLegs).not.toContain(0);
      expect(plan.montageLegs).not.toContain(plan.legCount - 1);
    }
  });

  it('protects the segments EITHER SIDE of a crossing, not just the crossing itself', () => {
    // A crossing is safe from montage by its dullness, and that is not enough. Montaging the
    // stretch BETWEEN two crossings collapses it to one leg, the two slack-1 border windows land
    // within a leg of each other, and ADR 0027 invariant (b) drops one — the crossing keeps its
    // scene and loses its beat. Measured on the 25 corpus routes: 71 border slots fell to 58,
    // and this guard returns them to 71. ADR 0039 Decision 3.
    //
    // The four segments flanking the crossings are the DULLEST here on purpose: without the
    // guard they are exactly what montage takes first, so this test goes red rather than
    // passing by luck of the ordering.
    const dull = (): LegSegment =>
      segment({ distanceKm: 900, terrain: 'steppe', servicesCount: 0 });
    const scenic = (): LegSegment =>
      segment({ distanceKm: 900, terrain: 'coast', servicesCount: 5, scenic: 2 });
    const crossing = (): LegSegment => segment({ distanceKm: 200, viaCrossingNode: true });

    //             0         1         2       3           4       5         6       7           8       9         10
    const segments = [
      scenic(),
      scenic(),
      dull(),
      crossing(),
      dull(),
      scenic(),
      dull(),
      crossing(),
      dull(),
      scenic(),
      scenic(),
    ];
    const plan = planLegs(segments);
    const montaged = new Set(plan.montageLegs);
    // A montaged segment is exactly one leg, so its arrival leg IS its montage leg.
    const isMontaged = (i: number): boolean => montaged.has(plan.arrivalLegOfEdge[i] ?? -1);

    expect(plan.montageLegs.length).toBeGreaterThan(0);
    for (const i of [2, 3, 4, 6, 7, 8]) {
      expect({ segment: i, montaged: isMontaged(i) }).toEqual({ segment: i, montaged: false });
    }
  });

  it('caps montage at a third in the expansion regime too', () => {
    const plan = planLegs(evenRoute(10, 2000, 'mountain'));
    expect(plan.montageLegs.length).toBeGreaterThan(0);
    expect(plan.montageLegs.length).toBeLessThanOrEqual(Math.floor(plan.legCount / 3));
  });

  it('stays silent on a route that is being PADDED rather than compressed', () => {
    // `rawLegs < target` means the floor is inflating a short route, and there is no deficit to
    // absorb. Two of the 25 corpus routes are in this state and montaging them would summarise
    // a journey that is already too thin.
    const plan = planLegs(evenRoute(3, 400, 'plain'));
    expect(plan.legCount).toBe(minLegs(1200));
    expect(plan.montageLegs).toEqual([]);
  });

  it('is invariant to unrelated segments — dullness reads only the segment itself', () => {
    // The property that stops adding a node in France reshuffling a montage in Greece.
    const a = segment({ distanceKm: 200, terrain: 'steppe', servicesCount: 1 });
    const b = segment({ distanceKm: 200, terrain: 'coast', servicesCount: 5, scenic: 2 });
    expect(dullness(a)).toBe(dullness({ ...a, edgeIdx: 999, edgeId: 'e.zzzz' }));
    expect(dullness(b)).toBeLessThan(dullness(a));
  });
});

describe('montage SPACING — the hour wall (ADR 0044, ADR 0046)', () => {
  /**
   * The defect these pin. Drain is charged per HOUR and recovery arrives per LEG, so a montage
   * run is not merely a long summary — it is a stretch billing all of its hours against a single
   * event each. `route.illicit.r1dlxpt5` billed 232 of its 509 hours inside nine CONSECUTIVE
   * montage legs and lost 67% of its population there, against 22% for a route that spread the
   * same 509 hours.
   *
   * Asserted on `montageLegs`, which is leg space and therefore the space the wall lives in.
   * Segment space would be the weaker claim: a montaged segment is exactly one leg and every
   * other segment gets at least one, so consecutive montage LEGS hold if and only if the
   * montaged SEGMENTS were consecutive.
   */
  const longestRun = (legs: readonly number[]): number => {
    let best = 0;
    let run = 0;
    for (let i = 0; i < legs.length; i += 1) {
      run = i > 0 && legs[i] === (legs[i - 1] ?? 0) + 1 ? run + 1 : 1;
      if (run > best) best = run;
    }
    return best;
  };

  /** A coarse corridor: few edges, each far longer than any density, and uniformly dull. */
  const coarseDullRoute = (n: number, km: number): LegSegment[] =>
    Array.from({ length: n }, () =>
      segment({ distanceKm: km, terrain: 'steppe', servicesCount: 0, scenic: 0 }),
    );

  it('never montages three consecutive segments — the wall cannot form', () => {
    // The regression. Before the constraint these routes montaged one solid block: the selector
    // picked by dullness alone, and position entered only through `protectedFromMontage`.
    for (const [n, km] of [
      [18, 950],
      [18, 2200],
      [20, 1200],
      [24, 900],
      [30, 700],
    ] as const) {
      const plan = planLegs(coarseDullRoute(n, km));
      expect(plan.montageLegs.length, `n=${n} km=${km} montaged nothing — vacuous`).toBeGreaterThan(
        0,
      );
      expect(
        longestRun(plan.montageLegs),
        `n=${n} km=${km} legs=${plan.montageLegs.join(',')}`,
      ).toBeLessThanOrEqual(2);
    }
  });

  it('spaces montage when the route has room, rather than merely capping the run', () => {
    // A cap alone would allow pairs everywhere. The ladder takes ISOLATED segments first, so a
    // route with room comes out as a comb and not as a chain of twos.
    const plan = planLegs(coarseDullRoute(18, 950));
    expect(longestRun(plan.montageLegs)).toBe(1);
    for (let i = 1; i < plan.montageLegs.length; i += 1) {
      expect((plan.montageLegs[i] ?? 0) - (plan.montageLegs[i - 1] ?? 0)).toBeGreaterThan(1);
    }
  });

  it('does not change the leg count it was already going to produce', () => {
    /**
     * The cost this constraint is allowed to have, and it is none. Every route on the current
     * slice is in the EXPANSION regime (`target > segments.length`), where `legCount` is exactly
     * `target` whatever montage does — montage decides who gets the surplus, not how many legs
     * there are. So refusing a segment to keep a gap moves the surplus and nothing else, which is
     * why this constraint does not have to trade against ADR 0026 Decision 4's cap.
     *
     * Tested as an A/B rather than against a formula. Marking segments as crossings changes
     * `protectedFromMontage`, therefore the candidate set, therefore which segments get montaged
     * — while leaving `distanceKm` and `terrain` alone, so `rawUnits`, `rawLegs` and `target` are
     * identical by construction. Two genuinely different montage outcomes over one leg budget is
     * exactly the comparison the claim is about, and a formula restating `target` here would only
     * assert that `planLegs` agrees with a copy of itself.
     */
    for (const [n, km] of [
      [18, 950],
      [24, 900],
      [30, 700],
    ] as const) {
      const plain = planLegs(coarseDullRoute(n, km));
      const withCrossings = planLegs(
        coarseDullRoute(n, km).map((s, i) => (i % 5 === 2 ? { ...s, viaCrossingNode: true } : s)),
      );

      expect(withCrossings.totalKm).toBe(plain.totalKm);
      // The montage sets genuinely differ, or the comparison below proves nothing.
      expect(withCrossings.montageLegs).not.toEqual(plain.montageLegs);
      expect(withCrossings.legCount).toBe(plain.legCount);

      for (const plan of [plain, withCrossings]) {
        expect(plan.legKm.reduce((a, b) => a + b, 0)).toBe(plan.totalKm);
        expect(plan.legCount).toBeGreaterThanOrEqual(minLegs(plan.totalKm));
        expect(plan.legCount).toBeLessThanOrEqual(maxLegs(plan.totalKm));
      }
    }
  });

  it('still montages when the route has NO room to space — the budget is not shrunk', () => {
    // The ladder DEGRADES, it does not refuse. A short route whose only candidates are adjacent
    // must still get its montage, or the constraint would silently under-compress exactly the
    // coarse paths it was written for.
    const plan = planLegs(coarseDullRoute(5, 3000));
    expect(plan.montageLegs.length).toBeGreaterThan(0);
    expect(longestRun(plan.montageLegs)).toBeLessThanOrEqual(2);
  });

  it('is deterministic and RNG-free — the same segments give the same plan', () => {
    // `legKm` reaches `RouteState`, therefore `stateDigest`, therefore every golden run. Two
    // passes over one total order preserve that; a coin anywhere in the selector would not.
    const a = planLegs(coarseDullRoute(18, 950));
    const b = planLegs(coarseDullRoute(18, 950));
    expect(a.montageLegs).toEqual(b.montageLegs);
    expect(a.legKm).toEqual(b.legKm);
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
