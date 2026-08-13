import { type NodeId } from '../ids/content-ids.ts';
import { legHours } from '../loop/leg-hours.ts';
import { HOURS_PER_HUNGER } from '../loop/world-tick.ts';
import { mulDivRound } from '../modifiers/modifier-tunables.ts';
import { type RouteProfile } from '../state/route-state.ts';
import { TRANSPORT_MODES, type TransportMode } from '../state/transport-state.ts';
import { type LegPlan, type LegSegment } from './leg-plan.ts';

/**
 * What a route looks like BEFORE it is chosen — the preparation screen's input.
 *
 * **None of this enters `RunState` or `contentVersion`.** It is advice about a route, not part
 * of one: a player who ignores every number here still gets a valid run. Keeping it out of state
 * is what stops the preview becoming a second, drifting description of the route.
 *
 * `notableNodes` is `readonly NodeId[]` and never a display string — that is what keeps
 * `packages/engine/src/route/` independent of ADR 0028's place-name decision.
 */

/** How much a profile costs relative to a plain one. Balance constants. */
const PROFILE_COST: Readonly<Record<RouteProfile, { readonly num: number; readonly den: number }>> =
  {
    fastest: { num: 115, den: 100 },
    cheapest: { num: 85, den: 100 },
    safest: { num: 105, den: 100 },
    scenic: { num: 100, den: 100 },
    illicit: { num: 125, den: 100 },
  };

const CASH_BASE = 120;
const CASH_PER_100KM = 14;
const CASH_PER_CROSSING = 45;

/** Kilometres a tank covers, and the cap `transport.fuel` clamps at. */
const KM_PER_FUEL = 180;
const FUEL_CAP = 10;

/** More than this is a route made of paperwork (ADR 0027). */
const MAX_BORDER_BEATS = 4;

export type RoutePreview = {
  readonly profile: RouteProfile;
  readonly totalKm: number;
  /**
   * IN-GAME HOURS THE WHOLE ROUTE COSTS, at the mode this profile would actually travel by.
   *
   * The number was already computed here — `rationsNeeded` divides by it — and thrown away.
   * Exposing it is design pillar 4's honest answer on its own: a 523-hour route is a different
   * proposition from a 112-hour one, and the player should be able to see that BEFORE
   * committing rather than discover it on leg 30. `totalKm` does not say it, because hours are
   * a function of mode as well as distance — a ferry leg and a train leg of equal length are
   * not equal journeys.
   *
   * It is advice, not state. Like every other field here it never enters `RunState` or
   * `contentVersion`, so nothing about it can move a save version or a golden run.
   *
   * At the STARTING mode, and only the starting mode. A run that loses its truck and walks
   * costs more hours than this says; the preview describes the plan, not the run.
   */
  readonly travelHours: number;
  readonly legCount: number;
  readonly montageLegCount: number;
  readonly crossings: number;
  readonly hasFerry: boolean;
  /** Settlements worth naming on the map screen, in travel order. Ids, never names. */
  readonly notableNodes: readonly NodeId[];
  /** Modes the route can actually be travelled by, most-supported first. */
  readonly transportMix: readonly TransportMode[];
  readonly recommendedCash: number;
  readonly rationsNeeded: number;
  readonly fuelNeeded: number;
  readonly refuelStops: number;
  readonly borderBeats: number;
};

function ceilDiv(value: number, per: number): number {
  return per <= 0 ? 0 : Math.floor((value + per - 1) / per);
}

/**
 * Modes ordered by how much of the route supports them, then by `TRANSPORT_MODES` order.
 *
 * The tie-break is what makes this deterministic: a mode supported on exactly as many edges as
 * another must not depend on map iteration order, which is a property of insertion rather than
 * of the world.
 */
export function transportMixOf(
  segments: readonly LegSegment[],
  graph: ModesByEdge,
): TransportMode[] {
  const count = new Map<TransportMode, number>();
  for (const segment of segments) {
    for (const mode of graph(segment.edgeIdx)) count.set(mode, (count.get(mode) ?? 0) + 1);
  }
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1] || TRANSPORT_MODES.indexOf(a[0]) - TRANSPORT_MODES.indexOf(b[0]))
    .map(([mode]) => mode);
}

