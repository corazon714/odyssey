import { type EdgeCost } from './cost-function.ts';
import { otherEnd, type GeoGraph } from './geo-graph.ts';
import { createIntHeap } from './int-heap.ts';

/**
 * A concrete path through the graph, in indices rather than ids.
 *
 * Indices because everything downstream — the diversity filter's edge sets, Yen's blocked-edge
 * sets, the leg allocator's cumulative distances — is arithmetic over the same graph. Ids are
 * put back on at `materialiseRoute`, which is the one place that crosses into `RouteState`.
 */
export type GeoPath = {
  /** Node indices, start first, end last. Length is `edges.length + 1`. */
  readonly nodes: readonly number[];
  readonly edges: readonly number[];
  /** Sum of `cost` over the edges, in whatever unit the profile counts in. */
  readonly cost: number;
  /** Sum of `distanceKm`, which is comparable ACROSS profiles where `cost` is not. */
  readonly distanceKm: number;
};

export type ShortestPathOptions = {
  /** Edge indices Yen has removed for this spur. */
  readonly blockedEdges?: ReadonlySet<number>;
  /** Node indices Yen has removed for this spur (root-path nodes). */
  readonly blockedNodes?: ReadonlySet<number>;
};

const UNREACHED = -1;

/** `Int32Array` maximum. Also the fail-closed sentinel for an unreadable distance. */
const INFINITE = 2147483647;

/**
 * Dijkstra over integer edge costs, with the three closures ADR 0025 Decision 3 requires.
 *
 * 1. The heap comparator is a strict total order, `(cost, node, seq)` — see `int-heap.ts`.
 * 2. An equal-cost relaxation replaces the predecessor only when it arrives by a LOWER edge
 *    index. Without this, two equal-cost routes into a node leave the winner to pop order.
 * 3. Every cost is `>= 1` by construction in `cost-function.ts`, so a node cannot be finalised
 *    before an equal-cost competitor has been offered.
 *
 * Together with CSR adjacency in ascending edge order, the result is a function of the graph
 * and the cost function alone. The acceptance test inserts an unrelated disconnected node and
 * asserts the produced path is byte-identical.
 *
 * Lazy deletion rather than decrease-key: a node may be pushed several times and stale pops are
 * discarded by the `settled` check. That keeps the heap free of an index-of-node map, which
 * would be a second ordering surface.
 */
export function shortestPath(
  graph: GeoGraph,
  startIdx: number,
  endIdx: number,
  cost: EdgeCost,
  options: ShortestPathOptions = {},
): GeoPath | null {
  const nodeCount = graph.nodes.length;
  if (startIdx < 0 || startIdx >= nodeCount || endIdx < 0 || endIdx >= nodeCount) return null;
  if (startIdx === endIdx) {
    return { nodes: [startIdx], edges: [], cost: 0, distanceKm: 0 };
  }

  const blockedEdges = options.blockedEdges;
  const blockedNodes = options.blockedNodes;
  if (blockedNodes?.has(startIdx) === true || blockedNodes?.has(endIdx) === true) return null;

  const dist = new Int32Array(nodeCount).fill(INFINITE);
  const prevEdge = new Int32Array(nodeCount).fill(UNREACHED);
  const prevNode = new Int32Array(nodeCount).fill(UNREACHED);
  const settled = new Uint8Array(nodeCount);

  const heap = createIntHeap();
  dist[startIdx] = 0;
  heap.push(0, startIdx);

  for (;;) {
    const top = heap.pop();
    if (top === null) break;
    const u = top.node;
    // Every `?? INFINITE` below fails closed: an unreadable slot reads as unreachable, so the
    // node is skipped rather than relaxed with a plausible wrong distance.
    if ((settled[u] ?? 1) === 1) continue;
    const distU = dist[u] ?? INFINITE;
    if (top.cost !== distU) continue;
    settled[u] = 1;
    if (u === endIdx) break;

    const start = graph.adjacencyOffsets[u] ?? 0;
    const end = graph.adjacencyOffsets[u + 1] ?? 0;
    for (let slot = start; slot < end; slot += 1) {
      const edgeIdx = graph.adjacencyEdges[slot];
      if (edgeIdx === undefined) continue;
      if (blockedEdges?.has(edgeIdx) === true) continue;
      const v = otherEnd(graph, edgeIdx, u);
      if (v < 0) continue;
      if ((settled[v] ?? 1) === 1) continue;
      if (blockedNodes?.has(v) === true) continue;

      const weight = cost(graph, edgeIdx);
      if (weight === null) continue;

      const candidate = distU + weight;
      const distV = dist[v] ?? INFINITE;
      const prevEdgeV = prevEdge[v] ?? UNREACHED;
      // Strictly better, OR equal and arriving by a lower edge index. The second clause is
      // what makes the retained predecessor independent of the order equal-cost entries pop.
      if (candidate < distV || (candidate === distV && edgeIdx < prevEdgeV)) {
        dist[v] = candidate;
        prevEdge[v] = edgeIdx;
        prevNode[v] = u;
        heap.push(candidate, v);
      }
    }
  }

  if ((settled[endIdx] ?? 0) === 0) return null;

  const nodes: number[] = [endIdx];
  const edges: number[] = [];
  let distanceKm = 0;
  let cursor = endIdx;
  while (cursor !== startIdx) {
    const edgeIdx = prevEdge[cursor] ?? UNREACHED;
    const parent = prevNode[cursor] ?? UNREACHED;
    if (edgeIdx === UNREACHED || parent === UNREACHED) return null;
    edges.push(edgeIdx);
    distanceKm += graph.edges[edgeIdx]?.distanceKm ?? 0;
    nodes.push(parent);
    cursor = parent;
  }
  nodes.reverse();
  edges.reverse();

  return { nodes, edges, cost: dist[endIdx] ?? INFINITE, distanceKm };
}

/**
 * A stable string identity for a path, used to order Yen's candidate set and to dedupe.
 *
 * Edge indices joined by `>`, compared with `<` / `>` — never `localeCompare`, which is banned
 * repo-wide because it is locale- and implementation-dependent.
 */
export function pathKey(path: GeoPath): string {
  return path.edges.join('>');
}
