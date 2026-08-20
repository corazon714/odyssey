import { type LocationType } from '../content/location-type.ts';
import { timeOfDayFor } from '../state/clock-state.ts';
import { locationAtLeg } from '../state/route-state.ts';
import { type RunState } from '../state/run-state.ts';

/**
 * The MOOD the world is in, derived from `RunState` and from nothing else.
 *
 * Design pillar 3: "if the state changed meaningfully, the presentation changes: palette,
 * ambience, vignette, event pool. Wanted -> sirens. Broke -> desaturation."
 *
 * ## Why this lives in the engine
 *
 * CLAUDE.md's hard rule for the app layer is that it imports the engine and renders — computing a
 * game rule in a component is a bug. This is a derivation over `RunState` that branches on nine
 * BALANCE THRESHOLDS (`heat >= 7`, `health <= 3`, ...), and a balance threshold inside a React tree
 * is exactly the shape that rule names.
 *
 * The second reason is the one that decided it: **putting it here makes mood MEASURABLE.**
 * `docs/phase-3-closeout.md` §6 argues that mood calibration depends on the state distribution —
 * today energy floors by leg 5 and morale sits at 0 for most of a long run, so an "exhausted"
 * presentation would be very nearly always-on. With the derivation in the engine, `pnpm sim` can
 * report mood occupancy per route and that claim stops being an assertion.
 *
 * ## What is NOT here
 *
 * **No colour, no asset, no duration.** A `MoodId` is an abstract vocabulary; every hex value,
 * vignette strength and ambient bed lives in `apps/mobile/src/design/`. The engine must not know
 * the word "violet", and this file must never grow a palette.
 *
 * **Nothing authored may filter on mood.** A `requires: { mood: 'wanted' }` would couple content to
 * a presentation decision and make the palette unchangeable without a content migration. There is
 * deliberately no predicate kind for it, and `MOOD_IDS` is classified `NOT_CONTENT` in the L2
 * conformance sweep for the same reason `WEAR_BANDS` is.
 */

export const MOOD_IDS = [
  'default',
  'night',
  'wanted',
  'destitute',
  'desperate',
  'injured',
  'wilderness',
  'urban',
  'border_tension',
  'storm',
  'triumphant',
] as const;

export type MoodId = (typeof MOOD_IDS)[number];

/**
 * Moods that ALSO apply as an orthogonal layer, whatever won the slot.
 *
 * ## The problem this solves
 *
 * A mood is one value, so the priority order below is a total order and something has to lose.
 * `night` loses to almost everything — correctly, because it is not actionable and recurs twice a
 * day. But "outranked" must not mean "invisible": **a night border crossing still has to look like
 * night**, or the world stops reacting to the one thing the player can always see out of the
 * window.
 *
 * So the two ENVIRONMENTAL members are returned twice over. `moodFromState` may answer `wanted`
 * while this answers `['night']`, and the app tints for night while sirening for wanted.
 *
 * ## The hazard, stated because it is easy to hit
 *
 * When nothing outranks it, `moodFromState` returns `night` AND this returns `['night']`. **A
 * consumer that applies the mood theme and then applies the overlay will double-darken.** The app's
 * `useMood()` is the one place that resolves them; nothing else should read both.
 */
export const MOOD_OVERLAYS = ['night', 'storm'] as const;

export type MoodOverlay = (typeof MOOD_OVERLAYS)[number];

/**
 * Weather that reads as a STORM.
 *
 * **Deliberately not `world-tick.ts`'s `HARSH_WEATHER`**, and the difference is the point.
 * `HARSH_WEATHER` is `['rain', 'wind', 'heat']` — the weather that costs you extra hours, a
 * drain-economy constant the balance sweep is free to move. `heat` is harsh and is emphatically not
 * a storm; a heat wave that made the screen look like a thunderstorm would be the presentation
 * lying about the weather.
 *
 * Keying a mood off a balance constant is the coupling `wear-state.ts` documents at length: an
 * event keyed on "the tail band" is an event keyed on how tired the drain economy thinks you are.
 * The same argument applies to a palette.
 *
 * `fog` is a `WEATHERS` member and is in neither set. It is atmosphere rather than a storm, and the
 * mood vocabulary has nowhere to put it — a real gap, and a smaller one than mislabelling it.
 */
