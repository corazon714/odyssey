import { clampValue } from '../state/clamp-event.ts';
import { RESOURCE_BOUNDS, type ResourceKey } from '../state/resources.ts';
import { type RunState } from '../state/run-state.ts';
import { SKILL_MAX, SKILL_MIN, type SkillKey } from '../state/skills.ts';
import { appliedEffect, type AppliedEffect } from './applied-effect.ts';
import { type Effect } from './effect.ts';

/**
 * The numeric meters: resources and skills.
 *
 * Both clamp, and both REPORT the clamp. `{ delta: -40 }` against a player holding 12 spends
 * 12, and the log says so — `{ requested: -40, applied: -12 }` plus a ClampEvent. Without
 * that, a sim report showing money pinned at zero cannot distinguish "the economy is tuned
 * tight" from "half the costs in the game are silently free".
 */
type MeterEffect = Extract<Effect, { op: 'resource' | 'skill' }>;

export type MeterResult = { readonly state: RunState; readonly applied: AppliedEffect };

export function applyMeterEffect(state: RunState, effect: MeterEffect): MeterResult {
  return effect.op === 'resource'
    ? applyResource(state, effect, effect.key)
    : applySkill(state, effect, effect.key);
}

function applyResource(
  state: RunState,
  effect: Extract<Effect, { op: 'resource' }>,
  key: ResourceKey,
): MeterResult {
  const before = state.resources[key];
  const bounds = RESOURCE_BOUNDS[key];
  const { applied, clamp } = clampValue(key, before + effect.delta, bounds.min, bounds.max);

  if (applied === before) {
    return {
      state,
      applied: appliedEffect(effect, false, { key, requested: effect.delta, applied: 0, before }),
    };
  }

  return {
    // Structural sharing: only `resources` is rebuilt, so flags, history and the rest keep
    // object identity. A full clone per effect is pure waste across a 20k-run simulation.
    state: { ...state, resources: { ...state.resources, [key]: applied } },
    applied: appliedEffect(
      effect,
      true,
      { key, requested: effect.delta, applied: applied - before, before, after: applied },
      clamp === null ? [] : [clamp],
    ),
  };
}

function applySkill(
  state: RunState,
  effect: Extract<Effect, { op: 'skill' }>,
  key: SkillKey,
): MeterResult {
  const before = state.skills[key];
  const { applied, clamp } = clampValue(key, before + effect.delta, SKILL_MIN, SKILL_MAX);

  if (applied === before) {
    return {
      state,
      applied: appliedEffect(effect, false, { key, requested: effect.delta, applied: 0, before }),
    };
  }

  return {
    state: { ...state, skills: { ...state.skills, [key]: applied } },
    applied: appliedEffect(
      effect,
      true,
      { key, requested: effect.delta, applied: applied - before, before, after: applied },
      clamp === null ? [] : [clamp],
    ),
  };
}
