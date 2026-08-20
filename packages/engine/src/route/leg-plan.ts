import { type LocationType } from '../content/location-type.ts';
import { mulDivRound } from '../modifiers/modifier-tunables.ts';
import { hasMode } from './geo-edge.ts';
import { edgeAt, nodeAt, type GeoGraph } from './geo-graph.ts';
import { serviceCount } from './geo-services.ts';
import { type TerrainKind } from './geo-terrain.ts';
import { type GeoPath } from './dijkstra.ts';

/**
 * How many legs a route is, how far each covers, and which of them are montage.
 *
 * ADR 0026 Decision 4 is the reasoning. The short version: a leg is a narrative SESSION, so the
 * same effort covers less ground through mountains than across a plain — 150 km of pass and
 * 250 km of plain are both one leg. That is what makes `legKm` variable and why leg count is a
 * function of terrain rather than of distance alone.
 *
 * Everything here is integer arithmetic. These numbers reach `RouteState`, therefore
 * `stateDigest`, therefore every golden run — a float would put a platform-dependent rounding
 * difference somewhere it can never be noticed (CLAUDE.md rule 2.3).
 */

/**
 * Kilometres that make one leg, by terrain. **The `LEG_SCALE` accumulator is load-bearing:**
 * `Σ floor(km / d)` truncates every segment, and forty 90 km urban segments would raw-count as
 * zero legs.
 *
 * ADR 0026 also lists `marsh 200` and `forest 220`. **Neither is a `TerrainKind`** — the
 * vocabulary is the eight below — so those two rows describe terrain this repo cannot produce.
 * Keyed off `TERRAIN_KINDS` rather than restated, so a new terrain kind is a compile error here
 * instead of a silent `undefined` divisor.
 */
const LEG_DENSITY_KM: Readonly<Record<TerrainKind, number>> = {
  urban: 120,
  mountain: 150,
  hill: 200,
  coast: 230,
  plain: 250,
  steppe: 320,
  desert: 450,
  sea: 450,
};

/** Fixed-point scale, so a segment shorter than one leg still contributes its fraction. */
const LEG_SCALE = 1000;

/**
 * How interesting a terrain is to travel through, for montage selection only. Balance constants;
 * they decide which stretches get summarised, never how long a leg is.
 */
const TERRAIN_INTEREST: Readonly<Record<TerrainKind, number>> = {
  mountain: 9,
  coast: 8,
  urban: 7,
  hill: 6,
  sea: 5,
  desert: 4,
  plain: 3,
  steppe: 2,
};

/**
 * The compression curve, as breakpoints. **These ARE the curve** — `Math.log` is banned, so
 * sub-linearity is piecewise-linear and explicit rather than emergent.
 *
 * Density alone is linear in distance, and a hard cap produces sub-linearity only as a wall:
 * 4,000 km and 12,000 km both landing on 48 is flat, not sub-linear.
 *
 * MODULE-PRIVATE, deliberately. An array exported from anything the barrel re-exports turns
 * conformance L2 red for a change made entirely inside the engine (ADR 0026 Decision 4).
 */
const COMPRESSION_BANDS: readonly { readonly legs: number; readonly percent: number }[] = [
  { legs: 18, percent: 100 },
  { legs: 14, percent: 75 },
  { legs: 28, percent: 50 },
];
const TAIL_PERCENT = 25;

/** A route that is a third montage is eight summary screens and there is no game left. */
const MAX_MONTAGE_SHARE = 3;

/**
 * Has montage absorbed enough of the deficit?
 *
 * **There are two regimes and no honest single formula**, which is what ADR 0039 is about. The
 * deficit `rawLegs - target` is real in both, but it is denominated differently:
 *
 * - **Compression** (`segments.length >= target`, short edges): every segment already gets its
 *   floor of one leg, so `legCount` is `segments.length` whatever montage does. `target` is
 *   therefore a budget of PLAYABLE legs and montage marks the excess. Stop when the unmarked
 *   legs fit.
 * - **Expansion** (`target > segments.length`, long edges — every route on the current slice):
 *   `legCount` is exactly `target` whatever montage does, because the surplus allocator spreads
 *   `target - segments.length` extra legs over the free segments. Montage does not change the
 *   count, it changes WHO gets the surplus: a montaged segment takes one leg and its share goes
 *   to segments worth travelling through. Stop when the survivors fit `target` at FULL density —
 *   that is the point at which nothing is being compressed any more.
 *
 * Writing one expression for both is what produced the bug: `segments.length > target` reads as
 * the compression test and silently means "never" in the other regime.
 */