const STORM_WEATHER: readonly string[] = ['rain', 'wind'];

/** Location types that read as a built-up place. `village` is not one; nor is a rest stop. */
const URBAN_LOCATIONS: readonly LocationType[] = ['city', 'town'];

/** Location types where a crossing is imminent or under way. */
const CROSSING_LOCATIONS: readonly LocationType[] = ['border_crossing', 'checkpoint'];

/**
 * The ending that earns a triumphant screen, and ONLY it.
 *
 * Not "any arrival". `ending.arrival_hollow` is declared as "arrived, but spent — the journey cost
 * more than the destination was worth", and a hollow arrival that rendered triumphant would be the
 * presentation congratulating the player for something the content just told them was sad. When it
 * falls through, it lands on `desperate` or `injured` — the state it actually arrived in — which is
 * the right screen and is emergent rather than special-cased.
 *
 * Hardcoding one content id in the engine is a coupling, and it is the coupling
 * `loop/check-run-end.ts` already has (it filters `startsWith('ending.arrival')` and constructs
 * three ids literally). CLAUDE.md §6 makes it safe: ids are permanent and are never renamed.
 */
const TRIUMPHANT_ENDING = 'ending.arrival_triumphant';

/**
 * The morale at or below which the journey has worn the player down.
 *
 * ## Why there is NO energy term, which is the counter-intuitive part
 *
 * "Exhausted" should obviously mean low energy, and it cannot: **`energy <= 1` holds on 71.19% of
 * legs and `energy <= 4` on 82.78%** (28 routes, 2,800 runs, 81,133 legs). Energy is floored for
 * roughly three quarters of the game, so it carries almost no information — exactly the always-on
 * failure `docs/phase-3-closeout.md` §6 warned a mood could have.
 *
 * The consequence is that an `AND` collapses onto the morale term and an `OR` collapses onto the
 * energy one. Measured: `morale <= 3 && energy <= 3` fires on **15.76%** of legs against
 * `morale <= 3` alone at **15.79%** — a difference of 0.03 percentage points. **A term that moves
 * the answer by three hundredths of a point is not a signal, it is decoration that reads as
 * rigour**, and the next person to open this file would reasonably assume it did something.
 *
 * So the predicate is morale alone, and this comment is here so nobody re-adds energy believing
 * its absence was an oversight. Energy being floored 71% of the time is a BALANCE finding with its
 * own owner; it is not this file's to fix.
 *
 * ## Why 3 and not 2
 *
 * The threshold was chosen as a SHARE rather than as a number. `morale <= 2` measures 9.66% of legs
 * raw and lands near 5.7% once the moods above it take their slots — below `injured`, which makes
 * exhaustion rarer than injury. `morale <= 3` measures 15.79% raw and lands in the intended band:
 * more common than injury because it is a recurring condition, less common than night because it
 * is not ambient.
 */
const WORN_DOWN_MORALE = 3;

