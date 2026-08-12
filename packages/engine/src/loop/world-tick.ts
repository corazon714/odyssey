import { applyEffects } from '../effects/apply-effects.ts';
import { createEffectContext } from '../effects/effect-context.ts';
import { type Effect } from '../effects/effect.ts';
import { eventId } from '../ids/content-ids.ts';
import { type Rng } from '../rng/rng.ts';
import { type RunState } from '../state/run-state.ts';
import { type TransportMode } from '../state/transport-state.ts';
import { legHours } from './leg-hours.ts';

/**
 * What a leg costs whether or not anything happens.
 *
 * **The hours a leg takes are no longer here.** `HOURS_PER_LEG[mode]` moved to `leg-hours.ts`
 * at M3.8a and became `legHours(km, mode, montage)` — duration is now derived from the leg's
 * own distance plus a per-mode overhead, rather than being a property of the mode alone. Every
 * drain below still reads `hours`, which is why that change cost nothing here: this file was
 * already denominated in time (rule 1).
 *
 * Every number that remains is a BALANCE CONSTANT, gathered in one block so tuning is a diff to
 * this file. They are tuned against the sim, not derived — see docs/adr/0014.
 *
 * `uneventful` legs run this too: a leg where nothing happened must still cost time and wear,
 * or a run can contain six legs of nothing, which reads as a bug to the player and corrupts
 * the sim's median-days line.
 *
 * The shape of the drift is the part that matters, and it is not arbitrary (ADR 0014). Three
 * rules, each fixing a way the original was structurally wrong rather than merely mistuned:
 *
 *   1. TIME makes you hungry, not legs. A nine-hour walk and a four-hour train ride used to
 *      cost the same point of hunger, so the clock and the body disagreed.
 *   2. EFFORT drains energy, not legs. Sitting on a train is not walking all day.
 *   3. Penalties are GRADED, not cliffs. Being starving used to cost exactly what being
 *      peckish cost, so every run crossed the threshold together and died together.
 *
 * Hours spent INSIDE an event are the event's business and content pays for them explicitly.
 * The drift covers travel only, which is why it reads `hours` here rather than the clock —
 * there is no hidden accumulator, and the tick stays a pure function of (state, hours).
 */

/**
 * Travel hours per point of hunger.
 *
 * Charged against the CLOCK SPAN the leg covers, not against the leg — `floor(after / N) -
 * floor(before / N)`. Consecutive ticks are contiguous, so the remainder carries and nothing
 * is lost to rounding; but because the span is quantised, a short hop can genuinely cost
 * nothing while a long one costs two. That is where the variance in the hunger curve comes
 * from, and it is why every run no longer crosses the threshold on the same leg.
 */
const HOURS_PER_HUNGER = 6;

/**
 * Travel hours per point of hygiene. **Graded at M3.8b; it was the last cliff in this file.**
 *
 * It used to read `hours >= 6 ? -1 : 0` — one point, once, for any leg over six hours. Under a
 * flat `HOURS_PER_LEG` that fired for truck (6) and for nobody else, so hygiene was very nearly
 * static and rule 3 above was false about this one meter. Once M3.8a made hours a function of
 * distance the cliff got worse, not better: a leg's hygiene cost was a step function of a
 * continuous quantity, so 5.9 hours cost nothing and 6.0 cost a point.
 *
 * Now it accrues per hour against the CLOCK SPAN like hunger and energy, so the remainder
 * carries and two short legs cost what one long one does.
 *
 * Grading a DRAIN is not what `ENERGY_TIRED` warns against. That rule is about a THRESHOLD
 * penalty keyed on a floored meter — energy sits at 0 for most of a run, so a second rung there
 * lands on the whole population at once. Hygiene is the meter being drained, not the trigger.
 */
const HOURS_PER_HYGIENE = 6;

