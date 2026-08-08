import { applyEffects } from '../effects/apply-effects.ts';
import { createEffectContext } from '../effects/effect-context.ts';
import { type Effect } from '../effects/effect.ts';
import { eventId } from '../ids/content-ids.ts';
import { type Rng } from '../rng/rng.ts';
import { type RunState } from '../state/run-state.ts';
import { type TransportMode } from '../state/transport-state.ts';

/**
 * What a leg costs whether or not anything happens.
 *
 * Every number here is a BALANCE PLACEHOLDER. They exist so the loop can run and the sim can
 * measure; M7/M10 tune them against real distributions. They are gathered in one place rather
 * than scattered through the loop precisely so that tuning is a diff to this file.
 *
 * `uneventful` legs run this too — a leg where nothing happened must still cost time and
 * wear, or a run can contain six legs of nothing, which reads as a bug to the player and
 * corrupts the sim's median-days line.
 */
const HOURS_PER_LEG: Readonly<Record<TransportMode, number>> = {
  foot: 9,
  bus: 5,
  train: 4,
  car: 5,
  truck: 6,
  ferry: 7,
  rideshare: 5,
};

const WEATHERS = ['clear', 'rain', 'fog', 'wind', 'heat'] as const;

const TICK_SOURCE = eventId('engine.world_tick');

export function worldTick(state: RunState, rng: Rng): RunState {
  const base = HOURS_PER_LEG[state.transport.mode];
  // Jitter so two legs of the same mode are not identical. Drawn from `worldTick`, so adding
  // director draws later cannot shift the weather or the clock.
  const hours = base + rng.nextInt(-1, 2, 'worldTick');

  const legShare = state.route.legCount > 0 ? state.route.totalKm / state.route.legCount : 0;

  const effects: Effect[] = [
    { op: 'advanceTime', hours },
    { op: 'route', change: { field: 'progressKm', delta: Math.round(legShare) } },
    { op: 'resource', key: 'hunger', delta: 1 },
    { op: 'resource', key: 'energy', delta: -1 },
  ];

  // Hygiene erodes at half rate, so it is a slow pressure rather than a second hunger.
  if (state.route.legIndex % 2 === 0) {
    effects.push({ op: 'resource', key: 'hygiene', delta: -1 });
  }

  // Hunger and exhaustion cost health once they bite. This is the main failure pressure in
  // M6 — without it every run completes and the sim's completion rate says nothing.
  if (state.resources.hunger >= 8) effects.push({ op: 'resource', key: 'health', delta: -1 });
  if (state.resources.energy <= 1) effects.push({ op: 'resource', key: 'morale', delta: -1 });

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