/**
 * The world's current mood.
 *
 * ## The priority order, and the reasoning that fixes it
 *
 * One value has to win, so the order is a claim about what the player must not miss. It runs
 * **terminal state, then threat, then scene, then body, then environment, then place.**
 *
 * 1. `triumphant` — the run is over and it went well. Nothing else is actionable.
 * 2. `wanted` — an escalating EXTERNAL threat with a scene attached, and the cue pillar 3 names.
 * 3. `destitute` — no money at all. Pillar 3's "broke -> desaturation". Rare, and placed high
 *    BECAUSE it is rare — see the branch.
 * 4. `border_tension` — the highest-stakes scene the game has.
 * 5. `injured` — an acute condition of the body.
 * 6. `desperate` — a recurring condition of the person. The background, not the alarm.
 * 7. `storm` / 8. `night` — environment, which is also carried by `moodOverlaysFromState`.
 * 9. `wilderness` / `urban` — where you are.
 * 10. `default`.
 *
 * ### `destitute` and `desperate` were ONE mood and had to be split
 *
 * The original `desperate` required `cash + bank === 0` AND a failing meter, and fired on **11 legs
 * in 81,133**. The defect was not the threshold, it was that the NAME and the PREDICATE disagreed:
 * `desperate` reads as a state of the person while the predicate measured the state of the wallet,
 * and those two come apart constantly. Splitting them gives each a name that matches what it
 * tests; tuning the conjunction would only have moved a number that was measuring the wrong thing.
 *
 * ### Why `wanted` beats `injured`, which is the interesting case
 *
 * `heat` is an external pressure that escalates and can be acted on; `health <= 3` is a condition
 * the resource meter already displays continuously and unmissably. If `injured` outranked `wanted`,
 * a hurt player at heat 9 would lose the siren at exactly the moment it carries the most
 * information — and gain nothing, because the health meter was already red.
 *
 * ### Why `night` is demoted, and why that does not lose it
 *
 * It is not actionable and it recurs twice a day, so it is the cheapest thing to signal by other
 * means. Being outranked would normally mean disappearing; `moodOverlaysFromState` is why it does
 * not. See its doc comment.
 *
 * ## Purity
 *
 * Reads `state` and nothing else — no clock, no RNG, no content pack. The same `RunState` always
 * gives the same `MoodId`, which is what lets the sim fold it over a whole corpus.
 */
export function moodFromState(state: RunState): MoodId {
  // GATED ON `status`, and it is not redundant. Content unlocks arrival variants DURING the run —
  // `check-run-end.ts` filters `unlockedEndings` for them at the moment of arrival — so
  // `ending.arrival_triumphant` can sit in the list for twenty legs before the run ends. Without
  // this gate the world would turn triumphant in the middle of the journey.
  if (state.status === 'ended' && state.unlockedEndings.some((id) => id === TRIUMPHANT_ENDING)) {
    return 'triumphant';
  }

  if (state.resources.heat >= 7) return 'wanted';

  // DESTITUTE OUTRANKS THE SCENE, and its rarity is the argument rather than an objection to it.
  // Measured at 43 legs in 81,133 — 27 runs of 2,800, across 8 of 28 routes. A mood that fires on
  // one run in a hundred is only ever SEEN if it wins when it fires; placed below the scene it
  // would render approximately never, and the palette would be built for nobody. It also changes
  // what every choice on the screen means — you cannot bribe, buy or pay your way out of anything
  // — which is a bigger claim on the presentation than the place you happen to be standing in.
  //
  // `wanted` still beats it: being hunted is an escalating threat with a timer, while being broke
  // is a static condition that will still be true on the next leg.
  if (state.resources.cash + state.resources.bank === 0) return 'destitute';

  const location = locationAtLeg(state.route, state.route.legIndex);
  if (CROSSING_LOCATIONS.includes(location)) return 'border_tension';

  if (state.resources.health <= 3) return 'injured';

  // DESPERATE SITS BELOW INJURED, and that is deliberate. It is a recurring condition rather than
  // an event, so it belongs where the background lives — it is what you see when nothing more
  // specific is happening, which is exactly what "the journey is grinding you down" should be.
  // Placing it above `injured` would also cannibalise that mood, because low morale and low health
  // correlate: both are the same run failing.
  if (state.resources.morale <= WORN_DOWN_MORALE) return 'desperate';
  if (STORM_WEATHER.includes(state.weather)) return 'storm';
  if (timeOfDayFor(state.clock.hour) === 'night') return 'night';
  if (location === 'wilderness') return 'wilderness';
  if (URBAN_LOCATIONS.includes(location)) return 'urban';

  return 'default';
}

/**
 * The environmental layers that apply regardless of what won the mood slot.
 *
 * Returned in `MOOD_OVERLAYS` order rather than in the order the conditions were tested, so the
 * result is stable and comparable — a consumer may use it as a key.
 */
export function moodOverlaysFromState(state: RunState): readonly MoodOverlay[] {
  const out: MoodOverlay[] = [];
  if (timeOfDayFor(state.clock.hour) === 'night') out.push('night');
  if (STORM_WEATHER.includes(state.weather)) out.push('storm');
  return out;
}
