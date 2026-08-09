import { tagsOf } from '../content/event-tags.ts';
import { type GameEvent } from '../content/game-event.ts';
import { type RunState } from '../state/run-state.ts';
import { TAG_SATURATION_MIN, TAG_WINDOW } from './scoring-constants.ts';

/**
 * The anti-repetition factor that actually matters.
 *
 * Per-event novelty and recency stop the SAME event recurring. They do nothing about three
 * DIFFERENT bribe events in a row, each individually novel and collectively identical — which
 * is the failure mode a Quality-Based Narrative actually suffers from.
 *
 * MAX, NOT PRODUCT. Taking the product over shared tags would collapse a six-tag event in a
 * busy window to near-zero, turning a scoring factor into a filter in disguise — exactly what
 * the bounded-with-a-floor rule forbids. The most-saturated single tag is the honest signal:
 * "you have had a lot of this lately" is about one theme, not about how many labels an event
 * happens to carry.
 *
 * The window is read from `history`, which already carries the tags copied at fire time. That
 * is deliberate: no redundant field to keep consistent across save and migration, and the
 * run's own past stays the source of truth for its pacing even after a content update.
 *
 * `category` folds in as a synthetic `cat:` tag, so one mechanism covers both axes.
 */
export function tagSaturation(event: GameEvent, state: RunState): number {
  const window = state.history.slice(-TAG_WINDOW);
  if (window.length === 0) return 1;

  const counts = new Map<string, number>();
  for (const entry of window) {
    for (const tag of entry.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }

  let worst = 0;
  for (const tag of tagsOf(event)) {
    const count = counts.get(tag) ?? 0;
    if (count > worst) worst = count;
  }

  const factor = 1 / (1 + worst);
  return factor < TAG_SATURATION_MIN ? TAG_SATURATION_MIN : factor;
}
