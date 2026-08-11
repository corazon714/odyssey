import { ROUTE_PROFILES, type RouteProfile } from '../state/route-state.ts';
import { costFor, RELAX_ALL_MASKS, type CostRelaxation } from './cost-function.ts';
import { pathKey, shortestPath, type GeoPath } from './dijkstra.ts';
import { type GeoGraph } from './geo-graph.ts';
import { acceptByDiversity, DIVERSITY_RUNGS } from './route-diversity.ts';
import { kShortestPaths } from './yen-k-shortest.ts';

export const MIN_CANDIDATE_ROUTES = 3;
export const MAX_CANDIDATE_ROUTES = 5;

/** How many alternatives Yen is asked for, per profile, when backfilling. */
const YEN_K = 6;

export type SelectedPath = {
  /** The profile whose cost function produced it. Yen backfill keeps its parent profile. */
  readonly profile: RouteProfile;
  readonly path: GeoPath;
  /** True when it came from Yen rather than from the profile's own shortest path. */
  readonly fromBackfill: boolean;
};

export type RejectedPath = {
  readonly profile: RouteProfile;
  readonly reasonKey: string;
  readonly overlapPercent: number;
};

export type PathShortfall = {
  readonly requested: number;
  readonly produced: number;
  readonly rungReached: number;
  readonly reasonKey: string;
};

/** A candidate pool plus the exact duplicates removed while building it. */
type Pool = {
  readonly items: readonly SelectedPath[];
  readonly duplicates: readonly SelectedPath[];
};

export type SelectPathsResult = {
  readonly paths: readonly SelectedPath[];
  /** Null when at least `MIN_CANDIDATE_ROUTES` distinct routes were found. */
  readonly shortfall: PathShortfall | null;
  /** Always populated, whether or not there was a shortfall. Design pillar 2. */
  readonly rejected: readonly RejectedPath[];
  readonly rungReached: number;
};

/**
 * Choose up to five meaningfully different routes between two nodes.
 *
 * **Fewer than three is not an error.** One valid route is a playable run, and a corridor with
 * genuinely no alternative is a fact about the world rather than a fault in the router. The
 * result says so through `shortfall` instead of failing, and `rejected` always carries the
 * overlap percentage of everything turned away — that is design pillar 2 (legible randomness)
 * applied to route generation rather than only to checks.
 *
 * Works in `GeoPath` space. Materialising a `RouteState` — leg counts, beat schedule, locations
 * — is `generate-routes.ts`, so this module can be tested without a leg model existing.
 *
 * ## The pools
 *
 * The ladder has six rungs but only three distinct candidate POOLS, so pools are built at most
 * once and lazily:
 *
 * - **A** the five profile shortest-paths at rung-0 masks;
 * - **B** = A plus Yen backfill for every profile whose path duplicated an earlier one;
 * - **C** = B plus the five profiles re-run with every mask dropped, and their backfill.
 *
 * Rungs then re-filter a pool at a different overlap threshold. Building C costs at most ten
 * Dijkstras and ten Yen runs, and only on a graph that could not otherwise yield three routes.
 */
