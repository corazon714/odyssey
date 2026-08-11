import {
  distanceKm,
  haversineKm,
  interpolate,
  type EpsilonLedger,
  type LatLng,
} from './geodesy.ts';
import { isOnLand, landFractionPercent, type BoxedRing } from './read-natural-earth.ts';

/**
 * Build candidate corridors between selected nodes. **Nothing here is extracted from a road
 * database** — the whole defensibility of `docs/geo-data-licensing.md` rests on that sentence,
 * so this module reads node coordinates and public-domain land polygons and nothing else.
 *
 * Three stages, each removing a different kind of wrong edge:
 *
 * 1. **k-nearest ∪ Gabriel** proposes. k-nearest alone leaves a chain of towns with no
 *    cross-links; Gabriel alone misses the long hop across an empty stretch where the midpoint
 *    disk is never empty. Together they give a connected graph with local structure.
 * 2. **The 2-hop prune** removes an edge whose endpoints are already joined by a barely-longer
 *    two-step path. Without it every triangle keeps its long side and the graph is a mesh, which
 *    makes every route look the same and defeats the diversity filter downstream.
 * 3. **Water rejection** drops a land corridor whose middle is at sea. A ferry is NEVER produced
 *    here — sea crossings are authored in the overlay, because the generator cannot know which
 *    straits have a service and inventing one is exactly the kind of plausible fiction that
 *    would be indistinguishable from a fact.
 */

export const NEAREST_K = 6;
/** An edge survives only if any two-hop alternative is at least this much longer. */
export const TWO_HOP_RATIO_NUM = 16;
export const TWO_HOP_RATIO_DEN = 10;
/** Points sampled along a candidate to decide whether it is a land corridor. */
export const WATER_SAMPLES = 9;
/** Below this share of sampled points on land, the corridor is water and is refused. */
export const MIN_LAND_PERCENT = 70;

export type EdgeNode = LatLng & {
  /** Stable identity. The selection ordinal is deliberately NOT used — ADR 0024 Decision 2. */
  readonly key: number;
};

export type CandidateEdge = {
  readonly a: number;
  readonly b: number;
  readonly distanceKm: number;
};

export type BuildEdgesInput = {
  readonly nodes: readonly EdgeNode[];
  readonly land: readonly BoxedRing[];
  readonly ledger: EpsilonLedger;
  /** Skip water rejection when no land polygon is available — tests, and only tests. */
  readonly skipWaterRejection?: boolean;
};

export type BuildEdgesResult = {
  readonly edges: readonly CandidateEdge[];
  readonly rejectedForWater: number;
  readonly prunedTwoHop: number;
};

/** Undirected key, smaller index first, so an edge has one identity however it was proposed. */
function pairKey(a: number, b: number): string {
  return a < b ? `${String(a)}:${String(b)}` : `${String(b)}:${String(a)}`;
}

/**
 * The Gabriel test: keep `a-b` when no third node lies inside the circle having `ab` as diameter.
 *
 * Checked against the midpoint rather than by solving the circle, which is the same predicate and
 * needs one distance per neighbour. A node exactly on the circle is a near-tie, so the ledger
 * decides it — and refuses the edge, because an edge that only just survives is the one most
 * likely to flip on the next Node major.
 */
function gabrielSurvives(
  nodes: readonly EdgeNode[],
  a: number,
  b: number,
  neighbourhood: readonly number[],
  ledger: EpsilonLedger,
): boolean {
  const nodeA = nodes[a];
  const nodeB = nodes[b];
  if (nodeA === undefined || nodeB === undefined) return false;
  const midpoint = interpolate(nodeA, nodeB, 0.5);
  const radius = haversineKm(nodeA, nodeB) / 2;

  for (const c of neighbourhood) {
    if (c === a || c === b) continue;
    const nodeC = nodes[c];
    if (nodeC === undefined) continue;
    const toMid = haversineKm(nodeC, midpoint);
    if (ledger.at('gabriel').compare(toMid, radius, radius, -1) < 0) return false;
  }
  return true;
}

