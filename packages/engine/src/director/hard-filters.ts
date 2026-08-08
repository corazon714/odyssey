import { type ContentPack } from '../content/content-pack.ts';
import { dueBeatSlot } from './beat-slots.ts';
import { type GameEvent } from '../content/game-event.ts';
import { evaluatePredicate } from '../predicate/evaluate-predicate.ts';
import { type PredicateContext } from '../predicate/predicate-context.ts';
import { timeOfDayFor } from '../state/clock-state.ts';
import { locationAtLeg } from '../state/route-state.ts';
import { type RunState } from '../state/run-state.ts';
import { NO_TEXT_PARAMS, type TextParams } from '../text-params.ts';

/**
 * The gates an event must pass to be a candidate at all.
 *
 * These are FILTERS, not weights. A filter is explainable — "failed requires: money >= 30" —
 * and a zero weight is not, which design pillar 2 cares about. Scoring (M7) shades a
 * candidate's chances; this decides whether it is a candidate.
 *
 * ORDER IS FIXED, and the FIRST failure is what gets reported. `requires` comes first because
 * it is the correctness boundary and the most informative rejection; the cheap context checks
 * come after because their rejections are usually uninteresting.
 *
 * Two gates are NEVER relaxed by the fallback ladder, and it matters that they are the first
 * two here: `requires` (an event needing a passport you do not have must not fire) and
 * `maxOccurrences` (authored intent — "this happens once per run" — not a pacing hint).
 */
export type FilterVerdict =
  | { readonly eligible: true }
  | { readonly eligible: false; readonly reasonKey: string; readonly params: TextParams };

const PASS: FilterVerdict = Object.freeze({ eligible: true });

function reject(reasonKey: string, params: TextParams = NO_TEXT_PARAMS): FilterVerdict {
  return { eligible: false, reasonKey, params };
}

/** Which gates the current rung is allowed to skip. M6 relaxes nothing; M7 adds the ladder. */
export type Relaxation = {
  readonly beatGate: boolean;
  readonly softContext: boolean;
  readonly cooldown: boolean;
  readonly locationTypes: boolean;
  readonly exclusiveGroup: boolean;
};

export const RELAX_NOTHING: Relaxation = Object.freeze({
  beatGate: false,
  softContext: false,
  cooldown: false,
  locationTypes: false,
  exclusiveGroup: false,
});

export function filterEvent(
  event: GameEvent,
  state: RunState,
  pack: ContentPack,
  ctx: PredicateContext,
  relax: Relaxation = RELAX_NOTHING,
  claimedGroups: ReadonlySet<string> = new Set(),
): FilterVerdict {
  // 1. requires — never relaxed.
  const requires = evaluatePredicate(event.requires, ctx, `req:${event.id}`);
  if (!requires.value) {
    return reject('director.reject.requires', { event: event.id });
  }

  // 2. maxOccurrences — never relaxed. Authored intent, not pacing.
  const memory = state.eventMemory[event.id];
  if (event.maxOccurrences !== null && (memory?.count ?? 0) >= event.maxOccurrences) {
    return reject('director.reject.maxOccurrences', {
      event: event.id,
      limit: event.maxOccurrences,
    });
  }

  // 3. beat gate. A beat event may fire only into an OPEN slot of its own type — open being
  //    anywhere in [legIndex, legIndex + slackLegs], so a slot that slid is still fillable.
  if (!relax.beatGate && event.priority === 'beat') {
    const slot = dueBeatSlot(state.route, state.route.legIndex);
    if (slot === null || slot.type !== event.beatType) {
      return reject('director.reject.beatGate', {
        event: event.id,
        due: slot === null ? 'none' : slot.type,
      });
    }
  }

  // 4. locationTypes — an empty list means NO constraint, not "matches nothing".
  const context = event.context;
  if (!relax.locationTypes && context.locationTypes.length > 0) {
    const here = locationAtLeg(state.route, state.route.legIndex);
    if (!context.locationTypes.includes(here)) {
      return reject('director.reject.locationType', { event: event.id, actual: here });
    }
  }

  // 5. soft context: time of day, transport, weather, route profile.
  if (!relax.softContext) {
    const timeOfDay = timeOfDayFor(state.clock.hour);
    if (context.timeOfDay.length > 0 && !context.timeOfDay.includes(timeOfDay)) {
      return reject('director.reject.timeOfDay', { event: event.id, actual: timeOfDay });
    }
    if (
      context.transportModes.length > 0 &&
      !context.transportModes.includes(state.transport.mode)
    ) {
      return reject('director.reject.transportMode', {
        event: event.id,
        actual: state.transport.mode,
      });
    }
    if (context.weather.length > 0 && !context.weather.includes(state.weather)) {
      return reject('director.reject.weather', { event: event.id, actual: state.weather });
    }
    if (context.routeProfiles.length > 0 && !context.routeProfiles.includes(state.route.profile)) {
      return reject('director.reject.routeProfile', {
        event: event.id,
        actual: state.route.profile,
      });
    }
  }

  // 6. cooldown.
  if (!relax.cooldown && memory !== undefined && event.cooldownLegs > 0) {
    const since = state.route.legIndex - memory.lastLeg;
    if (since < event.cooldownLegs) {
      return reject('director.reject.cooldown', {
        event: event.id,
        since,
        required: event.cooldownLegs,
      });
    }
  }

  // 7. exclusiveGroup — one event per group per leg.
  if (
    !relax.exclusiveGroup &&
    event.exclusiveGroup !== null &&
    claimedGroups.has(event.exclusiveGroup)
  ) {
    return reject('director.reject.exclusiveGroup', {
      event: event.id,
      group: event.exclusiveGroup,
    });
  }

  void pack;
  return PASS;
}
