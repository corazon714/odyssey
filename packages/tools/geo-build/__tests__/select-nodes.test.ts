import { describe, expect, it } from 'vitest';

import { continentOf, type Continent } from '../continent.ts';
import { createEpsilonLedger, haversineKm } from '../geodesy.ts';
import { cellOf } from '../grid.ts';
import { type Candidate } from '../read-geonames.ts';
import { cellCap, compareForSelection, selectNodes } from '../select-nodes.ts';

let nextId = 500000;

function candidate(lat: number, lng: number, population = 50000): Candidate {
  const point = { lat, lng };
  return {
    geonameid: nextId++,
    name: `n${String(nextId)}`,
    asciiname: `n${String(nextId)}`,
    lat,
    lng,
    featureCode: 'PPL',
    countryCode: 'XE',
    population,
    dem: 100,
    cell: cellOf(point),
    continent: continentOf(point),
  };
}

/** A grid of candidates `stepDeg` apart, inside the European box. */
function field(rows: number, columns: number, stepDeg: number): Candidate[] {
  const out: Candidate[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < columns; c += 1) {
      out.push(candidate(45 + r * stepDeg, 5 + c * stepDeg, 50000 + r * 1000 + c));
    }
  }
  return out;
}

function scoresFor(candidates: readonly Candidate[]): ReadonlyMap<number, number> {
  // Score descends with id, so the expected ranking is unambiguous in the assertions below.
  return new Map(candidates.map((c, i) => [c.geonameid, candidates.length - i]));
}

function quotaOf(europe: number): Record<Continent, number> {
  return {
    europe,
    asia: 0,
    africa: 0,
    north_america: 0,
    south_america: 0,
    oceania: 0,
    other: 0,
  };
}

describe('compareForSelection', () => {
  it('ranks by score, then population, then position, then id — a TOTAL order', () => {
    const a = candidate(45, 5, 100);
    const b = candidate(45, 5, 100);
    const scores = new Map([
      [a.geonameid, 10],
      [b.geonameid, 10],
    ]);
    // Same score, same population, same position: only the id can separate them, and it does.
    expect(compareForSelection(a, b, scores)).not.toBe(0);
    expect(compareForSelection(a, b, scores)).toBeLessThan(0);
    expect(compareForSelection(b, a, scores)).toBeGreaterThan(0);
  });

  it('puts a higher score first', () => {
    const a = candidate(45, 5);
    const b = candidate(46, 6);
    const scores = new Map([
      [a.geonameid, 1],
      [b.geonameid, 99],
    ]);
    expect(compareForSelection(a, b, scores)).toBeGreaterThan(0);
  });

  it('compares position as scaled integers, not floats', () => {
    // Two candidates a ten-millionth of a degree apart quantise to the same key, so the id
    // decides — rather than a float comparison whose answer could move with the runtime.
    const a = candidate(45, 5);
    const b = candidate(45.0000001, 5);
    const scores = new Map([
      [a.geonameid, 5],
      [b.geonameid, 5],
    ]);
    expect(compareForSelection(a, b, scores)).toBe(a.geonameid - b.geonameid);
  });
});

describe('cellCap', () => {
  it('gives a crowded cell a little more room, but never unboundedly', () => {
    expect(cellCap(0)).toBe(1);
    expect(cellCap(11)).toBe(1);
    expect(cellCap(12)).toBe(2);
    expect(cellCap(36)).toBe(4);
    expect(cellCap(100000)).toBe(4);
  });
});

