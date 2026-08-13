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
 *
 * THE WINDOW IS OVER FIRED EVENTS, NOT OVER ENTRIES (ADR 0029 D6). `TAG_WINDOW` is denominated
 * in events the player actually saw, and since the quiet-leg gate `history` also carries
 * entries with `eventId: null` — legs where nothing happened. Slicing entries would shrink the
 * effective window from 8 fired events to about 5.6 at a 30% quiet share, so a theme could
 * recur inside the window the constant promises and nothing in the run would penalise it.
 *
 * THAT IS THE WHOLE ARGUMENT, AND IT IS DELIBERATELY NOT AN ARGUMENT ABOUT THE SIM'S REPEAT
 * RATE. This comment used to close with "the two changes would have cancelled, and the sim
 * would have shown a wash rather than the regression it really was" — reasoning from
 * `Repeat-event rate`, which is `1 - unique/fired` over a whole run and therefore falls ~10pp
 * at a 30% quiet share whatever the director does, because the draws shrink while `unique` is
 * capped by a 13-event pool. A wash was never on the table; the line moves regardless. The
 * report now carries `Near-repeat rate` — a redraw inside `RECENCY_WINDOW` FIRED EVENTS — which
 * is the better of the two to read at M3.12b. **It is not unconfounded either**: a quiet share
 * compresses the draw sequence and moves it with the director untouched, by +7.6pp on the corpus
 * and −5.7pp on the fixture at a 30% quiet share, so a null baseline must be subtracted before
 * anything here is read as evidence. A shrinking window is a defect measured against the
 * constant, not against a rate — which is why this argument does not rest on either line.
 */
export function tagSaturation(event: GameEvent, state: RunState): number {
  const window = state.history.filter((entry) => entry.eventId !== null).slice(-TAG_WINDOW);
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