export type ModesByEdge = (edgeIdx: number) => readonly TransportMode[];

/**
 * What each profile would TRAVEL BY, given the choice.
 *
 * Ordering by "best supported" alone was the first attempt and it was wrong on the real graph:
 * bus, car and truck are available on essentially every road edge, so they tie on count and the
 * `TRANSPORT_MODES` tie-break handed `bus` to all eleven corpus routes. That erases transport as
 * a decision AND makes every car/truck-gated event unreachable — which is the exact failure
 * `load-pack.ts:63-69` says route and start block are kept together to prevent.
 *
 * A profile is a statement about how the player wants to travel, so it is the right thing to
 * read. `illicit` prefers a truck because that is what moves goods nobody is declaring;
 * `cheapest` takes the bus; `fastest` takes the train where there is one.
 */
const PROFILE_MODES: Readonly<Record<RouteProfile, readonly TransportMode[]>> = {
  fastest: ['train', 'car', 'rideshare', 'bus', 'truck'],
  cheapest: ['bus', 'train', 'rideshare', 'truck', 'car'],
  safest: ['train', 'bus', 'car', 'rideshare', 'truck'],
  scenic: ['car', 'bus', 'train', 'rideshare', 'truck'],
  illicit: ['truck', 'car', 'rideshare', 'bus', 'train'],
};

/** The mode a run should START in: the profile's preference, among what the route supports. */
export function startingMode(profile: RouteProfile, mix: readonly TransportMode[]): TransportMode {
  const available = new Set(mix);
  return (
    PROFILE_MODES[profile].find((mode) => available.has(mode)) ??
    mix.find((mode) => mode !== 'foot' && mode !== 'ferry') ??
    'foot'
  );
}

export function buildPreview(
  profile: RouteProfile,
  segments: readonly LegSegment[],
  plan: LegPlan,
  notableNodes: readonly NodeId[],
  modesFor: ModesByEdge,
): RoutePreview {
  const crossings = segments.filter((s) => s.viaCrossingNode).length;
  const hasFerry = segments.some((s) => s.ferry);
  const mix = transportMixOf(segments, modesFor);
  const mode = startingMode(profile, mix);

  const ratio = PROFILE_COST[profile];
  const recommendedCash = mulDivRound(
    CASH_BASE + mulDivRound(plan.totalKm, CASH_PER_100KM, 100) + crossings * CASH_PER_CROSSING,
    ratio.num,
    ratio.den,
  );

  // The route's total duration, and the input to `rationsNeeded` below. Rations are RIGHT
  // because they reuse `HOURS_PER_HUNGER`: retuning the hunger rate updates the supply
  // requirement automatically, instead of leaving a second number to remember.
  const montage = new Set(plan.montageLegs);
  const totalHours = plan.legKm.reduce(
    (sum, km, leg) => sum + legHours(km, mode, montage.has(leg)),
    0,
  );

  // Fuel matters because it CLAMPS at 10: a long route cannot be fuelled at the start, so
  // refuelling is a thing that has to happen on the way — and that is where events live.
  const drivenKm = mode === 'car' || mode === 'truck' ? plan.totalKm : 0;
  const fuelNeeded = ceilDiv(drivenKm, KM_PER_FUEL);

  return {
    profile,
    totalKm: plan.totalKm,
    travelHours: totalHours,
    legCount: plan.legCount,
    montageLegCount: plan.montageLegs.length,
    crossings,
    hasFerry,
    notableNodes,
    transportMix: mix,
    recommendedCash,
    rationsNeeded: ceilDiv(totalHours, HOURS_PER_HUNGER),
    fuelNeeded,
    refuelStops: Math.max(0, ceilDiv(fuelNeeded, FUEL_CAP) - 1),
    borderBeats: Math.min(crossings, MAX_BORDER_BEATS),
  };
}