function montageSatisfied(
  expanding: boolean,
  segmentCount: number,
  montagedCount: number,
  freeUnits: number,
  target: number,
): boolean {
  return expanding
    ? mulDivRound(freeUnits, 1, LEG_SCALE) + montagedCount <= target
    : segmentCount - montagedCount <= target;
}

/** One edge of the chosen path, with everything leg planning and montage selection read. */
export type LegSegment = {
  readonly edgeIdx: number;
  readonly edgeId: string;
  readonly distanceKm: number;
  /** The HARDER of the two endpoints — see `terrainOfSegment`. */
  readonly terrain: TerrainKind;
  readonly ferry: boolean;
  readonly scenic: number;
  /** Services at the node this segment arrives at. */
  readonly servicesCount: number;
  readonly viaCrossingNode: boolean;
  /**
   * The type of the node this segment ARRIVES at, which is where the leg ends up.
   *
   * A `GeoNode.type` IS a `LocationType` — not a parallel vocabulary (ADR 0024). That is what
   * makes `deriveLegLocations` a direct read rather than a mapping table nobody maintains.
   */
  readonly arrivalType: LocationType;
};

export type LegPlan = {
  readonly legCount: number;
  readonly legKm: readonly number[];
  readonly montageLegs: readonly number[];
  readonly totalKm: number;
  /**
   * The leg each path edge ARRIVES on. One allocator, two consumers: `leg-locations.ts` and
   * `beat-schedule.ts` both read this rather than recomputing it (ADR 0027 Decision 1).
   */
  readonly arrivalLegOfEdge: readonly number[];
};

/**
 * A segment's terrain is the HARDER of its two endpoints — the lower density.
 *
 * Taking the arrival node's terrain alone would make the same edge size differently depending on
 * which way it is traversed, and the graph is undirected: `otherEnd` walks it both ways. That is
 * a determinism wart rather than a modelling choice. Taking the harder end also models the case
 * the density table exists for — a pass between two plain nodes is a pass.
 */
function terrainOfSegment(a: TerrainKind, b: TerrainKind): TerrainKind {
  return LEG_DENSITY_KM[a] <= LEG_DENSITY_KM[b] ? a : b;
}

export function segmentsOf(graph: GeoGraph, path: GeoPath): readonly LegSegment[] {
  const out: LegSegment[] = [];
  for (let i = 0; i < path.edges.length; i += 1) {
    const edgeIdx = path.edges[i];
    const fromIdx = path.nodes[i];
    const toIdx = path.nodes[i + 1];
    if (edgeIdx === undefined || fromIdx === undefined || toIdx === undefined) continue;

    const edge = edgeAt(graph, edgeIdx);
    const from = nodeAt(graph, fromIdx);
    const to = nodeAt(graph, toIdx);
    if (edge === null || from === null || to === null) continue;

    out.push({
      edgeIdx,
      edgeId: String(edge.id),
      distanceKm: edge.distanceKm,
      terrain: terrainOfSegment(from.terrain, to.terrain),
      ferry: hasMode(edge.modes, 'ferry'),
      scenic: edge.scenic,
      servicesCount: serviceCount(to.services),
      viaCrossingNode: from.type === 'border_crossing' || to.type === 'border_crossing',
      arrivalType: to.type,
    });
  }
  return out;
}

/** Scaled legs a segment is worth. A ferry crossing is exactly one leg, however long. */
function rawUnits(segment: LegSegment): number {
  if (segment.ferry) return LEG_SCALE;
  return mulDivRound(segment.distanceKm, LEG_SCALE, LEG_DENSITY_KM[segment.terrain]);
}

