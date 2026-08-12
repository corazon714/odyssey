import { describe, expect, it } from 'vitest';

import {
  classifyTerrain,
  ringKindAt,
  COASTAL_KM,
  HILL_M,
  HILL_RELIEF_M,
  MOUNTAIN_M,
  type TerrainInput,
  type TerrainRing,
} from '../classify-terrain.ts';
import { type TerrainKind } from '@odyssey/engine';

/** A square named region covering the whole test area, so every probe point falls inside it. */
function region(kind: TerrainKind): TerrainRing {
  const ring: readonly (readonly number[])[] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ];
  return {
    kind,
    ring: ring as TerrainRing['ring'],
    minLat: 0,
    maxLat: 10,
    minLng: 0,
    maxLng: 10,
  };
}

const INSIDE = { lat: 5, lng: 5 };
const OUTSIDE = { lat: 50, lng: 50 };

/**
 * `localMedianDem` defaults to the point's own elevation, so relief is ZERO unless a case asks
 * for it. Defaulting it to 0 instead makes every elevation above `HILL_RELIEF_M` broken ground
 * as a side effect, which silently turns the elevation cases into relief cases.
 */
function facts(over: Partial<TerrainInput> = {}): TerrainInput {
  const dem = over.dem ?? 0;
  return {
    point: INSIDE,
    dem,
    localMedianDem: dem,
    isUrban: false,
    coastKm: Number.POSITIVE_INFINITY,
    ...over,
  };
}

describe('ringKindAt', () => {
  it('returns the first matching region in file order', () => {
    expect(ringKindAt(INSIDE, [region('steppe'), region('desert')])).toBe('steppe');
  });

  it('returns null when no region contains the point', () => {
    expect(ringKindAt(OUTSIDE, [region('desert')])).toBeNull();
  });
});

describe('classifyTerrain — hard ground outranks settlement size', () => {
  // The bug this pins: `isUrban` used to be the FIRST check, so a metro in the Alps came out
  // `urban` and scored terrainDifficulty 0 and scenic 0. At planet scale it swallowed 318 of
  // 720 selected nodes, and mountain and desert were the two kinds it stole from.
  it('calls a metro inside a mountain range a mountain city', () => {
    expect(classifyTerrain(facts({ isUrban: true }), [region('mountain')])).toBe('mountain');
  });

  it('calls a metro inside a desert a desert city', () => {
    expect(classifyTerrain(facts({ isUrban: true }), [region('desert')])).toBe('desert');
  });

  it('calls a metro above the mountain elevation a mountain city, with no region at all', () => {
    expect(classifyTerrain(facts({ isUrban: true, dem: MOUNTAIN_M }), [])).toBe('mountain');
  });

  it('still calls a metro on unremarkable ground urban', () => {
    // Size beats every OTHER named region — travel through a conurbation is slow and dense
    // whatever it was built on, and that is what the terrain field feeds into leg density.
    for (const kind of ['plain', 'coast', 'steppe'] as const) {
      expect(classifyTerrain(facts({ isUrban: true }), [region(kind)])).toBe('urban');
    }
    expect(classifyTerrain(facts({ isUrban: true }), [])).toBe('urban');
  });
});

describe('classifyTerrain — elevation outranks the coast', () => {
  // A town 600 m up and 20 km from the sea used to come out `coast`, difficulty 1, because the
  // coastal test ran before the hill thresholds. Mediterranean and Norwegian coasts are hill
  // country and the old order could not say so.
  it('calls upland near the sea hill, not coast', () => {
    expect(classifyTerrain(facts({ dem: HILL_M, coastKm: COASTAL_KM - 1 }), [])).toBe('hill');
  });

  it('still calls low ground near the sea coast', () => {
    expect(classifyTerrain(facts({ dem: HILL_M - 1, coastKm: COASTAL_KM }), [])).toBe('coast');
  });

  it('calls broken low ground near the sea hill, via the relief fallback', () => {
    expect(
      classifyTerrain({ ...facts({ coastKm: 0 }), dem: HILL_RELIEF_M, localMedianDem: 0 }, []),
    ).toBe('hill');
  });
});

describe('classifyTerrain — the thresholds themselves', () => {
  it('is inclusive at every boundary, so no elevation falls between two kinds', () => {
    expect(classifyTerrain(facts({ dem: MOUNTAIN_M }), [])).toBe('mountain');
    expect(classifyTerrain(facts({ dem: MOUNTAIN_M - 1 }), [])).toBe('hill');
    expect(classifyTerrain(facts({ dem: HILL_M }), [])).toBe('hill');
    expect(classifyTerrain(facts({ dem: HILL_M - 1 }), [])).toBe('plain');
  });

  it('measures relief in both directions — a basin is as broken as a ridge', () => {
    expect(classifyTerrain(facts({ dem: 0, localMedianDem: HILL_RELIEF_M }), [])).toBe('hill');
    expect(classifyTerrain(facts({ dem: HILL_RELIEF_M, localMedianDem: 0 }), [])).toBe('hill');
    expect(classifyTerrain(facts({ dem: 0, localMedianDem: HILL_RELIEF_M - 1 }), [])).toBe('plain');
  });

  it('falls back to plain when nothing else claims the ground', () => {
    expect(classifyTerrain(facts(), [])).toBe('plain');
  });

  it('keeps HILL_M below the 378 m upper quartile of settlement elevation', () => {
    // The reason `hill` was dead: at 500 m it sat above the 78th percentile, so it could only
    // fire for upland towns that were ALSO inland and outside every named polygon — 23 of 720
    // nodes against 6.3% of the candidate pool. This is the guard on putting it back.
    expect(HILL_M).toBeLessThan(378);
    expect(HILL_M).toBeLessThan(MOUNTAIN_M);
    expect(HILL_RELIEF_M).toBeLessThan(HILL_M);
  });
});
