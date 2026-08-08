import { endingId, type EndingId } from '../ids/content-ids.ts';
import { type RunState } from '../state/run-state.ts';

/**
 * Whether the run is over, and which ending it earned.
 *
 * Design pillar 4 — "no dead ends before the halfway point" — is a CONTENT rule the director
 * enforces by keeping escape routes eligible, not something this function can express. What
 * it does guarantee is that an ending is always attributable: a run never simply stops.
 *
 * Arrival is checked before failure, so reaching the destination on your last point of health
 * is an arrival. That is the more interesting story, and design pillar 1 prefers it.
 */
export type RunEndVerdict =
  | { readonly ended: false }
  | { readonly ended: true; readonly endingIds: readonly EndingId[]; readonly reasonKey: string };

const NOT_ENDED: RunEndVerdict = Object.freeze({ ended: false });

export function checkRunEnd(state: RunState): RunEndVerdict {
  if (state.route.legIndex >= state.route.legCount) {
    // An ending unlocked by the finale event wins; otherwise the run arrived without one,
    // which is itself a distinguishable outcome rather than a missing case.
    const arrivals = state.unlockedEndings.filter((id) => id.startsWith('ending.arrival'));
    return {
      ended: true,
      endingIds: arrivals.length > 0 ? arrivals : [endingId('ending.arrival_quiet')],
      reasonKey: 'loop.end.arrived',
    };
  }

  if (state.resources.health <= 0) {
    return {
      ended: true,
      endingIds: [endingId('ending.failure_collapsed')],
      reasonKey: 'loop.end.collapsed',
    };
  }

  if (state.resources.morale <= 0) {
    return {
      ended: true,
      endingIds: [endingId('ending.failure_gave_up')],
      reasonKey: 'loop.end.gave_up',
    };
  }

  return NOT_ENDED;
}