/** Apply the compression curve to a raw leg count. Monotone by construction. */
export function compressLegs(rawLegs: number): number {
  let remaining = rawLegs;
  let out = 0;
  for (const band of COMPRESSION_BANDS) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, band.legs);
    out += mulDivRound(take, band.percent, 100);
    remaining -= take;
  }
  if (remaining > 0) out += mulDivRound(remaining, TAIL_PERCENT, 100);
  return out;
}

/**
 * The clamp RAMPS rather than steps, and that absence is the decision.
 *
 * A hard `totalKm <= 500 ? [10,16] : [22,48]` gives a 500 km route ≤16 legs and a 501 km route
 * ≥22 — a cliff on a continuous input. **There is no `isShortTrip` boolean anywhere in this
 * pipeline**; a boolean is a cliff waiting to be reintroduced.
 */
export function minLegs(totalKm: number): number {
  return totalKm >= 1200 ? 22 : 10 + mulDivRound(12 * totalKm, 1, 1200);
}

export function maxLegs(totalKm: number): number {
  if (totalKm <= 500) return 16;
  if (totalKm >= 1200) return 48;
  return 16 + mulDivRound(32 * (totalKm - 500), 1, 700);
}

/**
 * How dull a stretch is, so the dullest get summarised first.
 *
 * **Crossings and ferries sort last BY CONSTRUCTION** (`−1000×`) rather than by a special case
 * someone can forget to apply — a border crossing is where `border_crossing` beats live and a
 * ferry is where `ferry_boarding` lives, and summarising either would delete the scene.
 *
 * Reads only the segment's own fields, and the comparator only its two arguments — no index, no
 * rank, no global — so adding a node elsewhere on the route cannot reshuffle an unrelated
 * montage. RNG-free: stability is strictly stronger without a coin, and a coin adds nothing.
 */
export function dullness(segment: LegSegment): number {
  return (
    (10 - TERRAIN_INTEREST[segment.terrain]) * 10 +
    (6 - segment.servicesCount) * 6 +
    (segment.scenic > 0 ? 0 : 8) -
    1000 * (segment.viaCrossingNode ? 1 : 0) -
    1000 * (segment.ferry ? 1 : 0)
  );
}

/** Dullest first, then longer-first, then by edge id. Total order, no ties. */
function byDullness(a: LegSegment, b: LegSegment): number {
  const d = dullness(b) - dullness(a);
  if (d !== 0) return d;
  if (a.distanceKm !== b.distanceKm) return b.distanceKm - a.distanceKm;
  return a.edgeId < b.edgeId ? -1 : a.edgeId > b.edgeId ? 1 : 0;
}

/**
 * Spread `total` across `parts` as integers summing to exactly `total`.
 *
 * Cumulative-floor, the allocator ADR 0026's addendum settled on and ADR 0027 Decision 1 uses:
 * exact by construction rather than by a correction pass, and the remainder spreads instead of
 * clumping at the front.
 */
/**
 * Segment positions montage may not take, by POSITION rather than by dullness.
 *
 * Two rules, and both exist because ADR 0027's `admit` **drops** a beat it cannot place rather
 * than moving it — so anything montage does to the shape of the route deletes beats silently.
 *
 * 1. **The first and last segments.** They own leg 0 and `legCount - 1`, the slack-0 anchors of
 *    `departure` and `finale`; invariant (d) drops a beat whose window is montage. Measured
 *    before this guard: 10 `finale` and 6 `departure` slots deleted across the 25 corpus routes.
 *    It also guarantees the free set is non-empty whenever montage is.
 * 2. **Either side of a crossing.** A crossing segment is already safe from montage by its
 *    dullness, and that is not enough: montaging the stretch BETWEEN two crossings collapses it
 *    to one leg, the two slack-1 border windows land within a leg of each other, and invariant
 *    (b) drops one. The crossing kept its scene and lost its beat. Measured at ADR 0039:
 *    71 border slots fell to 58, which is 18% of one of only two beat types the corpus can fill.
 *
 * Rule 2 is deliberately a NEIGHBOURHOOD and not a distance: what a border beat needs is legs
 * between it and the next one, and the segment either side is where those legs come from.
 */
function protectedFromMontage(segments: readonly LegSegment[]): ReadonlySet<number> {
  const out = new Set<number>([0, segments.length - 1]);
  for (let i = 0; i < segments.length; i += 1) {
    if (segments[i]?.viaCrossingNode !== true) continue;
    out.add(i - 1);
    out.add(i);
    out.add(i + 1);
  }
  return out;
}

