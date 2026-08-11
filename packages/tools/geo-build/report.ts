import { CONTINENTS, SETTLEMENT_QUOTA } from './continent.ts';
import { type EpsilonLedger } from './geodesy.ts';
import { DENSITY_CLASSES, densityClassFor, occupancy, type DensityClass } from './grid.ts';
import { type Candidate } from './read-geonames.ts';
import { PARTIAL_SCORE_MAX, type PartialScore } from './score-candidates.ts';

/**
 * The `--stage=audit` report. Fixed-width, like `sim/format-report.ts`, and for the same reason:
 * "produce a good report" is an instruction nobody can check, while a fixed layout makes two
 * runs comparable by eye and by diff.
 *
 * **It answers one question: can the candidate pool support the budget we wrote down?** Every
 * number is measured. Where a number is not yet computable it says so rather than printing a
 * placeholder — see the score note.
 */

export type AuditInput = {
  readonly source: string;
  readonly totalRead: number;
  readonly rejectedLines: readonly string[];
  readonly candidates: readonly Candidate[];
  readonly scores: readonly PartialScore[];
  readonly ledger: EpsilonLedger;
  readonly bboxDescription: string;
};

export function formatAudit(input: AuditInput): string {
  const lines: string[] = [];
  const { candidates, scores } = input;

  lines.push('# Geo candidate audit');
  lines.push('');
  lines.push(`source        ${input.source}`);
  lines.push(`region        ${input.bboxDescription}`);
  lines.push(`lines read    ${String(input.totalRead)}`);
  lines.push(`candidates    ${String(candidates.length)}   (feature class P, in region)`);
  lines.push(`unreadable    ${String(input.rejectedLines.length)}`);
  lines.push('');

  lines.push('## Supply against the ADR 0024 settlement budget');
  lines.push('');
  lines.push('  continent        candidates   quota   ratio   verdict');
  let quotaTotal = 0;
  let supplyTotal = 0;
  for (const continent of CONTINENTS) {
    const supply = candidates.filter((c) => c.continent === continent).length;
    const quota = SETTLEMENT_QUOTA[continent];
    quotaTotal += quota;
    supplyTotal += supply;
    if (quota === 0 && supply === 0) continue;
    const ratio = quota === 0 ? '—' : `${(supply / quota).toFixed(1)}x`;
    const verdict = quota === 0 ? 'excluded' : supply >= quota ? 'ok' : 'UNDER SUPPLIED';
    lines.push(
      `  ${continent.padEnd(16)}${String(supply).padStart(10)}${String(quota).padStart(8)}` +
        `${ratio.padStart(8)}   ${verdict}`,
    );
  }
  lines.push(
    `  ${'TOTAL'.padEnd(16)}${String(supplyTotal).padStart(10)}${String(quotaTotal).padStart(8)}`,
  );
  lines.push('');
  lines.push('  A continent that cannot supply its quota is a budget problem, not a code problem:');
  lines.push('  either the quota is wrong or the population floor is too high for that landmass.');
  lines.push('');

  lines.push('## Density classes, measured from candidate occupancy');
  lines.push('');
  const counts = occupancy(candidates);
  const byClass = new Map<DensityClass, { cells: number; candidates: number }>();
  for (const [, inCell] of counts) {
    const cls = densityClassFor(inCell);
    const entry = byClass.get(cls) ?? { cells: 0, candidates: 0 };
    byClass.set(cls, { cells: entry.cells + 1, candidates: entry.candidates + inCell });
  }
  lines.push('  class      cells   candidates   mean/cell');
  for (const cls of DENSITY_CLASSES) {
    const entry = byClass.get(cls) ?? { cells: 0, candidates: 0 };
    const mean = entry.cells === 0 ? '0.0' : (entry.candidates / entry.cells).toFixed(1);
    lines.push(
      `  ${cls.padEnd(10)}${String(entry.cells).padStart(6)}${String(entry.candidates).padStart(13)}` +
        `${mean.padStart(12)}`,
    );
  }
  lines.push(`  occupied cells: ${String(counts.size)}`);
  lines.push('');

  lines.push('## Partial score distribution');
  lines.push('');
  lines.push('  INCOMPLETE BY CONSTRUCTION — four of six terms. `coastal` needs the Natural Earth');
  lines.push('  land boundary and `isolation` needs the accepted set, which only exists once');
  lines.push('  selection runs. Both land at M3.5. Ranking on these four alone would differ from');
  lines.push('  the final ranking, so this is a shape check, not a shortlist.');
  lines.push('');
  const totals = scores.map((s) => s.total).sort((a, b) => a - b);
  lines.push(
    `  min ${String(totals[0] ?? 0)}   p50 ${String(percentile(totals, 0.5))}   ` +
      `p90 ${String(percentile(totals, 0.9))}   max ${String(totals[totals.length - 1] ?? 0)}   ` +
      `(of a possible ${String(PARTIAL_SCORE_MAX)})`,
  );
  lines.push('');
  lines.push('  term         mean    zero');
  for (const [label, pick] of [
    ['population', (s: PartialScore) => s.population],
    ['relief', (s: PartialScore) => s.relief],
    ['junction', (s: PartialScore) => s.junction],
    ['seat', (s: PartialScore) => s.seat],
  ] as const) {
    const values = scores.map(pick);
    const mean = values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
    const zero = values.filter((v) => v === 0).length;
    lines.push(`  ${label.padEnd(12)}${mean.toFixed(1).padStart(5)}${String(zero).padStart(8)}`);
  }
  lines.push('');
  lines.push('  A term that is zero for nearly every candidate is contributing nothing to the');
  lines.push('  ranking and should be retuned or dropped rather than left as decoration.');
  lines.push('');

  lines.push('## Float determinism');
  lines.push('');
  lines.push(`  epsilon resolutions   ${String(input.ledger.resolutions)}`);
  for (const [site, count] of [...input.ledger.sites].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    lines.push(`    ${site.padEnd(24)}${String(count).padStart(6)}`);
  }
  lines.push('');
  lines.push('  A selection boundary decided by the integer tie-break rather than by the float,');
  lines.push(
    '  because the two were within one part in a million. NON-ZERO IS FINE AND EXPECTED —',
  );
  lines.push('  the tie-break is a fixed rule, so those decisions are deterministic. What would');
  lines.push('  block `--check` as a CI gate is the count MOVING between runs or Node majors.');
  lines.push('');

  lines.push('## Not measured here');
  lines.push('');
  lines.push('  Degree distribution, continent connectivity and the detour-factor residual all');
  lines.push('  need EDGES, which M3.5 derives. `--stage=audit` deliberately stops before any');
  lines.push('  edge exists so the candidate pool can be judged on its own.');

  return `${lines.join('\n')}\n`;
}

