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

  it('records every source as unfetched, honestly', () => {
    // Null is the true state until a human runs --stage=fetch. A placeholder hash would be a
    // lie that `--check` would then compare against.
    for (const source of LOCK.sources) {
      expect(source.sha256, source.id).toBeNull();
      expect(source.retrievedUtc, source.id).toBeNull();
    }
    expect(LOCK.nodeMajor).toBeNull();
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
