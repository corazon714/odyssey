import { describe, expect, it } from 'vitest';

import { continentOf, CONTINENTS } from '../continent.ts';
import {
  bearingDegrees,
  createEpsilonLedger,
  distanceKm,
  EARTH_RADIUS_KM,
  haversineKm,
  interpolate,
  quantise,
} from '../geodesy.ts';
import {
  cellNeighbourhood,
  cellOf,
  densityClassFor,
  GRID_LAT_BANDS,
  GRID_LON_COLUMNS,
} from '../grid.ts';

describe('haversine', () => {
  it('is zero for a point against itself', () => {
    expect(haversineKm({ lat: 12, lng: 34 }, { lat: 12, lng: 34 })).toBe(0);
  });

  it('is symmetric', () => {
    const a = { lat: 51.5, lng: -0.12 };
    const b = { lat: 48.85, lng: 2.35 };
    expect(haversineKm(a, b)).toBe(haversineKm(b, a));
  });

  it('gives one degree of latitude as about 111 km', () => {
    const km = haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(km).toBeGreaterThan(111.1);
    expect(km).toBeLessThan(111.3);
  });

  it('gives a quarter of the great circle for a pole-to-equator hop', () => {
    const km = haversineKm({ lat: 0, lng: 0 }, { lat: 90, lng: 0 });
    expect(Math.round(km)).toBe(Math.round((Math.PI / 2) * EARTH_RADIUS_KM));
  });

  it('handles the antimeridian without going the long way round', () => {
    const km = haversineKm({ lat: 0, lng: 179.5 }, { lat: 0, lng: -179.5 });
    expect(km).toBeLessThan(120);
  });

  it('persists as an integer of at least 1, so no edge can ever weigh zero', () => {
    expect(distanceKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBe(111);
    const touching = distanceKm({ lat: 0, lng: 0 }, { lat: 0.0001, lng: 0 });
    expect(Number.isInteger(touching)).toBe(true);
    expect(touching).toBe(1);
  });
});

describe('quantise and interpolate', () => {
  it('pins coordinates to 1e-5 degrees', () => {
    expect(quantise(12.3456789)).toBe(12.34568);
    expect(quantise(-0.000004)).toBe(-0);
  });

  it('puts the midpoint halfway along, in quantised coordinates', () => {
    const mid = interpolate({ lat: 0, lng: 0 }, { lat: 0, lng: 10 }, 0.5);
    expect(mid.lat).toBeCloseTo(0, 5);
    expect(mid.lng).toBeCloseTo(5, 4);
    expect(quantise(mid.lng)).toBe(mid.lng);
  });

  it('returns the endpoints at 0 and 1', () => {
    const a = { lat: 40, lng: -3 };
    const b = { lat: 41.5, lng: 2 };
    expect(interpolate(a, b, 0).lat).toBeCloseTo(a.lat, 4);
    expect(interpolate(a, b, 1).lng).toBeCloseTo(b.lng, 4);
  });

  it('is the identity on a zero-length segment rather than dividing by zero', () => {
    expect(interpolate({ lat: 5, lng: 5 }, { lat: 5, lng: 5 }, 0.5)).toEqual({ lat: 5, lng: 5 });
  });
});

describe('bearing', () => {
  it('reads 0 for due north and 90 for due east', () => {
    expect(bearingDegrees({ lat: 0, lng: 0 }, { lat: 10, lng: 0 })).toBe(0);
    expect(bearingDegrees({ lat: 0, lng: 0 }, { lat: 0, lng: 10 })).toBe(90);
    expect(bearingDegrees({ lat: 10, lng: 0 }, { lat: 0, lng: 0 })).toBe(180);
  });

  it('stays inside 0-359', () => {
    for (const lng of [-179, -90, -1, 1, 90, 179]) {
      const b = bearingDegrees({ lat: 0, lng: 0 }, { lat: 5, lng });
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(360);
    }
  });
});

describe('the epsilon ledger', () => {
  it('compares normally outside the band', () => {
    const ledger = createEpsilonLedger();
    expect(ledger.compare(10, 20, 100, 0)).toBe(-1);
    expect(ledger.compare(20, 10, 100, 0)).toBe(1);
    expect(ledger.resolutions).toBe(0);
  });

  it('falls back to the integer tie-break INSIDE the band, and counts it', () => {
    const ledger = createEpsilonLedger();
    // 1e-9 apart against a scale of 100 is well inside one part in a million.
    expect(ledger.compare(50, 50 + 1e-9, 100, -1)).toBe(-1);
    expect(ledger.resolutions).toBe(1);
  });

  it('attributes resolutions to the site that caused them', () => {
    const ledger = createEpsilonLedger();
    ledger.at('poisson-disk').compare(1, 1, 1, 0);
    ledger.at('gabriel').compare(2, 2, 1, 0);
    ledger.at('gabriel').compare(3, 3, 1, 0);
    expect(ledger.sites.get('poisson-disk')).toBe(1);
    expect(ledger.sites.get('gabriel')).toBe(2);
    expect(ledger.resolutions).toBe(3);
  });

  it('scales the band with the magnitude being compared', () => {
    const ledger = createEpsilonLedger();
    // The same absolute gap is significant at a small scale and noise at a large one.
    expect(ledger.compare(1, 1.0001, 1, 0)).toBe(-1);
    expect(ledger.resolutions).toBe(0);
    expect(ledger.compare(1, 1.0001, 1000000, 7)).toBe(7);
    expect(ledger.resolutions).toBe(1);
  });
});

describe('the equal-area grid', () => {
  it('numbers every cell inside the declared range', () => {
    for (const lat of [-90, -45, 0, 45, 90]) {
      for (const lng of [-180, -90, 0, 90, 180]) {
        const cell = cellOf({ lat, lng });
        expect(cell).toBeGreaterThanOrEqual(0);
        expect(cell).toBeLessThan(GRID_LAT_BANDS * GRID_LON_COLUMNS);
      }
    }
  });

  it('gives every band the same AREA, which a naive lat/lng grid does not', () => {
    // The property the sin split exists for: equal slices of sin(lat) are equal slices of the
    // sphere, so "candidates per cell" means the same thing at the equator and at 70 north.
    const bandOf = (lat: number) => Math.floor(cellOf({ lat, lng: 0 }) / GRID_LON_COLUMNS);
    const widths: number[] = [];
    let previousLat = -90;
    let previousBand = bandOf(-90);
    for (let lat = -90; lat <= 90; lat += 0.01) {
      const band = bandOf(Math.min(90, lat));
      if (band !== previousBand) {
        widths.push(Math.sin((lat * Math.PI) / 180) - Math.sin((previousLat * Math.PI) / 180));
        previousLat = lat;
        previousBand = band;
      }
    }
    expect(widths.length).toBeGreaterThan(30);
    const expected = 2 / GRID_LAT_BANDS;
    for (const width of widths) expect(width).toBeCloseTo(expected, 2);
  });

  it('wraps longitude rather than falling off the end', () => {
    expect(cellOf({ lat: 0, lng: 180 })).toBe(cellOf({ lat: 0, lng: -180 }));
    expect(cellOf({ lat: 0, lng: 200 })).toBe(cellOf({ lat: 0, lng: -160 }));
  });

  it('returns a sorted, de-duplicated neighbourhood', () => {
    for (const cell of [0, 500, 1439, GRID_LAT_BANDS * GRID_LON_COLUMNS - 1]) {
      const hood = cellNeighbourhood(cell);
      expect(hood).toEqual([...new Set(hood)].sort((a, b) => a - b));
      expect(hood).toContain(cell);
      // Interior cells see nine; the top and bottom bands see six.
      expect(hood.length).toBeGreaterThanOrEqual(6);
      expect(hood.length).toBeLessThanOrEqual(9);
    }
  });

  it('classifies density from candidate counts, not from anywhere else', () => {
    expect(densityClassFor(100)).toBe('urban');
    expect(densityClassFor(40)).toBe('urban');
    expect(densityClassFor(39)).toBe('settled');
    expect(densityClassFor(12)).toBe('settled');
    expect(densityClassFor(3)).toBe('sparse');
    expect(densityClassFor(2)).toBe('empty');
    expect(densityClassFor(0)).toBe('empty');
  });
});

describe('continent assignment', () => {
  it('assigns from coordinates alone, and every answer is in the vocabulary', () => {
    for (const point of [
      { lat: 48, lng: 2 },
      { lat: 35, lng: 139 },
      { lat: -1, lng: 36 },
      { lat: 40, lng: -74 },
      { lat: -23, lng: -46 },
      { lat: -33, lng: 151 },
      { lat: -85, lng: 0 },
    ]) {
      expect(CONTINENTS).toContain(continentOf(point));
    }
  });

  it('resolves the overlaps in the documented order', () => {
    // Europe before Asia, so the shared band resolves west.
    expect(continentOf({ lat: 50, lng: 30 })).toBe('europe');
    // Africa before Asia, so Sinai and the Maghreb resolve south.
    expect(continentOf({ lat: 30, lng: 32 })).toBe('africa');
    // North America before South America, so the isthmus resolves north — which matters,
    // because the Darién is where the two stop being connected overland at all.
    expect(continentOf({ lat: 9, lng: -79 })).toBe('north_america');
  });

  it('answers `other` for Antarctica rather than guessing', () => {
    expect(continentOf({ lat: -85, lng: 0 })).toBe('other');
    expect(continentOf({ lat: -70, lng: 100 })).toBe('other');
  });
});
