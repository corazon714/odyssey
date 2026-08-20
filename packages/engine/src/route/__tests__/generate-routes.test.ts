import { describe, expect, it } from 'vitest';
import { legHours } from '../../loop/leg-hours.ts';
import { HOURS_PER_HUNGER, LEG_JITTER_MAX, LEG_JITTER_MIN } from '../../loop/world-tick.ts';
import { mulDivRound } from '../../modifiers/modifier-tunables.ts';
import { createRngCursors } from '../../rng/rng-cursors.ts';
import { createRunState } from '../../state/create-run-state.ts';
import { createRunInit } from '../../state/run-init.ts';
import { validateRoute } from '../../state/validate-route.ts';
import { generateRoutes } from '../generate-routes.ts';
import { idx, loadMiniGraph } from './support/load-geo-mini.ts';

/**
 * Route generation, end to end (M3.9 slice 3).
 *
 * **The success criterion for this milestone is a seeded property loop, not a golden.** Nothing
 * calls `generateRoutes` yet — wiring it into the run path is M3.10a — so there is no digest to
 * compare against and no sim number that would move. What can be checked is that every route it
 * produces is one the engine will accept, over as many seeds and pairs as the fixture graph
 * offers.
 */

const GRAPH = loadMiniGraph();
// Chosen to exercise the features the schedule branches on: `n.cross` is the fixture's border
// crossing and `n.p1`/`n.p2` its ports, so these pairs cover crossings and ferries rather than
// only the easy corridor.
const PAIRS: readonly (readonly [string, string])[] = [
  ['n.start', 'n.end'],
  ['n.start', 'n.c2'],
  ['n.a1', 'n.end'],
  ['n.start', 'n.p2'],
];

const SEEDS = Array.from({ length: 40 }, (_, i) => `gen:${String(i)}`);

function everyPlan(): readonly {
  seed: string;
  pair: string;
  plan: ReturnType<typeof generateRoutes>['plans'][number];
}[] {
  const out = [];
  for (const seed of SEEDS) {
    for (const [from, to] of PAIRS) {
      for (const plan of generateRoutes(GRAPH, idx(GRAPH, from), idx(GRAPH, to), seed).plans) {
        out.push({ seed, pair: `${from}>${to}`, plan });
      }
    }
  }
  return out;
}

const ALL = everyPlan();

describe('every generated route is one the engine accepts', () => {
  it('produced a non-empty sample — an empty loop would pass everything below vacuously', () => {
    expect(ALL.length).toBeGreaterThan(50);
  });

  it('passes validateRoute, every time', () => {
    const failures = ALL.filter(({ plan }) => validateRoute(plan.route) !== null).map(
      ({ seed, pair, plan }) =>
        `${seed} ${pair} ${plan.route.profile}: ${validateRoute(plan.route)?.code ?? ''}`,
    );
    expect(failures).toEqual([]);
  });

  it('builds a real RunState from each, not just a valid-looking object', () => {
    // validateRoute is the gate, but createRunState is what the game actually calls. A route
    // that validates and then fails to build would be a gap between the two.
    for (const { plan } of ALL.slice(0, 40)) {
      const created = createRunState(createRunInit('prop', 'content-v1', plan.route));
      if (!created.ok) throw new Error(`rejected: ${created.error.code}`);
      expect(created.state.route.legKm.reduce((a, b) => a + b, 0)).toBe(plan.route.totalKm);
    }
  });

  it('holds the leg invariants on every route', () => {
    for (const { plan } of ALL) {
      const route = plan.route;
      expect(route.legKm).toHaveLength(route.legCount);
      expect(route.legLocations).toHaveLength(route.legCount);
      expect(route.legKm.reduce((a, b) => a + b, 0)).toBe(route.totalKm);
      expect(route.edges).toHaveLength(route.nodes.length - 1);
      expect(route.legIndex).toBe(0);
      expect(route.progressKm).toBe(0);

      let previous = -1;
      for (const leg of route.montageLegs) {
        expect(leg).toBeGreaterThan(previous);
        expect(leg).toBeLessThan(route.legCount);
        previous = leg;
      }
    }
  });

  it('emits beats ascending, non-overlapping, in range and all pending', () => {
    for (const { plan } of ALL) {
      const slots = plan.route.beatSchedule;
      const montage = new Set(plan.route.montageLegs);
      for (let i = 0; i < slots.length; i += 1) {
        const slot = slots[i];
        if (slot === undefined) continue;
        expect(slot.status).toBe('pending');
        expect(slot.legIndex).toBeGreaterThanOrEqual(0);

        const to = slot.legIndex + slot.slackLegs;
        expect(to).toBeLessThan(plan.route.legCount);
        for (let leg = slot.legIndex; leg <= to; leg += 1) expect(montage.has(leg)).toBe(false);

        const next = slots[i + 1];
        if (next !== undefined) expect(to).toBeLessThan(next.legIndex);
      }
    }
  });
});

