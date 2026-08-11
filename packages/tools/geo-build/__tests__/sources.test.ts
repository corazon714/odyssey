import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { findWorkspaceRoot } from '../../shared/workspace-root.ts';
import { ALLOWED_HOSTS, ALLOWED_LICENCES, verifyLock, type SourcesLock } from '../fetch-sources.ts';

const ROOT = findWorkspaceRoot(dirname(fileURLToPath(import.meta.url)));
const LOCK_PATH = join(ROOT, 'packages', 'content', 'geo', 'sources.lock.json');
const LOCK = JSON.parse(readFileSync(LOCK_PATH, 'utf8')) as SourcesLock;

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'probe',
    url: 'https://download.geonames.org/export/dump/cities15000.zip',
    license: 'cc-by-4.0',
    attribution: 'Place data © GeoNames contributors, CC BY 4.0.',
    sha256: null,
    retrievedUtc: null,
    file: 'cities15000.txt',
    ...overrides,
  };
}

const NOT_FETCHED = { requireFetched: false } as const;

describe('the shipped sources.lock.json', () => {
  it('has sources to check', () => {
    expect(LOCK.sources.length).toBeGreaterThan(3);
  });

  it('passes its own firewall', () => {
    expect(verifyLock(LOCK, join(ROOT, '.geo-cache'), NOT_FETCHED)).toEqual([]);
  });

  it('records a hash and a retrieval date for every source it claims to have fetched', () => {
    // The two travel together or the record is meaningless: a hash with no date cannot be
    // re-verified against what the URL serves today, and a date with no hash pins nothing.
    for (const source of LOCK.sources) {
      expect(source.sha256 === null, source.id).toBe(source.retrievedUtc === null);
      if (source.sha256 !== null) expect(source.sha256, source.id).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('pins the build-host Node major once anything has been fetched', () => {
    // Transcendental results can shift between majors, so a byte comparison across two of them
    // is not a comparison. ADR 0024 Decision 6.
    const anyFetched = LOCK.sources.some((s) => s.sha256 !== null);
    if (anyFetched) expect(LOCK.nodeMajor).not.toBeNull();
  });

  it('records how each archive became the file the build reads', () => {
    // Natural Earth ships SHAPEFILES, not GeoJSON — ADR 0024 Decision 5 said otherwise and was
    // wrong. The conversion happens out of tree, so the command is the only thing that makes
    // the cached bytes reproducible by someone else.
    for (const source of LOCK.sources) {
      if (source.sha256 === null) continue;
      expect(source.conversion, source.id).toBeDefined();
      if (source.file.endsWith('.geojson')) {
        expect(source.conversion, source.id).toContain('mapshaper');
      }
    }
  });

  it('marks a source no current stage reads as not required', () => {
    // alternateNames is 200 MB compressed and is opened only by the exonym pass. Demanding it
    // for an audit that never touches it is the kind of checklist item people learn to skip.
    const alternates = LOCK.sources.find((s) => s.id === 'geonames-alternate-names');
    expect(alternates?.required).toBe(false);
  });

  it('carries an attribution string for every CC BY source', () => {
    for (const source of LOCK.sources) {
      if (source.license !== 'cc-by-4.0') continue;
      expect(source.attribution, source.id).toContain('CC BY 4.0');
      expect(source.attribution, source.id).toContain('GeoNames');
    }
  });
});

describe('the OSM firewall', () => {
  // "A rule that has never fired is a rule nobody has checked" — lint.test.ts:68-70. This rule
  // guards the single most consequential decision in the phase, so each way past it gets a case.

  it('REJECTS an ODbL mirror even when it claims to be public domain', () => {
    // The exact hole an earlier draft had: the keyword scan was scoped to source/provenance
    // fields, so a geofabrik URL under `url` with license: public-domain passed both checks.
    const issues = verifyLock(
      {
        nodeMajor: null,
        sources: [
          entry({ url: 'https://download.geofabrik.de/europe.osm.pbf', license: 'public-domain' }),
        ],
      },
      '/nowhere',
      NOT_FETCHED,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain('not on the allowlist');
    expect(issues[0]?.message).toContain('ODbL');
  });

  it('rejects planet.openstreetmap.org', () => {
    const issues = verifyLock(
      {
        nodeMajor: null,
        sources: [entry({ url: 'https://planet.openstreetmap.org/planet.osm.bz2' })],
      },
      '/nowhere',
      NOT_FETCHED,
    );
    expect(issues).toHaveLength(1);
  });

  it('rejects an unaccepted licence even from an allowed host', () => {
    const issues = verifyLock(
      { nodeMajor: null, sources: [entry({ license: 'odbl' })] },
      '/nowhere',
      NOT_FETCHED,
    );
    expect(issues[0]?.message).toContain('licence odbl');
  });

  it('rejects a CC BY source with no attribution recorded', () => {
    const issues = verifyLock(
      { nodeMajor: null, sources: [entry({ attribution: '   ' })] },
      '/nowhere',
      NOT_FETCHED,
    );
    expect(issues[0]?.message).toContain('no attribution');
  });

  it('rejects an unparseable url rather than skipping it', () => {
    const issues = verifyLock(
      { nodeMajor: null, sources: [entry({ url: 'not a url' })] },
      '/nowhere',
      NOT_FETCHED,
    );
    expect(issues[0]?.message).toContain('unparseable url');
  });

  it('accepts a subdomain of an allowed host, and nothing else', () => {
    const ok = verifyLock(
      { nodeMajor: null, sources: [entry({ url: 'https://naciscdn.naturalearthdata.com/x.zip' })] },
      '/nowhere',
      NOT_FETCHED,
    );
    expect(ok).toEqual([]);
    // Guards the guard: a host that merely CONTAINS an allowed one is not a subdomain of it.
    const spoofed = verifyLock(
      {
        nodeMajor: null,
        sources: [entry({ url: 'https://naturalearthdata.com.evil.test/x.zip' })],
      },
      '/nowhere',
      NOT_FETCHED,
    );
    expect(spoofed).toHaveLength(1);
  });

  it('demands a fetch and a Node major under --check', () => {
    const issues = verifyLock({ nodeMajor: null, sources: [entry()] }, '/nowhere', {
      requireFetched: true,
    });
    expect(issues.map((i) => i.message).join(' ')).toContain('never fetched');
    expect(issues.map((i) => i.message).join(' ')).toContain('Node major');
  });

  it('keeps the allowlists narrow', () => {
    expect([...ALLOWED_HOSTS].sort()).toEqual(['geonames.org', 'naturalearthdata.com', 'nga.mil']);
    expect([...ALLOWED_LICENCES].sort()).toEqual([
      'cc-by-4.0',
      'public-domain',
      'us-gov-public-domain',
    ]);
  });
});
