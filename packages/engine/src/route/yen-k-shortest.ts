import { type EdgeCost } from './cost-function.ts';
import { pathKey, shortestPath, type GeoPath } from './dijkstra.ts';
import { type GeoGraph } from './geo-graph.ts';

/**
 * Yen's k-shortest loopless paths, used as BACKFILL rather than as the primary generator.
 *
 * Five cost functions already produce up to five topologically distinct paths for five Dijkstra
 * runs (ADR 0025 Decision 1). Yen runs only when the diversity filter rejects a profile's path
 * as a near-duplicate of one already accepted, which is the case the profiles cannot fix by
 * themselves.
 *
 * ## The spur cap is an APPROXIMATION, and it is named rather than buried
 *
 * Yen's ascending-cost guarantee depends on enumerating *every* deviation of `A[k-1]`. Any cap
 * on spur nodes therefore breaks it: `cost(A[k+1]) < cost(A[k])` becomes possible. An earlier
 * draft capped at 24 against realistic path lengths of 15-40, which truncates the COMMON case
 * and would have invalidated the very invariant its own test asserted.
 *
 * So the cap is 64, exceeding it is REPORTED via `spurCapReached` so the caller can surface it
 * as a shortfall reason, and the returned list is sorted by `(cost, pathKey)` before it leaves.
 * The test asserts *that* — sorted output — rather than the strict ascending-discovery property
 * the cap removes.
 */
export const MAX_SPUR_NODES = 64;

export type YenOptions = {
  /** How many paths to return, including the shortest. */
  readonly k: number;
  readonly maxSpurNodes?: number;
};

export type YenResult = {
  /** Sorted by `(cost, pathKey)`. Empty when there is no path at all. */
  readonly paths: readonly GeoPath[];
  /** True when a deviation set was truncated, so the result is an approximation. */
  readonly spurCapReached: boolean;
};

function sameRoot(a: GeoPath, b: readonly number[], upTo: number): boolean {
  if (a.edges.length < upTo) return false;
  for (let i = 0; i < upTo; i += 1) {
    if (a.edges[i] !== b[i]) return false;
  }
  return true;
}

/** Total cost of a prefix of edges under this profile. Root paths are re-costed, never assumed. */
function costOf(graph: GeoGraph, edges: readonly number[], cost: EdgeCost): number | null {
  let total = 0;
  for (const edgeIdx of edges) {
    const weight = cost(graph, edgeIdx);
    if (weight === null) return null;
    total += weight;
  }
  return total;
}

/** Ascending `(cost, pathKey)`. The tie-break is a string compare with `<`, never `localeCompare`. */
function orderedBefore(a: GeoPath, b: GeoPath): boolean {
  if (a.cost !== b.cost) return a.cost < b.cost;
  return pathKey(a) < pathKey(b);
}

/**
 * `B` is a plain array kept sorted by linear insertion rather than a heap.
 *
 * `|B|` never exceeds a few hundred here, and a heap would introduce a SECOND tie-break surface
 * next to the one in `int-heap.ts` for no measurable gain — two places where equal keys could
 * order differently is exactly the kind of thing that makes a route irreproducible.
 */
function insertSorted(list: GeoPath[], path: GeoPath): void {
  let at = 0;
  while (at < list.length) {
    const existing = list[at];
    if (existing === undefined || orderedBefore(path, existing)) break;
    at += 1;
  }
  list.splice(at, 0, path);
}

export function kShortestPaths(
  graph: GeoGraph,
  startIdx: number,
  endIdx: number,
  cost: EdgeCost,
  options: YenOptions,
): YenResult {
  const maxSpurNodes = options.maxSpurNodes ?? MAX_SPUR_NODES;
  const first = shortestPath(graph, startIdx, endIdx, cost);
  if (first === null) return { paths: [], spurCapReached: false };

  const accepted: GeoPath[] = [first];
  const acceptedKeys = new Set<string>([pathKey(first)]);
  const candidates: GeoPath[] = [];
  const candidateKeys = new Set<string>();
  let spurCapReached = false;

  while (accepted.length < options.k) {
    const previous = accepted[accepted.length - 1];
    if (previous === undefined) break;

    const deviations = previous.nodes.length - 1;
    const limit = Math.min(deviations, maxSpurNodes);
    if (deviations > maxSpurNodes) spurCapReached = true;

    for (let i = 0; i < limit; i += 1) {
      const spurNode = previous.nodes[i];
      if (spurNode === undefined) continue;
      const rootEdges = previous.edges.slice(0, i);

      // Remove the edge each already-accepted path took out of this spur node, so the spur
      // cannot rediscover a path we already have.
      const blockedEdges = new Set<number>();
      for (const path of accepted) {
        if (!sameRoot(path, rootEdges, i)) continue;
        const branch = path.edges[i];
        if (branch !== undefined) blockedEdges.add(branch);
      }
      // Remove the root path's interior nodes, which is what keeps the result loopless.
      const blockedNodes = new Set<number>();
      for (let n = 0; n < i; n += 1) {
        const node = previous.nodes[n];
        if (node !== undefined) blockedNodes.add(node);
      }

      const spur = shortestPath(graph, spurNode, endIdx, cost, { blockedEdges, blockedNodes });
      if (spur === null) continue;

      const rootCost = costOf(graph, rootEdges, cost);
      if (rootCost === null) continue;
      const rootNodes = previous.nodes.slice(0, i);
      const merged: GeoPath = {
        nodes: [...rootNodes, ...spur.nodes],
        edges: [...rootEdges, ...spur.edges],
        cost: rootCost + spur.cost,
        distanceKm:
          rootEdges.reduce((sum, e) => sum + (graph.edges[e]?.distanceKm ?? 0), 0) +
          spur.distanceKm,
      };

      const key = pathKey(merged);
      if (acceptedKeys.has(key) || candidateKeys.has(key)) continue;
      candidateKeys.add(key);
      insertSorted(candidates, merged);
    }

    const next = candidates.shift();
    if (next === undefined) break;
    candidateKeys.delete(pathKey(next));
    acceptedKeys.add(pathKey(next));
    accepted.push(next);
  }

  // Sorted on the way out. With a spur cap, discovery order is not guaranteed ascending, so
  // this is the property callers may rely on — see the header.
  const paths = [...accepted].sort((a, b) =>
    orderedBefore(a, b) ? -1 : orderedBefore(b, a) ? 1 : 0,
  );
  return { paths, spurCapReached };
}
