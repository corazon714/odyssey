import {
  createGeoGraph,
  edgeId,
  modeMask,
  nodeId,
  overlapPercent,
  pathKey,
  selectPaths,
  type GeoEdge,
  type GeoNode,
  type GeoGraph,
  type LocationType,
  type PopulationBand,
  type Seasonality,
  type ServiceKind,
  type TerrainKind,
  type TransportMode,
  ROUTE_PROFILES,
  costFor,
  shortestPath,
} from '@odyssey/engine';

/**
 * **The go/no-go for the whole route-generation feature.**
 *
 * ADR 0025 Decision 2 names the risk: the licensed stack carries no fares and no travel times,
 * so `minutes` and `costCash` are both synthesised from `(distanceKm, mode, terrain)`. On a
 * single-mode corridor `cheapest` becomes an affine transform of `fastest` and returns the
 * identical path, and `safest` collapses too wherever `terrainDifficulty` is uniform. Five
 * profiles that all return one path is theatre.
 *
 * So this is a PRECONDITION, not a report. **Median pairwise overlap above 70% on the real graph
 * means the feature does not work.**
 *
 * But the median alone does not say WHY, and the first real run proved that matters: it read 83%
 * and the cause was not monotone data at all. Four of five profiles could route 5 of 168 sampled
 * pairs before relaxation, because `place-borders.ts` has never been built, so the graph has zero
 * `border_crossing` nodes and the `adminBoundary && !viaCrossingNode` mask closes every boundary
 * edge to everything except `illicit`. The ladder then rescued them by dropping masks, and five
 * profiles searching one identical feasible graph return near-identical paths as ARITHMETIC.
 *
 * Hence `feasibleUnrelaxed`. Two causes, opposite fixes — monotone data is fixed by attributes
 * (tolls, fares, rail), starved masks by building the missing pipeline stage — so the report
 * reads its diagnosis off the measurement rather than printing ADR 0025's prediction unconditionally.
 *
 * Pairs are sampled by a fixed stride over the id-sorted node list rather than at random: the
 * result has to be the same number on every machine, and this module has no RNG.
 */

type NodeRecord = {
  readonly id: string;
  readonly t: LocationType;
  readonly tr: TerrainKind;
  readonly e: number;
  readonly p: PopulationBand;
  readonly s: readonly ServiceKind[];
  readonly cm: readonly number[];
};

type EdgeRecord = {
  readonly id: string;
  readonly a: string;
  readonly b: string;
  readonly d: number;
  readonly m: readonly TransportMode[];
  readonly td: number;
  readonly sc: number;
  readonly sz: Seasonality;
  readonly tl: boolean;
  readonly ab: boolean;
  readonly uv: boolean;
};

/** Rebuild the engine's graph from the committed artifacts — the same bytes the game will load. */
export function graphFromArtifacts(nodesJson: string, edgesJson: string): GeoGraph {
  const nodeRecords = (JSON.parse(nodesJson) as { readonly nodes: readonly NodeRecord[] }).nodes;
  const edgeRecords = (JSON.parse(edgesJson) as { readonly edges: readonly EdgeRecord[] }).edges;

  const nodes: GeoNode[] = nodeRecords.map((r) => ({
    id: nodeId(r.id),
    type: r.t,
    terrain: r.tr,
    elevationM: r.e,
    population: r.p,
    services: serviceMaskOf(r.s),
    closedMonths: r.cm,
  }));

  const edges: GeoEdge[] = edgeRecords.map((r) => ({
    id: edgeId(r.id),
    from: nodeId(r.a),
    to: nodeId(r.b),
    distanceKm: r.d,
    modes: modeMask(r.m),
    terrainDifficulty: r.td,
    scenic: r.sc,
    seasonality: r.sz,
    tolled: r.tl,
    adminBoundary: r.ab,
    unavoidable: r.uv,
  }));

  const built = createGeoGraph(nodes, edges);
  if (!built.ok) throw new Error(`artifacts do not index: ${built.issues.join('; ')}`);
  return built.graph;
}

/** Local, because `serviceMask` takes the vocabulary type and the record already has it. */
function serviceMaskOf(services: readonly ServiceKind[]): number {
  const order: readonly ServiceKind[] = [
    'fuel',
    'lodging',
    'medical',
    'market',
    'transit',
    'repair',
  ];
  let mask = 0;
  for (const service of services) {
    const bit = order.indexOf(service);
    if (bit >= 0) mask |= 1 << bit;
  }
  return mask;
}

