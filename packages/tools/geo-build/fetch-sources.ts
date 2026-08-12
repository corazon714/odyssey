import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Verify — and, when asked, acquire — the third-party source archives.
 *
 * ## This module never runs itself
 *
 * `--stage=audit` reads a checked-in synthetic sample by default and never touches the network.
 * Downloading tens of megabytes of third-party data is a deliberate act with licence
 * consequences, so it happens only under `--stage=fetch`, and only when a human runs it.
 *
 * ## The allowlist is the real control
 *
 * `docs/geo-data-licensing.md` §7 is blunt that no regex can detect an OSM-derived *value* — a
 * latitude copied out of OSM looks like any other latitude. What CAN be enforced mechanically is
 * where bytes came from, so every entry's host is checked against `ALLOWED_HOSTS` before
 * anything is read, and `content:lint`'s `GEO_OSM_SOURCE` re-checks the same lock file from the
 * other side. Between them they catch carelessness. Neither catches intent, and saying so is
 * part of the control.
 */

/** Hosts any source may come from. ODbL-encumbered mirrors are absent on purpose. */
export const ALLOWED_HOSTS: readonly string[] = ['naturalearthdata.com', 'geonames.org', 'nga.mil'];

export const ALLOWED_LICENCES: readonly string[] = [
  'public-domain',
  'cc-by-4.0',
  'us-gov-public-domain',
];

export type SourceEntry = {
  readonly id: string;
  readonly url: string;
  readonly license: string;
  readonly attribution: string;
  /**
   * Null until the source has been fetched and recorded.
   *
   * It hashes the file in `.geo-cache/` that the BUILD READS, not the archive the URL served.
   * That is the value `--check` needs — a byte-identical rebuild depends on the bytes going in,
   * and for the Natural Earth layers those bytes are post-conversion (see `conversion`).
   */
  readonly sha256: string | null;
  readonly retrievedUtc: string | null;
  readonly file: string;
  /**
   * How the archive became the cached file.
   *
   * Natural Earth's own downloads are SHAPEFILES, not GeoJSON — ADR 0024 Decision 5 originally
   * claimed otherwise and was wrong. The conversion happens out of tree, which is what that
   * decision actually mandates, and recording the command here is what makes the cached bytes
   * reproducible by someone else.
   */
  readonly conversion?: string;
  /**
   * `false` for a source no current stage consumes. Defaults to required.
   *
   * `alternateNames` is 200 MB compressed and is read only by the exonym pass (ADR 0028
   * Decision 4, M3.11). Demanding it be unpacked and hashed to run an audit that never opens it
   * would be a checklist item people learn to skip.
   */
  readonly required?: boolean;
};

export type SourcesLock = {
  readonly nodeMajor: number | null;
  readonly sources: readonly SourceEntry[];
};

export type VerifyIssue = {
  readonly id: string;
  readonly message: string;
};

/**
 * Static checks on the lock file: hosts, licences, and whether the bytes are actually here.
 *
 * Returns issues rather than throwing, following every other loader in the repo. An entry with a
 * null `sha256` is NOT an issue by itself — it is the honest state of a source nobody has
 * fetched yet — but it IS an issue under `--check`, where the whole point is byte equality.
 */
export function verifyLock(
  lock: SourcesLock,
  cacheDir: string,
  opts: { readonly requireFetched: boolean },
): readonly VerifyIssue[] {
  const issues: VerifyIssue[] = [];

  for (const entry of lock.sources) {
    let host: string;
    try {
      host = new URL(entry.url).hostname;
    } catch {
      issues.push({ id: entry.id, message: `unparseable url: ${entry.url}` });
      continue;
    }
    if (!ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
      issues.push({
        id: entry.id,
        message:
          `host ${host} is not on the allowlist (${ALLOWED_HOSTS.join(', ')}). ` +
          'See docs/geo-data-licensing.md §2 — an ODbL source would oblige us to publish the ' +
          'route graph free of charge.',
      });
    }
    if (!ALLOWED_LICENCES.includes(entry.license)) {
      issues.push({ id: entry.id, message: `licence ${entry.license} is not one we accept` });
    }
    if (entry.attribution.trim() === '') {
      issues.push({ id: entry.id, message: 'no attribution string recorded' });
    }

    if (!opts.requireFetched || entry.required === false) continue;

    if (entry.sha256 === null) {
      issues.push({ id: entry.id, message: 'never fetched — run `--stage=fetch` first' });
      continue;
    }
    const path = join(cacheDir, entry.file);
    if (!existsSync(path)) {
      issues.push({ id: entry.id, message: `missing from the cache: ${path}` });
      continue;
    }
    const actual = sha256Of(readFileSync(path));
    if (actual !== entry.sha256) {
      issues.push({
        id: entry.id,
        message: `sha256 mismatch — lock says ${entry.sha256.slice(0, 12)}…, cache has ${actual.slice(0, 12)}…`,
      });
    }
  }

  if (opts.requireFetched && lock.nodeMajor === null) {
    issues.push({
      id: 'lock',
      message:
        'no build-host Node major recorded. Transcendental results can shift between majors, ' +
        'so a byte comparison across two of them is not meaningful — ADR 0024 Decision 6.',
    });
  }

  return issues;
}

export function sha256Of(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function readLock(path: string): SourcesLock {
  return JSON.parse(readFileSync(path, 'utf8')) as SourcesLock;
}