/**
 * Travel hours per point of energy, by how much of the work is yours. A passenger dozes; a
 * driver does not; a walker least of all. This is the main reason transport mode is a real
 * decision rather than a travel-time number, and it replaces a flat one-point-per-leg that
 * charged a four-hour train the same as a nine-hour walk.
 *
 * Same span quantisation as hunger, so the remainder carries and a mode change costs at most
 * one point of phase rather than rebasing the whole curve.
 */
const HOURS_PER_ENERGY: Readonly<Record<TransportMode, number>> = {
  foot: 5,
  bus: 10,
  train: 14,
  car: 9,
  truck: 9,
  ferry: 11,
  rideshare: 10,
};

/**
 * Weather that costs an extra point of energy — but only on a long leg. An hour in the rain
 * is nothing; a nine-hour day in it is the leg that breaks you. Gating on length is also what
 * keeps the penalty from applying to three legs in four once the weather starts rolling.
 */
const HARSH_WEATHER: readonly string[] = ['rain', 'wind', 'heat'];
const HARSH_WEATHER_HOURS = 6;

/**
 * Hunger thresholds, and how fast each rung costs health — in HOURS, like every other drain
 * here. Starvation damage was the last per-leg holdout in this file, and being per-leg is why
 * it converged: a short hop hurt exactly as much as a long haul, so once the population was
 * past the threshold it lost health in lockstep no matter how anyone travelled.
 */
const HUNGER_HURTS = 8;
const HUNGER_STARVING = 10;
const HOURS_PER_HUNGER_DAMAGE = 10;
const HOURS_PER_STARVING_DAMAGE = 5;

/**
 * Energy at or below this costs a point of morale each leg.
 *
 * Deliberately NOT graded, unlike hunger, and the asymmetry is the interesting part. Energy
 * FLOORS at 0 and most runs sit there, so a second harsher rung is a penalty the whole
 * population takes on the same leg — it synchronises the collapse instead of spreading it.
 * Measured: adding a `-2 at energy 0` rung drove leg-15 morale from `0/2/6` to `0/0/0`.
 * Hunger has no ceiling, so its rungs are reached at genuinely different times and grading
 * there does spread. Grade a penalty on an unbounded meter; never on a floored one.
 */
const ENERGY_TIRED = 1;

const WEATHERS = ['clear', 'rain', 'fog', 'wind', 'heat'] as const;

const TICK_SOURCE = eventId('engine.world_tick');

