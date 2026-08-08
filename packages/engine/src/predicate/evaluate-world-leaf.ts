import { drawWord } from '../rng/draw-word.ts';
import { timeOfDayFor } from '../state/clock-state.ts';
import { locationAtLeg } from '../state/route-state.ts';
import { compareNumber } from './number-cmp.ts';
import { chanceAddress, type PredicateContext } from './predicate-context.ts';
import { type Predicate } from './predicate.ts';
import { leafReason, type ReasonNode } from './reason-node.ts';

/** 2^32, as a literal — `**` is implementation-approximated (ADR 0005 decision 3). */
const UINT32_RANGE = 4294967296;

/**
 * Leaves that read the world rather than the player: time, weather, position on the route,
 * director tension — and the seeded chance gate.
 */
type WorldLeaf = Extract<
  Predicate,
  {
    kind:
      | 'weather'
      | 'timeOfDay'
      | 'locationType'
      | 'routeProfile'
      | 'status'
      | 'leg'
      | 'day'
      | 'tension'
      | 'chance';
  }
>;

export function evaluateWorldLeaf(
  predicate: WorldLeaf,
  ctx: PredicateContext,
  path: string,
): ReasonNode {
  const { state } = ctx;

  switch (predicate.kind) {
    case 'weather':
      return leafReason('weather', predicate.anyOf.includes(state.weather), 'reason.weather', {
        actual: state.weather,
      });

    case 'timeOfDay': {
      const actual = timeOfDayFor(state.clock.hour);
      return leafReason('timeOfDay', predicate.anyOf.includes(actual), 'reason.timeOfDay', {
        actual,
      });
    }

    case 'locationType': {
      // Same source the director's context filter reads, so a modifier's `when` and an
      // event's `context.locationTypes` can never disagree about where the player is.
      const actual = locationAtLeg(state.route, state.route.legIndex);
      return leafReason('locationType', predicate.anyOf.includes(actual), 'reason.locationType', {
        actual,
      });
    }

    case 'routeProfile':
      return leafReason(
        'routeProfile',
        predicate.anyOf.includes(state.route.profile),
        'reason.routeProfile',
        { actual: state.route.profile },
      );

    case 'status':
      return leafReason('status', predicate.anyOf.includes(state.status), 'reason.status', {
        actual: state.status,
      });

    case 'leg':
      return leafReason(
        'leg',
        compareNumber(predicate.cmp, state.route.legIndex),
        `reason.leg.${predicate.cmp.op}`,
        { required: predicate.cmp.value, actual: state.route.legIndex },
      );

    case 'day':
      return leafReason(
        'day',
        compareNumber(predicate.cmp, state.clock.day),
        `reason.day.${predicate.cmp.op}`,
        { required: predicate.cmp.value, actual: state.clock.day },
      );

    case 'tension':
      return leafReason(
        'tension',
        compareNumber(predicate.cmp, state.tension),
        `reason.tension.${predicate.cmp.op}`,
        { required: predicate.cmp.value, actual: state.tension },
      );

    case 'chance':
      return evaluateChance(predicate.percent, ctx, path);

    default:
      return unreachableLeaf(predicate);
  }
}

/**
 * A probability gate that consumes NO cursor.
 *
 * The word is drawn at an address derived from (run seed, scope, path in the predicate
 * tree) rather than from a running counter. Three consequences, all of them the point:
 *
 *   - Adding an event to the content pack shifts nothing. Drawing from `eventPick` would
 *     make the draw COUNT depend on pool size, invalidating every golden run (ADR 0005 §2).
 *   - Re-evaluating the same gate in the same leg gives the same answer, so the director can
 *     explain its reasoning without the explanation changing the outcome.
 *   - Two events asking for 30% on the same leg get independent answers, because the scope
 *     differs.
 *
 * The threshold uses division and multiplication of doubles, both exactly rounded by
 * IEEE-754 and therefore identical on every engine. The 0 and 100 cases short-circuit so no
 * float comparison decides a certainty.
 */
function evaluateChance(percent: number, ctx: PredicateContext, path: string): ReasonNode {
  if (percent <= 0) return leafReason('chance', false, 'reason.chance', { percent, roll: -1 });
  if (percent >= 100) return leafReason('chance', true, 'reason.chance', { percent, roll: -1 });

  const word = drawWord(chanceAddress(ctx, path), 0);
  const threshold = (percent / 100) * UINT32_RANGE;

  return leafReason('chance', word < threshold, 'reason.chance', {
    percent,
    // Reported as a 0-99 band so the result screen can show "rolled 73 vs 30" without
    // leaking a 32-bit word at the player.
    roll: Math.floor((word / UINT32_RANGE) * 100),
  });
}

function unreachableLeaf(predicate: never): ReasonNode {
  void predicate;
  return leafReason('unknown-kind', false, 'reason.unknown-kind');
}
