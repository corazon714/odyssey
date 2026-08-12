import { mulDivRound } from '../modifiers/modifier-tunables.ts';
import { type RouteProfile } from '../state/route-state.ts';
import { TRANSPORT_MODES, type TransportMode } from '../state/transport-state.ts';
import {
  CROSSING_MINUTES,
  FARE_PER_100KM,
  FERRY_CROSSING_FEE,
  FERRY_WAIT_MINUTES,
  KMH,
  MINUTES_PER_DAY,
  MODE_ATTENTION,
  MODE_EXPOSURE,
  POP_ATTENTION,
  SUBSISTENCE_PER_DAY,
  TOLL_FEE,
} from './edge-cost-tables.ts';
import { hasMode, type GeoEdge } from './geo-edge.ts';
import { edgeAt, nodeAt, type GeoGraph } from './geo-graph.ts';
import { populationRank, type GeoNode } from './geo-node.ts';
import { hasService } from './geo-services.ts';

/**
 * The cost of traversing one edge under one profile, or `null` when the profile refuses it.
 *
 * `null` is a MASK, not an infinity, and it mirrors `RELAX_NOTHING` in `hard-filters.ts:37-51`
 * deliberately: a masked edge is absent from the feasible graph rather than merely expensive,
 * which is what makes profiles produce topologically different paths instead of the same path
 * at different prices. ADR 0025 Decision 1, Mechanism 1.
 *
 * Costs are direction-independent — every term reads the edge and both endpoints
 * symmetrically. A route therefore costs the same reversed, which is pinned by a test.
 */
export type EdgeCost = (graph: GeoGraph, edgeIdx: number) => number | null;

/**
 * Which rung-0 masks to drop. The diversity ladder (ADR 0025 Decision 5) reaches rung 4 only
 * after exhausting Yen and two threshold steps, because dropping a mask changes what a profile
 * MEANS rather than merely how strict it is.
 */
export type CostRelaxation = {
  readonly modes: boolean;
  readonly season: boolean;
  readonly terrain: boolean;
  readonly boundary: boolean;
};

export const NO_RELAXATION: CostRelaxation = Object.freeze({
  modes: false,
  season: false,
  terrain: false,
  boundary: false,
});

export const RELAX_ALL_MASKS: CostRelaxation = Object.freeze({
  modes: true,
  season: true,
  terrain: true,
  boundary: true,
});

/** A controlled crossing point is a NODE TYPE. Nothing here reads a country. */
function viaCrossingNode(from: GeoNode, to: GeoNode): boolean {
  return from.type === 'border_crossing' || to.type === 'border_crossing';
}

/** An uncontrolled boundary crossing: the segment crosses one, away from a crossing node. */
function uncontrolledBoundary(edge: GeoEdge, from: GeoNode, to: GeoNode): boolean {
  return edge.adminBoundary && !viaCrossingNode(from, to);
}

/**
 * The modes a profile will consider, as a mask.
 *
 * **`illicit` refusing `train` and `ferry` is the single largest topology divergence in the
 * system** — they are ticketed and ID-checked — and it is derived purely from the profile, with
 * no player state and no place involved.
 */
function allowedModes(profile: RouteProfile, relax: CostRelaxation): readonly TransportMode[] {
  if (profile !== 'illicit' || relax.modes) return TRANSPORT_MODES;
  return TRANSPORT_MODES.filter((mode) => mode !== 'train' && mode !== 'ferry');
}

/**
 * The mode this profile would take on this edge, or null if it will not take any.
 *
 * Ties resolve by `TRANSPORT_MODES` index order, which is fixed — so two modes that score
 * identically never leave the choice to iteration order.
 */
function pickMode(
  profile: RouteProfile,
  edge: GeoEdge,
  relax: CostRelaxation,
): TransportMode | null {
  let best: TransportMode | null = null;
  let bestScore = 0;
  for (const mode of allowedModes(profile, relax)) {
    if (!hasMode(edge.modes, mode)) continue;
    // Every score is "higher is better", so one comparison serves all five profiles.
    const score =
      profile === 'cheapest'
        ? -FARE_PER_100KM[mode]
        : profile === 'safest'
          ? -MODE_EXPOSURE[mode]
          : profile === 'illicit'
            ? -MODE_ATTENTION[mode]
            : KMH[mode];
    if (best === null || score > bestScore) {
      best = mode;
      bestScore = score;
    }
  }
  return best;
}

