import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyseConnectivity, MIN_LANDMASS_NODES } from '../geo-build/connectivity.ts';
import { nodesDigest } from '../geo-build/write-artifacts.ts';
import { readLock } from '../geo-build/fetch-sources.ts';
import { error, warn, type LintIssue } from './issue.ts';
import { type ContentBundle } from './load-content.ts';

/**
 * The geo rules (M3.6). ADR 0024 is the reasoning; CLAUDE.md §11 is the constraint.
 *
 * ## Two families, and they run under different conditions
 *
 * **Graph rules** read `bundle.geo` and are SILENT when it is null — an absent geo directory is
 * a legitimate state (`load-geo.ts`), and a rule that fires on absence would be a to-do list.
 *
 * **Text rules** (`GEO_PLACE_BEHAVIOUR`, `GEO_NAME_FIELD_MISPLACED`, `GEO_OSM_SOURCE`) scan the
 * raw bytes and run whether or not the bundle parsed. That is not an oversight, it is the whole
 * point: every geo schema is a `strictObject`, so a file carrying `"cc"` today FAILS TO LOAD and
 * `bundle.geo` is null — which would make a parsed-data check silent exactly when it matters.
 * The failure these guard against is somebody adding a country code to the writer AND the
 * schema together, at which point the file parses perfectly and only a text scan objects.
 *
 * ## Where a finding points
 *
 * `nodes.gen.json` and `edges.gen.json` are GENERATED. Telling someone a generated line is
 * wrong is useless — they cannot edit it, and the next build would overwrite the fix. So every
 * message here names the cause a human can act on: an `overlay.yaml` row, a bbox, or
 * `pnpm geo:build`. The one exception is the text scans, where the offending bytes ARE the
 * finding and a real line number is more useful than a pointer.
 */

/**
 * A bridge stranding fewer than this many nodes is a fjord, a peninsula or a desert spur, and a
 * k-nearest graph with water rejection produces those in CHAINS. Declaring each would mean
 * several hundred overlay rows for no gain (`connectivity.ts`).
 */
const SIGNIFICANT_BRANCH = 10;

/**
 * MEASURED at the 692-node Afro-Eurasia slice (`--bbox=-18,-35,180,72`), 2026-08-12: 1,215
 * edges, 32 bridges, of which **ZERO strand 10+ nodes**. The largest stranded side in the whole
 * graph is 4 nodes; the distribution is 19 bridges stranding 1, ten stranding 2, two stranding 3
 * and one stranding 4. Nothing is grandfathered, so the budget is zero.
 *
 * It replaces 13, measured at the 263-node Europe-and-Maghreb slice, where 35 bridges included
 * 13 that stranded 10+ nodes. ADR 0033 Decision 6 required a re-measurement rather than an
 * extrapolation, and said that growing faster than the node count would be a finding about the
 * selector. **It went the other way, and that is the finding**: 2.6x the nodes, 3.0x the edges,
 * and three FEWER bridges. Average degree rose from 3.07 to 3.51, and the stranded sides
 * collapsed with it — the old 10+ branches were Mediterranean islands and Iberian spurs reached
 * by one edge, and on a continental graph those same places have neighbours in more directions.
 * The 263-node slice was the stringy one.
 *
 * Zero is therefore the honest calibration and not a tightening: any undeclared lifeline
 * stranding 10+ nodes is now genuinely new, and there is 2.5x of headroom before one can appear
 * (worst stranded side 4, `SIGNIFICANT_BRANCH` 10). Re-measure whenever the bbox or the quotas
 * move; a budget carried across a slice change is a number about a map that no longer exists.
 */
export const UNDECLARED_BRANCH_BUDGET = 0;

const NODES_FILE = 'geo/nodes.gen.json';
const EDGES_FILE = 'geo/edges.gen.json';
const OVERLAY_FILE = 'geo/overlay.yaml';
const LOCK_FILE = 'geo/sources.lock.json';

/**
 * Keys that would make a data file carry a POLITICAL or BEHAVIOURAL judgement.
 *
 * CLAUDE.md §11: geography is real, character is not. A node's `services` and `terrain` are
 * physical facts derived from settlement size and elevation; a per-place danger, risk or
 * corruption field is the thing the rule exists to make impossible, and a country code is how
 * one gets added later ("just for grouping"). ADR 0024 Decision 4 records why `countryCode` was
 * refused even though GeoNames supplies it free.
 */