export type DiversityReport = {
  readonly pairs: number;
  readonly routable: number;
  /**
   * Sampled pairs each profile can route UNRELAXED, in `ROUTE_PROFILES` order.
   *
   * This is the number that tells the two failure hypotheses apart, and without it a high median
   * is unattributable. If the profiles can all route freely and still return the same path, the
   * cost functions have collapsed and ADR 0025 Decision 2 is what happened. If four of them can
   * barely route at all, the ladder rescued them by DROPPING MASKS — at which point every profile
   * is searching one identical feasible graph and near-identical paths are arithmetic, not a
   * property of the cost functions.
   */
  readonly feasibleUnrelaxed: readonly number[];
  /**
   * Pairs on which row and column returned the BYTE-IDENTICAL path, in `ROUTE_PROFILES` order.
   *
   * The median tells you the pool is too similar; this tells you WHICH profile is not earning
   * its place, and those are different questions with different fixes. It was a throwaway script
   * the first time and it immediately found the thing the median could not: `fastest` and
   * `cheapest` return the same path on 186 of 220 pairs, which dwarfs anything the `safest` mask
   * was doing.
   */
  readonly identicalPairs: readonly (readonly number[])[];
  /** Distribution of how many distinct routes each pair yielded, indexed by count. */
  readonly distinctCounts: readonly number[];
  /** Pairwise overlap percentages between accepted routes, across every pair. */
  readonly overlaps: readonly number[];
  readonly medianOverlap: number;
  readonly shortfalls: number;
  readonly rungsUsed: readonly number[];
  readonly verdict: 'PASS' | 'FAIL';
};

export const DIVERSITY_PASS_THRESHOLD = 70;

export function auditDiversity(graph: GeoGraph, samples: number): DiversityReport {
  const count = graph.nodes.length;
  if (count < 2) {
    return {
      pairs: 0,
      routable: 0,
      feasibleUnrelaxed: [],
      identicalPairs: [],
      distinctCounts: [],
      overlaps: [],
      medianOverlap: 0,
      shortfalls: 0,
      rungsUsed: [],
      verdict: 'FAIL',
    };
  }

  // A fixed stride over the id-sorted list. Coprime-ish offsets so the pairs spread rather than
  // clustering, and no RNG so the number is the same everywhere.
  const overlaps: number[] = [];
  const distinctCounts: number[] = [];
  const rungsUsed = new Array<number>(6).fill(0);
  const feasibleUnrelaxed = new Array<number>(ROUTE_PROFILES.length).fill(0);
  const identicalPairs = ROUTE_PROFILES.map(() => new Array<number>(ROUTE_PROFILES.length).fill(0));
  let routable = 0;
  let shortfalls = 0;
  let pairs = 0;

  const stride = Math.max(1, Math.floor(count / 7) + 1);
  for (let i = 0; i < count && pairs < samples; i += 1) {
    const start = i;
    const end = (i * stride + 1 + Math.floor(count / 2)) % count;
    if (start === end) continue;
    pairs += 1;

    const perProfile = ROUTE_PROFILES.map((profile) =>
      shortestPath(graph, start, end, costFor(profile)),
    );
    for (let p = 0; p < ROUTE_PROFILES.length; p += 1) {
      if (perProfile[p] != null) feasibleUnrelaxed[p] = (feasibleUnrelaxed[p] ?? 0) + 1;
    }
    for (let x = 0; x < ROUTE_PROFILES.length; x += 1) {
      for (let y = x + 1; y < ROUTE_PROFILES.length; y += 1) {
        const px = perProfile[x];
        const py = perProfile[y];
        if (px == null || py == null) continue;
        if (px.edges.length !== py.edges.length) continue;
        if (!px.edges.every((e, k) => e === py.edges[k])) continue;
        const rowX = identicalPairs[x];
        const rowY = identicalPairs[y];
        if (rowX !== undefined) rowX[y] = (rowX[y] ?? 0) + 1;
        if (rowY !== undefined) rowY[x] = (rowY[x] ?? 0) + 1;
      }
    }

    const result = selectPaths(graph, start, end);
    if (result.paths.length === 0) continue;
    routable += 1;
    distinctCounts[result.paths.length] = (distinctCounts[result.paths.length] ?? 0) + 1;
    rungsUsed[result.rungReached] = (rungsUsed[result.rungReached] ?? 0) + 1;
    if (result.shortfall !== null) shortfalls += 1;

    // Every accepted route against the UNION of the others: the same measure the filter uses.
    for (let a = 0; a < result.paths.length; a += 1) {
      const others = new Set<number>();
      for (let b = 0; b < result.paths.length; b += 1) {
        if (a === b) continue;
        for (const edge of result.paths[b]?.path.edges ?? []) others.add(edge);
      }
      const path = result.paths[a]?.path;
      if (path === undefined || others.size === 0) continue;
      overlaps.push(overlapPercent(graph, path, others));
    }
  }

  const sorted = [...overlaps].sort((x, y) => x - y);
  const medianOverlap = sorted[Math.floor(sorted.length / 2)] ?? 0;

  return {
    pairs,
    routable,
    feasibleUnrelaxed,
    identicalPairs,
    distinctCounts,
    overlaps: sorted,
    medianOverlap,
    shortfalls,
    rungsUsed,
    verdict: medianOverlap <= DIVERSITY_PASS_THRESHOLD ? 'PASS' : 'FAIL',
  };
}

