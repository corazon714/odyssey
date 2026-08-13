import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadGeoOverlay } from '@odyssey/content/loader';
import { MIN_LANDMASS_NODES } from './connectivity.ts';
import { findWorkspaceRoot } from '../shared/workspace-root.ts';
import { auditDiversity, formatDiversity, graphFromArtifacts } from './audit-diversity.ts';
import { benchmark, formatBenchmark, formatVerification } from './report-verify.ts';
import { readNames } from './verify-routes.ts';
import { buildSlice } from './build-slice.ts';
import { SETTLEMENT_QUOTA } from './continent.ts';
import { readLock, verifyLock } from './fetch-sources.ts';
import { createEpsilonLedger } from './geodesy.ts';
import { parseArgs } from './parse-args.ts';
import { formatAudit, formatSlice } from './report.ts';
import { readGeonames, withinBox, type Candidate } from './read-geonames.ts';
import { readLand, readLines, readRegions } from './read-natural-earth.ts';
import { scoreCandidates } from './score-candidates.ts';

/**
 * `pnpm geo:audit` — read the candidate pool, measure it, print, and WRITE NOTHING.
 *
 * The audit stage exists so the node budget in ADR 0024 can be checked against real supply
 * before ~1,200 nodes and ~3,000 edges are derived from it. It is the review gate for M3.4:
 * if a continent cannot supply its quota, or a score term is zero for every candidate, that is
 * cheaper to find here than after the overlay has been hand-authored on top.
 *
 * **It does not touch the network.** `--real` reads `.geo-cache/`, which only
 * `--stage=fetch` populates and which a human runs deliberately — downloading third-party data
 * has licence consequences and is not something a build script should do on first run.
 */

const ROOT = findWorkspaceRoot(dirname(fileURLToPath(import.meta.url)));
const CACHE_DIR = join(ROOT, '.geo-cache');
const CONTENT_DIR = join(ROOT, 'packages', 'content');
const GEO_DIR = join(CONTENT_DIR, 'geo');
const LOCK_PATH = join(GEO_DIR, 'sources.lock.json');
const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  '__fixtures__',
  'geonames-sample.tsv',
);

function main(argv: readonly string[]): number {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    process.stderr.write(`geo-build: ${parsed.message}\n`);
    return 2;
  }
  const options = parsed.options;

  const lock = readLock(LOCK_PATH);
  const lockIssues = verifyLock(lock, CACHE_DIR, {
    requireFetched: options.check || !options.fixture,
  });
  if (lockIssues.length > 0) {
    // Always fatal. With `requireFetched: false` the only issues that can appear are host,
    // licence and attribution — the OSM firewall — and none of those is worth continuing past.
    process.stderr.write('geo-build: sources.lock.json\n');
    for (const issue of lockIssues) process.stderr.write(`  ${issue.id}: ${issue.message}\n`);
    return 2;
  }

  if (options.stage === 'fetch') {
    process.stderr.write(
      'geo-build: --stage=fetch downloads tens of megabytes of third-party data and is not\n' +
        '  implemented as an automatic step. Fetch the seven archives in\n' +
        '  packages/content/geo/sources.lock.json into .geo-cache/, then record each sha256 and\n' +
        '  the build-host Node major in that file. docs/geo-data-licensing.md §9 is the checklist.\n',
    );
    return 2;
  }

  const sourcePath = options.fixture ? FIXTURE : join(CACHE_DIR, 'cities15000.txt');
  const text = readFileSync(sourcePath, 'utf8');
  const read = readGeonames(text);

  const candidates =
    options.bbox === null ? read.candidates : withinBox(read.candidates, options.bbox);
  const ledger = createEpsilonLedger();

  if (options.stage === 'verify') {
    const nodesJson = readFileSync(join(GEO_DIR, 'nodes.gen.json'), 'utf8');
    const graph = graphFromArtifacts(
      nodesJson,
      readFileSync(join(GEO_DIR, 'edges.gen.json'), 'utf8'),
    );
    const { byName, nameOf } = readNames(nodesJson, graph);
    process.stdout.write(formatVerification(graph, byName, nameOf));
    process.stdout.write(`${formatBenchmark(graph, benchmark(graph, 200))}\n`);
    return 0;
  }

  if (options.stage === 'diversity') {
    // Reads the COMMITTED artifacts, not an in-memory graph: the question is whether the bytes
    // the game will load produce different routes.
    const graph = graphFromArtifacts(
      readFileSync(join(GEO_DIR, 'nodes.gen.json'), 'utf8'),
      readFileSync(join(GEO_DIR, 'edges.gen.json'), 'utf8'),
    );
    const report = auditDiversity(graph, 200);
    process.stdout.write(formatDiversity(report));
    return report.verdict === 'PASS' ? 0 : 1;
  }

  if (options.stage === 'all') {
    if (options.fixture) {
      process.stderr.write(
        'geo-build: --stage=all needs the real sources. Re-run with --real.\n' +
          '  Generating a world from the synthetic fixture would ship invented places AS\n' +
          '  geography, which is the one thing this pipeline exists not to do.\n',
      );
      return 2;
    }
    return generate(candidates, ledger, options.check);
  }

  const scores = scoreCandidates(candidates);

  process.stdout.write(
    formatAudit({
      source: options.fixture
        ? 'packages/tools/geo-build/__fixtures__/geonames-sample.tsv (SYNTHETIC)'
        : '.geo-cache/cities15000.txt',
      totalRead: read.candidates.length,
      rejectedLines: read.rejected,
      candidates,
      scores,
      ledger,
      bboxDescription:
        options.bbox === null
          ? 'whole candidate set'
          : `bbox ${String(options.bbox.minLng)},${String(options.bbox.minLat)},` +
            `${String(options.bbox.maxLng)},${String(options.bbox.maxLat)}`,
    }),
  );

  if (options.fixture) {
    process.stdout.write(
      '\nNOTE: this is the SYNTHETIC fixture. The numbers above exercise the pipeline; they say\n' +
        'nothing about the real world. Re-run with --real once .geo-cache/ is populated.\n',
    );
  }
  return 0;
}