const FORBIDDEN_KEYS = [
  'cc',
  'countryCode',
  'country',
  'iso',
  'iso3',
  'danger',
  'dangerIndex',
  'risk',
  'riskIndex',
  'corruption',
  'crime',
  'hostility',
  'threat',
  'safety',
  'stability',
] as const;

type KeyHit = { readonly key: string; readonly line: number; readonly column: number };

/**
 * Find object keys by name in raw JSON or YAML source.
 *
 * Deliberately a scan over KEYS, never values: `overlay.yaml`'s `reason` fields name real
 * countries ("Free in Germany, then the A36 charges from Mulhouse") and must keep doing so —
 * describing where a road is priced is not a judgement about anyone. Matching values would
 * make every honest justification a violation.
 */
function findKeys(source: string, keys: readonly string[]): readonly KeyHit[] {
  const hits: KeyHit[] = [];
  const lines = source.split('\n');
  for (const key of keys) {
    const pattern = new RegExp(`(?:"${key}"\\s*:)|(?:^\\s*${key}\\s*:)`, 'g');
    lines.forEach((text, index) => {
      pattern.lastIndex = 0;
      const found = pattern.exec(text);
      if (found === null) return;
      hits.push({ key, line: index + 1, column: found.index + 1 });
    });
  }
  return hits.sort((a, b) => a.line - b.line || a.column - b.column || (a.key < b.key ? -1 : 1));
}

function readIfPresent(root: string, file: string): string | null {
  const full = join(root, file);
  return existsSync(full) ? readFileSync(full, 'utf8') : null;
}

/** CLAUDE.md §11 — no geo file may carry a country code or a per-place behavioural field. */
export function geoPlaceBehaviour(bundle: ContentBundle): readonly LintIssue[] {
  const issues: LintIssue[] = [];
  for (const file of [NODES_FILE, EDGES_FILE, OVERLAY_FILE]) {
    const source = readIfPresent(bundle.root, file);
    if (source === null) continue;
    for (const hit of findKeys(source, FORBIDDEN_KEYS)) {
      issues.push(
        error(
          'GEO_PLACE_BEHAVIOUR',
          file,
          `\`${hit.key}\` attaches a political or behavioural fact to a real place. CLAUDE.md ` +
            `§11: difficulty comes from the route profile and the player state, never from where ` +
            `the player happens to be.`,
          hit.line,
          hit.column,
        ),
      );
    }
  }
  return issues;
}

/**
 * CLAUDE.md rule 2.4 — a place name is one of exactly two sanctioned user-visible literals, and
 * it lives on a NODE. An edge or an overlay row carrying one is a second exemption nobody
 * granted, and the rule exists so the first does not spread into the general case.
 */
export function geoNameFieldMisplaced(bundle: ContentBundle): readonly LintIssue[] {
  const issues: LintIssue[] = [];
  for (const file of [EDGES_FILE, OVERLAY_FILE]) {
    const source = readIfPresent(bundle.root, file);
    if (source === null) continue;
    for (const hit of findKeys(source, ['n', 'name', 'label', 'title', 'placeName'])) {
      issues.push(
        error(
          'GEO_NAME_FIELD_MISPLACED',
          file,
          `\`${hit.key}\` looks like a place name, and only a geo NODE may carry one ` +
            `(CLAUDE.md rule 2.4, ADR 0028). Everything else refers to a node by id.`,
          hit.line,
          hit.column,
        ),
      );
    }
  }
  return issues;
}

/**
 * ADR 0024's OSM firewall, re-checked at lint time.
 *
 * `fetch-sources.ts` refuses a disallowed licence before anything is downloaded; this is the
 * second gate, because the lock file is committed and can be edited by hand long after a fetch.
 * ODbL's share-alike is incompatible with a closed-source commercial game — that is the whole
 * reason every distance in this repo is derived from coordinates rather than looked up.
 */