export function formatDiversity(report: DiversityReport): string {
  const lines: string[] = ['', '# Route diversity — the go/no-go', ''];
  const pct = (q: number): number =>
    report.overlaps[Math.min(report.overlaps.length - 1, Math.floor(report.overlaps.length * q))] ??
    0;

  lines.push(`pairs sampled  ${String(report.pairs)}`);
  lines.push(`routable       ${String(report.routable)}`);
  lines.push(`shortfalls     ${String(report.shortfalls)}   (fewer than 3 distinct routes)`);
  lines.push('');
  lines.push('## Distinct routes per pair');
  lines.push('');
  for (let n = 0; n < report.distinctCounts.length; n += 1) {
    const c = report.distinctCounts[n] ?? 0;
    if (c > 0) lines.push(`  ${String(n)} routes   ${String(c)}`);
  }
  lines.push('');
  lines.push('## Pairs each profile can route with NO relaxation');
  lines.push('');
  for (let p = 0; p < ROUTE_PROFILES.length; p += 1) {
    const profile = ROUTE_PROFILES[p] ?? '?';
    const n = report.feasibleUnrelaxed[p] ?? 0;
    lines.push(`  ${profile.padEnd(9)} ${String(n)} / ${String(report.pairs)}`);
  }
  lines.push('');
  lines.push('## Pairs on which two profiles returned the IDENTICAL path');
  lines.push('');
  lines.push(`  ${''.padEnd(10)}${ROUTE_PROFILES.map((p) => p.slice(0, 8).padStart(9)).join('')}`);
  for (let x = 0; x < ROUTE_PROFILES.length; x += 1) {
    const cells = ROUTE_PROFILES.map((_, y) =>
      x === y ? '—'.padStart(9) : String(report.identicalPairs[x]?.[y] ?? 0).padStart(9),
    );
    lines.push(`  ${(ROUTE_PROFILES[x] ?? '').padEnd(10)}${cells.join('')}`);
  }
  lines.push('');
  lines.push('  A high cell is a profile not earning its place. The median above says the pool is');
  lines.push('  too similar; this says WHICH pair to fix, and they are different questions.');
  lines.push('');
  lines.push('## Ladder rung reached');
  lines.push('');
  for (let r = 0; r < report.rungsUsed.length; r += 1) {
    const c = report.rungsUsed[r] ?? 0;
    if (c > 0) lines.push(`  rung ${String(r)}   ${String(c)}`);
  }
  lines.push('');
  lines.push('## Overlap of each accepted route with the union of the others');
  lines.push('');
  lines.push(
    `  p10 ${String(pct(0.1))}%   p50 ${String(report.medianOverlap)}%   ` +
      `p90 ${String(pct(0.9))}%   n=${String(report.overlaps.length)}`,
  );
  lines.push('');
  lines.push(
    `  VERDICT: ${report.verdict} — median ${String(report.medianOverlap)}% against a ` +
      `${String(DIVERSITY_PASS_THRESHOLD)}% ceiling.`,
  );
  lines.push('');

  // The diagnosis is READ FROM THE MEASUREMENT, never assumed. A failing median has two causes
  // that look identical in the overlap number alone, and they have opposite fixes — so printing
  // ADR 0025's predicted cause unconditionally would send the reader at the wrong one.
  const starved = report.feasibleUnrelaxed.filter((n) => n * 2 < report.pairs).length;
  if (report.verdict === 'FAIL' && starved >= 2) {
    lines.push(
      `  DIAGNOSIS: MASK STARVATION, not monotone data. ${String(starved)} of ` +
        `${String(report.feasibleUnrelaxed.length)} profiles route fewer than half`,
    );
    lines.push('  the sampled pairs before any relaxation, so the ladder rescued them by DROPPING');
    lines.push('  MASKS — and every profile past that rung searches one identical feasible graph.');
    lines.push('  Near-identical paths are then arithmetic, and say nothing about the cost');
    lines.push('  functions. Restore feasibility first, then re-run: this number is not evidence');
    lines.push(
      '  about ADR 0025 Decision 2 until the profiles can actually reach the destination.',
    );
  } else if (report.verdict === 'FAIL') {
    lines.push('  DIAGNOSIS: the profiles can route freely and still return the same path, which');
    lines.push('  is ADR 0025 Decision 2 exactly. The fix is DATA — tolled corridors, ferry fees,');
    lines.push('  rail coverage — rather than code.');
  } else {
    lines.push('  The five profiles return materially different paths. ADR 0025 Decision 2 was');
    lines.push('  the risk and it did not land.');
  }
  return `${lines.join('\n')}\n`;
}

export { pathKey };
