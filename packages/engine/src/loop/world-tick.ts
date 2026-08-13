import { applyEffects } from '../effects/apply-effects.ts';
import { createEffectContext } from '../effects/effect-context.ts';
import { type Effect } from '../effects/effect.ts';
import { eventId } from '../ids/content-ids.ts';
import { type Rng } from '../rng/rng.ts';
import { type RunState } from '../state/run-state.ts';
import { type TransportMode } from '../state/transport-state.ts';
import { wearChipKey } from '../state/wear-state.ts';
import { legHours } from './leg-hours.ts';
import { wearBandAt, wearHistoryEntry, worn } from './wear-curve.ts';

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
 * The drift covers travel only, which is why it reads `hours` here rather than the clock.
 *
 * **There IS an accumulator now, and it is `state.wear.hours`** — this file's header used to
 * claim there was none. The wear curve (`wear-curve.ts`) makes the drain non-stationary, and
 * a non-stationary rate needs to know how far along the run is in TRAVEL hours, which no other
 * field carries. What has not changed is the PHASE: every `spanPoints` call below still bases
 * on the wall clock, and only the span LENGTH is compressed. Below the knee that compression
 * is the identity, so a short route is bit-identical to the pre-curve engine.
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
export const HOURS_PER_HUNGER = 6;

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
 * here.
 *
 * **Softened three times** (10/5 → 16/9 → 28/14 at M3.10b, → 44/22 at M3.11). Each time for the
 * same reason and each time because the previous value was tuned against a route set that had
 * since been replaced. This constant is denominated in HOURS, so it is not a difficulty dial —
 * it is a statement about how many travel hours a run survives, and it has to be re-derived
 * whenever the hour content of a route changes.
 *
 * M3.11 widened the geo slice to Afro-Eurasia, and a 48-leg route went from ~6,000 km to
 * ~15,300. Leg COUNT is capped at 48 by the compression curve (ADR 0026 Decision 4) but leg
 * LENGTH is not, so the same 48 legs now bill 407 travel hours where they billed ~215. Measured
 * over the whole corpus route set: total route hours span 112-510 where they spanned ~140-220,
 * and completion is a near-deterministic function of that one number — routes under ~150 hours
 * complete 55-85%, routes over ~250 hours complete 0.0%, with nothing in between.
 *
 * 44/22 is chosen with `HOURS_PER_MORALE` 20; neither lever reaches the band alone, because the
 * failure mode is conserved (see `HOURS_PER_MORALE`). It keeps collapse meaningful at 26.1% —
 * the pillar-1 floor that refused 32/16 at M3.10b is not close to being crossed — and it holds
 * the 2:1 rung ratio the invariant test pins. Full sweep in docs/adr/0035's second addendum.
 */
const HUNGER_HURTS = 8;
const HUNGER_STARVING = 10;
export const HOURS_PER_HUNGER_DAMAGE = 44;
const HOURS_PER_STARVING_DAMAGE = 22;

/**
 * Energy at or below this costs morale — and it is charged PER HOUR, not per leg (M3.10b).
 *
 * **Still deliberately NOT graded**, and that decision is untouched: energy FLOORS at 0 and
 * most runs sit there, so a second harsher rung lands on the whole population at once and
 * synchronises the collapse. Measured: a `-2 at energy 0` rung drove leg-15 morale from
 * `0/2/6` to `0/0/0`. Grade a penalty on an unbounded meter, never on a floored one.
 *
 * What changed is the RATE, not the rungs. Morale was the last per-leg drain in this file —
 * the header's rule 1 says TIME makes you hungry, not legs, and morale was the one meter still
 * disagreeing. Charging -1 per LEG once energy floors is effectively an unconditional -1/leg
 * against a 0-10 pool, which is death at ~leg 13 regardless of how far or how long those legs
 * were. The observed median run was 14 legs on routes of 23-31.
 *
 * That is why softening health alone could not work: it converted `failure_collapsed` into
 * `failure_gave_up` (68.1% → 3.0% against 28.2% → 72.4%) without saving a single run. With
 * hunger made unreachable entirely — perfect food forever — completion still stalled at 26.3%.
 *
 * **12 → 20 at M3.11, and it moves TOGETHER with `HOURS_PER_HUNGER_DAMAGE` because neither
 * works alone.** Swept on the widened route set, each lever in isolation: morale 12/16/20/26/34
 * gives completion 19.2/22.4/24.1/25.4/26.6% and saturates below the band, while `gave_up`
 * falls 52.2% → 6.5% and `collapsed` RISES 28.5% → 66.8%. Starvation alone does the mirror
 * image — 28/14 → 44/22 gives 19.2% → 28.1% while `collapsed` falls to 6.4% and `gave_up`
 * climbs to 65.4%. Each lever deletes its own failure mode and the other meter absorbs the runs
 * it saved. That is the conservation ADR 0035 named, measured a third time.
 *
 * Only moving both together clears the floor: 20 + 44/22 lands 41.0% with collapse 26.1% and
 * gave_up 32.8% — the first corpus measurement in this project where neither failure mode is
 * the majority ending.
 *
 * **Exported so its test can derive a span from it.** `world-tick.test.ts` pinned the
 * single-rung property with a hardcoded `span = 12`, which was this constant's own value and
 * therefore capped it silently — one meter over from the `HOURS_PER_HUNGER_DAMAGE * 2` trap
 * that comment already describes, and left in place at M3.10b because morale did not move then.
 */
const ENERGY_TIRED = 1;
export const HOURS_PER_MORALE = 20;