/** Minutes for this edge under this mode. Shared by `fastest` and `cheapest`'s subsistence term. */
function minutesFor(edge: GeoEdge, mode: TransportMode, crossing: boolean): number {
  return (
    mulDivRound(edge.distanceKm, 60, KMH[mode]) +
    (crossing ? CROSSING_MINUTES : 0) +
    (mode === 'ferry' ? FERRY_WAIT_MINUTES : 0)
  );
}

function seasonBlocked(edge: GeoEdge, strict: boolean): boolean {
  if (strict) return edge.seasonality !== 'all_year';
  return edge.seasonality === 'winter_closed' || edge.seasonality === 'summer_only';
}

/**
 * Build the cost function for a profile.
 *
 * **Every body clamps to `Math.max(1, ...)`, and the test asserts `>= 1` rather than `>= 0`.**
 * That is not defensive padding. A zero-weight edge is reachable — `mulDivRound(2, 1, 5)` is 0
 * — and with one present, `if (visited[v]) continue` can finalise a node before an equal-cost,
 * lower-edge-index relaxation arrives, which makes the retained predecessor depend on pop
 * order. Non-negativity is Dijkstra's precondition; strict positivity is what the tie-break
 * argument in ADR 0025 Decision 3 actually needs, and the resulting bug would present as a
 * heap fault rather than a cost-function one.
 */
export function costFor(profile: RouteProfile, relax: CostRelaxation = NO_RELAXATION): EdgeCost {
  return (graph, edgeIdx) => {
    const edge = edgeAt(graph, edgeIdx);
    if (edge === null) return null;
    const fromIdx = graph.edgeFrom[edgeIdx];
    const toIdx = graph.edgeTo[edgeIdx];
    if (fromIdx === undefined || toIdx === undefined) return null;
    const from = nodeAt(graph, fromIdx);
    const to = nodeAt(graph, toIdx);
    if (from === null || to === null) return null;

    const mode = pickMode(profile, edge, relax);
    if (mode === null) return null;

    const crossing = viaCrossingNode(from, to);
    const uncontrolled = uncontrolledBoundary(edge, from, to);

    // Rung-0 masks. `illicit` is the only profile that may cross a boundary away from a
    // controlled crossing; `safest` additionally refuses hard ground and any seasonal doubt.
    if (!relax.boundary && profile !== 'illicit' && uncontrolled) return null;
    if (!relax.season && profile !== 'illicit' && profile !== 'scenic') {
      if (seasonBlocked(edge, profile === 'safest')) return null;
    }
    // ... EXCEPT where there is no way round: see GeoEdge.unavoidable. A mask that disconnects
    // the graph forces relaxation, and relaxation is what makes five profiles into one.
    if (
      !relax.terrain &&
      profile === 'safest' &&
      edge.terrainDifficulty >= 3 &&
      !edge.unavoidable
    ) {
      return null;
    }

    const maxPop = Math.max(populationRank(from.population), populationRank(to.population));
    const minPop = Math.min(populationRank(from.population), populationRank(to.population));
    const remote = maxPop < populationRank('small');

    switch (profile) {
      case 'fastest':
        return Math.max(1, minutesFor(edge, mode, crossing));

      case 'cheapest': {
        const minutes = minutesFor(edge, mode, crossing);
        return Math.max(
          1,
          mulDivRound(edge.distanceKm, FARE_PER_100KM[mode], 100) +
            (mode === 'ferry' ? FERRY_CROSSING_FEE : 0) +
            (edge.tolled ? TOLL_FEE : 0) +
            (crossing ? 15 : 0) +
            mulDivRound(minutes, SUBSISTENCE_PER_DAY, MINUTES_PER_DAY),
        );
      }

      case 'safest':
        return Math.max(
          1,
          mulDivRound(edge.distanceKm, 1 + edge.terrainDifficulty, 4) +
            (crossing ? 400 : 0) +
            (edge.seasonality === 'all_year' ? 0 : 250) +
            MODE_EXPOSURE[mode] +
            (remote ? 180 : 0),
        );

      case 'scenic':
        return Math.max(
          1,
          edge.distanceKm * (4 - edge.scenic) + (minPop >= populationRank('large') ? 300 : 0),
        );

      case 'illicit':
        return Math.max(
          1,
          mulDivRound(edge.distanceKm, 1, 5) +
            (crossing ? 900 : 0) +
            (uncontrolled ? 150 : 0) +
            POP_ATTENTION[
              maxPop === populationRank(from.population) ? from.population : to.population
            ] +
            (hasService(from.services, 'transit') || hasService(to.services, 'transit') ? 250 : 0) +
            MODE_ATTENTION[mode],
        );
    }
  };
}

export { pickMode as pickModeForProfile };
