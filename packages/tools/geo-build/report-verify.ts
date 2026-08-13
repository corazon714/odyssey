import { ROUTE_PROFILES, costFor, selectPaths, shortestPath, type GeoGraph } from '@odyssey/engine';

import { DIVERSITY_PASS_THRESHOLD } from './audit-diversity.ts';
import { verifyPair, type NameLookup, type PairReport } from './verify-routes.ts';

/**
 * The Phase 3 verification report.
 *
 * **This report stops at the graph, and since M3.11 that is a boundary rather than a gap.** The
 * six modules the original header named as "not on disk" — `leg-plan`, `leg-locations`,
 * `beat-schedule`, `route-preview`, `materialise-route`, `generate-routes` — all shipped in M3.7
 * through M3.10, and `sim/load-pack.ts` now builds the corpus scenarios by calling
 * `generateRoutes` (ADR 0034). So legs, days, cash, events fired and completion rate ARE
 * measurable now; they are simply not measurable HERE, because every one of them is a function
 * of the content pack as well as of the route. `pnpm sim --pack=corpus` is where they live, and
 * a second copy computed off a different code path is a balance report that drifts from the one
 * anybody acts on.
 *
 * What this file measures is what a route is before any content touches it: distance, hops,
 * crossings, ferries, tolls, how many distinct routes a pair yields and how far apart they are.
 */

/**
 * Ten pairs, picked under a CONSTRAINT rather than by ranking anything.
 *
 * The previous list was chosen for the 263-node Europe-and-Maghreb slice and did not survive
 * M3.11. Five of its ten pairs named nodes the selector no longer keeps, and one that survived
 * — Barcelona-Zaragoza, a SINGLE HOP — printed a section 2 FAIL that measured nothing, because
 * one edge has nothing to diversify.
 *
 * ## The constraint, three clauses, all checked before the list was written
 *
 * 1. **Twenty distinct endpoints.** No node appears twice. This is the clause that stops ten
 *    rows collapsing into one measurement repeated: `CORPUS_PAIRS` failed exactly that way at
 *    2e38375, where four rows shared one destination.
 * 2. **One pair per distance band**, bands disjoint and spanning the slice's achievable range:
 *    250-500, 500-1k, 1k-2k, 2k-3k, 3k-4.5k, 4.5k-6k, 6k-8k, 8k-10k, 10k-13k, 13k+. A pair is
 *    admitted for the band it FILLS, never for being the longest — which is how the same list
 *    failed AGAIN at 04f0f38, where ranking longest-first returned five routes all sitting on
 *    the 48-leg cap.
 * 3. **At least three hops** on the first returned route. Below that the section 2 overlap
 *    number is not measuring a property of the filter.
 *
 * Within a band the pick is the first admissible pair scanning the alphabetical settlement list
 * from that band's own offset, `floor(band * 411 / 10)`, wrapping — the fixed-stride, RNG-free
 * spreading `benchmark` and `auditDiversity` already use. Plain alphabetical-first was tried and
 * rejected: it put nine of ten `from` cities under "A", a shape the tie-break invented. Bands
 * fill longest-first, because the long bands have the fewest admissible pairs and would
 * otherwise find their endpoints already taken.
 *
 * **The 48-leg cap is exercised, not saturated, and that is measured rather than hoped for.**
 * `planLegs` over the first route of each row gives 15, 20, 22, 22, 23, 30, 32, 45, 48, 48 —
 * two rows at the cap, both in the top two bands, which is where a cap is supposed to bite.
 *
 * `noRoute` is deliberately absent and that absence is a RESULT: `--stage=all` refuses to write
 * a fragment, so on the shipped slice no pair is unreachable. The nearest real thing is a
 * profile-level refusal, which the `refused` column reports.
 */
export const NAMED_PAIRS: readonly (readonly [string, string, string])[] = [
  ['250-500 km', 'Marand', 'Mosul'],
  ['500 km - 1,000', 'Belgrade', 'Burgas'],
  ['1,000 km - 2,000', 'Chongjin', 'Jeju City'],
  ['2,000 km - 3,000', 'Guangyuan', 'Monywa'],
  ['3,000 km - 4,500', 'Kampala', 'Kinshasa'],
  ['4,500 km - 6,000', 'Lampang', 'Mianwali'],
  ['6,000 km - 8,000', 'Molde', 'Montana'],
  ['8,000 km - 10,000', 'Palermo', 'Riyadh'],
  ['10,000 km - 13,000', 'Sambalpur', 'Slavonski Brod'],
  ['13,000 km and up', 'Tianshui', 'Toulouse'],
];

