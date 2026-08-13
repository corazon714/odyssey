import { type GeoGraph, type GeoPath } from '@odyssey/engine';

/**
 * The diagnostics that tell a STRUCTURAL diversity failure from a real one.
 *
 * ## Why this module exists
 *
 * Section 2 of the verification report has always printed a worst-overlap percentage and a
 * PASS/FAIL against it, and that number alone cannot distinguish the two things it is asked to
 * distinguish. A pair can breach the 70% ceiling because the diversity filter admitted routes it
 * did not have to, which is a fault in the filter; or because every route between those two nodes
 * is obliged to traverse the same corridor, which is a fact about the map and no filter can fix.
 * The repo has already deleted one report row (Barcelona-Zaragoza, a single hop) for being the
 * second kind misread as the first, so the distinction is worth measuring rather than arguing.
 *
 * ## The measurement
 *
 * `forcedEdges` are the edges present in EVERY returned route. Their combined distance, as a
 * share of the SHORTEST returned route, is a hard lower bound on the worst symmetric pairwise
 * overlap the pair can achieve: the shortest route spends that share of itself on ground every
 * alternative also covers, so no selection among these candidates can read lower. When that floor
 * already exceeds the ceiling, the pair is unpassable by construction and calling it a filter
 * failure is a misattribution.
 *
 * **Normalised by the shortest route, deliberately.** `overlapPercent` normalises by the
 * CANDIDATE's own length (ADR 0025 Decision 5), so the largest percentage any candidate can show
 * is the one with the least distance to dilute the forced edges — which is the shortest. Dividing
 * by anything longer would understate the floor and let a structural failure read as a real one.
 *
 * ## Endpoint degree is the cause, not the test
 *
 * A degree-1 endpoint forces its single attaching edge into every route, so it is the commonest
 * source of a high floor — but it is neither necessary nor sufficient. Palermo-Riyadh has a
 * degree-1 endpoint and a floor of 15%, because a 300 km forced ferry is little of a 9,787 km
 * journey; Chongjin-Jeju City has one and a floor of 71%, because 630 km of forced edge is most
 * of a 1,391 km journey. The degree is reported alongside because it names the CAUSE a reader
 * then has to act on, but the floor is what decides the verdict.
 */

/** Edges shared by every path. Empty when fewer than two paths are given. */
export function forcedEdges(paths: readonly GeoPath[]): readonly number[] {
  const first = paths[0];
  if (first === undefined || paths.length < 2) return [];
  const others = paths.slice(1).map((path) => new Set(path.edges));
  return [...new Set(first.edges)].filter((edge) => others.every((set) => set.has(edge)));
}

/**
 * Lower bound on the worst pairwise overlap this candidate set can show, as an integer percent.
 *
 * `Math.floor` matches `overlapPercent`, so a floor and an overlap computed on the same edges are
 * directly comparable rather than differing by a rounding convention.
 */
export function structuralFloorPercent(graph: GeoGraph, paths: readonly GeoPath[]): number {
  if (paths.length < 2) return 0;
  const forced = forcedEdges(paths);
  if (forced.length === 0) return 0;

  const forcedKm = forced.reduce((sum, edge) => sum + (graph.edges[edge]?.distanceKm ?? 0), 0);
  const shortestKm = Math.min(...paths.map((path) => path.distanceKm));
  return shortestKm <= 0 ? 0 : Math.floor((forcedKm * 100) / shortestKm);
}

/** Number of edges incident to a node. Read straight off the CSR row pointers. */
export function endpointDegree(graph: GeoGraph, nodeIdx: number): number {
  return (graph.adjacencyOffsets[nodeIdx + 1] ?? 0) - (graph.adjacencyOffsets[nodeIdx] ?? 0);
}

/**
 * Why a pair reads the overlap it does.
 *
 * - `single` — fewer than two routes, so there is no overlap to measure and no verdict to give.
 * - `pass` — within the ceiling.
 * - `structural` — the floor alone breaches the ceiling. Unreachable for any filter over this
 *   candidate set; the fix is the graph (an edge, a ferry, a second corridor), never the filter.
 * - `filter` — the floor is within the ceiling and the measured overlap is not, so routes were
 *   admitted that did not have to be. This is the only value that indicts `acceptByDiversity`.
 */
export type DiversityCause = 'single' | 'pass' | 'structural' | 'filter';

export function classifyDiversity(
  routeCount: number,
  worstOverlap: number,
  floorPercent: number,
  ceiling: number,
): DiversityCause {
  if (routeCount < 2) return 'single';
  if (worstOverlap <= ceiling) return 'pass';
  return floorPercent > ceiling ? 'structural' : 'filter';
}
