import { createHash } from 'node:crypto';

import { populationRank, type PopulationBand } from '@odyssey/engine';

import { type CandidateEdge } from './build-edges.ts';
import { interpolate, type LatLng } from './geodesy.ts';
import { regionIndexAt, type Region } from './read-natural-earth.ts';

/**
 * Where the controlled crossings are — selected geometrically, positioned by bisection, never
 * named.
 *
 * ## Why this module is not optional
 *
 * `cost-function.ts` masks `adminBoundary && !viaCrossingNode` for every profile except
 * `illicit`, and `viaCrossingNode` is true only when an endpoint is typed `border_crossing`.
 * With no crossings in the graph at all, that mask closes EVERY boundary edge to four of five
 * profiles — and the slice measured 43 components once boundary edges are removed, the largest
 * holding 15 of 170 nodes. Four profiles could route 5 of 168 sampled pairs; `illicit` routed
 * 123. The diversity ladder then rescued them by dropping masks, after which all five profiles
 * search one identical feasible graph and return near-identical paths, which is what
 * `--stage=diversity` read as 83% overlap. That number was measuring a missing pipeline stage,
 * not the cost-function collapse ADR 0025 predicted.
 *
 * ## Nothing here reads a country
 *
 * A region index is a position in a Natural Earth file, used only to detect that two points sit
 * in *different* polygons. The score is population and length. The output node has `name: null`
 * and type `border_crossing`, and `GEO_NAMED_BORDER` keeps it that way. CLAUDE.md 11.
 *
 * ## Selection: connectivity first, then score — and the leftovers are the point
 *
 * A controlled crossing on every boundary edge would make `uncontrolledBoundary` dead code and
 * delete one of ADR 0025's three divergence mechanisms. Leaving them all uncontrolled shreds the
 * graph. So the rule is a max-spanning-forest by score (Kruskal over the boundary edges, seeded
 * with the non-boundary ones) to guarantee every profile can reach everywhere, then a
 * score-ranked fill to the budget so the restrictive profiles get cycles rather than a bare
 * tree. What is left over stays uncontrolled and belongs to `illicit` alone — which is the
 * design intent, and it now falls out of a budget rather than an accident.
 *
 * Ranking by `popRank(u) + popRank(v) - floor(km/200)` means the major short corridors get the
 * posts and the long rural ones do not. That is both realistic and derived.
 *
 * ## Two deviations from the plan, stated
 *
 * **No 40 km merge.** Merging nearby crossings into one node would join roads that do not meet
 * on the ground: `u1 -> x -> v2` becomes routable when no such road exists. The node-count
 * saving is not worth inventing connectivity, and without the merge every crossing lies on
 * exactly one real corridor.
 *
 * **Ferry edges are split like any other.** A maritime boundary is a real boundary, and the
 * alternative — exempting them — would leave the two boundary-crossing ferries closed to four
 * profiles and to `illicit` too (which masks `ferry`), stranding everything beyond them.
 *
 * ## No epsilon band applies
 *
 * ADR 0024 Decision 8 covers float comparisons at decision boundaries. Every decision here is
 * discrete or integer: point-in-polygon returns an index, the score is integer, ties break on
 * edge index, and the bisection converges on a polygon flip rather than on a threshold. The one
 * float that reaches a file is the crossing's position, and `interpolate` already quantises it.
 */

/**
 * Share of boundary edges that get a controlled crossing, before the connectivity floor.
 *
 * Calibrated against the plan's own Europe allocation — 44 crossings against 150 European
 * settlements — rather than against the global 150/930, because border density per traversable
 * kilometre is far higher here than the planetary average and a global pro-rata would have
 * under-served this slice by half.
 */
export const CONTROLLED_SHARE_PERCENT = 75;

/** Bisection steps. 24 halvings put the crossing within a metre on any edge under 8,000 km. */
const BISECTION_STEPS = 24;

/** An edge shorter than this cannot be split into two positive integer distances. */
const MIN_SPLITTABLE_KM = 2;

export type BorderInput = {
  /** Parallel to the node list: position and id of every settlement. */
  readonly points: readonly LatLng[];
  readonly ids: readonly string[];
  readonly populations: readonly PopulationBand[];
  readonly edges: readonly CandidateEdge[];
  /** Admin polygon index per node, or null offshore. BUILD-TIME ONLY — never written. */
  readonly regionAt: readonly (number | null)[];
  readonly regions: readonly Region[];
};

export type BorderCrossing = {
  /** Index into `input.edges` — the corridor this crossing controls. */
  readonly parentEdge: number;
  /** `n.border.b<hash8>`, derived from the two adjacent settlement ids, sorted. */
  readonly id: string;
  readonly point: LatLng;
  /** Distance from the parent's `a` end, integer km. The remainder is the far half. */
  readonly distanceFromA: number;
};

export type BorderResult = {
  readonly crossings: readonly BorderCrossing[];
  readonly boundaryEdges: number;
  /** How many crossings the connectivity floor alone demanded. */
  readonly requiredForConnectivity: number;
  /** Boundary edges left without one. These belong to `illicit`. */
  readonly uncontrolled: number;
  readonly issues: readonly string[];
};

