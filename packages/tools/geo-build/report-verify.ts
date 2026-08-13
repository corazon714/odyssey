import {
  ROUTE_PROFILES,
  costFor,
  hasMode,
  selectPaths,
  shortestPath,
  type GeoGraph,
} from '@odyssey/engine';

import { DIVERSITY_PASS_THRESHOLD } from './audit-diversity.ts';
import { endpointDegree } from './route-structure.ts';
import {
  illicitCashDominates,
  previewsFor,
  verifyPair,
  type NameLookup,
  type PairReport,
  type PreviewFacts,
} from './verify-routes.ts';

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
 *
 * ## Two rows fail section 2 and are KEPT
 *
 * Chongjin-Jeju City and Palermo-Riyadh both hang off a degree-1 endpoint. Removing them would
 * make section 2 read PASS, and it would be the third time this list was pruned into agreeing
 * with itself — the reason `KIND_COVERAGE` and the endpoint-degree table below exist is so a
 * structural breach is DIAGNOSED in place rather than selected away. The degree-1 rows are the
 * only evidence the report has that the slice attaches nineteen settlements by a single edge.
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

/**
 * The two kinds the band constraint provably cannot reach, added as SUPPLEMENTARY rows.
 *
 * The brief names five kinds a pair list should contain: short domestic, long continental, one
 * needing a ferry, one with 4+ borders, one with no legal route. Three of the five fall out of
 * `NAMED_PAIRS` already and are reported there. The other two do not, for reasons that are
 * measurements rather than oversights, and section 1b prints the evidence for each:
 *
 * - **Border-free.** Every one of the ten banded pairs crosses at least one controlled crossing,
 *   because the band constraint pairs nodes half the settlement list apart. Border-free pairs do
 *   exist — the crossing-free subgraph has a 196-node component and a 86-node one — so this is a
 *   gap in the SELECTION, and a row is added rather than a caveat written.
 * - **Ferry forced.** `hasFerry` on the first route is not the property asked for; a pair "needing"
 *   a ferry is one where EVERY returned route takes one. On this slice that set is exactly the
 *   pairs with Palermo or Sassari as an endpoint, which is itself the finding — see section 1b.
 *
 * "Domestic" is deliberately not the word used in the output. What is checkable here is the count
 * of `border_crossing` NODES on a route, and CLAUDE.md §11 keeps country identity out of the data
 * entirely, so the column is border-free and means what it says.
 */
