import { type GeoPath } from './dijkstra.ts';
import { type GeoGraph } from './geo-graph.ts';

/**
 * How similar two routes are allowed to be before one of them stops being an alternative.
 *
 * ## Measured by DISTANCE, not by edge count
 *
 * The brief says "sharing >70% of edges". Counting edges is the wrong instrument and the change
 * is made here deliberately rather than silently (ADR 0025 Decision 5): two routes sharing eight
 * short urban edges out of thirty are different journeys, and two sharing one 900 km trunk edge
 * are the same journey wearing different endpoints. The player experiences kilometres.
 *
 * ## Asymmetric, normalised by the CANDIDATE's own length
 *
 * Correct in both directions, which Jaccard is not:
 *
 * - a short candidate lying wholly inside a long accepted route reads 100% and is rejected — it
 *   is a truncation, not an alternative;
 * - a long candidate containing a short accepted route plus a 600 km detour reads low and is
 *   accepted, because it *is* a different journey. Jaccard would reject it.
 */
export const DIVERSITY_MAX_PERCENT = 70;

/**
 * Overlap of `candidate` with an edge set, as an integer percentage of the candidate's distance.
 *
 * **Pass the UNION of every accepted route's edges.** Checking the union subsumes checking each
 * accepted route pairwise — the union is a superset, so its shared distance is never smaller —
 * and it is the check that catches the case pairwise misses: a candidate sharing a different 45%
 * with each of two accepted routes is 90% covered and is not an alternative to either.
 *
 * (ADR 0025 Decision 5 specifies computing both and rejecting on the larger. The larger is
 * always the union, so the pairwise pass is redundant; the union check is kept and the
 * redundancy is recorded rather than implemented.)
 */
export function overlapPercent(
  graph: GeoGraph,
  candidate: GeoPath,
  acceptedEdges: ReadonlySet<number>,
): number {
  if (candidate.distanceKm <= 0) return 100;
  let sharedKm = 0;
  for (const edgeIdx of candidate.edges) {
    if (acceptedEdges.has(edgeIdx)) sharedKm += graph.edges[edgeIdx]?.distanceKm ?? 0;
  }
  return Math.floor((sharedKm * 100) / candidate.distanceKm);
}

/**
 * The ladder, in the shape of `RELAXATION_RUNGS` (`director/relaxation-rung.ts`).
 *
 * Order matters and is argued: Yen before any threshold move, because Yen produces GENUINE
 * alternatives while raising the threshold merely admits near-siblings. Dropping a profile's
 * masks is rung 4 rather than rung 1 because it changes what the profile MEANS — a `safest`
 * route through a closed mountain pass is not a safest route — so it is given up only after the
 * cheaper options are exhausted.
 *
 * `maxOverlapPercent` never reaches 100: two byte-identical routes are never two routes.
 */
export type DiversityRung = {
  readonly rung: number;
  readonly maxOverlapPercent: number;
  /** Backfill each profile that produced a duplicate with Yen alternatives. */
  readonly useYen: boolean;
  /** Re-run the profiles with their mode, season, terrain and boundary masks dropped. */
  readonly dropMasks: boolean;
  readonly describe: string;
};

export const DIVERSITY_RUNGS: readonly DiversityRung[] = Object.freeze([
  { rung: 0, maxOverlapPercent: 70, useYen: false, dropMasks: false, describe: 'profiles only' },
  { rung: 1, maxOverlapPercent: 70, useYen: true, dropMasks: false, describe: 'Yen backfill' },
  { rung: 2, maxOverlapPercent: 80, useYen: true, dropMasks: false, describe: 'overlap 80' },
  { rung: 3, maxOverlapPercent: 90, useYen: true, dropMasks: false, describe: 'overlap 90' },
  { rung: 4, maxOverlapPercent: 90, useYen: true, dropMasks: true, describe: 'masks dropped' },
  { rung: 5, maxOverlapPercent: 99, useYen: true, dropMasks: true, describe: 'accept what exists' },
]);

export type DiversityVerdict<T> = {
  readonly accepted: readonly T[];
  readonly rejected: readonly { readonly item: T; readonly overlapPercent: number }[];
};

/**
 * Greedily accept candidates whose overlap with everything already accepted is within budget.
 *
 * Consideration order is the caller's and is load-bearing: `ROUTE_PROFILES` order first, then
 * Yen backfill in ascending `(cost, pathKey)`. A greedy filter is only reproducible if the order
 * it consumes is.
 *
 * Generic over the item so the caller can carry a profile label alongside the path without this
 * module knowing what a profile is.
 */
export function acceptByDiversity<T>(
  graph: GeoGraph,
  candidates: readonly T[],
  pathOf: (item: T) => GeoPath,
  maxOverlapPercent: number,
  limit: number,
): DiversityVerdict<T> {
  const accepted: T[] = [];
  const rejected: { item: T; overlapPercent: number }[] = [];
  const acceptedEdges = new Set<number>();

  for (const candidate of candidates) {
    if (accepted.length >= limit) break;
    const path = pathOf(candidate);
    const overlap = accepted.length === 0 ? 0 : overlapPercent(graph, path, acceptedEdges);
    // `>` and not `>=`: the brief says "sharing >70%", so a candidate at exactly the threshold
    // is admitted. An off-by-one here silently costs one route on every tie.
    if (overlap > maxOverlapPercent) {
      rejected.push({ item: candidate, overlapPercent: overlap });
      continue;
    }
    accepted.push(candidate);
    for (const edgeIdx of path.edges) acceptedEdges.add(edgeIdx);
  }

  return { accepted, rejected };
}