/**
 * Twelve pairs spanning the slice's achievable range, shortest to longest.
 *
 * Same constraint as `NAMED_PAIRS` at a finer grain — twelve disjoint bands, one pair each —
 * with two differences that follow from what this section is for. **Its twenty-four endpoints
 * are disjoint from the named ten's twenty**, so the sweep is a second sample of the graph
 * rather than the same one re-sorted; and the three-hop floor drops to two, because a sweep
 * reports distance and hop count without gating diversity.
 */
export const SWEEP_PAIRS: readonly (readonly [string, string])[] = [
  ['A Coruna', 'Porto'],
  ['Barcelona', 'Bordeaux'],
  ['Caen', 'Duesseldorf'],
  ['Emden', 'Ferrara'],
  ['Huambo', 'Kolwezi'],
  ['Kasulu', 'Luanda'],
  ['Lausanne', 'Moscow'],
  ['Melitopol', 'Merida'],
  ['Nasiriyah', 'OErnskoeldsvik'],
  ['Proddatur', 'Pskov'],
  ['Shostka', 'Singida'],
  ['Tromso', 'Ubon Ratchathani'],
];

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}
function num(value: number, width: number): string {
  return String(value).padStart(width);
}

function resolve(byName: NameLookup, name: string): number | null {
  return byName.get(name) ?? null;
}

