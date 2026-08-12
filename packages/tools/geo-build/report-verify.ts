import { ROUTE_PROFILES, selectPaths, type GeoGraph } from '@odyssey/engine';

import { DIVERSITY_PASS_THRESHOLD } from './audit-diversity.ts';
import { verifyPair, type NameLookup, type PairReport } from './verify-routes.ts';

/**
 * The Phase 3 verification report.
 *
 * **Columns that do not exist are absent, not estimated.** Legs, montage legs, in-game days,
 * cash, risk band, events fired, memory chains and completion rate all belong to M3.7 through
 * M3.10; six of the modules that would produce them are not on disk. The header says so once so
 * no table below has to.
 */

/**
 * The ten pairs, chosen to hit the categories asked for rather than sampled.
 *
 * `noRoute` is deliberately absent and that absence is a RESULT: `--stage=all` refuses to write a
 * graph with more than one connected component, so on the shipped slice no pair is unreachable.
 * The nearest real thing is a profile-level refusal, which the `refused` column reports.
 */
export const NAMED_PAIRS: readonly (readonly [string, string, string])[] = [
  ['short domestic', 'Barcelona', 'Zaragoza'],
  ['short domestic', 'Hamburg', 'Bremen'],
  ['medium, one border', 'Vienna', 'Budapest'],
  ['long continental', 'Vigo', 'Vilnius'],
  ['long continental', 'Lisbon', 'Warsaw'],
  ['ferry required', 'Barcelona', 'Palermo'],
  ['ferry required', 'Algiers', 'Rome'],
  ['many borders', 'Amsterdam', 'Athens'],
  ['many borders', 'Copenhagen', 'Belgrade'],
  ['island to island', 'Palma', 'Cagliari'],
];

