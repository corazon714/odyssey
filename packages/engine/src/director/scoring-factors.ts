import { type GameEvent } from '../content/game-event.ts';
import { timeOfDayFor } from '../state/clock-state.ts';
import { locationAtLeg } from '../state/route-state.ts';
import { type RunState } from '../state/run-state.ts';
import {
  AFFINITY_MATCH,
  AFFINITY_MAX,
  AFFINITY_MIN,
  AFFINITY_MISS,
  NOVELTY_MIN,
  PRIORITY_BOOST,
  RECENCY_MIN,
  RECENCY_WINDOW,
  TENSION_FALLOFF,
  TENSION_IN_BAND,
  TENSION_MIN,
  TENSION_NEUTRAL,
} from './scoring-constants.ts';
import { tagSaturation } from './tag-saturation.ts';

/**
 * The six factors. Each is a pure function of `(event, state)` returning a bounded multiplier.
 *
 * They are INDEPENDENT judgments about fitness, which is why the score multiplies them rather
 * than adding. Addition would denominate every modifier in the same units as the author's
 * `weight`, so an author writing `weight: 500` would silently defeat every penalty in the
 * system — and penalties could go negative, needing a clamp anyway.
 */
function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * How well the event's declared context matches where the run actually is.
 *
 * Matters most at the relaxed rungs. At rung 0 the hard filters already excluded mismatches,
 * so this mostly rewards events that declared a context and got it — a border event AT a
 * border outscores a generic one that could fire anywhere.
 */
export function contextAffinity(event: GameEvent, state: RunState): number {
  const context = event.context;
  let factor = 1;

  const shade = (declared: number, matched: boolean): void => {
    if (declared === 0) return;
    factor *= matched ? AFFINITY_MATCH : AFFINITY_MISS;
  };

  shade(
    context.locationTypes.length,
    context.locationTypes.includes(locationAtLeg(state.route, state.route.legIndex)),
  );
  shade(context.timeOfDay.length, context.timeOfDay.includes(timeOfDayFor(state.clock.hour)));
  shade(context.transportModes.length, context.transportModes.includes(state.transport.mode));
  shade(context.weather.length, context.weather.includes(state.weather));
  shade(context.routeProfiles.length, context.routeProfiles.includes(state.route.profile));

  return clamp(factor, AFFINITY_MIN, AFFINITY_MAX);
}

/**
 * How well the event's tension band fits the director's current signal.
 *
 * SOFT, not a gate. engine-spec 2 comments `tensionBand` as controlling eligibility; hard-
 * gating on a continuous signal is the fastest route to blowing the same spec's <2%
 * empty-pool target, so it shades instead (ADR 0005 §5, taken with sign-off).
 *
 * `1 / (1 + 4d)` rather than an exponential decay: rational arithmetic is bit-identical
 * across engines, `Math.exp` is not.
 */
export function tensionFit(event: GameEvent, state: RunState): number {
  const band = event.tensionBand;
  if (band === null) return TENSION_NEUTRAL;

  const [low, high] = band;
  const tension = state.tension;
  if (tension >= low && tension <= high) return TENSION_IN_BAND;

  const distance = tension < low ? low - tension : tension - high;
  return clamp(1 / (1 + TENSION_FALLOFF * distance), TENSION_MIN, TENSION_IN_BAND);
}

/** 1, ½, ⅓, ¼ … by how many times this event has already fired. */
export function novelty(event: GameEvent, state: RunState): number {
  const seen = state.eventMemory[event.id]?.count ?? 0;
  return clamp(1 / (1 + seen), NOVELTY_MIN, 1);
}

