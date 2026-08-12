import { drawWord } from '../rng/draw-word.ts';
import { deriveKey, streamKey } from '../rng/stream-key.ts';
import { WEATHERS } from '../loop/world-tick.ts';
import { mulDivRound } from '../modifiers/modifier-tunables.ts';
import { type RouteState } from '../state/route-state.ts';
import { type TransportMode } from '../state/transport-state.ts';
import { edgeAt, type GeoGraph } from './geo-graph.ts';
import { modesOf } from './geo-edge.ts';
import { materialiseRoute } from './materialise-route.ts';
import { buildPreview, startingMode, type RoutePreview } from './route-preview.ts';
import { selectPaths, type PathShortfall, type RejectedPath } from './select-paths.ts';

/**
 * Candidate routes between two nodes — the first meaningful decision in the game.
 *
 * `selectPaths` chose which paths are worth offering; this turns each into something playable.
 * **Nothing calls it yet**: the run path still takes `RunInit.route` from a caller, and wiring
 * it in is M3.10a's job, which is why both sim baselines are unmoved by this milestone.
 */

/**
 * Route and start block are INSEPARABLE, so they are returned together.
 *
 * `sim/load-pack.ts:63-69` is explicit about why: the walking skeleton had 5 of 9 events never
 * firing because transport defaulted to `foot` and money to 0 while the route implied a vehicle
 * and two border crossings. A pack full of vehicle-gated events is unreachable without one.
 *
 * The start block is DERIVED rather than authored — transport from the preview's mix, cash from
 * the recommendation — which satisfies that rule by construction instead of by convention.
 */
export type RouteStart = {
  readonly transportMode: TransportMode;
  readonly vehicleLegal: boolean;
  readonly cash: number;
  readonly startHour: number;
  readonly weather: string;
};

export type RoutePlan = {
  readonly route: RouteState;
  readonly start: RouteStart;
  readonly preview: RoutePreview;
};

export type GenerateRoutesResult = {
  readonly plans: readonly RoutePlan[];
  /** Null when at least three distinct routes were found. Not an error — see `selectPaths`. */
  readonly shortfall: PathShortfall | null;
  readonly rejected: readonly RejectedPath[];
  readonly rungReached: number;
};

/** A player starts with more than the bare recommendation, or preparation has no slack. */
const STARTING_CASH_NUM = 130;
const STARTING_CASH_DEN = 100;

/** Departures are morning-ish: 5am to 11am. A 3am start is a different game. */
const EARLIEST_HOUR = 5;
const DEPARTURE_WINDOW = 7;

/**
 * A cursor-free draw in `[0, range)`.
 *
 * `routeGen`'s cursor stays at 0 through generation, and that is asserted rather than assumed:
 * the number of draws depends on how many routes a graph yields, so a cursored draw would make
 * the cursor a function of geography and a map edit would move every save fixture.
 */
function pick(key: number, range: number): number {
  if (range <= 1) return 0;
  const limit = Math.floor(0x1_0000_0000 / range) * range;
  for (let counter = 0; counter < 64; counter += 1) {
    const word = drawWord(key, counter);
    if (word < limit) return word % range;
  }
  return 0;
}

export function generateRoutes(
  graph: GeoGraph,
  startIdx: number,
  endIdx: number,
  seed: string,
): GenerateRoutesResult {
  const selected = selectPaths(graph, startIdx, endIdx);
  const base = streamKey(seed, 'routeGen');
  const plans: RoutePlan[] = [];

  for (const candidate of selected.paths) {
    const materialised = materialiseRoute(graph, candidate.path, candidate.profile, seed);
    if (materialised === null) continue;

    const { route, segments, plan, notableNodes } = materialised;
    const preview = buildPreview(candidate.profile, segments, plan, notableNodes, (edgeIdx) => {
      const edge = edgeAt(graph, edgeIdx);
      return edge === null ? [] : modesOf(edge.modes);
    });

    // Addressed by the route's own id, so two profiles between the same pair get different
    // weather and neither depends on how many routes were generated before it.
    const label = `${String(route.id)}:start`;
    const mode = startingMode(candidate.profile, preview.transportMix);

    plans.push({
      route,
      preview,
      start: {
        transportMode: mode,
        // `illicit` is the profile that routes around controls; a vehicle with papers in order
        // is not what it is for. Every other profile starts legal.
        vehicleLegal: candidate.profile !== 'illicit',
        cash: mulDivRound(preview.recommendedCash, STARTING_CASH_NUM, STARTING_CASH_DEN),
        startHour: EARLIEST_HOUR + pick(deriveKey(base, `${label}:hour`), DEPARTURE_WINDOW),
        weather: WEATHERS[pick(deriveKey(base, `${label}:weather`), WEATHERS.length)] ?? 'clear',
      },
    });
  }

  return {
    plans,
    shortfall: selected.shortfall,
    rejected: selected.rejected,
    rungReached: selected.rungReached,
  };
}