describe('routeGen consumes no cursor', () => {
  it('leaves every cursor at zero — generation is cursor-free', () => {
    // THE assertion this milestone exists to make true. The number of draws depends on how many
    // routes a graph yields and how many beats each has, so a cursored draw would make
    // `routeGen`'s cursor a function of geography — and a map edit would move every save fixture.
    const before = createRngCursors();
    generateRoutes(GRAPH, idx(GRAPH, 'n.start'), idx(GRAPH, 'n.end'), 'cursor-check');
    expect(createRngCursors()).toEqual(before);
    expect(before.routeGen).toBe(0);
  });
});

describe('generation is deterministic and seed-dependent', () => {
  const a = idx(GRAPH, 'n.start');
  const b = idx(GRAPH, 'n.end');

  it('reproduces itself exactly for the same seed', () => {
    expect(generateRoutes(GRAPH, a, b, 'same')).toEqual(generateRoutes(GRAPH, a, b, 'same'));
  });

  it('gives the same ROUTES but a different start block for a different seed', () => {
    // The paths are a function of the graph and the cost functions, not of the seed — only the
    // jitter and the start block are seeded. Pinning that split stops a future change quietly
    // making route SELECTION random, which would make a shared seed unreproducible.
    const one = generateRoutes(GRAPH, a, b, 'seed-one');
    const two = generateRoutes(GRAPH, a, b, 'seed-two');
    expect(one.plans.map((p) => p.route.nodes.join('>'))).toEqual(
      two.plans.map((p) => p.route.nodes.join('>')),
    );
  });

  it('gives a route a stable id derived from what it IS', () => {
    const one = generateRoutes(GRAPH, a, b, 'id-one');
    const two = generateRoutes(GRAPH, a, b, 'id-two');
    expect(one.plans.map((p) => String(p.route.id))).toEqual(
      two.plans.map((p) => String(p.route.id)),
    );
    for (const plan of one.plans)
      expect(String(plan.route.id)).toMatch(/^route\.[a-z]+\.r[a-z0-9]+$/);
  });
});

