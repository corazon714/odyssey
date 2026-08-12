import { routeId, type NodeId } from '../ids/content-ids.ts';
import { deriveKey } from '../rng/stream-key.ts';
import { type RouteProfile, type RouteState } from '../state/route-state.ts';
import { deriveBeatSchedule, type BeatContext } from './beat-schedule.ts';
import { type GeoPath } from './dijkstra.ts';
import { edgeAt, nodeAt, type GeoGraph } from './geo-graph.ts';
import { deriveLegLocations } from './leg-locations.ts';
import { planLegs, segmentsOf, type LegPlan, type LegSegment } from './leg-plan.ts';

/**
 * A `GeoPath` becomes a `RouteState` — the one place the graph turns into something the run
 * loop can traverse.
 *
 * Everything it needs was already computed by the three modules below it; this assembles them
 * and produces the fields `validateRoute` checks. It deliberately does NOT validate: the caller
 * does, because `createRunState` already validates and doing it twice would mean two answers to
 * maintain.
 */

export type MaterialisedRoute = {
  readonly route: RouteState;
  readonly segments: readonly LegSegment[];
  readonly plan: LegPlan;
  /** Settlements worth naming, in travel order — ids only, never display strings. */
  readonly notableNodes: readonly NodeId[];
};

/**
 * A deterministic id for a route, derived from what the route IS.
 *
 * Not a counter and not a hash of the objects: the same two endpoints under the same profile on
 * the same graph must produce the same id across processes, or a saved run could not name the
 * route it is on. `r` prefixes the hash because `ID_PATTERN` requires every dot-separated
 * segment to start with a letter.
 */
function idFor(profile: RouteProfile, path: GeoPath): string {
  const shape = `${String(path.nodes[0] ?? -1)}>${String(path.nodes[path.nodes.length - 1] ?? -1)}:${path.edges.join('_')}`;
  const hash = deriveKey(0, `${profile}:${shape}`) >>> 0;
  return `route.${profile}.r${hash.toString(36)}`;
}

/** Places a player would recognise as waypoints. Crossings are typed, never named (§11). */
function notablesOf(graph: GeoGraph, path: GeoPath): readonly NodeId[] {
  const out: NodeId[] = [];
  for (const nodeIdx of path.nodes) {
    const node = nodeAt(graph, nodeIdx);
    if (node === null) continue;
    if (node.type === 'city' || node.type === 'town' || node.type === 'port') out.push(node.id);
  }
  return out;
}

export function materialiseRoute(
  graph: GeoGraph,
  path: GeoPath,
  profile: RouteProfile,
  seed: string,
): MaterialisedRoute | null {
  const segments = segmentsOf(graph, path);
  if (segments.length === 0) return null;

  const plan = planLegs(segments);
  if (plan.legCount < 1) return null;

  const legLocations = deriveLegLocations(segments, plan);

  const startNode = nodeAt(graph, path.nodes[0] ?? -1);
  const endNode = nodeAt(graph, path.nodes[path.nodes.length - 1] ?? -1);
  if (startNode === null || endNode === null) return null;

  const beatContext: BeatContext = {
    seed,
    startNodeId: String(startNode.id),
    endNodeId: String(endNode.id),
    profile,
  };

  const nodes: NodeId[] = [];
  for (const nodeIdx of path.nodes) {
    const node = nodeAt(graph, nodeIdx);
    if (node !== null) nodes.push(node.id);
  }

  const edges = [];
  for (const edgeIdx of path.edges) {
    const edge = edgeAt(graph, edgeIdx);
    if (edge !== null) edges.push(edge.id);
  }

  // `validateRoute` requires `edges.length === nodes.length - 1`. A GeoPath guarantees it, but a
  // node or edge that failed to resolve would break it silently — so bail rather than emit a
  // route that fails validation three calls later with no clue where it came from.
  if (edges.length !== nodes.length - 1) return null;

  const route: RouteState = {
    id: routeId(idFor(profile, path)),
    profile,
    nodes,
    edges,
    legIndex: 0,
    progressKm: 0,
    legCount: plan.legCount,
    totalKm: plan.totalKm,
    legKm: plan.legKm,
    montageLegs: plan.montageLegs,
    legLocations,
    beatSchedule: deriveBeatSchedule(plan, segments, legLocations, beatContext),
  };

  return { route, segments, plan, notableNodes: notablesOf(graph, path) };
}
