import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { parseArgs } from '../parse-args.ts';
import { readGeonames, withinBox } from '../read-geonames.ts';
import { populationScore, scoreCandidates, seatScore } from '../score-candidates.ts';

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '__fixtures__',
  'geonames-sample.tsv',
);
const SAMPLE = readFileSync(FIXTURE, 'utf8');

/** One well-formed row, for the cases that need a specific field. */
function row(overrides: Record<number, string> = {}): string {
  const fields = [
    '910001',
    'Testholm',
    'Testholm',
    '',
    '47.5',
    '9.0',
    'P',
    'PPL',
    'XE',
    '',
    '01',
    '',
    '',
    '',
    '50000',
    '',
    '400',
    'Etc/UTC',
    '2026-08-09',
  ];
  for (const [at, value] of Object.entries(overrides)) fields[Number(at)] = value;
  return fields.join('\t');
}

describe('readGeonames', () => {
  it('reads the shipped synthetic fixture', () => {
    const { candidates, rejected } = readGeonames(SAMPLE);
    expect(candidates.length).toBeGreaterThan(60);
    expect(rejected).toEqual([]);
  });

  it('skips comment lines and blanks', () => {
    const { candidates } = readGeonames(`# a note\n\n${row()}\n`);
    expect(candidates).toHaveLength(1);
  });

  it('keeps only populated places', () => {
    // The wider dumps carry administrative regions and terrain features; none of them is a
    // place a traveller stops.
    const { candidates } = readGeonames(`${row()}\n${row({ 6: 'A' })}\n${row({ 6: 'T' })}\n`);
    expect(candidates).toHaveLength(1);
  });

  it('REPORTS a malformed line rather than dropping it silently', () => {
    const { candidates, rejected } = readGeonames(`${row()}\nnot\ta\trow\n`);
    expect(candidates).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toContain('expected 19 fields');
  });

  it('rejects impossible coordinates', () => {
    const { rejected } = readGeonames(`${row({ 4: '120' })}\n${row({ 5: '-999' })}\n`);
    expect(rejected).toHaveLength(2);
    expect(rejected.join(' ')).toContain('out of range');
  });

  it('sorts by geonameid, so a re-download that reorders lines changes nothing', () => {
    const forward = readGeonames(`${row({ 0: '3' })}\n${row({ 0: '1' })}\n${row({ 0: '2' })}\n`);
    const backward = readGeonames(`${row({ 0: '2' })}\n${row({ 0: '1' })}\n${row({ 0: '3' })}\n`);
    expect(forward.candidates.map((c) => c.geonameid)).toEqual([1, 2, 3]);
    expect(backward.candidates.map((c) => c.geonameid)).toEqual([1, 2, 3]);
  });

  it('reads dem rather than elevation, and tolerates an empty one', () => {
    const { candidates } = readGeonames(`${row({ 15: '', 16: '1800' })}\n`);
    expect(candidates[0]?.dem).toBe(1800);
    const { candidates: blank } = readGeonames(`${row({ 16: '' })}\n`);
    expect(blank[0]?.dem).toBe(0);
  });

  it('assigns a cell and a continent to every candidate', () => {
    const { candidates } = readGeonames(SAMPLE);
    for (const candidate of candidates) {
      expect(Number.isInteger(candidate.cell)).toBe(true);
      expect(candidate.continent).not.toBe('');
    }
  });

  it('filters to a bounding box', () => {
    const { candidates } = readGeonames(SAMPLE);
    const box = { minLng: 8, minLat: 47, maxLng: 11, maxLat: 49 };
    const inside = withinBox(candidates, box);
    expect(inside.length).toBeGreaterThan(10);
    expect(inside.length).toBeLessThan(candidates.length);
    for (const c of inside) {
      expect(c.lat).toBeGreaterThanOrEqual(box.minLat);
      expect(c.lng).toBeLessThanOrEqual(box.maxLng);
    }
  });
});