export function geoOsmSource(bundle: ContentBundle): readonly LintIssue[] {
  const full = join(bundle.root, LOCK_FILE);
  if (!existsSync(full)) return [];

  const lock = readLock(full);
  const banned = /openstreetmap|\bosm\b|odbl|open database license/i;
  return lock.sources.flatMap((source) => {
    const haystack = `${source.id} ${source.url} ${source.license} ${source.attribution}`;
    if (!banned.test(haystack)) return [];
    return [
      error(
        'GEO_OSM_SOURCE',
        LOCK_FILE,
        `source \`${source.id}\` is OSM-derived. ADR 0024 forbids it outright: ODbL share-alike ` +
          `is incompatible with a closed-source commercial game, and the incompatibility is not ` +
          `fixable by attribution.`,
      ),
    ];
  });
}

/** Everything that needs the parsed graph. Silent when there is no geo data. */
export function geoGraph(bundle: ContentBundle): readonly LintIssue[] {
  // `?? null`, not `=== null`. Synthetic bundles in the tests are built with
  // `as unknown as ContentBundle` and simply OMIT the key, so `bundle.geo` is `undefined` there
  // — and `undefined !== null` would walk straight into `geo.nodes` and throw. ADR 0021 records
  // the same trap in `migrate_3_to_4`, where an absent `presentation` read as undefined and sent
  // `resolveChoice` looking up a complication by an undefined id. Absent and null mean the same
  // thing here: there is no graph.
  const geo = bundle.geo ?? null;
  if (geo === null) return [];

  const issues: LintIssue[] = [];
  const indexOf = new Map(geo.nodes.map((record, i) => [String(record.node.id), i]));

  // ── endpoints resolve ────────────────────────────────────────────────────────────────
  // `resolved` DROPS unresolvable edges, so its indices are not `geo.edges` indices. Every
  // downstream reader of a connectivity result must go through `resolvedIds`, or a single
  // dangling endpoint would silently shift every bridge report by one.
  const resolved: { readonly a: number; readonly b: number }[] = [];
  const resolvedIds: string[] = [];
  for (const edge of geo.edges) {
    const a = indexOf.get(String(edge.from));
    const b = indexOf.get(String(edge.to));
    if (a === undefined || b === undefined) {
      issues.push(
        error(
          'GEO_EDGE_ENDPOINT_UNRESOLVED',
          EDGES_FILE,
          `edge \`${String(edge.id)}\` names \`${a === undefined ? String(edge.from) : String(edge.to)}\`, ` +
            `which is not in ${NODES_FILE}. The two files are out of step — run \`pnpm geo:build\`.`,
        ),
      );
      continue;
    }
    resolved.push({ a, b });
    resolvedIds.push(String(edge.id));
  }

  // ── the node set the edges were built against ────────────────────────────────────────
  const recomputed = nodesDigest(geo.nodes.map((record) => record.node));
  if (recomputed !== geo.nodesDigest) {
    issues.push(
      error(
        'GEO_NODES_DIGEST_STALE',
        NODES_FILE,
        `header digest \`${geo.nodesDigest}\` but the node set hashes to \`${recomputed}\`. The ` +
          `file was hand-edited, or written by a different build — run \`pnpm geo:build\`.`,
      ),
    );
  }
  if (geo.nodesDigest !== geo.edgesNodesDigest) {
    issues.push(
      error(
        'GEO_NODES_DIGEST_STALE',
        EDGES_FILE,
        `built against node set \`${geo.edgesNodesDigest}\` but ${NODES_FILE} is \`${geo.nodesDigest}\`. ` +
          `One file was regenerated and the other was not.`,
      ),
    );
  }

  // ── connectivity ─────────────────────────────────────────────────────────────────────
  const report = analyseConnectivity(geo.nodes.length, resolved);

  // ADR 0036: several components are legal, one per LANDMASS. What is never legal is a
  // FRAGMENT — an island the selector reached and the edge builder could not connect, which
  // ships as a place a player can be routed into and stranded on. That is the failure ADR 0024
  // named; the component COUNT was only ever a proxy for it, and it was a proxy that made a
  // world map impossible.
  //
  // Reported per fragment rather than once, because each one is a separate decision: ferry it
  // in, or drop it from the slice.
  for (const component of report.components) {
    if (component.length >= MIN_LANDMASS_NODES) continue;
    const sample = component
      .slice(0, 4)
      .map((i) => String(geo.nodes[i]?.node.id ?? '?'))
      .join(', ');
    issues.push(
      error(
        'GEO_DISCONNECTED',
        EDGES_FILE,
        `a fragment of ${String(component.length)} node(s) is cut off from every landmass, and a ` +
          `player routed into it is stranded there: ${sample}. Join it with a \`ferries\` row in ` +
          `${OVERLAY_FILE}, or narrow the bbox so the selector stops reaching it. A component ` +
          `needs ${String(MIN_LANDMASS_NODES)} nodes to count as a landmass of its own.`,
      ),
    );
  }

  for (const index of report.orphans) {
    issues.push(
      error(
        'GEO_ORPHAN_NODE',
        NODES_FILE,
        `\`${String(geo.nodes[index]?.node.id ?? '?')}\` has no edge at all. Either the bbox cut ` +
          `its neighbours off, or it needs a \`forcedCorridors\` row in ${OVERLAY_FILE}.`,
      ),
    );
  }

  // ── bridges, against a budget ────────────────────────────────────────────────────────
  const declared = new Set(geo.overlay.criticalEdges.map((row) => String(row.edge)));
  const undeclared = report.leafBranches.filter((branch) => {
    if (branch.stranded < SIGNIFICANT_BRANCH) return false;
    return !declared.has(resolvedIds[branch.edge] ?? '');
  });

  if (undeclared.length > UNDECLARED_BRANCH_BUDGET) {
    const worst = undeclared
      .slice(0, 3)
      .map((b) => `${resolvedIds[b.edge] ?? '?'} (${String(b.stranded)} nodes)`)
      .join(', ');
    issues.push(
      warn(
        'GEO_UNDECLARED_BRIDGE',
        EDGES_FILE,
        `${String(undeclared.length)} undeclared lifeline edges strand ${String(SIGNIFICANT_BRANCH)}+ ` +
          `nodes, against a budget of ${String(UNDECLARED_BRANCH_BUDGET)}. Worst: ${worst}. Each is a ` +
          `single edge whose loss cuts the map — declare it in ${OVERLAY_FILE} \`criticalEdges\`, or ` +
          `add a corridor so it is not the only way through.`,
      ),
    );
  }

  // ── the overlay still refers to nodes that exist ─────────────────────────────────────
  const rows = [
    ...geo.overlay.forcedCorridors,
    ...geo.overlay.ferries,
    ...geo.overlay.forbiddenCorridors,
    ...geo.overlay.tolled,
  ];
  for (const row of rows) {
    const missing = [String(row.from), String(row.to)].filter((id) => !indexOf.has(id));
    if (missing.length === 0) continue;
    issues.push(
      error(
        'GEO_OVERLAY_STALE',
        OVERLAY_FILE,
        `row "${row.reason}" names ${missing.join(' and ')}, which the selector did not keep. ` +
          `The row now does nothing — repoint it or delete it.`,
      ),
    );
  }

  const edgeIds = new Set(geo.edges.map((edge) => String(edge.id)));
  for (const row of geo.overlay.criticalEdges) {
    if (edgeIds.has(String(row.edge))) continue;
    issues.push(
      error(
        'GEO_OVERLAY_STALE',
        OVERLAY_FILE,
        `criticalEdges row "${row.reason}" names edge \`${String(row.edge)}\`, which no longer ` +
          `exists. Edge ids are generated, so a row naming one rots on any retune.`,
      ),
    );
  }

  // ── §11, on the parsed data ──────────────────────────────────────────────────────────
  for (const record of geo.nodes) {
    if (record.node.type !== 'border_crossing' || record.name === null) continue;
    issues.push(
      error(
        'GEO_NAMED_BORDER',
        NODES_FILE,
        `\`${String(record.node.id)}\` is a border crossing and carries the name ` +
          `"${record.name}". A crossing is typed and never named (CLAUDE.md §11, ADR 0024): the ` +
          `UI composes "a border crossing, 40 km past X" from the previous node.`,
      ),
    );
  }

  return issues;
}

/** Re-exported for the rule table, so adding a geo rule is one line there. */
export const GEO_RULES = [
  { name: 'geo-graph', run: geoGraph },
  { name: 'geo-place-behaviour', run: geoPlaceBehaviour },
  { name: 'geo-name-field', run: geoNameFieldMisplaced },
  { name: 'geo-osm-source', run: geoOsmSource },
] as const satisfies readonly {
  readonly name: string;
  readonly run: (bundle: ContentBundle) => readonly LintIssue[];
}[];