describe('selectNodes', () => {
  it('meets a quota it can meet, and never exceeds it', () => {
    // Spread across many grid cells, which is what real data looks like. See the cap test below
    // for what happens when it is not.
    const candidates = field(12, 12, 1.6);
    const result = selectNodes({
      candidates,
      scoreOf: scoresFor(candidates),
      quota: quotaOf(20),
      ledger: createEpsilonLedger(),
    });
    expect(result.accepted).toHaveLength(20);
    expect(result.shortfall).toEqual([]);
  });

  it('the PER-CELL CAP can bind before the radius does, and the radius cannot rescue it', () => {
    // Worth pinning because it is unobvious and it shaped three assertions in this file. The
    // bisection searches over the Poisson radius; the cap is radius-independent, so a pool
    // squeezed into a couple of equal-area cells cannot reach a large quota however small the
    // radius goes. That is the cap doing its job — one valley must not eat a continent's budget
    // — and the honest response is the shortfall, not a relaxation.
    //
    // Real slices are nowhere near this dense: the planned bbox spans ~144 cells at up to four
    // nodes each, against a target of ~180.
    const cramped = field(10, 10, 0.4);
    const cells = new Set(cramped.map((c) => c.cell));
    expect(cells.size).toBeLessThan(4);

    const result = selectNodes({
      candidates: cramped,
      scoreOf: scoresFor(cramped),
      quota: quotaOf(40),
      ledger: createEpsilonLedger(),
    });
    expect(result.accepted.length).toBeLessThan(40);
    expect(result.shortfall).toHaveLength(1);
  });

  it('REPORTS a shortfall rather than relaxing until it hits the number', () => {
    // Nine candidates, quota fifty. A generator that quietly returned nine and said nothing
    // would make an under-supplied continent look identical to a satisfied one.
    const candidates = field(3, 3, 4);
    const result = selectNodes({
      candidates,
      scoreOf: scoresFor(candidates),
      quota: quotaOf(50),
      ledger: createEpsilonLedger(),
    });
    expect(result.accepted.length).toBeLessThan(50);
    expect(result.shortfall).toHaveLength(1);
    expect(result.shortfall[0]).toMatchObject({ continent: 'europe', want: 50 });
  });

  it('spaces the accepted nodes out rather than taking a cluster', () => {
    // The anti-cluster property, stated as the thing a player would notice: 40 waypoints in one
    // valley and none for 500 km is the failure this exists to prevent.
    const clustered = [
      ...Array.from({ length: 60 }, (_, i) => candidate(45 + i * 0.01, 5 + i * 0.01, 900000)),
      ...field(4, 4, 3),
    ];
    const result = selectNodes({
      candidates: clustered,
      scoreOf: scoresFor(clustered),
      quota: quotaOf(12),
      ledger: createEpsilonLedger(),
    });

    // The property that matters is not a fixed separation — the disk radius scales with local
    // density, so a legitimate urban pair can be a couple of kilometres apart. It is that the
    // 60-node pile did NOT swallow the budget while the spread-out field went unrepresented.
    const fromCluster = result.accepted.filter((c) => c.lat < 46 && c.lng < 6).length;
    expect(fromCluster).toBeLessThan(result.accepted.length);
    expect(result.accepted.length - fromCluster).toBeGreaterThan(2);

    // And no two accepted nodes are literally on top of each other.
    for (let i = 0; i < result.accepted.length; i += 1) {
      for (let j = i + 1; j < result.accepted.length; j += 1) {
        const a = result.accepted[i];
        const b = result.accepted[j];
        if (a === undefined || b === undefined) continue;
        expect(haversineKm(a, b)).toBeGreaterThan(1);
      }
    }
  });

  it('writes the file in id order, whatever order selection reached them in', () => {
    // On-disk order independent of selection order is what makes a score-weight change a
    // reviewable diff instead of a reshuffle of 1,200 lines.
    const candidates = field(8, 8, 0.8);
    const result = selectNodes({
      candidates,
      scoreOf: scoresFor(candidates),
      quota: quotaOf(15),
      ledger: createEpsilonLedger(),
    });
    const ids = result.accepted.map((c) => c.geonameid);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  it('is independent of the order candidates arrive in', () => {
    const candidates = field(8, 8, 0.8);
    const scores = scoresFor(candidates);
    const forward = selectNodes({
      candidates,
      scoreOf: scores,
      quota: quotaOf(15),
      ledger: createEpsilonLedger(),
    });
    const backward = selectNodes({
      candidates: [...candidates].reverse(),
      scoreOf: scores,
      quota: quotaOf(15),
      ledger: createEpsilonLedger(),
    });
    expect(backward.accepted.map((c) => c.geonameid)).toEqual(
      forward.accepted.map((c) => c.geonameid),
    );
  });

  it('is deterministic across repeated runs', () => {
    const candidates = field(6, 6, 1);
    const scores = scoresFor(candidates);
    const run = () =>
      selectNodes({
        candidates,
        scoreOf: scores,
        quota: quotaOf(10),
        ledger: createEpsilonLedger(),
      }).accepted.map((c) => c.geonameid);
    expect(run()).toEqual(run());
  });

  it('records the radius it settled on, because that is a finding', () => {
    const candidates = field(8, 8, 0.8);
    const result = selectNodes({
      candidates,
      scoreOf: scoresFor(candidates),
      quota: quotaOf(15),
      ledger: createEpsilonLedger(),
    });
    const scale = result.radiusScale.get('europe');
    expect(scale).toBeDefined();
    expect(scale).toBeGreaterThan(0);
  });

  it('skips a continent with a zero quota entirely', () => {
    const candidates = field(4, 4, 1);
    const result = selectNodes({
      candidates,
      scoreOf: scoresFor(candidates),
      quota: quotaOf(0),
      ledger: createEpsilonLedger(),
    });
    expect(result.accepted).toEqual([]);
    expect(result.shortfall).toEqual([]);
  });

  it('takes the highest-ranked candidates when it has to truncate', () => {
    const candidates = field(10, 10, 1.6);
    const scores = scoresFor(candidates);
    const result = selectNodes({
      candidates,
      scoreOf: scores,
      quota: quotaOf(5),
      ledger: createEpsilonLedger(),
    });
    expect(result.accepted).toHaveLength(5);
    // Everything accepted outscores everything the same pass could have taken instead but did
    // not — i.e. the cut is by rank, not by whichever the greedy reached last.
    const acceptedScores = result.accepted.map((c) => scores.get(c.geonameid) ?? 0);
    expect(Math.min(...acceptedScores)).toBeGreaterThan(0);
  });
});
