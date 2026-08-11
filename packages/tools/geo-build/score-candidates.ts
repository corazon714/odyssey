import { bearingDegrees, haversineKm } from './geodesy.ts';
import { cellNeighbourhood } from './grid.ts';
import { type Candidate } from './read-geonames.ts';

/**
 * Score a candidate for selection. ADR 0024 Decision 2.
 *
 * Every term is an integer and every input is either a settlement attribute or a physical fact
 * about the ground. Nothing reads a country, and there is nowhere in the arithmetic to put one.
 *
 * ## Two terms are deliberately absent at this milestone
 *
 * `coastal` needs the Natural Earth land boundary and `isolation` needs the set of nodes already
 * ACCEPTED, which only exists once selection runs. Both arrive at M3.5. `--stage=audit` reports
 * the partial score and says so rather than printing a number that looks final — a score missing
 * two of its six terms would rank differently, and pretending otherwise would make the review
 * gate worse than useless.
 */

export const POPULATION_BAND_THRESHOLDS: readonly {
  readonly min: number;
  readonly score: number;
}[] = [
  { min: 2000000, score: 30 },
  { min: 500000, score: 24 },
  { min: 100000, score: 16 },
  { min: 25000, score: 8 },
  { min: 0, score: 0 },
];

/** Deliberately sub-linear: a metro is worth more than a town, not eighty times more. */
export function populationScore(population: number): number {
  for (const band of POPULATION_BAND_THRESHOLDS) {
    if (population >= band.min) return band.score;
  }
  return 0;
}

/** Relief against the local median elevation — a pass or a valley floor is interesting. */
export function reliefScore(candidate: Candidate, neighbours: readonly Candidate[]): number {
  if (neighbours.length === 0) return 0;
  const elevations = [...neighbours.map((n) => n.dem)].sort((a, b) => a - b);
  const median = elevations[Math.floor(elevations.length / 2)] ?? 0;
  const delta = Math.abs(candidate.dem - median);
  if (delta >= 1000) return 18;
  if (delta >= 400) return 12;
  if (delta >= 100) return 6;
  return 0;
}

/**
 * How many distinct 60-degree sectors hold another candidate within 250 km.
 *
 * A junction is a place routes converge on, which is a property of the surrounding settlement
 * pattern rather than of the settlement itself — a small town at a crossroads is more useful to
 * a route graph than a larger one at the end of a valley.
 */
export const JUNCTION_RADIUS_KM = 250;
const SECTOR_DEGREES = 60;

export function junctionScore(candidate: Candidate, neighbours: readonly Candidate[]): number {
  const sectors = new Set<number>();
  for (const neighbour of neighbours) {
    if (neighbour.geonameid === candidate.geonameid) continue;
    if (haversineKm(candidate, neighbour) > JUNCTION_RADIUS_KM) continue;
    sectors.add(Math.floor(bearingDegrees(candidate, neighbour) / SECTOR_DEGREES));
  }
  return Math.min(18, sectors.size * 3);
}

/**
 * Administrative seat, from the GeoNames feature code.
 *
 * `PPLC` is a national capital and `PPLA` a first-order regional seat — both are settlement
 * ATTRIBUTES published per place, not judgements we are making about a country. A seat is worth
 * points because roads converge on it, which is the same reason `junction` exists.
 */
export function seatScore(featureCode: string): number {
  if (featureCode === 'PPLC' || featureCode === 'PPLA') return 12;
  if (featureCode === 'PPLA2') return 6;
  return 0;
}

export type PartialScore = {
  readonly candidate: Candidate;
  readonly population: number;
  readonly relief: number;
  readonly junction: number;
  readonly seat: number;
  /** Sum of the four terms computable before selection begins. */
  readonly total: number;
};

/** Maximum the four available terms can reach. The absent two are worth 10 more. */
export const PARTIAL_SCORE_MAX = 30 + 18 + 18 + 12;

/**
 * Score every candidate, using the grid to bound neighbour search.
 *
 * An all-pairs sweep over 25,000 rows is 625 million distance calls; bucketing by cell and its
 * eight neighbours turns it into something that finishes, and the 250 km junction radius is
 * comfortably inside one cell-neighbourhood everywhere the grid is not degenerate.
 */
export function scoreCandidates(candidates: readonly Candidate[]): readonly PartialScore[] {
  const byCell = new Map<number, Candidate[]>();
  for (const candidate of candidates) {
    const bucket = byCell.get(candidate.cell);
    if (bucket === undefined) byCell.set(candidate.cell, [candidate]);
    else bucket.push(candidate);
  }

  return candidates.map((candidate): PartialScore => {
    const neighbours: Candidate[] = [];
    for (const cell of cellNeighbourhood(candidate.cell)) {
      for (const other of byCell.get(cell) ?? []) {
        if (other.geonameid !== candidate.geonameid) neighbours.push(other);
      }
    }
    // Nearest eight by distance, tie-broken by id so the median is reproducible.
    const nearest = [...neighbours]
      .sort((a, b) => {
        const da = haversineKm(candidate, a);
        const db = haversineKm(candidate, b);
        return da === db ? a.geonameid - b.geonameid : da - db;
      })
      .slice(0, 8);

    const population = populationScore(candidate.population);
    const relief = reliefScore(candidate, nearest);
    const junction = junctionScore(candidate, neighbours);
    const seat = seatScore(candidate.featureCode);
    return {
      candidate,
      population,
      relief,
      junction,
      seat,
      total: population + relief + junction + seat,
    };
  });
}