export const KIND_PAIRS: readonly (readonly [string, string, string])[] = [
  ['border-free, short', 'Ankara', 'Canakkale'],
  ['ferry forced', 'Valencia', 'Palermo'],
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

  lines.push(
    'Measured against the committed artifacts, on the Afro-Eurasia slice. Paths come from',
  );
  lines.push('`selectPaths`; legs, montage legs, travel days and cash come from `generateRoutes`,');
  lines.push("which is the call `sim/load-pack.ts` makes, so they are the game's own numbers.");
  lines.push('');
  lines.push(
    'EVENTS FIRED, MEMORY CHAINS AND COMPLETION RATE ARE NOT HERE, and that is a boundary',
  );
  lines.push('rather than a gap: each is a function of the CONTENT PACK as well as of the route,');
  lines.push(
    'and `pnpm sim --pack=corpus` measures them off the code path the game runs. A second',
  );
  lines.push('copy computed here would drift from the one anybody acts on. THERE IS NO RISK');
  lines.push('COLUMN either, and section 1 says why not.');
  lines.push('');
  lines.push('The pair lists are picked under a stated constraint — one pair per distance band,');
  lines.push('every endpoint distinct, three hops minimum — never by ranking. See NAMED_PAIRS.');
  lines.push(
    'Two supplementary rows cover kinds the band constraint cannot reach: see KIND_PAIRS.',
  );
  lines.push('');

  // ── 1 + 2 ────────────────────────────────────────────────────────────────────────────────
  const reports: PairReport[] = [];
  const missing: string[] = [];
  const previews = new Map<string, readonly PreviewFacts[]>();
  const endpoints: { readonly name: string; readonly degree: number }[] = [];
  for (const [label, from, to] of NAMED_PAIRS) {
    const a = resolve(byName, from);
    const b = resolve(byName, to);
    if (a === null || b === null) {
      missing.push(`${from} -> ${to} (${a === null ? from : to} is not a node in this slice)`);
      continue;
    }
    const report = verifyPair(graph, label, a, b, nameOf);
    reports.push(report);
    previews.set(label, previewsFor(graph, a, b));
    endpoints.push({ name: from, degree: report.fromDegree });
    endpoints.push({ name: to, degree: report.toDegree });
  }

  // The two supplementary rows. Measured exactly like the ten so section 1b can compare them.
  const kindReports: PairReport[] = [];
  for (const [label, from, to] of KIND_PAIRS) {
    const a = resolve(byName, from);
    const b = resolve(byName, to);
    if (a === null || b === null) {
      missing.push(`${from} -> ${to} (${a === null ? from : to} is not a node in this slice)`);
      continue;
    }
    const report = verifyPair(graph, label, a, b, nameOf);
    kindReports.push(report);
    previews.set(label, previewsFor(graph, a, b));
  }

  lines.push('## 1. Ten pairs');
  lines.push('');
  lines.push(
    `  ${pad('pair', 30)}${pad('band', 18)}${'km'.padStart(6)}${'hops'.padStart(5)}` +
      `${'legs'.padStart(5)}${'mtg'.padStart(4)}${'days'.padStart(6)}${'cash'.padStart(6)}` +
      `${'mode'.padStart(10)}${'brdr'.padStart(5)}${'fry'.padStart(4)}${'toll'.padStart(5)}` +
      `${'hard'.padStart(5)}${'rts'.padStart(4)}${'ovlp'.padStart(6)}${'rung'.padStart(5)}`,
  );
  for (const report of reports) {
    const best = report.routes[0];
    const preview = previews.get(report.label)?.[0];
    if (best === undefined) continue;
    lines.push(
      `  ${pad(`${report.from}-${report.to}`, 30)}${pad(report.label, 18)}` +
        `${num(best.km, 6)}${num(best.hops, 5)}` +
        `${preview === undefined ? '    ?' : num(preview.legCount, 5)}` +
        `${preview === undefined ? '   ?' : num(preview.montageLegCount, 4)}` +
        `${(preview === undefined ? '?' : (preview.travelHours / 24).toFixed(1)).padStart(6)}` +
        `${preview === undefined ? '     ?' : num(preview.recommendedCash, 6)}` +
        `${(preview?.startingMode ?? '?').padStart(10)}` +
        `${num(best.borders, 5)}${num(best.ferryHops, 4)}${num(best.tolledHops, 5)}` +
        `${num(best.hardest, 5)}${num(report.routes.length, 4)}` +
        `${`${String(report.maxOverlap)}%`.padStart(6)}${num(report.rungReached, 5)}`,
    );
  }
  if (missing.length > 0) {
    lines.push('');
    lines.push('  NOT IN THIS SLICE — the pair was requested and the node does not exist:');
    for (const entry of missing) lines.push(`    ${entry}`);
  }
  lines.push('');
  lines.push(
    '  Every column describes the FIRST returned route except `rts` and `ovlp`, which are',
  );
  lines.push('  properties of the whole candidate set. `ovlp` is the worst pairwise overlap among');
  lines.push('  the routes returned, and is what section 2 gates.');
  lines.push('');
  lines.push('  WHERE EACH COLUMN COMES FROM, because four of them are not graph facts:');
  lines.push('    km hops brdr fry toll hard   the path and its edges — `factsFor`.');
  lines.push('    legs mtg days cash mode      `generateRoutes` -> `RoutePreview`, the same call');
  lines.push(
    '                                 `sim/load-pack.ts` makes (ADR 0034). Seed-independent:',
  );
  lines.push(
    '                                 `materialiseRoute` plans legs before the seed is used.',
  );
  lines.push('');
  lines.push('  `days` IS ADVISORY AND IS NOT THE LENGTH OF A RUN. It is `travelHours / 24`, the');
  lines.push(
    '  expected in-game travel time at the starting mode with `worldTick` jitter included,',
  );
  lines.push('  and it counts no time spent in events. A run that loses its vehicle costs more.');
  lines.push('  `cash` is `recommendedCash`, the preparation budget; a run STARTS at 130% of it.');
  lines.push('');
  lines.push('  THERE IS NO RISK COLUMN, and that is a refusal rather than an omission. No risk');
  lines.push('  field exists on `RoutePreview`, `GeoNode` or `GeoEdge`, and CLAUDE.md §11 forbids');
  lines.push(
    '  deriving one from where a node is — difficulty comes from the route PROFILE and the',
  );
  lines.push('  player STATE, never from place identity. What a risk band would have to be built');
  lines.push('  from is printed instead, as the physical facts they are: `brdr` (controlled');
  lines.push('  crossings), `hard` (hardest `terrainDifficulty`, 0-4), `fry`, `toll`, and the');
  lines.push(
    '  profile. Compressing those into one number is a design decision with no owner, and',
  );
  lines.push('  inventing it here would put a fabricated scalar in a verification report.');
  lines.push('');

  // ── 1b ───────────────────────────────────────────────────────────────────────────────────
  const all = [...reports, ...kindReports];
  const borderFree = all.filter((r) => r.routes.every((route) => route.borders === 0));
  const ferryForced = all.filter(
    (r) => r.routes.length > 0 && r.routes.every((route) => route.ferryHops > 0),
  );
  const manyBorders = all.filter((r) => (r.routes[0]?.borders ?? 0) >= 4);
  const longest = [...all].sort((x, y) => (y.routes[0]?.km ?? 0) - (x.routes[0]?.km ?? 0))[0];
  const label = (r: PairReport | undefined): string =>
    r === undefined ? 'NONE' : `${r.from}-${r.to}`;

  lines.push('## 1b. The five kinds the brief asks for, against what the slice can supply');
  lines.push('');
  lines.push(`  ${pad('kind', 26)}${pad('covered by', 30)}evidence`);
  lines.push(
    `  ${pad('short, border-free', 26)}${pad(label(borderFree[0]), 30)}` +
      `${String(borderFree[0]?.routes[0]?.km ?? 0)} km, 0 crossings on EVERY route ` +
      `(${String(borderFree.length)} of ${String(all.length)} rows)`,
  );
  lines.push(
    `  ${pad('long continental', 26)}${pad(label(longest), 30)}${String(longest?.routes[0]?.km ?? 0)} km on the first route`,
  );
  lines.push(
    `  ${pad('needs a ferry', 26)}${pad(label(ferryForced[0]), 30)}` +
      `${String(ferryForced.length)} of ${String(all.length)} rows take a ferry on EVERY route`,
  );
  lines.push(
    `  ${pad('4+ borders', 26)}${pad(label(manyBorders[0]), 30)}` +
      `${String(manyBorders.length)} of ${String(all.length)} rows, up to ` +
      `${String(Math.max(0, ...all.map((r) => r.routes[0]?.borders ?? 0)))} crossings`,
  );
  lines.push(`  ${pad('no legal route', 26)}${pad('NONE — CANNOT EXIST', 30)}see below`);
  lines.push('');
  lines.push('  NO PAIR IN THIS SLICE HAS NO LEGAL ROUTE, and that is structural rather than a');
  lines.push(
    '  failure to look. The shipped graph is ONE connected component of 692 nodes — every',
  );
  lines.push('  node reaches every other — and `--stage=all` refuses to write a fragment below');
  lines.push(`  MIN_LANDMASS_NODES, so an unroutable pair cannot be produced by the build at all.`);
  lines.push(
    '  ADR 0036 permits several components, one per landmass; the current bbox yields one.',
  );
  lines.push('');
  lines.push(
    '  THE NEAREST REAL THING IS A PROFILE REFUSING, and the report has two grades of it:',
  );
  lines.push('    - `refused at rung 0` in section 2: the profile has NO path under its own masks');
  lines.push('      and the ladder rescued it by relaxing them. Palermo-Riyadh refuses `illicit`,');
  lines.push(
    '      and the reason is exact: the only edge out of Palermo is a ferry, and `illicit`',
  );
  lines.push('      masks ferry and train as ticketed. That is a genuine "no legal route for this');
  lines.push('      way of travelling", and it is the closest the slice comes.');
  lines.push('    - section 4 counts how often each profile is in that position across the graph.');
  lines.push('');
  lines.push('  "BORDER-FREE" IS NOT "DOMESTIC", and the difference is deliberate. What is');
  lines.push(
    '  checkable is the number of `border_crossing` NODES on a route; CLAUDE.md §11 keeps',
  );
  lines.push('  country identity out of the geo data entirely, so no column here can say which');
  lines.push('  country a route stays inside, and none tries to.');
  lines.push('');
  lines.push('  FERRY-FORCED PAIRS ARE EXACTLY THE DEGREE-1 ISLANDS, which is a finding and not a');
  lines.push('  coincidence. The slice holds SIX ferry edges forming THREE corridors, all in the');
  lines.push('  western Mediterranean (Barcelona-Sardinia, Algiers-Barcelona, Tunis-Palermo), and');
  lines.push(
    '  every one is AUTHORED in `overlay.yaml` — `build-edges.ts` never generates a ferry.',
  );
  lines.push('  The overlay was written for the 263-node Europe-and-Maghreb slice and was not');
  lines.push('  extended when the bbox went continental, so Palermo and Sassari are the only two');
  lines.push('  places on the map that need a boat. Section 2b has what that costs elsewhere.');
  lines.push('');

  // ── 2 ────────────────────────────────────────────────────────────────────────────────────
  lines.push('## 2. Diversity — no two routes may share more than 70% of a route by distance');
  lines.push('');
  let worst = 0;
  let failures = 0;
  let structural = 0;
  lines.push(
    `  ${pad('pair', 28)}${'rts'.padStart(4)}${'worst'.padStart(7)}${'floor'.padStart(7)}` +
      `${'deg'.padStart(8)}${'rung'.padStart(6)}   verdict`,
  );
  for (const report of all) {
    if (report.maxOverlap > worst) worst = report.maxOverlap;
    if (!report.diversityOk) failures += 1;
    if (report.cause === 'structural') structural += 1;
    const verdict =
      report.cause === 'single'
        ? 'single route — nothing to diversify'
        : report.cause === 'pass'
          ? 'PASS'
          : report.cause === 'structural'
            ? 'FAIL — STRUCTURAL, the floor alone breaches'
            : 'FAIL — FILTER, the floor left room';
    lines.push(
      `  ${pad(`${report.from}-${report.to}`, 28)}${num(report.routes.length, 4)}` +
        `${`${String(report.maxOverlap)}%`.padStart(7)}${`${String(report.floorPercent)}%`.padStart(7)}` +
        `${`${String(report.fromDegree)},${String(report.toDegree)}`.padStart(8)}` +
        `${num(report.rungReached, 6)}   ${verdict}`,
    );
  }
  lines.push('');
  lines.push(
    `  VERDICT: ${failures === 0 ? 'PASS' : 'FAIL'} — ${String(failures)} of ` +
      `${String(all.length)} pairs exceed the ${String(DIVERSITY_PASS_THRESHOLD)}% ceiling ` +
      `(${String(structural)} structural, ${String(failures - structural)} filter); ` +
      `worst seen ${String(worst)}%.`,
  );
  lines.push('');
  const refusers = all.filter((r) => r.refused.length > 0);
  lines.push('  PROFILES WITH NO PATH AT RUNG 0 — the mask held and the ladder then relaxed it:');
  if (refusers.length === 0) lines.push('    none of these pairs');
  for (const report of refusers) {
    lines.push(`    ${pad(`${report.from}-${report.to}`, 28)}${report.refused.join(' ')}`);
  }
  lines.push('');
  lines.push('  `floor` IS THE NUMBER THAT SPLITS THE VERDICT, and it is measured, not judged.');
  lines.push('  It is the combined distance of the edges present in EVERY returned route, as a');
  lines.push('  share of the SHORTEST returned route — a hard lower bound on the worst pairwise');
  lines.push('  overlap the pair can show, because that route spends that share of itself on');
  lines.push('  ground every alternative also covers. A floor above the ceiling means NO filter');
  lines.push('  over these candidates could have passed the pair, so calling it a filter fault is');
  lines.push('  a misattribution; a floor below it means routes were admitted that need not have');
  lines.push('  been, which is the only case that indicts `acceptByDiversity`.');
  lines.push('');
  lines.push('  CHONGJIN-JEJU CITY IS STRUCTURAL, and the arithmetic is worth stating in full.');
  lines.push(
    '  Three edges totalling 1,000 km appear in all five returned routes. The shortest is',
  );
  lines.push(
    '  1,391 km, so its floor is 71% — already past the 70% ceiling before any filtering.',
  );
  lines.push('  Jeju City has DEGREE 1: its sole edge is 630 km of the 1,000, and every route in');
  lines.push(
    '  and out of the place must use it. The remaining 370 km is the neck out of Chongjin.',
  );
  lines.push('');
  lines.push('  BUT DEGREE-1 IS THE CAUSE, NOT THE TEST, and Palermo-Riyadh is the control that');
  lines.push(
    '  proves it: Palermo is also degree-1, its forced ferry is also unavoidable, and the',
  );
  lines.push('  pair PASSES at 69% — because 1,525 km of forced edge is only 15% of a 9,787 km');
  lines.push('  journey. A degree-1 endpoint breaks diversity in proportion to how much of the');
  lines.push('  route it forces, which is why the floor is the verdict and the degree is context.');
  lines.push('');
  lines.push('  VALENCIA-PALERMO IS THE OTHER KIND, and it is the row this classification was');
  lines.push('  built to find. Same degree-1 island, but a 34% floor — so two thirds of the route');
  lines.push(
    '  WAS free to vary and the filter returned an 85% overlap anyway. Nothing structural',
  );
  lines.push(
    "  forced that. It is `acceptByDiversity`'s directional guarantee (ONE below) landing",
  );
  lines.push(
    '  on a pair short enough for the forced ferry to still dominate what is left, and it',
  );
  lines.push('  is the only genuine filter failure in the twelve.');
  lines.push('');
  lines.push('  NOT the ladder relaxing either — the breach resolved at rung 1, and rungs 0 and 1');
  lines.push('  both cap overlap at 70 (`DIVERSITY_RUNGS`). Two further mechanisms sit underneath');
  lines.push(
    '  the structural floor and are re-measured on the 692-node slice. Neither CAUSES the',
  );
  lines.push('  FAIL above — the floor does that on its own — but both decide how bad it reads:');
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

  // ── 2b ───────────────────────────────────────────────────────────────────────────────────
  lines.push('## 2b. Endpoint degree — the diagnostic that tells the two failures apart');
  lines.push('');
  lines.push(`  ${pad('endpoint', 22)}deg   ${pad('endpoint', 22)}deg`);
  for (let i = 0; i < endpoints.length; i += 2) {
    const left = endpoints[i];
    const right = endpoints[i + 1];
    if (left === undefined || right === undefined) continue;
    lines.push(
      `  ${pad(left.name, 22)}${num(left.degree, 3)}   ${pad(right.name, 22)}${num(right.degree, 3)}`,
    );
  }
  lines.push('');

  // Measured over settlements only: a border post is not a place a journey starts from, and
  // including them would report the graph's internal plumbing as if a player could choose it.
  const settlementIdx: number[] = [];
  for (let i = 0; i < graph.nodes.length; i += 1) {
    if (graph.nodes[i]?.type !== 'border_crossing') settlementIdx.push(i);
  }
  const degrees = settlementIdx.map((i) => endpointDegree(graph, i));
  const ones = settlementIdx.filter((i) => endpointDegree(graph, i) === 1);
  const meanDegree = degrees.reduce((s, d) => s + d, 0) / Math.max(1, degrees.length);

  lines.push(
    `  Of the twenty endpoints above, ${String(endpoints.filter((e) => e.degree === 1).length)} have degree 1. ` +
      `Across the whole slice ${String(ones.length)} of`,
  );
  lines.push(
    `  ${String(settlementIdx.length)} settlements do, and mean settlement degree is ${meanDegree.toFixed(2)}.`,
  );
  lines.push('');
  lines.push('  THE DEGREE-1 SETTLEMENTS, all of them:');
  for (let i = 0; i < ones.length; i += 4) {
    lines.push(
      `    ${ones
        .slice(i, i + 4)
        .map((n) => pad(nameOf[n] ?? '?', 18))
        .join('')}`.trimEnd(),
    );
  }
  lines.push('');
  lines.push(
    '  A DEGREE-1 SETTLEMENT CANNOT YIELD A DIVERSE ROUTE SET NEAR ITSELF. Its one edge is',
  );
  lines.push('  in every route by construction, so it contributes 100% of its own length to the');
  lines.push('  floor. Whether that breaks the pair depends on the ratio to total distance, which');
  lines.push(
    '  is what section 2 measures — but every one of these nineteen is a latent section 2',
  );
  lines.push('  failure waiting for a short enough partner.');
  lines.push('');
  const coastal = ones.filter((n) => graph.nodes[n]?.terrain === 'coast').length;
  const ferryAttached = ones.filter((n) => {
    const lo = graph.adjacencyOffsets[n] ?? 0;
    const hi = graph.adjacencyOffsets[n + 1] ?? 0;
    for (let k = lo; k < hi; k += 1) {
      const edge = graph.edges[graph.adjacencyEdges[k] ?? -1];
      if (edge !== undefined && hasMode(edge.modes, 'ferry')) return true;
    }
    return false;
  }).length;

  lines.push(
    `  ${String(coastal)} OF THE ${String(ones.length)} CARRY \`terrain: coast\`, AND THAT IS THE FERRY GAP RESTATED.`,
  );
  lines.push(
    `  Exactly ${String(ferryAttached)} of them are attached by a ferry edge. Every other one — including`,
  );
  lines.push('  islands — is attached by a ROAD edge, some of which cross open water.');
  lines.push('');
  lines.push('  THE WATER TEST LETS THEM THROUGH, and the mechanism is exact. `build-edges.ts`');
  lines.push('  samples WATER_SAMPLES=9 points along a candidate and refuses it below');
  lines.push(
    '  MIN_LAND_PERCENT=70. Seoul-Jeju City reads 77% land — seven of nine samples fall on',
  );
  lines.push('  the peninsula and two on the strait — so it is ACCEPTED as a 630 km road corridor');
  lines.push('  to an island. The geographically real link, Jeju City-Busan, reads 11% and is');
  lines.push('  correctly refused. The threshold admits any crossing short enough relative to the');
  lines.push('  land approach, so the graph gets a road where a boat belongs.');
  lines.push('');
  lines.push('  Measured across all 1,215 shipped edges: 1,149 are 100% land, 6 are the authored');
  lines.push(
    '  ferries, and 60 are non-ferry edges under 89% land. Fourteen of those 60 are below',
  );
  lines.push('  the 70% threshold that should have refused them outright — thirteen touch a');
  lines.push(
    '  border-crossing node, which is the mechanism: `place-borders.ts` SPLITS an edge to',
  );
  lines.push(
    '  insert a crossing, and the two halves are never re-tested for water. The fourteenth',
  );
  lines.push('  is Istanbul-Canakkale, the one authored `forcedCorridors` row, which is exempt by');
  lines.push(
    "  intent. NONE OF THIS IS THIS REPORT'S TO FIX — it is `geo:build`'s — but it is the",
  );
  lines.push('  root cause of both section 2 failures and it has no owner.');
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
  const illicitBestWithCash: string[] = [];
  const illicitPresent: string[] = [];
  const illicitKmRatio: number[] = [];
  const illicitCrossingsSaved: number[] = [];
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
    if (report.routes.some((route) => route.profile === 'illicit')) illicitPresent.push(pair);
    if (report.illicitDominates) {
      illicitBest.push(pair);
      // Only the geometrically-dominant pairs can be dominant on cash too, so the expensive
      // preview call is made for those alone rather than for all 410.
      const previewSet = previewsFor(graph, from, to);
      if (illicitCashDominates(previewSet)) illicitBestWithCash.push(pair);

      // How much of the win comes from each term. Compared against the BEST alternative on each
      // axis independently, which is the most generous reading available to the other profiles.
      const illicit = previewSet.find((p) => p.profile === 'illicit');
      const others = previewSet.filter((p) => p.profile !== 'illicit');
      if (illicit !== undefined && others.length > 0) {
        const bestKm = Math.min(...others.map((o) => o.totalKm));
        const bestCrossings = Math.min(...others.map((o) => o.crossings));
        if (bestKm > 0) illicitKmRatio.push(illicit.totalKm / bestKm);
        illicitCrossingsSaved.push(bestCrossings - illicit.crossings);
      }
    }
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
  lines.push('  THE CAUSE IS 38 EDGES, AND IT IS WORTH NAMING BECAUSE THE COUNT LOOKS ALARMING.');
  lines.push('  Relaxing the SEASON mask alone takes `fastest` and `cheapest` from 126 to 0;');
  lines.push('  `safest` needs season AND terrain together, and then also reaches 0. The whole');
  lines.push('  effect comes from the 38 `winter_closed` edges among 1,215 — 3% of the graph — of');
  lines.push('  which NONE is flagged `unavoidable`, so `costFor` masks every one of them for the');
  lines.push('  three profiles that respect seasonality. `scenic` and `illicit` skip the season');
  lines.push('  mask by design and route 410 and 406 of 410 respectively.');
  lines.push('');
  lines.push('  WHAT IT COSTS IS DIVERSITY, NOT REACHABILITY. The ladder reaches rung 4 (masks');
  lines.push('  dropped) on only 5 of 200 pairs in `geo:diversity`, so these pairs are not being');
  lines.push('  rescued by relaxation — they are being filled by `scenic`, `illicit` and Yen');
  lines.push('  backfill instead. On 31% of pairs the candidate pool is therefore built from two');
  lines.push('  profiles and their alternatives rather than five, which is a quieter failure than');
  lines.push('  an unroutable pair and shows up only as sameness. `mark-unavoidable.ts` exists to');
  lines.push('  set the flag that would fix this and has evidently not set it on any of the 38.');
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
  const pct = (n: number, of: number): string => `${((n / Math.max(1, of)) * 100).toFixed(0)}%`;
  lines.push(
    `  ILLICIT STRICTLY DOMINATES   ${String(illicitBest.length)} of ${String(sampled)} ` +
      `(${pct(illicitBest.length, sampled)})   <- a design bug if > 0`,
  );
  for (const pair of illicitBest.slice(0, 10)) lines.push(`    ${pair}`);
  lines.push('');
  lines.push(
    '  ON GEOMETRY ALONE, which is the whole finding. "Dominates" here means shorter than',
  );
  lines.push('  EVERY other returned route, crossing no more borders and no harder ground — three');
  lines.push('  facts about the PATH. It is not a claim about the cost function, and section 4');
  lines.push('  used to print it as though it were.');
  lines.push('');
  lines.push(
    `  An illicit route is returned at all on ${String(illicitPresent.length)} of ${String(sampled)} pairs ` +
      `(${pct(illicitPresent.length, sampled)}), so the`,
  );
  lines.push(
    `  dominance rate among pairs that HAVE one is ${pct(illicitBest.length, illicitPresent.length)}.`,
  );
  lines.push('');
  lines.push("  WHY GEOMETRY FAVOURS IT, AND WHY THAT IS NEARLY TAUTOLOGICAL. `illicit`'s cost is");
  lines.push('  `distanceKm / 5` plus penalties for crossings, populated ground and transit');
  lines.push('  services. The distance term dominates on long edges, so the profile is close to a');
  lines.push('  distance-minimiser that dodges border posts — which is exactly what the first two');
  lines.push('  of the three dominance tests reward. Measuring it on those three and calling the');
  lines.push('  result a design bug is close to measuring the cost function against itself.');
  lines.push('');
  const median = (values: readonly number[]): number =>
    [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
  const mean = (values: readonly number[]): number =>
    values.reduce((s, v) => s + v, 0) / Math.max(1, values.length);

  lines.push(
    `  ADDING PREPARATION COST DOES NOT BREAK IT:   ${String(illicitBestWithCash.length)} of ` +
      `${String(sampled)} (${pct(illicitBestWithCash.length, sampled)}) are ALSO the cheapest`,
  );
  lines.push('');
  lines.push(
    `  ${String(illicitBestWithCash.length)} of the ${String(illicitBest.length)} geometrically-dominant pairs ` +
      `(${pct(illicitBestWithCash.length, illicitBest.length)}) survive the cash test. That was`,
  );
  lines.push('  not the expected result and it is the more serious one, so the mechanism is worth');
  lines.push('  stating exactly:');
  lines.push('');
  lines.push(
    `    illicit distance / best alternative     mean ${mean(illicitKmRatio).toFixed(3)}   ` +
      `median ${median(illicitKmRatio).toFixed(3)}`,
  );
  lines.push(
    `    controlled crossings AVOIDED            mean ${mean(illicitCrossingsSaved).toFixed(1)}   ` +
      `median ${String(median(illicitCrossingsSaved))}`,
  );
  lines.push('');
  lines.push(
    '  THE CROSSING COUNT IS THE WHOLE STORY. `recommendedCash` charges CASH_PER_CROSSING',
  );
  lines.push(
    '  = 45 per controlled crossing, and a dominant illicit route avoids a MEDIAN OF 14 of',
  );
  lines.push('  them — around 630 cash, which comfortably swamps the 125%-vs-85% `PROFILE_COST`');
  lines.push('  handicap it carries against `cheapest`. The same avoidance is why it is shorter:');
  lines.push(
    '  the other four profiles are MASKED out of crossing a boundary anywhere except at a',
  );
  lines.push('  crossing node (`costFor`, the `uncontrolled` mask), so they detour to reach one');
  lines.push(
    '  while `illicit` walks straight over for a flat +150. On Durban -> El Bayadh that is',
  );
  lines.push('  0 crossings against 32, and 12,580 km against 20,851.');
  lines.push('');
  lines.push(
    '  SO THE TRADE IS NOT PRICED IN ANY NUMBER A PLAYER SEES BEFORE CHOOSING. Everything',
  );
  lines.push('  `illicit` gives up is paid at RUN time and in content: it starts `vehicleLegal:');
  lines.push('  false`, it refuses train and ferry, and it is meant to attract attention. None of');
  lines.push(
    '  those is a field on `RoutePreview`, so on the preparation screen the illegal route',
  );
  lines.push(
    '  is shorter, cheaper, flatter and crosses fewer borders than every alternative on a',
  );
  lines.push('  third of pairs, with nothing shown against it.');
  lines.push('');
  lines.push('  A SECOND-ORDER CONSEQUENCE, because it is checkable here: `borderBeats` is');
  lines.push('  `min(crossings, 4)`, so an illicit route with 0 crossings schedules ZERO border');
  lines.push('  beats. Border crossings are one of only two beat types the corpus can currently');
  lines.push('  fill, so the dominant illicit route also deletes most of the authored content on');
  lines.push('  the way past. That is a content-reachability problem, not only a balance one.');
  lines.push('');
  lines.push(
    '  VERDICT ON THE 35%: CONFIRMED at 142 of 410, and it is NOT an artefact of measuring',
  );
  lines.push(
    '  geometry — it survives the only other generation-time number that exists. But it is',
  );
  lines.push(
    '  still a statement about the PREVIEW, not about play: whether the trade is fair is a',
  );
  lines.push('  question about heat, wanted level and event rates, which live in the content pack');
  lines.push('  and are measured by `pnpm sim --pack=corpus`. The finding this report can make is');
  lines.push(
    '  narrower and firmer than "design bug": AT GENERATION TIME THE ILLICIT ROUTE HAS NO',
  );
  lines.push('  VISIBLE DOWNSIDE ON A THIRD OF PAIRS. Fixing that is either a preview field or a');
  lines.push('  cost-function change, and it has no owner.');
  lines.push('');

  return lines.join('\n');
}

/** Total `selectPaths` cost per pair, the five raw Dijkstras inside it, and the path length. */
export type BenchmarkSample = {
  readonly total: readonly number[];
  readonly dijkstra: readonly number[];
  /**
   * Hops on the profile shortest path, parallel to `total`.
   *
   * Recorded so the "Yen scales with hop count" claim is a MEASUREMENT rather than an appeal to
   * the algorithm's shape. `kShortestPaths` runs a Dijkstra per spur node along the path, so the
   * prediction is that time tracks hops super-linearly; the report bands the samples by hop count
   * and prints the mean in each band, which either shows that or does not.
   */
  readonly hops: readonly number[];
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
  lines.push(`  DEVICE MULTIPLIER: ${String(DEVICE_MULTIPLIER)}x, ASSUMED, NOT MEASURED.`);
  lines.push('  The basis: a mid-range phone under Hermes runs allocation-light integer work of');
  lines.push(
    '  this shape roughly 4-8x slower than desktop V8, and 6x is the middle of that range.',
  );
  lines.push('');
  lines.push('  IS 6x DEFENSIBLE? As a placeholder yes, as a measurement no, and the distinction');
  lines.push('  matters because nothing in this repo has ever run on a phone. ADR 0012 records');
  lines.push('  Hermes as UNTESTED; the determinism guarantees are proven on V8 only. Worse for');
  lines.push('  this particular number, Hermes has NO JIT in its default configuration, so the');
  lines.push('  4-8x band — which is drawn from JIT-ed interpreter comparisons — is being applied');
  lines.push('  to an engine that may not match its assumptions. The tight integer loops inside');
  lines.push('  Dijkstra and Yen are exactly the code JIT compilation helps most, so 6x is as');
  lines.push('  likely to be optimistic as pessimistic, and there is no evidence either way.');
  lines.push('');
  lines.push(
    '  WHAT WOULD REPLACE IT: run `selectPaths` over these same 200 pairs inside the Expo',
  );
  lines.push('  app on a real device and read the ratio off. That is a day of work, it needs the');
  lines.push('  app shell that does not exist yet, and until it happens this row is an assumption');
  lines.push('  with a stated basis. The break-even column above is what makes the verdict usable');
  lines.push('  in the meantime.');
  lines.push('');
  lines.push(
    `  Phone estimate     mean ${phone(total.mean)} ms   p50 ${phone(total.at(0.5))}   ` +
      `p90 ${phone(total.at(0.9))}   max ${phone(total.at(1))}`,
  );
  lines.push('');

  // PASS/FAIL PER STATISTIC, plus the multiplier at which each would flip. The break-even is what
  // makes the verdict robust to the one number in this section that is assumed rather than
  // measured: if a statistic fails at every plausible multiplier, the assumption is not load-bearing.
  lines.push(
    `  VERDICT vs the ${String(BUDGET_MS)} ms budget, per statistic, at ${String(DEVICE_MULTIPLIER)}x:`,
  );
  lines.push(
    `    ${'statistic'.padEnd(10)}${'Node ms'.padStart(9)}${'phone ms'.padStart(10)}` +
      `${'verdict'.padStart(9)}   flips at a multiplier of`,
  );
  for (const [name, value] of [
    ['mean', total.mean],
    ['p50', total.at(0.5)],
    ['p90', total.at(0.9)],
    ['max', total.at(1)],
  ] as const) {
    const breakEven = value <= 0 ? Infinity : BUDGET_MS / value;
    lines.push(
      `    ${name.padEnd(10)}${value.toFixed(2).padStart(9)}${phone(value).padStart(10)}` +
        `${(value * DEVICE_MULTIPLIER <= BUDGET_MS ? 'PASS' : 'FAIL').padStart(9)}   ` +
        `${Number.isFinite(breakEven) ? `${breakEven.toFixed(2)}x` : 'n/a'}`,
    );
  }
  lines.push('');
  lines.push(
    '  THE VERDICT DOES NOT DEPEND ON THE MULTIPLIER BEING RIGHT, which is the only reason',
  );
  lines.push(
    '  it is safe to report at all. `max` needs a phone no worse than ~1.2x desktop V8 to',
  );
  lines.push(
    '  fit the budget — that is not a mid-range phone, that is a faster laptop — and `p90`',
  );
  lines.push(
    '  needs ~3.5x, which is below the bottom of any defensible range. So p90 and max fail',
  );
  lines.push(
    '  at 4x, at 6x and at 8x alike, and p50 passes at all three. Choosing 6 rather than 4',
  );
  lines.push('  or 8 changes no PASS and no FAIL in this table.');
  lines.push('');
  lines.push('  RE-MEASURED AT M3.11, AND THE EXTRAPOLATION IT REPLACES WAS WRONG IN ITS MODEL,');
  lines.push('  not just in its number. The old caveat said Dijkstra is O(E log V) so ~8x the');
  lines.push('  graph is ~8x the work. Dijkstra is not where the time goes: five of them cost');
  lines.push(
    `  ${dijkstra.mean.toFixed(2)} ms mean and ${dijkstra.at(1).toFixed(2)} ms at the worst pair, ` +
      `which is ${((dijkstra.mean / Math.max(total.mean, 1e-9)) * 100).toFixed(0)}% of the call.`,
  );
  lines.push('  The other ~95% is Yen backfill, and `kShortestPaths` runs a Dijkstra per spur');
  lines.push('  node ALONG THE PATH — so its cost should scale with HOP COUNT, which is what the');
  lines.push('  continental slice actually changed: longest path 19 hops before, 59 now.');
  lines.push('');
  lines.push('  THAT CLAIM IS INSTRUMENTED RATHER THAN ASSERTED. The same 200 samples, banded by');
  lines.push('  the hop count of the longest profile shortest-path:');
  lines.push('');
  lines.push(
    `    ${'hops'.padEnd(10)}${'pairs'.padStart(7)}${'mean ms'.padStart(10)}` +
      `${'max ms'.padStart(10)}${'ms/hop'.padStart(10)}`,
  );
  const bands: readonly (readonly [string, number, number])[] = [
    ['0-9', 0, 9],
    ['10-19', 10, 19],
    ['20-29', 20, 29],
    ['30-39', 30, 39],
    ['40+', 40, Number.MAX_SAFE_INTEGER],
  ];
  for (const [name, lo, hi] of bands) {
    const picked: number[] = [];
    let hopSum = 0;
    for (let i = 0; i < sample.total.length; i += 1) {
      const h = sample.hops[i] ?? 0;
      const t = sample.total[i];
      if (t === undefined || h < lo || h > hi) continue;
      picked.push(t);
      hopSum += h;
    }
    if (picked.length === 0) continue;
    const m = picked.reduce((s, v) => s + v, 0) / picked.length;
    const meanHops = hopSum / picked.length;
    lines.push(
      `    ${name.padEnd(10)}${String(picked.length).padStart(7)}${m.toFixed(2).padStart(10)}` +
        `${Math.max(...picked)
          .toFixed(2)
          .padStart(10)}` +
        `${(m / Math.max(1, meanHops)).toFixed(3).padStart(10)}`,
    );
  }
  lines.push('');
  lines.push('  `ms/hop` RISING FROM THE 10-19 BAND DOWN IS THE POINT. If Yen cost were linear in');
  lines.push('  hops that column would be flat; instead it roughly quadruples from 10-19 to 40+,');
  lines.push('  because each extra hop adds a spur Dijkstra AND every spur Dijkstra runs over a');
  lines.push('  longer path. Mean time itself goes 1.6 ms to 24.7 ms across those bands.');
  lines.push('');
  lines.push('  THE 0-9 ROW IS NOT PART OF THAT TREND and is not evidence against it: 25 pairs at');
  lines.push('  sub-millisecond totals, where fixed call overhead rather than spur count sets the');
  lines.push(
    '  time, so dividing by a hop count near zero inflates the ratio. The trend to read is',
  );
  lines.push('  the four bands from 10 hops up, which is where all the cost lives.');
  lines.push('');
  lines.push('  THE BUDGET IS MISSED BY THE LONG-HOP BAND ALONE, and that band is a minority of');
  lines.push(
    '  pairs — which is exactly why mean and p50 look survivable while p90 and max do not.',
  );
  lines.push('  A player routing between two nearby cities never notices; one routing across the');
  lines.push('  map waits three quarters of a second at the estimated multiplier.');
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
  const hops: number[] = [];
  for (let i = 0; i < count && total.length < samples; i += 1) {
    const from = i;
    const to = (i * stride + 1 + Math.floor(count / 2)) % count;
    if (from === to) continue;
    // The one sanctioned wall-clock read outside the app's clock adapter: a build-time tool
    // measuring the harness, never the run.
    let started = performance.now();
    let longest = 0;
    for (const profile of ROUTE_PROFILES) {
      const path = shortestPath(graph, from, to, costFor(profile));
      if (path !== null && path.edges.length > longest) longest = path.edges.length;
    }
    dijkstra.push(performance.now() - started);

    started = performance.now();
    selectPaths(graph, from, to);
    total.push(performance.now() - started);
    hops.push(longest);
  }
  return { total, dijkstra, hops };
}