/**
 * `--stage=all`: derive the slice and write the artifacts.
 *
 * `--check` regenerates and byte-compares instead of writing, which is what makes the build
 * reproducible rather than merely deterministic-looking.
 */
function generate(
  candidates: readonly Candidate[],
  ledger: ReturnType<typeof createEpsilonLedger>,
  check: boolean,
): number {
  const read = (name: string): string => readFileSync(join(CACHE_DIR, name), 'utf8');

  // The overlay goes through `packages/content`'s loader rather than a local `JSON.parse` +
  // `as Overlay`. The cast was the whole risk: a hand-edited file with a misspelled key or a
  // dropped `reason` typechecked perfectly and silently did nothing. `loadGeoOverlay` validates
  // it against `geoOverlaySchema` and reports file:line:col — and `loadGeo` is deliberately NOT
  // used here, because this function WRITES the two artifacts it would insist on parsing.
  const overlay = loadGeoOverlay(CONTENT_DIR);
  if (overlay.data === null) {
    for (const found of overlay.issues) {
      process.stderr.write(
        `${found.file}:${String(found.line)}:${String(found.column)}  ${found.message}\n`,
      );
    }
    process.stderr.write('\ngeo-build: overlay.yaml did not parse. Nothing was written.\n');
    return 1;
  }

  const slice = buildSlice({
    candidates,
    regions: readRegions(read('ne_10m_admin_0_countries.geojson')),
    land: readLand(read('ne_10m_land.geojson')),
    terrainGeoJson: read('ne_10m_geography_regions_polys.geojson'),
    railLines: readLines(read('ne_10m_railroads.geojson')),
    quota: SETTLEMENT_QUOTA,
    overlay: overlay.data,
    ledger,
  });

  process.stdout.write(formatSlice(slice, ledger));

  const nodesPath = join(GEO_DIR, 'nodes.gen.json');
  const edgesPath = join(GEO_DIR, 'edges.gen.json');

  if (check) {
    const same =
      existsSync(nodesPath) &&
      existsSync(edgesPath) &&
      readFileSync(nodesPath, 'utf8') === slice.artifacts.nodesJson &&
      readFileSync(edgesPath, 'utf8') === slice.artifacts.edgesJson;
    process.stdout.write(same ? '\n--check: byte-identical.\n' : '\n--check: DIFFERS.\n');
    return same ? 0 : 1;
  }

  writeFileSync(nodesPath, slice.artifacts.nodesJson);
  writeFileSync(edgesPath, slice.artifacts.edgesJson);
  process.stdout.write(`\nwrote ${nodesPath}\nwrote ${edgesPath}\n`);

  // Fail closed. More than one component means a node no route can reach, and a second
  // component is not a curiosity — it is a map the player can be stranded on. ADR 0024.
  // ADR 0036: several components are legal, one per LANDMASS. Fail on FRAGMENTS — an island the
  // selector reached and the edge builder could not connect ships as a place a player can be
  // routed into and stranded on, which is the failure ADR 0024 actually named. The component
  // count was only ever a proxy for it, and it was a proxy that made a world map impossible.
  const fragments = slice.connectivity.components.filter(
    (component) => component.length < MIN_LANDMASS_NODES,
  );
  if (fragments.length > 0) {
    const sizes = fragments
      .map((component) => component.length)
      .sort((a, b) => b - a)
      .slice(0, 8)
      .join(', ');
    process.stderr.write(
      `\ngeo-build: ${String(fragments.length)} fragment(s) below ${String(MIN_LANDMASS_NODES)} ` +
        `nodes (${sizes}${fragments.length > 8 ? ', …' : ''}). Each is cut off from every ` +
        'landmass. Join it with a `ferries` row in overlay.yaml, or narrow the bbox so the ' +
        'selector stops reaching it.\n',
    );
    return 1;
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
