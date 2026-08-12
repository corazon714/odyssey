import { type EdgeId, type NodeId } from '../ids/content-ids.ts';
import { type GeoEdge } from './geo-edge.ts';
import { type GeoNode } from './geo-node.ts';

/**
 * The world graph, indexed for routing. Built outside the engine, passed in as a parameter.
 *
 * `GeoGraph` is to `generateRoutes` exactly what `ContentPack` is to `advanceLeg`: constructed
 * by the caller, never loaded here. The engine may not touch the filesystem (`purity.test.ts`,
 * and `ci.yml` executes the barrel under bare Node), and geography is a build-time input
 * rather than a `ContentRegistries` member because it cannot change how an existing run plays
 * — a `RouteState` is materialised at run construction. ADR 0024 Decision 3.
 *
 * **It never reaches `RunState`.** `RouteState` continues to hold branded id strings only.
 *
 * ## Why CSR typed arrays
 *
 * NOT to escape `noUncheckedIndexedAccess`. An earlier draft of ADR 0025 claimed TypedArray
 * element access types as `number` and so dodges the flag; **it does not** — the flag applies
 * to numeric index signatures, TypedArrays included. This module is the first TypedArray in the
 * engine, so there was no precedent to check that claim against, and it was wrong.
 *
 * What survives is still worth having: flat memory, a length fixed at allocation,
 * zero-initialisation, and integrality enforced by the container rather than by review. Reads
 * are written `?? <sentinel>` with sentinels that **fail closed** — an impossible index yields
 * "no candidate" or "no predecessor", never a plausible wrong number.
 *
 * Adjacency is stored compressed-sparse-row: `adjacencyOffsets[n] .. adjacencyOffsets[n + 1]`
 * is the slice of `adjacencyEdges` belonging to node `n`. Edge indices are **ascending within
 * each node**, which is one of the three closures against tie-break nondeterminism in
 * ADR 0025 Decision 3 — an equal-cost race is settled by lowest edge index, and that is only
 * meaningful if iteration order is fixed.
 *
 * Both `Map`s are get-only. **Never iterate them** — insertion order would become an
 * unguarded ordering surface. Iterate `nodes` and `edges`, which are sorted by id.
 */
export type GeoGraph = {
  /** Sorted by id ascending, compared with `<` / `>`. Never `localeCompare` (ADR 0005 §3). */
  readonly nodes: readonly GeoNode[];
  /** Sorted by id ascending. */
  readonly edges: readonly GeoEdge[];
  readonly nodeIndex: ReadonlyMap<NodeId, number>;
  readonly edgeIndex: ReadonlyMap<EdgeId, number>;
  /** Node index of each edge's `from`, parallel to `edges`. */
  readonly edgeFrom: Int32Array;
  /** Node index of each edge's `to`, parallel to `edges`. */
  readonly edgeTo: Int32Array;
  /** Length `nodes.length + 1`. CSR row pointers into `adjacencyEdges`. */
  readonly adjacencyOffsets: Int32Array;
  /** Edge indices, ascending within each node's slice. Each edge appears at BOTH endpoints. */
  readonly adjacencyEdges: Int32Array;
};

export type GeoGraphResult =
  | { readonly ok: true; readonly graph: GeoGraph }
  | { readonly ok: false; readonly issues: readonly string[] };

/**
 * Index a node/edge list into a `GeoGraph`, or report every reason it cannot be indexed.
 *
 * RETURNS issues rather than throwing, following `createRunState` and the content loaders. It
 * reports ALL of them rather than the first, because a geo build that fails does so in bulk and
 * a caller fixing them one round-trip at a time is the worst version of this.
 *
 * The checks are the ones that make the CSR arrays constructible at all — a dangling endpoint
 * has no index to write. Graph-quality questions (connectivity, orphans, bridges, over-long
 * edges) belong to `content:lint`, which can report them with a file and a rule name; see
 * ADR 0018 on what belongs where.
 */