export function buildEdges(input: BuildEdgesInput): BuildEdgesResult {
  const { nodes, ledger } = input;
  const proposed = new Map<string, CandidateEdge>();

  // Distance matrix by brute force over the SLICE. At ~180 nodes that is 32k haversines; the
  // full 1,200-node build is 1.4M, which is still seconds. Bucketing would add an ordering
  // surface for no gain at this size, and ordering surfaces are what this phase is avoiding.
  const order: number[][] = nodes.map((_, i) =>
    nodes
      .map((_, j) => j)
      .filter((j) => j !== i)
      .sort((x, y) => {
        const nodeI = nodes[i];
        const nodeX = nodes[x];
        const nodeY = nodes[y];
        if (nodeI === undefined || nodeX === undefined || nodeY === undefined) return 0;
        const dx = haversineKm(nodeI, nodeX);
        const dy = haversineKm(nodeI, nodeY);
        if (dx === dy) return (nodeX.key ?? 0) - (nodeY.key ?? 0);
        return dx - dy;
      }),
  );

  for (let i = 0; i < nodes.length; i += 1) {
    const ranked = order[i] ?? [];
    // k-nearest.
    for (const j of ranked.slice(0, NEAREST_K)) {
      const nodeI = nodes[i];
      const nodeJ = nodes[j];
      if (nodeI === undefined || nodeJ === undefined) continue;
      proposed.set(pairKey(i, j), {
        a: Math.min(i, j),
        b: Math.max(i, j),
        distanceKm: distanceKm(nodeI, nodeJ),
      });
    }
    // Gabriel, over a bounded neighbourhood — the full set is unnecessary and slow.
    const neighbourhood = ranked.slice(0, NEAREST_K * 4);
    for (const j of neighbourhood) {
      if (proposed.has(pairKey(i, j))) continue;
      if (!gabrielSurvives(nodes, i, j, neighbourhood, ledger)) continue;
      const nodeI = nodes[i];
      const nodeJ = nodes[j];
      if (nodeI === undefined || nodeJ === undefined) continue;
      proposed.set(pairKey(i, j), {
        a: Math.min(i, j),
        b: Math.max(i, j),
        distanceKm: distanceKm(nodeI, nodeJ),
      });
    }
  }

  // Sorted before any pruning decision, so the pruning order is a property of the graph rather
  // than of Map insertion order.
  const all = [...proposed.values()].sort(
    (x, y) => x.distanceKm - y.distanceKm || x.a - y.a || x.b - y.b,
  );

  const adjacency = new Map<number, Set<number>>();
  for (const edge of all) {
    (adjacency.get(edge.a) ?? adjacency.set(edge.a, new Set()).get(edge.a))?.add(edge.b);
    (adjacency.get(edge.b) ?? adjacency.set(edge.b, new Set()).get(edge.b))?.add(edge.a);
  }

  const kept: CandidateEdge[] = [];
  let prunedTwoHop = 0;
  let rejectedForWater = 0;

  // Longest first: a long edge is the one a short two-hop path should replace, and considering
  // it first means the short edges it depends on are still present.
  for (const edge of [...all].sort(
    (x, y) => y.distanceKm - x.distanceKm || x.a - y.a || x.b - y.b,
  )) {
    const viaA = adjacency.get(edge.a);
    const viaB = adjacency.get(edge.b);
    let shortcut = false;
    if (viaA !== undefined && viaB !== undefined) {
      for (const via of viaA) {
        if (via === edge.b || !viaB.has(via)) continue;
        const nodeA = nodes[edge.a];
        const nodeB = nodes[edge.b];
        const nodeVia = nodes[via];
        if (nodeA === undefined || nodeB === undefined || nodeVia === undefined) continue;
        const twoHop = haversineKm(nodeA, nodeVia) + haversineKm(nodeVia, nodeB);
        if (twoHop * TWO_HOP_RATIO_DEN < edge.distanceKm * TWO_HOP_RATIO_NUM) {
          shortcut = true;
          break;
        }
      }
    }
    if (shortcut) {
      prunedTwoHop += 1;
      adjacency.get(edge.a)?.delete(edge.b);
      adjacency.get(edge.b)?.delete(edge.a);
      continue;
    }
    kept.push(edge);
  }

  const onLand: CandidateEdge[] = [];
  for (const edge of kept) {
    if (input.skipWaterRejection === true) {
      onLand.push(edge);
      continue;
    }
    const nodeA = nodes[edge.a];
    const nodeB = nodes[edge.b];
    if (nodeA === undefined || nodeB === undefined) continue;
    const percent = landFractionPercent(input.land, nodeA, nodeB, WATER_SAMPLES, interpolate);
    if (percent < MIN_LAND_PERCENT) {
      rejectedForWater += 1;
      continue;
    }
    onLand.push(edge);
  }

  return {
    edges: onLand.sort((x, y) => x.a - y.a || x.b - y.b),
    rejectedForWater,
    prunedTwoHop,
  };
}

/** Whether a node sits on land at all. Used to drop candidates the coastline disagrees with. */
export function nodeIsOnLand(land: readonly BoxedRing[], point: LatLng): boolean {
  return isOnLand(land, point);
}
