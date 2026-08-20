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
 * ## The measure is directional; the GUARANTEE is not
 *
 * `overlapPercent(x, y)` normalises by `x`'s own length, so it is not symmetric, and the asymmetry
 * is the point — it is what tells a truncation from a detour:
 *
 * - a short route lying wholly inside a long one reads 100% *in that direction* — it is a
 *   truncation, not an alternative;
 * - the same pair read the other way reads low, because the long route really does spend most of
 *   itself on ground the short one never sees. Jaccard collapses both into one middling number.
 *
 * A one-DIRECTION check is therefore not a per-pair guarantee, and until this fix the filter made
 * one anyway: it only ever measured a new candidate against what was already accepted, so an
 * accepted route could be swallowed by a route admitted *after* it and nothing ever looked. The
 * threshold below now bounds **`max(overlap(a,b), overlap(b,a))`** over every accepted pair, which
 * is exactly the number `verifyPair` reports. See `acceptByDiversity` and ADR 0025 Decision 5.
 */
export const DIVERSITY_MAX_PERCENT = 70;

/**
 * Overlap of `candidate` with an edge set, as an integer percentage of the candidate's distance.
 *
 * The edge set is whatever the caller is asking about, and `acceptByDiversity` asks twice with
 * different sets — the UNION of everything accepted, and then each accepted route's edges on its
 * own. Both are needed and neither subsumes the other; the doc comment there says why.
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
 *
 * ## Two checks, in two directions, and they are not the same check
 *
 * **FORWARD — how much of the candidate is already covered — is measured against the UNION.**
 * The union is what catches the case pairwise misses: a candidate sharing a different 45% with
 * each of two accepted routes is 90% covered and is an alternative to neither. Pairwise would
 * wave it through twice.
 *
 * **REVERSE — how much of each accepted route the candidate would swallow — is measured
 * PAIRWISE.** This is the direction the filter never looked in before, and the reason
 * `geo:verify` could report 85% on a pair the filter believed it had held to 70%: the accepted
 * route is normalised by ITS OWN length, so no measurement taken while it was the candidate can
 * stand in for this one. Chongjin-Jeju City accepted `safest` at 1,724 km and then a 2,573 km
 * backfill; the backfill read 53% against `safest`, `safest` read 80% inside the backfill, and
 * only the first number was ever computed.
 *
 * **The reverse check is pairwise and NOT a second union, deliberately.** A union in reverse —
 * "how much of this accepted route is covered by everything else together" — is a strictly
 * stronger claim than the one `verifyPair` measures. It would reject far more, push far more
 * pairs up the rung ladder into Yen backfill (~95% of `selectPaths`' cost), and buy a guarantee
 * nothing asks for. Pairwise in reverse makes the filter's guarantee exactly equal to the
 * reported metric, which is the property worth having.
 *
 * The post-condition, which `route-diversity.test.ts` asserts directly: for every accepted pair
 * `(a, b)`, `max(overlap(a,b), overlap(b,a)) <= maxOverlapPercent`.
 */
export function acceptByDiversity<T>(
  graph: GeoGraph,
  candidates: readonly T[],
  pathOf: (item: T) => GeoPath,
  maxOverlapPercent: number,
  limit: number,
): DiversityVerdict<T> {
  const accepted: T[] = [];
  const acceptedPaths: GeoPath[] = [];
  const rejected: { item: T; overlapPercent: number }[] = [];
  const acceptedEdges = new Set<number>();

  for (const candidate of candidates) {
    if (accepted.length >= limit) break;
    const path = pathOf(candidate);
    let worst = acceptedPaths.length === 0 ? 0 : overlapPercent(graph, path, acceptedEdges);

    // The reverse pass. Both directions are always computed, so the number reported on a
    // rejection is the worst overlap actually seen rather than whichever one was tested first —
    // design pillar 2 applied to the filter's own reasoning.
    if (acceptedPaths.length > 0) {
      const candidateEdges = new Set(path.edges);
      for (const acceptedPath of acceptedPaths) {
        const swallowed = overlapPercent(graph, acceptedPath, candidateEdges);
        if (swallowed > worst) worst = swallowed;
      }
    }

    // `>` and not `>=`: the brief says "sharing >70%", so a candidate at exactly the threshold
    // is admitted. An off-by-one here silently costs one route on every tie.
    if (worst > maxOverlapPercent) {
      rejected.push({ item: candidate, overlapPercent: worst });
      continue;
    }
    accepted.push(candidate);
    acceptedPaths.push(path);
    for (const edgeIdx of path.edges) acceptedEdges.add(edgeIdx);
  }

  return { accepted, rejected };
}