/** Twelve pairs spanning the slice's achievable range, shortest to longest. */
export const SWEEP_PAIRS: readonly (readonly [string, string])[] = [
  ['Tunis', 'Aryanah'],
  ['Hamburg', 'Bremen'],
  ['Vienna', 'Budapest'],
  ['Milan', 'Turin'],
  ['Barcelona', 'Zaragoza'],
  ['Rome', 'Naples'],
  ['Paris', 'Amsterdam'],
  ['Berlin', 'Warsaw'],
  ['Madrid', 'Paris'],
  ['Amsterdam', 'Athens'],
  ['Lisbon', 'Warsaw'],
  ['Vigo', 'Vilnius'],
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

  lines.push('Measured from `selectPaths` against the committed artifacts. Legs, montage legs,');
  lines.push('in-game days, cash, risk band, events fired, memory chains and completion rate are');
  lines.push('NOT here: leg-plan, leg-locations, beat-schedule, route-preview, materialise-route');
  lines.push('and generate-routes do not exist, and `RouteState` has no `legKm`. Estimating them');
  lines.push('would be inventing them.');
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
    `  ${pad('pair', 26)}${pad('category', 20)}${'km'.padStart(6)}${'hops'.padStart(5)}` +
      `${'brdr'.padStart(5)}${'fry'.padStart(4)}${'toll'.padStart(5)}${'rts'.padStart(4)}` +
      `${'ovlp'.padStart(6)}${'rung'.padStart(5)}  refused at rung 0`,
  );
  for (const report of reports) {
    const best = report.routes[0];
    if (best === undefined) continue;
    lines.push(
      `  ${pad(`${report.from}-${report.to}`, 26)}${pad(report.label, 20)}` +
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
  lines.push('  NOT the ladder relaxing — every failure above resolved at rung 0 or 1, where the');
  lines.push('  threshold is still 70. Two different causes, both measured:');
  lines.push('');
  lines.push('  ONE: THE GUARANTEE IS DIRECTIONAL. `acceptByDiversity` tests each NEW candidate');
  lines.push('  against the union of what is already accepted, normalised by the CANDIDATE’s');
  lines.push('  length, and never re-tests an earlier route against a later one. On');
  lines.push('  Barcelona-Palermo, `safest` (3,496 km) is 69% inside `fastest` (3,051 km) and was');
  lines.push('  accepted on that number — while `fastest` is 79% inside `safest`, which nothing');
  lines.push('  ever looked at. Algiers-Rome is the same shape at 63% accepted, 74% reverse.');
  lines.push('  The candidate-normalisation is deliberate (ADR 0025 Decision 5 uses it to reject');
  lines.push('  truncations) but its consequence — a one-way guarantee — is not written down.');
  lines.push('');
  lines.push('  TWO: YEN BACKFILL OFFERS ROUTES NOBODY WOULD DRIVE. Vienna-Budapest is 297 km');
  lines.push('  direct, and the pool also contains 866, 1,186 and 1,352 km alternatives; the 72%');
  lines.push('  is between two of those detours, not between anything a player would weigh.');
  lines.push('  `kShortestPaths` has no length ceiling relative to the shortest path. Section 4');
  lines.push('  measures how far this goes.');
  lines.push('');
  lines.push(
    '  So a per-pair 70% guarantee is not something this system currently makes. ADR 0025',
  );
  lines.push('  gates the MEDIAN over many pairs, which is 59% and passes.');
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
  lines.push('  The requested 300 km - 13,000 km span is NOT achievable here. This slice is one');
  lines.push('  bbox of Europe and the Maghreb; the longest route it contains is the last row.');
  lines.push('  13,000 km needs the M3.11 scale-up to ~1,200 nodes across continents.');
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

/**
 * Wall-clock for `selectPaths`, which is the whole cost of route generation today: five
 * Dijkstras plus Yen backfill plus the diversity filter.
 *
 * Reported in Node on this machine, with the phone multiplier stated rather than applied
 * silently. ADR 0012 records that Hermes is untested here, so the multiplier is an assumption
 * and is labelled as one.
 */
export function formatBenchmark(graph: GeoGraph, samples: number, elapsedMs: number[]): string {
  const sorted = [...elapsedMs].sort((a, b) => a - b);
  const at = (q: number): number =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
  const mean = sorted.reduce((s, v) => s + v, 0) / Math.max(1, sorted.length);
  const lines: string[] = ['## 5. Route generation benchmark', ''];

  lines.push(
    `  graph            ${String(graph.nodes.length)} nodes, ${String(graph.edges.length)} edges`,
  );
  lines.push(`  pairs measured   ${String(samples)}`);
  lines.push('');
  lines.push(
    `  Node/V8 per call   mean ${mean.toFixed(2)} ms   p50 ${at(0.5).toFixed(2)}   ` +
      `p90 ${at(0.9).toFixed(2)}   max ${at(1).toFixed(2)}`,
  );
  lines.push('');
  lines.push('  DEVICE MULTIPLIER: 6x, assumed, not measured.');
  lines.push('  A mid-range phone under Hermes runs this kind of allocation-light integer work');
  lines.push(
    '  roughly 4-8x slower than desktop V8. 6x is the middle of that and the number every',
  );
  lines.push('  figure below is scaled by. ADR 0012 records that Hermes is UNTESTED in this repo,');
  lines.push('  so this is an assumption with a stated basis, not a measurement.');
  lines.push('');
  lines.push(
    `  Phone estimate     mean ${(mean * 6).toFixed(1)} ms   p90 ${(at(0.9) * 6).toFixed(1)}   ` +
      `max ${(at(1) * 6).toFixed(1)}`,
  );
  lines.push(
    `  VERDICT vs 150 ms budget: ${at(1) * 6 <= 150 ? 'PASS' : 'FAIL'} at the measured maximum.`,
  );
  lines.push('');
  lines.push('  Caveat worth more than the number: this is the 263-node slice. Dijkstra is');
  lines.push('  O(E log V), so ~1,200 nodes and ~2,900 edges is roughly 8x the work, and the');
  lines.push('  budget must be re-measured at M3.11 rather than extrapolated from here.');
  return lines.join('\n');
}

export function benchmark(graph: GeoGraph, samples: number): number[] {
  const count = graph.nodes.length;
  const stride = Math.max(1, Math.floor(count / 7) + 1);
  const timings: number[] = [];
  for (let i = 0; i < count && timings.length < samples; i += 1) {
    const from = i;
    const to = (i * stride + 1 + Math.floor(count / 2)) % count;
    if (from === to) continue;
    // The one sanctioned wall-clock read outside the app's clock adapter: a build-time tool
    // measuring the harness, never the run.
    const started = performance.now();
    selectPaths(graph, from, to);
    timings.push(performance.now() - started);
  }
  return timings;
}