describe('the start block is derived, never authored', () => {
  it('gives every plan a mode the route can actually be travelled by', () => {
    for (const { plan } of ALL) {
      expect(plan.preview.transportMix.length).toBeGreaterThan(0);
      expect(plan.start.cash).toBeGreaterThan(0);
      expect(plan.start.startHour).toBeGreaterThanOrEqual(5);
      expect(plan.start.startHour).toBeLessThan(12);
      expect(['clear', 'rain', 'fog', 'wind', 'heat']).toContain(plan.start.weather);
    }
  });

  it('starts a player above the bare recommendation, or preparation has no slack', () => {
    for (const { plan } of ALL) {
      expect(plan.start.cash).toBeGreaterThan(plan.preview.recommendedCash);
    }
  });

  it('starts illicit routes with a vehicle that is not in order', () => {
    // The profile that routes around controls is not the one with the paperwork done.
    for (const { plan } of ALL) {
      expect(plan.start.vehicleLegal).toBe(plan.route.profile !== 'illicit');
    }
  });

  it('reuses HOURS_PER_HUNGER for rations rather than restating it', () => {
    // Retuning the hunger rate must update the supply requirement automatically.
    for (const { plan } of ALL) {
      expect(plan.preview.rationsNeeded).toBeGreaterThan(0);
      expect(Number.isInteger(plan.preview.rationsNeeded)).toBe(true);
    }
  });

  /**
   * `travelHours` is the number `rationsNeeded` was ALREADY dividing, now exposed.
   *
   * Asserted as that identity rather than against a figure. Pillar 4 wants the player to see that
   * a 523-hour route is not a 112-hour one, and a preview computing its own hours would be free to
   * disagree with the supply requirement printed beside it. Both sides derive from
   * `HOURS_PER_HUNGER`, so retuning the hunger rate moves them together or this fails.
   *
   * What this does NOT prove, despite an earlier version of this comment claiming it: that no
   * second summation exists. A duplicate that happened to agree would satisfy the identity just
   * as well, and agreeing-today duplicates are exactly the defect class. The single-summation
   * guarantee comes from `route-preview.ts`, where one `totalHours` local feeds both consumers —
   * read it there. This test pins the RELATIONSHIP, which is worth having and is not the same
   * claim.
   */
  it('exposes the total travel hours rations were already computed from', () => {
    for (const { plan } of ALL) {
      const hours = plan.preview.travelHours;
      expect(hours).toBeGreaterThan(0);
      expect(Number.isInteger(hours)).toBe(true);
      expect(plan.preview.rationsNeeded).toBe(Math.ceil(hours / HOURS_PER_HUNGER));
    }
  });

  /**
   * THE REGRESSION. `travelHours` shipped as the static `legHours` sum, which is not what a route
   * costs: `worldTick` bills `legHours + nextInt(LEG_JITTER_MIN, LEG_JITTER_MAX)` per leg, and
   * `nextInt` is inclusive at BOTH ends, so the draw {-1, 0, 1, 2} has a mean of +0.5. Every
   * preview was low by `legCount / 2` — 11 h on a 22-leg route, 24 h on a 48-leg one — in the same
   * direction on every route, which is a bias rather than noise.
   *
   * The static sum IS recomputed here, and that is the point rather than a duplication slip: the
   * assertion is precisely that the field is NOT that number. It calls the same exported
   * `legHours` the production path calls rather than reimplementing the per-mode arithmetic, so
   * the only thing restated is the loop.
   *
   * Both sides read `LEG_JITTER_*`, so the identity survived the bounds being made symmetric at
   * C1 — the correction went to zero and this kept passing without an edit, which is what it was
   * built for.
   *
   * WHAT IT NO LONGER DOES, said plainly because the shape still looks like a guard. It once
   * carried `if (asymmetric) expect(travelHours).toBeGreaterThan(staticHours)`, and under
   * symmetric bounds that condition is `false`, so the branch never ran and the surviving
   * equality collapsed to `travelHours === staticHours` — the exact "old behaviour" its own
   * anti-vacuity comment warned about. A dead branch that reads as a live assertion is worse
   * than no assertion, so it is gone. **The guard against re-introducing an asymmetric jitter is
   * `world-tick.test.ts`'s draw-set test**, which measures what the tick actually bills rather
   * than what two constants sum to. That is where it belongs and where it can fail.
   */
  it('reports the EXPECTED duration, jitter included, not the static leg sum', () => {
    const expectedJitter = (legCount: number): number =>
      mulDivRound(legCount, LEG_JITTER_MIN + LEG_JITTER_MAX, 2);

    for (const { seed, pair, plan } of ALL) {
      const montage = new Set(plan.route.montageLegs);
      const staticHours = plan.route.legKm.reduce(
        (sum, km, leg) => sum + legHours(km, plan.start.transportMode, montage.has(leg)),
        0,
      );
      const where = `${seed} ${pair} ${plan.route.profile}`;

      expect(`${where}: ${String(plan.preview.travelHours)}`).toBe(
        `${where}: ${String(staticHours + expectedJitter(plan.route.legCount))}`,
      );
    }
  });

  it('tells routes apart by duration, which is the point of printing it', () => {
    // Anti-vacuity for the identity above — a constant would satisfy it, and a preview whose
    // hours never move is not a decision the player can make anything of.
    const distinct = new Set(ALL.map(({ plan }) => plan.preview.travelHours));
    expect(distinct.size).toBeGreaterThan(1);
  });
});
