import {
  ROUTE_PROFILES,
  costFor,
  edgeAt,
  hasMode,
  nodeAt,
  nodeId,
  overlapPercent,
  selectPaths,
  shortestPath,
  type GeoGraph,
  type GeoPath,
  type RouteProfile,
} from '@odyssey/engine';

import { DIVERSITY_PASS_THRESHOLD } from './audit-diversity.ts';

/**
 * Phase 3 route verification, against the committed artifacts.
 *
 * ## What this can and cannot answer, and why
 *
 * It measures the GRAPH and the PATHS — the only two things that exist. Legs, montage legs,
 * in-game days, cash cost, risk band, events fired, memory chains and completion rate are all
 * properties of milestones that have not shipped: `leg-plan`, `leg-locations`, `beat-schedule`,
 * `route-preview`, `materialise-route` and `generate-routes` are six files that are not on disk,
 * `RouteState` has no `legKm` or `montageLegs`, and nothing feeds a generated route to the sim.
 * Printing those columns would mean inventing them, so they are absent rather than estimated.
 *
 * Everything below is measured from `selectPaths` and the edges it returns.
 */

export type NameLookup = ReadonlyMap<string, number>;

/**
 * Node ids carry no names — those live in `nodes.gen.json`, which the engine never sees.
 *
 * **Resolved through `graph.nodeIndex`, never by artifact position.** `createGeoGraph` sorts
 * nodes by id, and `write-artifacts.ts` happens to write them sorted by id too, so the two
 * orders agree today and an index-by-position lookup would appear to work. It would also be one
 * write-order change away from labelling every row of this report with the wrong place, silently
 * and undetectably. A test fixture in any other order catches it immediately, which is how this
 * was found.
 */
export function readNames(
  nodesJson: string,
  graph: GeoGraph,
): { readonly byName: NameLookup; readonly nameOf: readonly string[] } {
  const records = (
    JSON.parse(nodesJson) as { readonly nodes: readonly { id: string; n: string | null }[] }
  ).nodes;
  const byName = new Map<string, number>();
  const nameOf = new Array<string>(graph.nodes.length).fill('(crossing)');

  for (const record of records) {
    const index = graph.nodeIndex.get(nodeId(record.id));
    if (index === undefined) continue;
    nameOf[index] = record.n ?? '(crossing)';
    if (record.n !== null) byName.set(record.n, index);
  }
  return { byName, nameOf };
}

export type RouteFacts = {
  readonly profile: RouteProfile;
  readonly km: number;
  readonly hops: number;
  readonly borders: number;
  readonly ferryHops: number;
  readonly tolledHops: number;
  /** Highest `terrainDifficulty` on the path. */
  readonly hardest: number;
};

export function factsFor(graph: GeoGraph, profile: RouteProfile, path: GeoPath): RouteFacts {
  let km = 0;
  let ferryHops = 0;
  let tolledHops = 0;
  let hardest = 0;
  const crossings = new Set<number>();

  for (const index of path.edges) {
    const edge = edgeAt(graph, index);
    if (edge === null) continue;
    km += edge.distanceKm;
    if (hasMode(edge.modes, 'ferry')) ferryHops += 1;
    if (edge.tolled) tolledHops += 1;
    if (edge.terrainDifficulty > hardest) hardest = edge.terrainDifficulty;

    for (const side of [graph.edgeFrom[index], graph.edgeTo[index]]) {
      if (side === undefined) continue;
      if (nodeAt(graph, side)?.type === 'border_crossing') crossings.add(side);
    }
  }
  return {
    profile,
    km,
    hops: path.edges.length,
    borders: crossings.size,
    ferryHops,
    tolledHops,
    hardest,
  };
}

export type PairReport = {
  readonly label: string;
  readonly from: string;
  readonly to: string;
  readonly routes: readonly RouteFacts[];
  readonly rungReached: number;
  /** Worst pairwise overlap between any two returned routes, by distance. */
  readonly maxOverlap: number;
  readonly diversityOk: boolean;
  /** Profiles that could not reach the destination without relaxation. */
  readonly refused: readonly RouteProfile[];
  /**
   * True when `illicit` beats EVERY other route on distance, borders and hard ground at once.
   *
   * A design bug rather than a metric: the illegal route is meant to be a trade — it refuses
   * ticketed modes and pays attention for every crossing. If it is also the shortest, the
   * flattest and the least policed, nothing is being traded and the other four profiles are
   * decoration.
   */
  readonly illicitDominates: boolean;
};

export function verifyPair(
  graph: GeoGraph,
  label: string,
  from: number,
  to: number,
  nameOf: readonly string[],
): PairReport {
  const result = selectPaths(graph, from, to);
  const routes = result.paths.map((selected) => factsFor(graph, selected.profile, selected.path));

  let maxOverlap = 0;
  for (let a = 0; a < result.paths.length; a += 1) {
    for (let b = 0; b < result.paths.length; b += 1) {
      if (a === b) continue;
      const pa = result.paths[a]?.path;
      const pb = result.paths[b]?.path;
      if (pa === undefined || pb === undefined || pb.edges.length === 0) continue;
      const overlap = overlapPercent(graph, pa, new Set(pb.edges));
      if (overlap > maxOverlap) maxOverlap = overlap;
    }
  }

  const refused = ROUTE_PROFILES.filter(
    (profile) => shortestPath(graph, from, to, costFor(profile)) === null,
  );

  const illicit = routes.find((r) => r.profile === 'illicit');
  const others = routes.filter((r) => r.profile !== 'illicit');
  const illicitDominates =
    illicit !== undefined &&
    others.length > 0 &&
    others.every(
      (other) =>
        illicit.km < other.km &&
        illicit.borders <= other.borders &&
        illicit.hardest <= other.hardest,
    );

  return {
    label,
    from: nameOf[from] ?? '?',
    to: nameOf[to] ?? '?',
    routes,
    rungReached: result.rungReached,
    maxOverlap,
    diversityOk: result.paths.length < 2 || maxOverlap <= DIVERSITY_PASS_THRESHOLD,
    refused,
    illicitDominates,
  };
}