export function formatVerification(
  graph: GeoGraph,
  byName: NameLookup,
  nameOf: readonly string[],
): string {
  const lines: string[] = ['', '# Phase 3 route verification', ''];

  lines.push('Measured from `selectPaths` against the committed artifacts, on the Afro-Eurasia');
  lines.push('slice. Legs, in-game days, cash, events fired and completion rate are NOT here and');
  lines.push('that is a boundary, not a gap: since M3.10 they are all a function of the CONTENT');
  lines.push('PACK as well as of the route, and `pnpm sim --pack=corpus` measures them off the');
  lines.push('code path the game runs. A second copy computed here would drift from it.');
  lines.push('');
  lines.push('The pair lists are picked under a stated constraint — one pair per distance band,');
  lines.push('every endpoint distinct, three hops minimum — never by ranking. See NAMED_PAIRS.');
  lines.push('');

  // ── 1 + 2 ────────────────────────────────────────────────────────────────────────────────
  const reports: PairReport[] = [];
  const missing: string[] = [];
  for (const [label, from, to] of NAMED_PAIRS) {
    const a = resolve(byName, from);
    const b = resolve(byName, to);
    if (a === null || b === null) {
      missing.push(`${from} -> ${to} (${a === null ? from : to} is not a node in this slice)`);
      continue;
    }
    reports.push(verifyPair(graph, label, a, b, nameOf));
  }

  lines.push('## 1. Ten pairs');
  lines.push('');
  lines.push(
    `  ${pad('pair', 32)}${pad('band', 20)}${'km'.padStart(6)}${'hops'.padStart(5)}` +
      `${'brdr'.padStart(5)}${'fry'.padStart(4)}${'toll'.padStart(5)}${'rts'.padStart(4)}` +
      `${'ovlp'.padStart(6)}${'rung'.padStart(5)}  refused at rung 0`,
  );
  for (const report of reports) {
    const best = report.routes[0];
    if (best === undefined) continue;
    lines.push(
      `  ${pad(`${report.from}-${report.to}`, 32)}${pad(report.label, 20)}` +
        `${num(best.km, 6)}${num(best.hops, 5)}${num(best.borders, 5)}${num(best.ferryHops, 4)}` +
        `${num(best.tolledHops, 5)}${num(report.routes.length, 4)}` +
        `${`${String(report.maxOverlap)}%`.padStart(6)}${num(report.rungReached, 5)}  ` +
        `${report.refused.length === 0 ? '—' : report.refused.join(' ')}`,
    );
  }
  if (missing.length > 0) {
    lines.push('');
    lines.push('  NOT IN THIS SLICE — the pair was requested and the node does not exist:');
    for (const entry of missing) lines.push(`    ${entry}`);
  }
  lines.push('');
  lines.push('  km/hops/borders describe the FIRST returned route. `ovlp` is the worst pairwise');
  lines.push('  overlap among all routes returned for that pair, which is what section 2 gates.');
  lines.push('');

  lines.push('## 2. Diversity — no two routes may share more than 70% of a route by distance');
  lines.push('');
  let worst = 0;
  let failures = 0;
  for (const report of reports) {
    if (report.maxOverlap > worst) worst = report.maxOverlap;
    if (!report.diversityOk) failures += 1;
    const singleEdge = (report.routes[0]?.hops ?? 0) <= 1;
    const verdict =
      report.routes.length < 2
        ? 'single route'
        : report.diversityOk
          ? 'ok'
          : singleEdge
            ? 'FAIL (one hop — nothing to diversify)'
            : 'FAIL';
    lines.push(
      `  ${pad(`${report.from}-${report.to}`, 26)}${num(report.routes.length, 3)} routes  ` +
        `worst overlap ${`${String(report.maxOverlap)}%`.padStart(5)}  ` +
        `rung ${String(report.rungReached)}  ${verdict}`,
    );
  }
  lines.push('');
  lines.push(
    `  VERDICT: ${failures === 0 ? 'PASS' : 'FAIL'} — ${String(failures)} of ` +
      `${String(reports.length)} pairs exceed the ${String(DIVERSITY_PASS_THRESHOLD)}% ceiling; ` +
      `worst seen ${String(worst)}%.`,
  );
  lines.push('');
  lines.push('  NOT the ladder relaxing — the breach below resolved at rung 1, and rungs 0 and 1');
  lines.push('  both cap overlap at 70 (`DIVERSITY_RUNGS`). Two causes, both re-measured on the');
  lines.push('  692-node slice:');
  lines.push('');
  lines.push('  ONE: THE GUARANTEE IS DIRECTIONAL, and it survived the slice change intact.');
  lines.push('  `acceptByDiversity` tests each NEW candidate against the union of what is already');
  lines.push('  accepted, normalised by the CANDIDATE’s length, and never re-tests an earlier');
  lines.push('  route against a later one. Chongjin-Jeju City accepts, in order, `fastest`');
  lines.push('  (1,391 km), `safest` (1,724) and three Yen backfills at 2,573, 2,690 and 9,068.');
  lines.push(
    '  `safest` is 80% inside the 2,573 km backfill — but the backfill was accepted AFTER',
  );
  lines.push(
    '  it, so the only number ever measured between the two is the backfill’s 53% against',
  );
  lines.push('  `safest`. The 80% was never looked at by anything.');
  lines.push('  The candidate-normalisation is deliberate (ADR 0025 Decision 5 uses it to reject');
  lines.push(
    '  truncations) but its consequence — a one-way guarantee — is still not written down.',
  );
  lines.push('');
  lines.push(
    '  TWO: YEN BACKFILL OFFERS ROUTES NOBODY WOULD DRIVE, and the bigger slice made this',
  );
  lines.push('  worse rather than better. Chongjin-Jeju City is 1,391 km direct and the pool also');
  lines.push('  holds a 9,068 km route — 6.5x the shortest, offered as a choice. Marand-Mosul is');
  lines.push('  466 km direct against a 1,401 km backfill, 3.0x. `kShortestPaths` has no length');
  lines.push('  ceiling relative to the shortest path, and on a continental graph there is far');
  lines.push('  more room to stray. Section 4 measures how far this goes across the whole graph.');
  lines.push('');
  lines.push(
    '  So a per-pair 70% guarantee is not something this system currently makes. ADR 0025',
  );
  lines.push('  gates the MEDIAN over many pairs, which `pnpm geo:diversity` reports and passes.');
  lines.push('');

  // ── 3 ────────────────────────────────────────────────────────────────────────────────────
  lines.push('## 3. Distance sweep');
  lines.push('');
  lines.push(
    `  ${pad('pair', 26)}${'km'.padStart(6)}${'hops'.padStart(5)}${'brdr'.padStart(5)}` +
      `${'fry'.padStart(4)}${'toll'.padStart(5)}${'rts'.padStart(4)}${'ovlp'.padStart(6)}`,
  );
  const sweep: { km: number; line: string }[] = [];
  for (const [from, to] of SWEEP_PAIRS) {
    const a = resolve(byName, from);
    const b = resolve(byName, to);
    if (a === null || b === null) {
      sweep.push({ km: -1, line: `  ${pad(`${from}-${to}`, 26)}  NOT IN THIS SLICE` });
      continue;
    }
    const report = verifyPair(graph, 'sweep', a, b, nameOf);
    const best = report.routes[0];
    if (best === undefined) {
      sweep.push({ km: -1, line: `  ${pad(`${from}-${to}`, 26)}  NO ROUTE` });
      continue;
    }
    sweep.push({
      km: best.km,
      line:
        `  ${pad(`${report.from}-${report.to}`, 26)}${num(best.km, 6)}${num(best.hops, 5)}` +
        `${num(best.borders, 5)}${num(best.ferryHops, 4)}${num(best.tolledHops, 5)}` +
        `${num(report.routes.length, 4)}${`${String(report.maxOverlap)}%`.padStart(6)}`,
    });
  }
  for (const entry of [...sweep].sort((x, y) => x.km - y.km)) lines.push(entry.line);
  lines.push('');
  lines.push(
    '  The 300 km - 13,000 km span the brief asked for IS achievable on this slice, which',
  );
  lines.push('  it was not before M3.11 — the 263-node Europe-and-Maghreb bbox topped out at');
  lines.push('  5,294 km. The widest great-circle separation the slice contains is 15,552 km');
  lines.push('  (Cape Town to Magadan); the longest row above is 14,753 km of road.');
  lines.push('');

  // ── 4 ────────────────────────────────────────────────────────────────────────────────────
  lines.push('## 4. Pathological cases, over a stride sample of the whole graph');
  lines.push('');
  // SETTLEMENTS ONLY. The graph is 35% border-crossing nodes, and a journey does not begin at
  // a border post — sampling them as endpoints measures a pair no player can ever ask for.
  const settlements: number[] = [];
  for (let i = 0; i < graph.nodes.length; i += 1) {
    if (graph.nodes[i]?.type !== 'border_crossing') settlements.push(i);
  }
  const count = settlements.length;
  const stride = Math.max(1, Math.floor(count / 7) + 1);
  const unreachable: string[] = [];
  const singleRoute: string[] = [];
  const illicitBest: string[] = [];
  const refusedBy = new Map<string, number>();
  const detours: number[] = [];
  let sampled = 0;

  for (let i = 0; i < count; i += 1) {
    const from = settlements[i];
    const to = settlements[(i * stride + 1 + Math.floor(count / 2)) % count];
    if (from === undefined || to === undefined || from === to) continue;
    sampled += 1;
    const report = verifyPair(graph, 'sample', from, to, nameOf);
    const pair = `${report.from} -> ${report.to}`;
    if (report.routes.length === 0) unreachable.push(pair);
    else if (report.routes.length === 1) singleRoute.push(pair);
    if (report.illicitDominates) illicitBest.push(pair);
    if (report.routes.length >= 2) {
      const km = report.routes.map((r) => r.km);
      const lo = Math.min(...km);
      if (lo > 0) detours.push(Math.max(...km) / lo);
    }
    for (const profile of report.refused) {
      refusedBy.set(profile, (refusedBy.get(profile) ?? 0) + 1);
    }
  }

  lines.push(`  sampled pairs   ${String(sampled)}`);
  lines.push('');
  lines.push(`  UNREACHABLE (no route at any rung)   ${String(unreachable.length)}`);
  for (const pair of unreachable.slice(0, 8)) lines.push(`    ${pair}`);
  if (unreachable.length === 0) {
    lines.push('    None, and that is structural rather than lucky: the build refuses to write');
    lines.push('    a graph with more than one component, so every pair is reachable at rung 5.');
    lines.push('    A genuinely unroutable pair cannot exist until the graph can be disconnected.');
  }
  lines.push('');
  lines.push(`  ONLY ONE ROUTE   ${String(singleRoute.length)}`);
  for (const pair of singleRoute.slice(0, 8)) lines.push(`    ${pair}`);
  if (singleRoute.length > 8) lines.push(`    ... and ${String(singleRoute.length - 8)} more`);
  lines.push('');
  lines.push('  REFUSED AT RUNG 0, by profile   (the mask worked; the ladder then relaxed it)');
  for (const profile of ROUTE_PROFILES) {
    lines.push(
      `    ${pad(profile, 10)}${num(refusedBy.get(profile) ?? 0, 5)} of ${String(sampled)}`,
    );
  }
  lines.push('');
  lines.push('  ROUTES NOBODY WOULD DRIVE   longest returned route / shortest, per pair');
  const ratios = detours.sort((a, b) => a - b);
  const ratioAt = (q: number): number => ratios[Math.floor(ratios.length * q)] ?? 0;
  lines.push(
    `    p50 ${ratioAt(0.5).toFixed(2)}x   p90 ${ratioAt(0.9).toFixed(2)}x   ` +
      `p99 ${ratioAt(0.99).toFixed(2)}x   max ${(ratios[ratios.length - 1] ?? 0).toFixed(2)}x`,
  );
  for (const threshold of [2, 3, 4]) {
    const over = ratios.filter((r) => r > threshold).length;
    lines.push(
      `    over ${String(threshold)}x the shortest: ${String(over)} of ${String(ratios.length)} pairs ` +
        `(${((over / Math.max(1, ratios.length)) * 100).toFixed(0)}%)`,
    );
  }
  lines.push('    A tail, not a systemic fault — but offering a 10x detour as a "route" is not a');
  lines.push('    choice, it is noise in the candidate list. `kShortestPaths` has no ceiling on');
  lines.push('    how far a backfill may stray from the shortest path, and it should.');
  lines.push('');
  lines.push(
    `  ILLICIT STRICTLY DOMINATES   ${String(illicitBest.length)}   <- a design bug if > 0`,
  );
  for (const pair of illicitBest.slice(0, 10)) lines.push(`    ${pair}`);
  lines.push('');
  lines.push('  Dominates means: shorter than EVERY other returned route, crossing no more');
  lines.push('  borders and no harder ground. The illegal route is meant to be a trade — if it');
  lines.push('  is also the shortest and flattest, nothing is being traded.');
  lines.push('');

  return lines.join('\n');
}