export function worldTick(state: RunState, rng: Rng): RunState {
  // `advanceLeg` sets `legIndex` to the leg being travelled BEFORE calling this (`:57`, `:69`),
  // so this is that leg's distance. `validateRoute` guarantees `legKm.length === legCount` and
  // `legIndex < legCount`, which is what makes the `?? 0` unreachable rather than a fallback
  // anybody should rely on — and 0 is chosen over an average deliberately, because an average
  // would paper over a broken route while 0 leaves it visible.
  const km = state.route.legKm[state.route.legIndex] ?? 0;
  const base = legHours(
    km,
    state.transport.mode,
    state.route.montageLegs.includes(state.route.legIndex),
  );

  // Jitter so two legs of the same mode are not identical. Drawn from `worldTick`, so adding
  // director draws later cannot shift the weather or the clock. The draw and its arguments are
  // UNCHANGED by M3.8a on purpose: a different draw here would move every RNG cursor downstream
  // and turn a duration change into a whole-run divergence.
  //
  // Floored after the jitter as well as inside `legHours`, so a one-hour leg cannot roll to zero
  // and stop the clock. No current route reaches it — the shortest leg any fixture produces is
  // four hours after a −1 — but a zero-hour leg would silently break `spanPoints` for everything.
  const hours = Math.max(1, base + rng.nextInt(-1, 2, 'worldTick'));

  const elapsed = elapsedHours(state);
  const harsh = HARSH_WEATHER.includes(state.weather) && hours >= HARSH_WEATHER_HOURS;
  const hunger = spanPoints(elapsed, hours, HOURS_PER_HUNGER);
  const hygiene = spanPoints(elapsed, hours, HOURS_PER_HYGIENE);
  const energy =
    spanPoints(elapsed, hours, HOURS_PER_ENERGY[state.transport.mode]) + (harsh ? 1 : 0);

  const effects: Effect[] = [
    { op: 'advanceTime', hours },
    // The leg's OWN distance, not `round(totalKm / legCount)`. The old expression is why a run's
    // accumulated `progressKm` summed to `legCount × round(totalKm/legCount)` rather than
    // `totalKm` — 24 × 89 = 2136 against 2140 on the illicit fixture. `uniformSplit` sums
    // exactly, so a completed run now lands on `totalKm` to the kilometre.
    { op: 'route', change: { field: 'progressKm', delta: km } },
    { op: 'resource', key: 'energy', delta: -energy },
  ];

  if (hunger > 0) effects.push({ op: 'resource', key: 'hunger', delta: hunger });
  if (hygiene > 0) effects.push({ op: 'resource', key: 'hygiene', delta: -hygiene });

  // Graded, not a cliff. A flat penalty at one threshold makes the whole population cross
  // together and collapse together, which is what made the old curve's p10/p50/p90 identical.
  const health = healthCost(state.resources.hunger, elapsed, hours);
  if (health > 0) effects.push({ op: 'resource', key: 'health', delta: -health });

  const morale = moraleCost(state.resources.energy);
  if (morale > 0) effects.push({ op: 'resource', key: 'morale', delta: -morale });

  // Weather changes roughly one leg in four.
  if (rng.nextInt(0, 3, 'worldTick') === 0) {
    const next = rng.pick(WEATHERS, 'worldTick');
    if (next !== null && next !== state.weather) {
      // Weather is not an Effect op — it is world state the director reads, not something
      // content mutates — so it is set directly here rather than through the applier.
      return applyEffects({ ...state, weather: next }, effects, createEffectContext(TICK_SOURCE))
        .state;
    }
  }

  return applyEffects(state, effects, createEffectContext(TICK_SOURCE)).state;
}

/** Hours the run has been going. The clock is the only accumulator the drift needs. */
function elapsedHours(state: RunState): number {
  return state.clock.day * 24 + state.clock.hour;
}

/**
 * Points accrued by travelling `hours` from `before` hours elapsed, one point per `per` hours.
 *
 * Exported so a test can prove the property that matters: summed over a contiguous sequence
 * of spans, the total equals `floor(total / per)` exactly, with no drift. A per-leg
 * `floor(hours / per)` would discard the remainder every leg and quietly halve the rate — and
 * would also make the cost of a leg independent of when it happened, which is what removed
 * every trace of variance from the old curve.
 */
export function spanPoints(before: number, hours: number, per: number): number {
  return Math.floor((before + hours) / per) - Math.floor(before / per);
}

/**
 * Health lost to hunger over a leg's clock span. Exported for tests.
 *
 * Two rungs, both charged per hour rather than per leg: being starving costs twice as fast as
 * being merely hungry, and a nine-hour haul on an empty stomach costs more than a four-hour
 * hop. Hunger is the right meter to grade because it has no ceiling — the rungs are therefore
 * reached at genuinely different times. Compare `ENERGY_TIRED`, which is deliberately not
 * graded for the opposite reason.
 */
export function healthCost(hunger: number, before: number, hours: number): number {
  if (hunger >= HUNGER_STARVING) return spanPoints(before, hours, HOURS_PER_STARVING_DAMAGE);
  if (hunger >= HUNGER_HURTS) return spanPoints(before, hours, HOURS_PER_HUNGER_DAMAGE);
  return 0;
}

/** Morale lost this leg to exhaustion. Single-rung on purpose — see `ENERGY_TIRED`. */
export function moraleCost(energy: number): number {
  return energy <= ENERGY_TIRED ? 1 : 0;
}