export function createGeoGraph(
  nodes: readonly GeoNode[],
  edges: readonly GeoEdge[],
): GeoGraphResult {
  const issues: string[] = [];

  const sortedNodes = [...nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const sortedEdges = [...edges].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const nodeIndex = new Map<NodeId, number>();
  for (let i = 0; i < sortedNodes.length; i += 1) {
    const node = sortedNodes[i];
    if (node === undefined) continue;
    if (nodeIndex.has(node.id)) issues.push(`duplicate node id: ${node.id}`);
    else nodeIndex.set(node.id, i);
  }

  const edgeIndex = new Map<EdgeId, number>();
  for (let i = 0; i < sortedEdges.length; i += 1) {
    const edge = sortedEdges[i];
    if (edge === undefined) continue;
    if (edgeIndex.has(edge.id)) issues.push(`duplicate edge id: ${edge.id}`);
    else edgeIndex.set(edge.id, i);
  }

  const edgeFrom = new Int32Array(sortedEdges.length);
  const edgeTo = new Int32Array(sortedEdges.length);
  const degree = new Int32Array(sortedNodes.length);

  for (let i = 0; i < sortedEdges.length; i += 1) {
    const edge = sortedEdges[i];
    if (edge === undefined) continue;
    const from = nodeIndex.get(edge.from);
    const to = nodeIndex.get(edge.to);
    if (from === undefined || to === undefined) {
      issues.push(`edge ${edge.id} names a node that does not exist: ${edge.from} -> ${edge.to}`);
      continue;
    }
    if (from === to) issues.push(`edge ${edge.id} is a self-loop at ${edge.from}`);
    if (!Number.isInteger(edge.distanceKm) || edge.distanceKm <= 0) {
      issues.push(`edge ${edge.id} has distanceKm ${edge.distanceKm}; must be a positive integer`);
    }
    if (edge.modes === 0) issues.push(`edge ${edge.id} has an empty mode mask`);
    edgeFrom[i] = from;
    edgeTo[i] = to;
    degree[from] = (degree[from] ?? 0) + 1;
    degree[to] = (degree[to] ?? 0) + 1;
  }

  if (issues.length > 0) return { ok: false, issues };

  const adjacencyOffsets = new Int32Array(sortedNodes.length + 1);
  for (let n = 0; n < sortedNodes.length; n += 1) {
    adjacencyOffsets[n + 1] = (adjacencyOffsets[n] ?? 0) + (degree[n] ?? 0);
  }

  // `cursor` walks each node's slice as edges are appended. Because `sortedEdges` is in
  // ascending id order and we append in that order, edge indices come out ascending within
  // every node's slice for free — which is the ordering the tie-break argument depends on.
  const cursor = adjacencyOffsets.slice(0, sortedNodes.length);
  const adjacencyEdges = new Int32Array(2 * sortedEdges.length);
  for (let i = 0; i < sortedEdges.length; i += 1) {
    const from = edgeFrom[i] ?? 0;
    const to = edgeTo[i] ?? 0;
    adjacencyEdges[cursor[from] ?? 0] = i;
    cursor[from] = (cursor[from] ?? 0) + 1;
    adjacencyEdges[cursor[to] ?? 0] = i;
    cursor[to] = (cursor[to] ?? 0) + 1;
  }

  return {
    ok: true,
    graph: {
      nodes: sortedNodes,
      edges: sortedEdges,
      nodeIndex,
      edgeIndex,
      edgeFrom,
      edgeTo,
      adjacencyOffsets,
      adjacencyEdges,
    },
  };
}

/**
 * The endpoint of `edgeIdx` that is not `nodeIdx`. Edges are undirected.
 *
 * Returns -1 for an edge index out of range, which fails closed: callers treat a negative node
 * index as unreachable rather than relaxing into slot 0.
 */
export function otherEnd(graph: GeoGraph, edgeIdx: number, nodeIdx: number): number {
  const from = graph.edgeFrom[edgeIdx];
  const to = graph.edgeTo[edgeIdx];
  if (from === undefined || to === undefined) return -1;
  return from === nodeIdx ? to : from;
}

/** The node record at an index, or null. Keeps callers free of non-null assertions. */
export function nodeAt(graph: GeoGraph, nodeIdx: number): GeoNode | null {
  return graph.nodes[nodeIdx] ?? null;
}

export function edgeAt(graph: GeoGraph, edgeIdx: number): GeoEdge | null {
  return graph.edges[edgeIdx] ?? null;
}