/** Stable, and independent of the selection ordinal — ADR 0024 Decision 2. */
export function crossingId(idA: string, idB: string): string {
  const [first, second] = idA < idB ? [idA, idB] : [idB, idA];
  const digest = createHash('sha256').update(`${first}|${second}`).digest('hex');
  // `b` prefix because ID_PATTERN requires every dot-segment to start with a letter and a hex
  // digest routinely starts with a digit. Same reason `n.city.g<geonameid>` carries its `g`.
  return `n.border.b${digest.slice(0, 8)}`;
}

/**
 * Where along `a -> b` the admin polygon first stops being `a`'s.
 *
 * `lo` always sits in `a`'s region and `hi` always does not, so the invariant holds at every
 * step and the midpoint of the final band is the boundary to within one part in 2^24. Offshore
 * (a null region) counts as "not `a`'s", which is correct: leaving the polygon is leaving it.
 */
function boundaryFraction(input: BorderInput, a: LatLng, b: LatLng, regionA: number): number {
  let lo = 0;
  let hi = 1;
  for (let step = 0; step < BISECTION_STEPS; step += 1) {
    const mid = (lo + hi) / 2;
    if (regionIndexAt(input.regions, interpolate(a, b, mid)) === regionA) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Major short corridors get the posts. Population and length only — never a place. */
function crossingScore(input: BorderInput, edge: CandidateEdge): number {
  const a = input.populations[edge.a];
  const b = input.populations[edge.b];
  if (a === undefined || b === undefined) return 0;
  return populationRank(a) + populationRank(b) - Math.floor(edge.distanceKm / 200);
}

export function placeBorders(input: BorderInput): BorderResult {
  const issues: string[] = [];
  const boundary: number[] = [];

  for (let i = 0; i < input.edges.length; i += 1) {
    const edge = input.edges[i];
    if (edge === undefined) continue;
    const regionA = input.regionAt[edge.a];
    const regionB = input.regionAt[edge.b];
    if (regionA === undefined || regionB === undefined) continue;
    if (regionA === null || regionB === null || regionA === regionB) continue;
    boundary.push(i);
  }

  // Descending score, ties on edge index — a strict total order, so the selection cannot depend
  // on sort stability.
  const ranked = [...boundary].sort((x, y) => {
    const edgeX = input.edges[x];
    const edgeY = input.edges[y];
    if (edgeX === undefined || edgeY === undefined) return x - y;
    return crossingScore(input, edgeY) - crossingScore(input, edgeX) || x - y;
  });

  // Union-find seeded with every NON-boundary edge: this is the graph a restrictive profile can
  // already traverse, and what is left to connect is exactly what it cannot.
  const parent = input.points.map((_, i) => i);
  const find = (n: number): number => {
    let root = n;
    while (parent[root] !== root) {
      const up = parent[root] ?? root;
      parent[root] = parent[up] ?? up;
      root = parent[root] ?? root;
    }
    return root;
  };
  const union = (x: number, y: number): boolean => {
    const rx = find(x);
    const ry = find(y);
    if (rx === ry) return false;
    parent[rx] = ry;
    return true;
  };

  const boundarySet = new Set(boundary);
  for (let i = 0; i < input.edges.length; i += 1) {
    const edge = input.edges[i];
    if (edge === undefined || boundarySet.has(i)) continue;
    union(edge.a, edge.b);
  }

  const selected = new Set<number>();
  let requiredForConnectivity = 0;
  for (const index of ranked) {
    const edge = input.edges[index];
    if (edge === undefined) continue;
    if (union(edge.a, edge.b)) {
      selected.add(index);
      requiredForConnectivity += 1;
    }
  }

  const budget = Math.max(
    requiredForConnectivity,
    Math.floor((boundary.length * CONTROLLED_SHARE_PERCENT) / 100),
  );
  for (const index of ranked) {
    if (selected.size >= budget) break;
    selected.add(index);
  }

  const crossings: BorderCrossing[] = [];
  for (const index of ranked) {
    if (!selected.has(index)) continue;
    const edge = input.edges[index];
    if (edge === undefined) continue;

    const a = input.points[edge.a];
    const b = input.points[edge.b];
    const idA = input.ids[edge.a];
    const idB = input.ids[edge.b];
    const regionA = input.regionAt[edge.a];
    if (a === undefined || b === undefined || idA === undefined || idB === undefined) continue;
    if (regionA === undefined || regionA === null) continue;

    if (edge.distanceKm < MIN_SPLITTABLE_KM) {
      // Loud rather than silent: an unsplittable boundary edge stays closed to four profiles,
      // and a connectivity-critical one closed is the exact failure this module exists to fix.
      issues.push(
        `boundary edge ${idA} - ${idB} is ${String(edge.distanceKm)} km and cannot carry a ` +
          `crossing; it stays uncontrolled`,
      );
      continue;
    }

    const fraction = boundaryFraction(input, a, b, regionA);
    // Both halves must be >= 1 km, and the two must still sum to the parent so total route
    // distance is preserved exactly.
    const near = Math.min(edge.distanceKm - 1, Math.max(1, Math.round(edge.distanceKm * fraction)));
    crossings.push({
      parentEdge: index,
      id: crossingId(idA, idB),
      point: interpolate(a, b, fraction),
      distanceFromA: near,
    });
  }

  return {
    crossings,
    boundaryEdges: boundary.length,
    requiredForConnectivity,
    uncontrolled: boundary.length - crossings.length,
    issues,
  };
}