/**
 * Linear recovery: fully recovered after RECENCY_WINDOW DRAWS, floored so it never vetoes.
 *
 * THE WINDOW IS OVER FIRED EVENTS, NOT OVER LEGS (ADR 0029 addendum, M3.12a). This used to
 * read `state.route.legIndex - memory.lastLeg`, which was the same number right up until a leg
 * could show the player nothing: at a 30% quiet share `RECENCY_WINDOW = 6` would have become
 * about 4.2 events of real cover, the identical arithmetic Decision 6 spells out for
 * `TAG_WINDOW`. Two windows doing ONE anti-repetition job must not be denominated in two units.
 *
 * The unit is what the PLAYER READ, and that is the whole argument. Recency exists so a
 * repeat does not land while the first showing is still fresh, and freshness is worn down by
 * other events, not by odometer readings. `[bribe] [nothing] [nothing] [nothing] [bribe]` is
 * five screens with the repeat plainly visible; `[bribe] [storm] [theft] [breakdown] [bribe]`
 * is five screens with three real ones in between. A leg that showed nothing buffers nothing,
 * so it does not consume a slot here.
 *
 * `cooldownLegs` deliberately goes the OTHER way and stays wall-clock — see `hard-filters.ts`.
 * The split is not an inconsistency: this is engine-owned PRESENTATION shading, that is an
 * authored WORLD-pacing gate, and each is denominated in the unit its own question is asked in.
 *
 * IDENTICAL AT `BASE_EVENT_ODDS = 1:0`, which is what keeps the M3.12a fence: `quiet` is zero
 * by construction there, and `uneventful` — the only other leg kind that leaves no fired entry —
 * measures exactly 0 across 2,000 runs on both packs and 9 of 9 golden runs. If that ever
 * stops being true the golden digests move loudly rather than the window drifting silently,
 * which is the failure mode this whole sweep is about.
 */
export function recency(event: GameEvent, state: RunState): number {
  const memory = state.eventMemory[event.id];
  if (memory === undefined) return 1;

  const gap = drawsSince(state, memory.lastLeg);
  if (gap >= RECENCY_WINDOW) return 1;
  return clamp(RECENCY_MIN + ((1 - RECENCY_MIN) * gap) / RECENCY_WINDOW, RECENCY_MIN, 1);
}

/**
 * How many draws the director has made since the leg an event last fired on, counting this one —
 * SATURATING AT `RECENCY_WINDOW`, which is the last value the caller can tell apart.
 *
 * Starts at 1 so `gap` keeps its old meaning exactly: 1 is "the very next draw", the value
 * `RECENCY_MIN` is calibrated against. Walks backwards and stops at `lastLeg` rather than
 * filtering the whole array — `history` is appended in ascending leg order by both writers.
 *
 * The saturation is what keeps this off the hot path's critical list rather than a
 * micro-optimisation: `recency` is evaluated per candidate per rung per leg, and an event that
 * fired on leg 0 of a 48-leg Phase 3 route would otherwise walk the whole run every time. Exact
 * by construction, since `recency` returns 1 for every gap at or above the window.
 *
 * Reads `history` rather than a counter in `RunState` for the reason `tag-saturation.ts` gives:
 * no redundant field to keep consistent across save and migration, and the run's own past stays
 * the source of truth for its own pacing.
 */
function drawsSince(state: RunState, lastLeg: number): number {
  let draws = 1;
  for (let i = state.history.length - 1; i >= 0 && draws < RECENCY_WINDOW; i -= 1) {
    const entry = state.history[i];
    if (entry === undefined || entry.legIndex <= lastLeg) break;
    if (entry.eventId !== null) draws += 1;
  }
  return draws;
}

export function priorityBoost(event: GameEvent): number {
  return PRIORITY_BOOST[event.priority];
}

/**
 * The factor list, in the order `scoreEvent` multiplies them.
 *
 * Exported so `director/__tests__/scoring.test.ts` can pin it AND verify that `scoreEvent`'s hand-written
 * multiplication agrees with a loop over this array. The hand-written form stays because it
 * is the hot path; the array is what makes the order an asserted contract rather than a
 * comment.
 */
export const SCORING_FACTORS: readonly {
  readonly name: string;
  readonly of: (event: GameEvent, state: RunState) => number;
  readonly min: number;
  readonly max: number;
}[] = [
  { name: 'contextAffinity', of: contextAffinity, min: AFFINITY_MIN, max: AFFINITY_MAX },
  { name: 'tensionFit', of: tensionFit, min: TENSION_MIN, max: TENSION_IN_BAND },
  { name: 'novelty', of: novelty, min: NOVELTY_MIN, max: 1 },
  { name: 'recency', of: recency, min: RECENCY_MIN, max: 1 },
  { name: 'tagSaturation', of: tagSaturation, min: 0.25, max: 1 },
  { name: 'priorityBoost', of: (event) => priorityBoost(event), min: 0.4, max: 3 },
];
