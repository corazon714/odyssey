import {
  ROUTE_PROFILES,
  costFor,
  edgeAt,
  generateRoutes,
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
import {
  classifyDiversity,
  endpointDegree,
  structuralFloorPercent,
  type DiversityCause,
} from './route-structure.ts';

/**
 * Phase 3 route verification, against the committed artifacts.
 *
 * ## What this can and cannot answer, and why
 *
 * It measures the GRAPH, the PATHS, and — since M3.10 — the PREVIEW the preparation screen would
 * show for each of them. The header here used to say legs, montage legs, in-game days and cash
 * were unmeasurable because six modules were not on disk. All six shipped; `previewsFor` reads
 * them through `generateRoutes`, which is the same call `sim/load-pack.ts` makes (ADR 0034), so
 * the columns are the game's own numbers rather than a second estimate of them.
 *
 * **What is still absent is absent for a different reason.** Events fired, memory chains and
 * completion rate are functions of the CONTENT PACK as well as of the route, and
 * `pnpm sim --pack=corpus` measures them off the code path the game runs. A second copy here
 * would drift from the one anybody acts on.
 *
 * **There is no risk column and there must not be one.** `RoutePreview` has no risk field, no
 * `GeoNode` or `GeoEdge` carries one, and CLAUDE.md §11 forbids deriving one from where a node
 * happens to be. What a risk band would have to be built from is printed instead — crossings,
 * hardest terrain, ferry and tolled hops, and the profile — as the physical facts they are.
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
  /** Edges on the graph incident to each endpoint. A 1 forces its single edge into every route. */
  readonly fromDegree: number;
  readonly toDegree: number;
  /** Lower bound on `maxOverlap` set by the edges every route must use. See `route-structure`. */
  readonly floorPercent: number;
  /** Whether a breach is the graph's shape or the filter's doing. */
  readonly cause: DiversityCause;
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

  const floorPercent = structuralFloorPercent(
    graph,
    result.paths.map((selected) => selected.path),
  );

  return {
    label,
    from: nameOf[from] ?? '?',
    to: nameOf[to] ?? '?',
    routes,
    rungReached: result.rungReached,
    maxOverlap,
    diversityOk: result.paths.length < 2 || maxOverlap <= DIVERSITY_PASS_THRESHOLD,
    fromDegree: endpointDegree(graph, from),
    toDegree: endpointDegree(graph, to),
    floorPercent,
    cause: classifyDiversity(
      result.paths.length,
      maxOverlap,
      floorPercent,
      DIVERSITY_PASS_THRESHOLD,
    ),
    refused,
    illicitDominates,
  };
}

/**
 * What the preparation screen would show for each route between a pair.
 *
 * Read through `generateRoutes` rather than by re-deriving `planLegs` here, so these are the
 * numbers the game produces rather than a parallel calculation of them.
 *
 * **The seed does not reach any field below**, which is why one fixed value is honest rather than
 * a hidden variable: `materialiseRoute` computes `segments` and `plan` before the seed is used,
 * and passes it only to `deriveBeatSchedule`. Leg count, montage legs, distance, hours and cash
 * are therefore identical under every seed; `RouteStart`'s departure hour and weather are not,
 * and are not reported here.
 */
export const PREVIEW_SEED = 'geo-verify';

export type PreviewFacts = {
  readonly profile: RouteProfile;
  readonly totalKm: number;
  readonly legCount: number;
  readonly montageLegCount: number;
  /** Expected in-game hours at the profile's starting mode, jitter included. */
  readonly travelHours: number;
  readonly crossings: number;
  readonly hasFerry: boolean;
  /** Advisory preparation budget. `RouteStart.cash` starts the player at 130% of it. */
  readonly recommendedCash: number;
  readonly startingMode: string;
};

/**
 * Whether the `illicit` route is also the cheapest to prepare for.
 *
 * **The companion measurement to `illicitDominates`, and the one that says what "strictly better"
 * is being measured ON.** `illicitDominates` compares three GEOMETRIC facts — distance, crossings,
 * hardest ground — and geometry is precisely where `illicit` is expected to win: its cost function
 * is `distanceKm / 5` plus penalties for crossings and populated ground, so it is already close to
 * a distance-minimiser that dodges border posts. Finding it short and border-light is close to
 * tautological, and a dominance count built only on those three overstates the problem.
 *
 * What geometry cannot see is that `illicit` is priced at 125% of a plain route by `PROFILE_COST`,
 * refuses train and ferry as ticketed, and starts the run `vehicleLegal: false`. Cash is the one
 * of those three that is a comparable NUMBER on every route, so it is the one added here. A route
 * that is shorter, flatter, crosses fewer borders AND costs less to prepare is dominant in a sense
 * no cost function disagrees with; one that merely wins on geometry is making a trade the
 * geometric test cannot represent.
 */
export function illicitCashDominates(previews: readonly PreviewFacts[]): boolean {
  const illicit = previews.find((preview) => preview.profile === 'illicit');
  const others = previews.filter((preview) => preview.profile !== 'illicit');
  return (
    illicit !== undefined &&
    others.length > 0 &&
    others.every((other) => illicit.recommendedCash < other.recommendedCash)
  );
}

export function previewsFor(graph: GeoGraph, from: number, to: number): readonly PreviewFacts[] {
  return generateRoutes(graph, from, to, PREVIEW_SEED).plans.map((plan) => ({
    profile: plan.preview.profile,
    totalKm: plan.preview.totalKm,
    legCount: plan.preview.legCount,
    montageLegCount: plan.preview.montageLegCount,
    travelHours: plan.preview.travelHours,
    crossings: plan.preview.crossings,
    hasFerry: plan.preview.hasFerry,
    recommendedCash: plan.preview.recommendedCash,
    startingMode: plan.start.transportMode,
  }));
}