/**
 * The `--stage=all` report: what the slice actually came out as.
 *
 * Every line is a number the review gate needs. Connectivity first, because one component is
 * the property everything else assumes.
 */
export function formatSlice(
  slice: {
    readonly nodes: readonly { readonly terrain: string; readonly type: string }[];
    readonly edges: readonly { readonly distanceKm: number; readonly adminBoundary: boolean }[];
    readonly connectivity: {
      readonly componentCount: number;
      readonly orphans: readonly number[];
      readonly bridges: readonly number[];
      readonly leafBranches: readonly { readonly stranded: number }[];
    };
    readonly degrees: readonly number[];
    readonly terrainTally: ReadonlyMap<string, number>;
    readonly rejectedForWater: number;
    readonly prunedTwoHop: number;
    readonly boundaryEdges: number;
    readonly overlayIssues: readonly string[];
    readonly overlayAdded: number;
    readonly selection: {
      readonly shortfall: readonly {
        readonly continent: string;
        readonly got: number;
        readonly want: number;
      }[];
    };
  },
  ledger: EpsilonLedger,
): string {
  const lines: string[] = ['', '# Slice', ''];
  lines.push(`nodes         ${String(slice.nodes.length)}`);
  lines.push(`edges         ${String(slice.edges.length)}`);
  lines.push(`components    ${String(slice.connectivity.componentCount)}   (must be 1)`);
  lines.push(`orphans       ${String(slice.connectivity.orphans.length)}`);
  lines.push(`bridges       ${String(slice.connectivity.bridges.length)}`);
  const bigBranches = slice.connectivity.leafBranches.filter((b) => b.stranded >= 5).length;
  lines.push(
    `  stranding >=5 nodes  ${String(bigBranches)}   (these are the ones worth declaring)`,
  );
  lines.push(`water-rejected ${String(slice.rejectedForWater)}   edges dropped as sea crossings`);
  lines.push(`two-hop pruned ${String(slice.prunedTwoHop)}`);
  lines.push(`boundary edges ${String(slice.boundaryEdges)}   (cross an admin polygon boundary)`);
  lines.push('');

  lines.push('## Overlay');
  lines.push('');
  lines.push(`  applied       ${String(slice.overlayAdded)} links`);
  if (slice.overlayIssues.length === 0) {
    lines.push('  issues        none');
  } else {
    // A rejected overlay row is the whole point of declared-intent-over-patch: it is stale or
    // wrong, and it says so instead of quietly doing nothing.
    lines.push(`  ISSUES        ${String(slice.overlayIssues.length)}`);
    for (const issue of slice.overlayIssues) lines.push(`    ${issue}`);
  }
  lines.push('');

  lines.push('## Degree distribution');
  lines.push('');
  for (let degree = 0; degree < slice.degrees.length; degree += 1) {
    const count = slice.degrees[degree] ?? 0;
    if (count === 0) continue;
    lines.push(`  ${String(degree).padStart(2)}  ${String(count).padStart(5)}`);
  }
  lines.push('');

  lines.push('## Terrain');
  lines.push('');
  for (const [kind, count] of [...slice.terrainTally].sort((a, b) => b[1] - a[1])) {
    const share = ((count / Math.max(1, slice.nodes.length)) * 100).toFixed(1);
    lines.push(`  ${kind.padEnd(10)}${String(count).padStart(5)}  ${share.padStart(5)}%`);
  }
  lines.push('');

  const distances = slice.edges.map((e) => e.distanceKm).sort((a, b) => a - b);
  lines.push('## Edge length, km');
  lines.push('');
  lines.push(
    `  p10 ${String(percentile(distances, 0.1))}   p50 ${String(percentile(distances, 0.5))}   ` +
      `p90 ${String(percentile(distances, 0.9))}   max ${String(distances[distances.length - 1] ?? 0)}`,
  );
  lines.push('');

  // Only continents that HAD candidates. A continent outside the bbox reporting "0 of 195"
  // reads as a failure and is noise — it is the bbox working, not the selector failing.
  const realShortfall = slice.selection.shortfall.filter((s) => s.got > 0);
  if (realShortfall.length > 0) {
    lines.push('## Quota shortfall');
    lines.push('');
    for (const s of realShortfall) {
      lines.push(`  ${s.continent.padEnd(16)}${String(s.got)} of ${String(s.want)}`);
    }
    lines.push('');
  }

  lines.push(`epsilon resolutions   ${String(ledger.resolutions)}`);
  return `${lines.join('\n')}\n`;
}

/** Integer-indexed, so no float rounding decides a reported statistic. Mirrors sim/percentile.ts. */
function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}