function splitExact(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const out = new Array<number>(parts);
  let previous = 0;
  for (let i = 0; i < parts; i += 1) {
    const boundary = Math.floor(((i + 1) * total) / parts);
    out[i] = boundary - previous;
    previous = boundary;
  }
  return out;
}

export function planLegs(segments: readonly LegSegment[]): LegPlan {
  const totalKm = segments.reduce((sum, s) => sum + s.distanceKm, 0);
  if (segments.length === 0) {
    return { legCount: 0, legKm: [], montageLegs: [], totalKm: 0, arrivalLegOfEdge: [] };
  }

  const units = segments.map(rawUnits);
  const rawLegs = Math.max(
    segments.length,
    mulDivRound(
      units.reduce((a, b) => a + b, 0),
      1,
      LEG_SCALE,
    ),
  );

  // The floor and ceiling ramp, so a one-kilometre difference never moves the band.
  const target = Math.min(maxLegs(totalKm), Math.max(minLegs(totalKm), compressLegs(rawLegs)));

  // ── montage: crush the dullest stretches rather than shrinking everything ────────────
  // THE CAP WINS OVER THE DEFICIT (ADR 0026 Decision 4): leg count may run over target
  // rather than summarise a third of the journey.
  //
  // THE GATE IS `rawLegs > target`, WHICH IS ADR 0026 DECISION 4'S OWN WORDING. It shipped as
  // `segments.length > target`, which is the same test only while a segment is worth at most
  // one leg. On this slice the median path edge is 378 km against densities of 120-450 km, so
  // every route is in the expansion regime and the branch was unreachable — `montageLegs` was
  // empty on all 25 corpus routes. ADR 0039 has the measurement.
  const montageBudget = Math.floor(target / MAX_MONTAGE_SHARE);
  const montaged = new Set<number>();
  const expanding = target > segments.length;
  if (rawLegs > target && montageBudget > 0) {
    // Position beats dullness: `protectedFromMontage` keeps the two anchors and the
    // neighbourhood of every crossing, because `admit` DROPS a beat it cannot place.
    const off = protectedFromMontage(segments);
    // POSITIONS ARE CARRIED THROUGH THE SORT, and that is what makes the spacing pass possible.
    // `montaged` is keyed by `edgeIdx` — the graph's index for an edge, which says nothing about
    // adjacency ALONG THIS PATH — so a neighbour test needs the position in `segments`, and the
    // previous `filter((_, i) => ...).sort()` discarded it before the loop could see it.
    const order = segments
      .map((segment, position) => ({ segment, position }))
      .filter((entry) => !off.has(entry.position))
      .sort((a, b) => byDullness(a.segment, b.segment));
    const montagedPositions = new Set<number>();
    let freeUnits = units.reduce((a, b) => a + b, 0);

    // MONTAGE SPACING — ADR 0046. The mechanism it exists to defuse is ADR 0044.
    //
    // Selecting by dullness alone lets montage take nine CONSECUTIVE segments, and on a corridor
    // whose dull stretches are contiguous it reliably does. That is lethal rather than merely
    // long: drain is charged per HOUR (every drain in `world-tick.ts` is `spanPoints`) while
    // recovery arrives per LEG (one event per leg while `BASE_EVENT_ODDS` is fenced at 1:0), so
    // survivability is the LOCAL ratio, not the total. `route.illicit.r1dlxpt5` billed 232 of its
    // 509 hours inside legs 8-16 and lost 67% of its population there, against 22% for a route
    // spreading the same 509 hours. Proved causally at 21 SE with two null controls.
    //
    // A LADDER OF THREE PASSES, NOT A SWITCH, AND THAT IS THE CORRECTION THIS FIX TURNS ON.
    //
    // `maxAdjacent` is how many of a candidate's two neighbours may ALREADY be montaged: pass 0
    // takes only fully isolated segments, pass 1 allows extending a run at one end, pass 2 allows
    // closing a hole between two. Same order every pass, so the dullest still goes first.
    //
    // **`docs/phase-3-closeout.md` proposed a two-pass version — refuse a neighbour, then relax —
    // and it was measured INSUFFICIENT on the very route it was written for.** The deficit on
    // `r1dlxpt5` demands 10-11 montaged segments out of an 18-edge path whose anchors and
    // crossing neighbourhoods are already protected, and no arrangement of 11 among ~16 free
    // positions is fully spaced. So the relaxed pass ran on almost every selection and rebuilt
    // the wall: measured, the two-pass version moved `r1dlxpt5` from a 9-leg run at 8-16 to a
    // 9-leg run at 9-17, which is not a fix. The ladder degrades one step at a time instead of
    // falling off a cliff, and the worst it can produce is short runs where the path genuinely
    // cannot hold gaps.
    //
    // THE BUDGET IS NEVER SHRUNK. Every pass shares the same `montageSatisfied` and
    // `montageBudget` guards, so the constraint changes WHERE montage lands and never how much of
    // it there is — the cap still wins over the deficit (ADR 0026 D4) and leg count is untouched.
    //
    // NOT A `peak` THRESHOLD. `peak` is a FLAG, not a dial — a permutation that halved it gained
    // nothing (closeout §5). This constrains the SHAPE that produced the wall, and is measured by
    // completion, the morale-floor share and the ending histogram.
    for (const maxAdjacent of [0, 1]) {
      for (const { segment, position } of order) {
        if (montaged.size >= montageBudget) break;
        if (montageSatisfied(expanding, segments.length, montaged.size, freeUnits, target)) break;
        if (segment.ferry) break; // sorted last; nothing duller remains
        if (montagedPositions.has(position)) continue; // taken by an earlier pass
        const adjacent =
          (montagedPositions.has(position - 1) ? 1 : 0) +
          (montagedPositions.has(position + 1) ? 1 : 0);
        if (adjacent > maxAdjacent) continue;
        montaged.add(segment.edgeIdx);
        montagedPositions.add(position);
        freeUnits -= rawUnits(segment);
      }
    }
  }

  // ── allocate legs to segments ────────────────────────────────────────────────────────
  // A montaged segment is exactly one leg however long it is; that IS the compression. Every
  // other segment gets at least one, then the surplus in proportion to its raw units.
  //
  // A FERRY IS EXCLUDED FROM THE SURPLUS, and that is not the same rule as `rawUnits` returning
  // one leg for it. Without this, a route whose only segment is a 900 km crossing gets padded to
  // `minLegs` — nineteen legs of sitting on the same boat, and `ferry_boarding` scheduled on one
  // of them. A crossing is one session at any distance, so the floor has to go unmet instead.
  // ADR 0026 Decision 4 accepts being under the floor: the sub-floor response (event probability,
  // time pressure) is deferred, and padding was never the answer.
  const free = segments.filter((s) => !montaged.has(s.edgeIdx) && !s.ferry);
  const surplus = Math.max(0, target - segments.length);
  const freeUnits = free.reduce((sum, s) => sum + rawUnits(s), 0);

  const extra = new Map<number, number>();
  if (surplus > 0 && freeUnits > 0) {
    let allocated = 0;
    let cumulative = 0;
    for (let i = 0; i < free.length; i += 1) {
      const segment = free[i];
      if (segment === undefined) continue;
      cumulative += rawUnits(segment);
      const boundary =
        i === free.length - 1 ? surplus : Math.floor((cumulative * surplus) / freeUnits);
      extra.set(segment.edgeIdx, boundary - allocated);
      allocated = boundary;
    }
  }

  const legKm: number[] = [];
  const arrivalLegOfEdge: number[] = [];
  const montageLegs: number[] = [];

  for (const segment of segments) {
    const isMontage = montaged.has(segment.edgeIdx);
    const legs = isMontage ? 1 : 1 + (extra.get(segment.edgeIdx) ?? 0);
    const split = splitExact(segment.distanceKm, legs);
    for (const km of split) {
      if (isMontage) montageLegs.push(legKm.length);
      legKm.push(km);
    }
    arrivalLegOfEdge.push(legKm.length - 1);
  }

  return { legCount: legKm.length, legKm, montageLegs, totalKm, arrivalLegOfEdge };
}