/** Total `selectPaths` cost per pair, and the five raw Dijkstras inside it, same pairs. */
export type BenchmarkSample = {
  readonly total: readonly number[];
  readonly dijkstra: readonly number[];
};

/** The phone multiplier. An ASSUMPTION with a stated basis — see the report text. */
const DEVICE_MULTIPLIER = 6;

/**
 * The budget, in milliseconds of estimated phone time, for one `selectPaths` call.
 *
 * **DELIBERATELY NOT RAISED at M3.11.** The number is a statement about what a player will sit
 * through between tapping a destination and seeing routes, and nothing about that changed when
 * the map grew. Passing today would take roughly five times this — a number chosen to match the
 * measurement, which is recording the regression as the requirement.
 */
const BUDGET_MS = 150;

/**
 * Wall-clock for `selectPaths`, which is the whole cost of route generation today: five
 * Dijkstras plus Yen backfill plus the diversity filter.
 *
 * Reported in Node on this machine, with the phone multiplier stated rather than applied
 * silently. ADR 0012 records that Hermes is untested here, so the multiplier is an assumption
 * and is labelled as one.
 *
 * **Split into Dijkstra and everything-else since M3.11**, because a single total said the
 * budget was missed without saying by what, and the two halves scale with completely different
 * things. See the report text for the measurement.
 */
