import { continentOf, type Continent } from './continent.ts';
import { haversineKm, type EpsilonLedger } from './geodesy.ts';
import {
  cellNeighbourhood,
  DENSITY_RADIUS_KM,
  densityClassFor,
  type DensityClass,
} from './grid.ts';
import { type Candidate } from './read-geonames.ts';

/**
 * Thin ~25,000 candidates down to a node set that is neither clustered nor gappy.
 * ADR 0024 Decision 2.
 *
 * Two mechanisms, and they pull in opposite directions on purpose:
 *
 * - **Poisson-disk** stops a well-surveyed region eating the budget. A candidate is refused if
 *   an accepted node already sits within `r`, where `r` scales with how crowded the area is.
 * - **The per-cell cap** stops a single dense cell dominating even at a small radius.
 *
 * ## The quota is a FLOOR, not an equality
 *
 * The radius is bisected for the smallest value producing at least the quota, then the surplus
 * is truncated by the total order. Demanding exact equality is unbuildable: count-against-radius
 * is an integer step function that can jump 197 to 193, and no radius yields 195. An earlier
 * draft made "quotas met exactly" a fail-closed assertion, which would have failed on data
 * nobody had looked at yet.
 */

export const POISSON_BISECTION_STEPS = 24;

export type SelectionInput = {
  readonly candidates: readonly Candidate[];
  /** Full score per candidate, keyed by geonameid. `scoreCandidates` plus the two late terms. */
  readonly scoreOf: ReadonlyMap<number, number>;
  readonly quota: Readonly<Record<Continent, number>>;
  readonly ledger: EpsilonLedger;
};

export type SelectionResult = {
  readonly accepted: readonly Candidate[];
  readonly byContinent: ReadonlyMap<Continent, readonly Candidate[]>;
  /** Radius multiplier the bisection settled on, per continent. Reported, because it is a finding. */
  readonly radiusScale: ReadonlyMap<Continent, number>;
  readonly shortfall: readonly {
    readonly continent: Continent;
    readonly got: number;
    readonly want: number;
  }[];
};

/**
 * The total order every tie resolves by. No two candidates ever compare equal.
 *
 * Coordinates are compared as scaled integers rather than as floats, so a rebuild on a different
 * Node major cannot reorder two candidates that a float comparison would call a tie.
 */
export function compareForSelection(
  a: Candidate,
  b: Candidate,
  scoreOf: ReadonlyMap<number, number>,
): number {
  const scoreA = scoreOf.get(a.geonameid) ?? 0;
  const scoreB = scoreOf.get(b.geonameid) ?? 0;
  if (scoreA !== scoreB) return scoreB - scoreA;
  if (a.population !== b.population) return b.population - a.population;
  const latA = Math.round(a.lat * 100000);
  const latB = Math.round(b.lat * 100000);
  if (latA !== latB) return latA - latB;
  const lngA = Math.round(a.lng * 100000);
  const lngB = Math.round(b.lng * 100000);
  if (lngA !== lngB) return lngA - lngB;
  return a.geonameid - b.geonameid;
}

/** Cap per cell: crowded cells earn a little more room, but never unboundedly. */
export function cellCap(candidatesInCell: number): number {
  return Math.min(4, Math.max(1, 1 + Math.floor(candidatesInCell / 12)));
}

type Accepted = {
  readonly candidate: Candidate;
  readonly cell: number;
};

/**
 * One greedy pass at a fixed radius multiplier.
 *
 * Considers candidates in total order and accepts each unless an accepted node is inside its
 * disk or its cell is full. The disk radius is the candidate's own density class, so a node in
 * a crowded area needs less clearance than one in an empty one — which is what keeps a desert
 * from being swallowed by a conurbation's budget.
 */