export function selectPaths(
  graph: GeoGraph,
  startIdx: number,
  endIdx: number,
  wanted: number = MAX_CANDIDATE_ROUTES,
): SelectPathsResult {
  const limit = Math.max(1, Math.min(wanted, MAX_CANDIDATE_ROUTES));

  /** Profile shortest-paths under one relaxation, in `ROUTE_PROFILES` order. */
  function profilePaths(relax: CostRelaxation | undefined): SelectedPath[] {
    const out: SelectedPath[] = [];
    for (const profile of ROUTE_PROFILES) {
      const path = shortestPath(
        graph,
        startIdx,
        endIdx,
        relax === undefined ? costFor(profile) : costFor(profile, relax),
      );
      if (path !== null) out.push({ profile, path, fromBackfill: false });
    }
    return out;
  }

  let spurCapReached = false;

  /** Yen alternatives for each profile, appended after every profile's own path. */
  function backfill(relax: CostRelaxation | undefined): SelectedPath[] {
    const out: SelectedPath[] = [];
    for (const profile of ROUTE_PROFILES) {
      const result = kShortestPaths(
        graph,
        startIdx,
        endIdx,
        relax === undefined ? costFor(profile) : costFor(profile, relax),
        { k: YEN_K },
      );
      if (result.spurCapReached) spurCapReached = true;
      // `paths[0]` is the profile's own shortest path, already in the pool.
      for (const path of result.paths.slice(1)) out.push({ profile, path, fromBackfill: true });
    }
    return out;
  }

  /**
   * First occurrence of each distinct route wins, so consideration order decides — and the
   * losers are KEPT rather than discarded.
   *
   * A profile whose shortest path is byte-identical to an earlier profile's has not merely
   * failed to be distinct, it has produced no alternative at all, and that is the single most
   * useful thing to tell a caller wondering why five profiles yielded three routes. Dropping it
   * silently would make `safest` look absent rather than redundant.
   */
  function dedupe(items: readonly SelectedPath[]): Pool {
    const seen = new Set<string>();
    const kept: SelectedPath[] = [];
    const duplicates: SelectedPath[] = [];
    for (const item of items) {
      const key = pathKey(item.path);
      if (seen.has(key)) {
        duplicates.push(item);
        continue;
      }
      seen.add(key);
      kept.push(item);
    }
    return { items: kept, duplicates };
  }

  const poolA = dedupe(profilePaths(undefined));
  let poolB: Pool | null = null;
  let poolC: Pool | null = null;

  function poolFor(rung: (typeof DIVERSITY_RUNGS)[number]): Pool {
    if (rung.dropMasks) {
      poolB ??= dedupe([...poolA.items, ...backfill(undefined)]);
      poolC ??= dedupe([
        ...poolB.items,
        ...profilePaths(RELAX_ALL_MASKS),
        ...backfill(RELAX_ALL_MASKS),
      ]);
      return poolC;
    }
    if (rung.useYen) {
      poolB ??= dedupe([...poolA.items, ...backfill(undefined)]);
      return poolB;
    }
    return poolA;
  }

  let best: {
    verdict: ReturnType<typeof acceptByDiversity<SelectedPath>>;
    rung: number;
    pool: Pool;
  } | null = null;

  for (const rung of DIVERSITY_RUNGS) {
    const pool = poolFor(rung);
    const verdict = acceptByDiversity(
      graph,
      pool.items,
      (item) => item.path,
      rung.maxOverlapPercent,
      limit,
    );
    best = { verdict, rung: rung.rung, pool };
    if (verdict.accepted.length >= Math.min(MIN_CANDIDATE_ROUTES, limit)) break;
  }

  if (best === null) {
    return { paths: [], shortfall: null, rejected: [], rungReached: 0 };
  }

  const paths = best.verdict.accepted;
  const rejected: RejectedPath[] = [
    // Exact duplicates first: they are the strongest signal and 100% is literally true.
    ...best.pool.duplicates.map((item): RejectedPath => ({
      profile: item.profile,
      reasonKey: 'route.rejected.duplicate',
      overlapPercent: 100,
    })),
    ...best.verdict.rejected.map((entry): RejectedPath => ({
      profile: entry.item.profile,
      reasonKey: 'route.rejected.too_similar',
      overlapPercent: entry.overlapPercent,
    })),
  ];

  const target = Math.min(MIN_CANDIDATE_ROUTES, limit);
  const shortfall: PathShortfall | null =
    paths.length >= target
      ? null
      : {
          requested: target,
          produced: paths.length,
          rungReached: best.rung,
          reasonKey: shortfallReason(spurCapReached, best.rung, best.pool.items),
        };

  return { paths, shortfall, rejected, rungReached: best.rung };
}

/**
 * Why there were not three routes. Distinguishing these matters because they call for different
 * responses: a truncated search is a tuning problem, a single corridor is a fact about the map,
 * and exhausting the masks means the profiles themselves could not diverge here.
 */
function shortfallReason(
  spurCapReached: boolean,
  rung: number,
  pool: readonly SelectedPath[],
): string {
  if (spurCapReached) return 'route.shortfall.spur_cap_reached';
  if (pool.length <= 1) return 'route.shortfall.single_corridor';
  if (rung >= DIVERSITY_RUNGS.length - 1) return 'route.shortfall.masks_exhausted';
  return 'route.shortfall.single_corridor';
}