export function formatBenchmark(graph: GeoGraph, sample: BenchmarkSample): string {
  const quantiles = (values: readonly number[]): { mean: number; at: (q: number) => number } => {
    const sorted = [...values].sort((a, b) => a - b);
    return {
      mean: sorted.reduce((s, v) => s + v, 0) / Math.max(1, sorted.length),
      at: (q: number): number =>
        sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0,
    };
  };
  const total = quantiles(sample.total);
  const dijkstra = quantiles(sample.dijkstra);
  const rest = quantiles(sample.total.map((v, i) => v - (sample.dijkstra[i] ?? 0)));
  const phone = (ms: number): string => (ms * DEVICE_MULTIPLIER).toFixed(1);
  const lines: string[] = ['', '## 5. Route generation benchmark', ''];

  lines.push(
    `  graph            ${String(graph.nodes.length)} nodes, ${String(graph.edges.length)} edges`,
  );
  lines.push(`  pairs measured   ${String(sample.total.length)}`);
  lines.push('');
  lines.push(
    `  Node/V8 per call   ${'mean'.padStart(8)}${'p50'.padStart(9)}${'p90'.padStart(9)}${'max'.padStart(9)}`,
  );
  for (const [label, q] of [
    ['selectPaths  total', total],
    ['  5x Dijkstra', dijkstra],
    ['  Yen + filter', rest],
  ] as const) {
    lines.push(
      `  ${label.padEnd(19)}${q.mean.toFixed(2).padStart(8)}${q.at(0.5).toFixed(2).padStart(9)}` +
        `${q.at(0.9).toFixed(2).padStart(9)}${q.at(1).toFixed(2).padStart(9)}`,
    );
  }
  lines.push('');
  lines.push(`  DEVICE MULTIPLIER: ${String(DEVICE_MULTIPLIER)}x, assumed, not measured.`);
  lines.push('  A mid-range phone under Hermes runs this kind of allocation-light integer work');
  lines.push(
    '  roughly 4-8x slower than desktop V8. 6x is the middle of that and the number every',
  );
  lines.push('  figure below is scaled by. ADR 0012 records that Hermes is UNTESTED in this repo,');
  lines.push('  so this is an assumption with a stated basis, not a measurement.');
  lines.push('');
  lines.push(
    `  Phone estimate     mean ${phone(total.mean)} ms   p50 ${phone(total.at(0.5))}   ` +
      `p90 ${phone(total.at(0.9))}   max ${phone(total.at(1))}`,
  );
  lines.push(
    `  VERDICT vs ${String(BUDGET_MS)} ms budget: ` +
      `${total.at(1) * DEVICE_MULTIPLIER <= BUDGET_MS ? 'PASS' : 'FAIL'} at the measured maximum, ` +
      `${total.at(0.9) * DEVICE_MULTIPLIER <= BUDGET_MS ? 'PASS' : 'FAIL'} at p90, ` +
      `${total.at(0.5) * DEVICE_MULTIPLIER <= BUDGET_MS ? 'PASS' : 'FAIL'} at p50.`,
  );
  lines.push('');
  lines.push('  RE-MEASURED AT M3.11, AND THE EXTRAPOLATION IT REPLACES WAS WRONG IN ITS MODEL,');
  lines.push('  not just in its number. The old caveat said Dijkstra is O(E log V) so ~8x the');
  lines.push('  graph is ~8x the work. Dijkstra is not where the time goes: five of them cost');
  lines.push(
    `  ${dijkstra.mean.toFixed(2)} ms mean and ${dijkstra.at(1).toFixed(2)} ms at the worst pair, ` +
      `which is ${((dijkstra.mean / Math.max(total.mean, 1e-9)) * 100).toFixed(0)}% of the call.`,
  );
  lines.push('  The other ~95% is Yen backfill, and `kShortestPaths` runs a Dijkstra per spur');
  lines.push('  node ALONG THE PATH — so its cost scales with HOP COUNT, which is what the');
  lines.push('  continental slice actually changed: longest path 19 hops before, 59 now.');
  lines.push('');
  lines.push(
    `  THE BUDGET IS NOT RAISED. ${String(BUDGET_MS)} ms is a claim about how long a player will`,
  );
  lines.push('  wait, and the map growing is not an argument about players. The fix is the');
  lines.push('  ceiling section 2 and section 4 both already ask for: `kShortestPaths` may stray');
  lines.push('  arbitrarily far from the shortest path, and the pairs that blow the budget are');
  lines.push('  exactly the pairs where it strays furthest. Bounding the stray ratio buys the');
  lines.push('  headroom back and deletes routes nobody would drive. It is not M3.11 work.');
  return lines.join('\n');
}

export function benchmark(graph: GeoGraph, samples: number): BenchmarkSample {
  const count = graph.nodes.length;
  const stride = Math.max(1, Math.floor(count / 7) + 1);
  const total: number[] = [];
  const dijkstra: number[] = [];
  for (let i = 0; i < count && total.length < samples; i += 1) {
    const from = i;
    const to = (i * stride + 1 + Math.floor(count / 2)) % count;
    if (from === to) continue;
    // The one sanctioned wall-clock read outside the app's clock adapter: a build-time tool
    // measuring the harness, never the run.
    let started = performance.now();
    for (const profile of ROUTE_PROFILES) shortestPath(graph, from, to, costFor(profile));
    dijkstra.push(performance.now() - started);

    started = performance.now();
    selectPaths(graph, from, to);
    total.push(performance.now() - started);
  }
  return { total, dijkstra };
}
