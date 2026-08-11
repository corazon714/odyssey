import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findWorkspaceRoot } from '../shared/workspace-root.ts';
import { readLock, verifyLock } from './fetch-sources.ts';
import { createEpsilonLedger } from './geodesy.ts';
import { parseArgs } from './parse-args.ts';
import { formatAudit } from './report.ts';
import { readGeonames, withinBox } from './read-geonames.ts';
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
const LOCK_PATH = join(ROOT, 'packages', 'content', 'geo', 'sources.lock.json');
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

process.exitCode = main(process.argv.slice(2));