function greedyPass(
  ordered: readonly Candidate[],
  occupancyByCell: ReadonlyMap<number, number>,
  radiusScale: number,
  ledger: EpsilonLedger,
): readonly Candidate[] {
  const accepted: Accepted[] = [];
  const acceptedByCell = new Map<number, Accepted[]>();
  const perCellCount = new Map<number, number>();

  for (const candidate of ordered) {
    const cls: DensityClass = densityClassFor(occupancyByCell.get(candidate.cell) ?? 0);
    const radius = DENSITY_RADIUS_KM[cls] * radiusScale;

    const cap = cellCap(occupancyByCell.get(candidate.cell) ?? 0);
    if ((perCellCount.get(candidate.cell) ?? 0) >= cap) continue;

    let blocked = false;
    for (const cell of cellNeighbourhood(candidate.cell)) {
      for (const other of acceptedByCell.get(cell) ?? []) {
        const separation = haversineKm(candidate, other.candidate);
        // `compare` returns -1 when separation is inside the radius. Within the epsilon band the
        // float cannot be trusted, so a FIXED rule decides — a candidate sitting exactly on the
        // radius is refused — and the ledger counts that it had to. Deterministic either way.
        if (ledger.at('poisson-disk').compare(separation, radius, radius, -1) < 0) {
          blocked = true;
          break;
        }
      }
      if (blocked) break;
    }
    if (blocked) continue;

    const entry: Accepted = { candidate, cell: candidate.cell };
    accepted.push(entry);
    const bucket = acceptedByCell.get(candidate.cell);
    if (bucket === undefined) acceptedByCell.set(candidate.cell, [entry]);
    else bucket.push(entry);
    perCellCount.set(candidate.cell, (perCellCount.get(candidate.cell) ?? 0) + 1);
  }

  return accepted.map((a) => a.candidate);
}

/**
 * Bisect the radius multiplier for the smallest value that still meets the quota.
 *
 * Smaller radius means more nodes, so the search is inverted from the usual reading: the LOW end
 * of the bracket is dense and the HIGH end is sparse, and we want the largest scale that still
 * clears the floor — the sparsest arrangement that is still enough.
 */
function bisectScale(
  ordered: readonly Candidate[],
  occupancyByCell: ReadonlyMap<number, number>,
  want: number,
  ledger: EpsilonLedger,
): { readonly scale: number; readonly accepted: readonly Candidate[] } {
  let low = 0.05;
  let high = 4;
  let best = greedyPass(ordered, occupancyByCell, low, ledger);
  let bestScale = low;

  if (best.length < want) return { scale: low, accepted: best };

  for (let step = 0; step < POISSON_BISECTION_STEPS; step += 1) {
    const mid = (low + high) / 2;
    const attempt = greedyPass(ordered, occupancyByCell, mid, ledger);
    if (attempt.length >= want) {
      bestScale = mid;
      best = attempt;
      low = mid;
    } else {
      high = mid;
    }
  }

  return { scale: bestScale, accepted: best };
}

export function selectNodes(input: SelectionInput): SelectionResult {
  const byContinent = new Map<Continent, readonly Candidate[]>();
  const radiusScale = new Map<Continent, number>();
  const shortfall: { continent: Continent; got: number; want: number }[] = [];
  const accepted: Candidate[] = [];

  // Occupancy is measured over ALL candidates, once, so a continent's density classes do not
  // shift depending on which continent is being selected.
  const occupancyByCell = new Map<number, number>();
  for (const candidate of input.candidates) {
    occupancyByCell.set(candidate.cell, (occupancyByCell.get(candidate.cell) ?? 0) + 1);
  }

  for (const continent of Object.keys(input.quota) as Continent[]) {
    const want = input.quota[continent];
    if (want <= 0) continue;

    const pool = input.candidates
      .filter((c) => continentOf(c) === continent)
      .sort((a, b) => compareForSelection(a, b, input.scoreOf));

    const { scale, accepted: chosen } = bisectScale(pool, occupancyByCell, want, input.ledger);
    radiusScale.set(continent, scale);

    // Truncate the surplus by the same total order the pass consumed, so the cut is the
    // lowest-ranked nodes rather than whichever the greedy happened to reach last.
    const trimmed = [...chosen]
      .sort((a, b) => compareForSelection(a, b, input.scoreOf))
      .slice(0, Math.max(want, 0));

    if (trimmed.length < want) shortfall.push({ continent, got: trimmed.length, want });
    byContinent.set(continent, trimmed);
    accepted.push(...trimmed);
  }

  // The FILE is sorted by id, so on-disk order is independent of selection order and a
  // score-weight change produces a reviewable diff rather than a reshuffle.
  return {
    accepted: [...accepted].sort((a, b) => a.geonameid - b.geonameid),
    byContinent,
    radiusScale,
    shortfall,
  };
}
