import { advanceClock } from '../state/clock-state.ts';
import { clampValue } from '../state/clamp-event.ts';
import { TRANSPORT_MAX, TRANSPORT_MIN } from '../state/transport-state.ts';
import { type RunState } from '../state/run-state.ts';
import { appliedEffect, type AppliedEffect } from './applied-effect.ts';
import { type Effect } from './effect.ts';

/**
 * Time, transport and route position.
 *
 * `route` deliberately cannot change the ROUTE, only the position along it. Re-routing needs
 * pending-event rebasing to exist first (M8) and route generation to exist at all (Phase 2),
 * so an effect that could swap the node list now would be a way to corrupt a run.
 */
type WorldEffect = Extract<Effect, { op: 'advanceTime' | 'transport' | 'route' }>;

export type WorldResult = { readonly state: RunState; readonly applied: AppliedEffect };

export function applyWorldEffect(state: RunState, effect: WorldEffect): WorldResult {
  switch (effect.op) {
    case 'advanceTime': {
      // advanceClock refuses to move time backwards, so a negative delta is a noop rather
      // than a way to revisit a past day and break every deadline.
      const clock = advanceClock(state.clock, effect.hours);
      if (clock.day === state.clock.day && clock.hour === state.clock.hour) {
        return { state, applied: appliedEffect(effect, false, { hours: effect.hours }) };
      }
      return {
        state: { ...state, clock },
        applied: appliedEffect(effect, true, {
          hours: effect.hours,
          day: clock.day,
          hour: clock.hour,
        }),
      };
    }

    case 'transport':
      return applyTransport(state, effect);

    case 'route':
      return applyRoute(state, effect);

    default:
      return unreachable(effect, state);
  }
}

function applyTransport(
  state: RunState,
  effect: Extract<Effect, { op: 'transport' }>,
): WorldResult {
  const { change } = effect;

  switch (change.field) {
    case 'mode': {
      if (state.transport.mode === change.mode && state.transport.vehicleId === change.vehicleId) {
        return { state, applied: appliedEffect(effect, false, { mode: change.mode }) };
      }
      return {
        state: {
          ...state,
          transport: { ...state.transport, mode: change.mode, vehicleId: change.vehicleId },
        },
        applied: appliedEffect(effect, true, { mode: change.mode }),
      };
    }

    case 'condition':
    case 'fuel': {
      const key = change.field;
      const before = state.transport[key];
      const { applied, clamp } = clampValue(
        key,
        before + change.delta,
        TRANSPORT_MIN,
        TRANSPORT_MAX,
      );
      if (applied === before) {
        return { state, applied: appliedEffect(effect, false, { key, requested: change.delta }) };
      }
      return {
        state: { ...state, transport: { ...state.transport, [key]: applied } },
        applied: appliedEffect(
          effect,
          true,
          { key, requested: change.delta, applied: applied - before, after: applied },
          clamp === null ? [] : [clamp],
        ),
      };
    }

    case 'legal': {
      if (state.transport.legal === change.legal) {
        return { state, applied: appliedEffect(effect, false, { legal: change.legal }) };
      }
      return {
        state: { ...state, transport: { ...state.transport, legal: change.legal } },
        applied: appliedEffect(effect, true, { legal: change.legal }),
      };
    }

    default:
      return unreachableChange(change, state, effect);
  }
}

function applyRoute(state: RunState, effect: Extract<Effect, { op: 'route' }>): WorldResult {
  const { change } = effect;

  switch (change.field) {
    case 'progressKm': {
      const before = state.route.progressKm;
      // Clamped to the route: progress cannot go negative or overshoot the destination.
      const { applied } = clampValue('progressKm', before + change.delta, 0, state.route.totalKm);
      if (applied === before) {
        return { state, applied: appliedEffect(effect, false, { requested: change.delta }) };
      }
      return {
        state: { ...state, route: { ...state.route, progressKm: applied } },
        applied: appliedEffect(effect, true, {
          requested: change.delta,
          applied: applied - before,
          progressKm: applied,
        }),
      };
    }

    case 'beatStatus': {
      let found = false;
      const beatSchedule = state.route.beatSchedule.map((slot) => {
        if (slot.legIndex !== change.legIndex || slot.status === change.status) return slot;
        found = true;
        return { ...slot, status: change.status };
      });

      if (!found) {
        return { state, applied: appliedEffect(effect, false, { legIndex: change.legIndex }) };
      }
      return {
        state: { ...state, route: { ...state.route, beatSchedule } },
        applied: appliedEffect(effect, true, {
          legIndex: change.legIndex,
          status: change.status,
        }),
      };
    }

    default:
      return unreachableChange(change, state, effect);
  }
}

function unreachable(effect: never, state: RunState): WorldResult {
  void effect;
  return { state, applied: appliedEffect({ op: 'advanceTime', hours: 0 } as never, false) };
}

function unreachableChange(change: never, state: RunState, effect: Effect): WorldResult {
  void change;
  return { state, applied: appliedEffect(effect, false) };
}