describe('scoring', () => {
  it('bands population sub-linearly', () => {
    // A metro is worth more than a town, not eighty times more.
    expect(populationScore(3000000)).toBe(30);
    expect(populationScore(600000)).toBe(24);
    expect(populationScore(150000)).toBe(16);
    expect(populationScore(30000)).toBe(8);
    expect(populationScore(1000)).toBe(0);
    expect(populationScore(3000000) / populationScore(30000)).toBeLessThan(4);
  });

  it('reads the seat score from the settlement feature code', () => {
    expect(seatScore('PPLC')).toBe(12);
    expect(seatScore('PPLA')).toBe(12);
    expect(seatScore('PPLA2')).toBe(6);
    expect(seatScore('PPL')).toBe(0);
  });

  it('scores every candidate with integer terms inside their stated ranges', () => {
    const { candidates } = readGeonames(SAMPLE);
    const scores = scoreCandidates(candidates);
    expect(scores).toHaveLength(candidates.length);
    for (const score of scores) {
      for (const value of [score.population, score.relief, score.junction, score.seat]) {
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
      expect(score.relief).toBeLessThanOrEqual(18);
      expect(score.junction).toBeLessThanOrEqual(18);
      expect(score.total).toBe(score.population + score.relief + score.junction + score.seat);
    }
  });

  it('the fixture actually EXERCISES the junction term', () => {
    // It did not, at first: 66 scattered candidates with no two within 250 km scored junction
    // at zero for every row, and `--stage=audit` is what surfaced that. The fixture now carries
    // a deliberate 16-row cluster. Without this assertion the term could silently go dead again.
    const { candidates } = readGeonames(SAMPLE);
    const scores = scoreCandidates(candidates);
    expect(scores.filter((s) => s.junction > 0).length).toBeGreaterThan(8);
  });

  it('is order-independent', () => {
    const { candidates } = readGeonames(SAMPLE);
    const forward = scoreCandidates(candidates);
    const backward = scoreCandidates([...candidates].reverse());
    const key = (s: { candidate: { geonameid: number }; total: number }) =>
      `${String(s.candidate.geonameid)}:${String(s.total)}`;
    expect([...backward].map(key).sort()).toEqual([...forward].map(key).sort());
  });
});

describe('parseArgs', () => {
  it('defaults to auditing the synthetic fixture, never the network', () => {
    const parsed = parseArgs([]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.options).toEqual({ stage: 'audit', bbox: null, check: false, fixture: true });
  });

  it('swallows the bare separator pnpm forwards', () => {
    expect(parseArgs(['--', '--stage=audit']).ok).toBe(true);
  });

  it('makes an unknown flag a HARD ERROR', () => {
    // A typo'd --bbox that silently audited the whole planet would produce a report that reads
    // as a finding about the slice.
    const parsed = parseArgs(['--bboxx=1,2,3,4']);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.message).toContain('unknown flag');
  });

  it('rejects an unknown stage by name', () => {
    const parsed = parseArgs(['--stage=demolish']);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.message).toContain('unknown stage');
  });

  it('parses a bounding box and rejects a broken one', () => {
    const ok = parseArgs(['--bbox=-12,36,42,62']);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.options.bbox).toEqual({ minLng: -12, minLat: 36, maxLng: 42, maxLat: 62 });

    for (const bad of ['1,2,3', '1,2,3,4,5', 'a,b,c,d', '42,36,-12,62', '-12,36,42,999']) {
      expect(parseArgs([`--bbox=${bad}`]).ok, bad).toBe(false);
    }
  });

  it('takes --check and --real as valueless flags', () => {
    const parsed = parseArgs(['--check', '--real']);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.options.check).toBe(true);
    expect(parsed.options.fixture).toBe(false);
  });

  it('demands a value for a flag that needs one', () => {
    const parsed = parseArgs(['--stage']);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.message).toContain('needs a value');
  });
});