/**
 * The per-leg travel-time jitter, INCLUSIVE AT BOTH ENDS — `Rng.nextInt`'s contract.
 *
 * Named and exported so `route-preview.ts` can state the expected duration of a route from the
 * same numbers the tick draws from, instead of keeping a second copy of this distribution. The
 * preview understated every route by `legCount / 2` hours for as long as it summed the static
 * `legHours` alone.
 *
 * **These values are under review and the constant does not endorse them.** `nextInt` is
 * inclusive at both ends, so `(-1, 2)` draws from {-1, 0, 1, 2} with a mean of **+0.5 hours per
 * leg**, while `docs/adr/0014` ("the ±1 hour jitter on travel time") and `docs/adr/0026`
 * ("±1 hour on a 5-hour leg is texture") both describe the intent as symmetric ±1. If the ADRs
 * are right the upper bound is an off-by-one from an exclusive-max assumption, and correcting it
 * moves every downstream RNG draw and therefore every golden run — which is why it is recorded
 * here rather than changed here.
 *
 * Whichever way that lands, the preview is correct without a further edit: at {-1, 0, 1} the
 * expectation below is zero and the static sum becomes the honest answer on its own.
 */
export const LEG_JITTER_MIN = -1;
export const LEG_JITTER_MAX = 2;

export const WEATHERS = ['clear', 'rain', 'fog', 'wind', 'heat'] as const;

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
  const hours = Math.max(1, base + rng.nextInt(LEG_JITTER_MIN, LEG_JITTER_MAX, 'worldTick'));

  const elapsed = elapsedHours(state);

  // THE WEAR CURVE, and the whole of its arithmetic. `span` is the effective drain length of
  // this leg: full `hours` below the knee, compressed above it. It is what every drain below
  // charges, while `hours` itself still drives the clock and the jitter — the curve buys the
  // player TIME, it does not slow the calendar down.
  const travel = state.wear.hours;
  const span = worn(travel + hours) - worn(travel);
  const crossed = wearBandAt(travel + hours);
  const bandChanged = crossed !== wearBandAt(travel);

  const harsh = HARSH_WEATHER.includes(state.weather) && hours >= HARSH_WEATHER_HOURS;
  const hunger = spanPoints(elapsed, span, HOURS_PER_HUNGER);
  const hygiene = spanPoints(elapsed, span, HOURS_PER_HYGIENE);
  // The `+ 1` is charged per LEG and stays OUTSIDE the curve on purpose: it is the one drain in
  // this file that is not a rate over time, so compressing it would be compressing a headcount.
  const energy =
    spanPoints(elapsed, span, HOURS_PER_ENERGY[state.transport.mode]) + (harsh ? 1 : 0);

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
  const health = healthCost(state.resources.hunger, elapsed, span);
  if (health > 0) effects.push({ op: 'resource', key: 'health', delta: -health });

  const morale = moraleCost(state.resources.energy, elapsed, span);
  if (morale > 0) effects.push({ op: 'resource', key: 'morale', delta: -morale });

  // The travel clock advances by REAL hours, never by the compressed span — `worn` is applied
  // at the point of drain so that the sweep can move `FULL_UNTIL` without every old save
  // carrying a figure baked against the previous value.
  const wear = {
    hours: travel + hours,
    chipKey: bandChanged ? wearChipKey(crossed) : null,
  };

  // Weather changes roughly one leg in four. The two draws and their arguments are UNCHANGED —
  // only the early `return` around them went, because the tick now has a tail to run.
  let weather = state.weather;
  if (rng.nextInt(0, 3, 'worldTick') === 0) {
    const next = rng.pick(WEATHERS, 'worldTick');
    // Weather is not an Effect op — it is world state the director reads, not something
    // content mutates — so it is set directly here rather than through the applier.
    if (next !== null && next !== state.weather) weather = next;
  }

  const applied = applyEffects(
    { ...state, wear, weather },
    effects,
    createEffectContext(TICK_SOURCE),
  ).state;

  if (!bandChanged) return applied;

  // The journal line, written on the POST-effects state so its `day` is the day the leg ended
  // on. It is written here rather than in `advanceLeg` because this is the function that owns
  // the accumulator, and the crossing is not observable anywhere else.
  return {
    ...applied,
    history: [...applied.history, wearHistoryEntry(applied, applied.route.legIndex, crossed)],
  };
}

/**
 * Hours the run has been going, WALL time — the PHASE every drain is charged against.
 *
 * It used to say "the clock is the only accumulator the drift needs", which the wear curve made
 * false: `state.wear.hours` is the second one. The two answer different questions and neither
 * substitutes for the other — this one places a span on the drain axis, that one says how tired
 * the road has made you.
 */
function elapsedHours(state: RunState): number {
  return state.clock.day * 24 + state.clock.hour;
}

/**
 * Points accrued by a span of `hours` from `before` hours elapsed, one point per `per` hours.
 *
 * **`hours` is the WORN span, not the leg's real duration**, since the wear curve landed. The
 * two are equal below the knee and diverge above it; `before` is the wall clock either way.
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
export function healthCost(hunger: number, before: number, span: number): number {
  if (hunger >= HUNGER_STARVING) return spanPoints(before, span, HOURS_PER_STARVING_DAMAGE);
  if (hunger >= HUNGER_HURTS) return spanPoints(before, span, HOURS_PER_HUNGER_DAMAGE);
  return 0;
}

/**
 * Morale lost to exhaustion over a leg's clock span. Single-rung on purpose — see
 * `ENERGY_TIRED` — and charged per hour since M3.10b, which is a rate change rather than a
 * grading. Exported for tests.
 */
export function moraleCost(energy: number, before: number, span: number): number {
  return energy <= ENERGY_TIRED ? spanPoints(before, span, HOURS_PER_MORALE) : 0;
}
