import { type RunState } from '../state/run-state.ts';
import { appliedEffect, type AppliedEffect, type EffectApplication } from './applied-effect.ts';
import { applyCarriedEffect } from './apply-carried-effects.ts';
import { applyContainerEffect } from './apply-container-effects.ts';
import { applyMemoryEffect } from './apply-memory-effects.ts';
import { applyMeterEffect } from './apply-meter-effects.ts';
import { applyWorldEffect } from './apply-world-effects.ts';
import { type EffectContext } from './effect-context.ts';
import { type Effect } from './effect.ts';

/**
 * Apply one effect. Pure: the input state is never mutated.
 *
 * Returns the SAME state object when nothing changed, which is what makes
 * `structural-sharing.test.ts` able to assert anything — and what lets a caller cheaply
 * detect a no-op run of effects by identity.
 */
export function applyEffect(
  state: RunState,
  effect: Effect,
  ctx: EffectContext,
): { readonly state: RunState; readonly applied: AppliedEffect } {
  switch (effect.op) {
    case 'resource':
    case 'skill':
      return applyMeterEffect(state, effect);

    case 'flag':
    case 'clearFlag':
    case 'relationship':
    case 'scheduleEvent':
    case 'unlockEnding':
      return applyMemoryEffect(state, effect, ctx);

    case 'item':
    case 'moveItem':
    case 'loseContainer':
    case 'grantContainer':
      return applyContainerEffect(state, effect);

    case 'document':
      return applyCarriedEffect(state, effect);

    case 'advanceTime':
    case 'transport':
    case 'route':
      return applyWorldEffect(state, effect);

    default:
      return unknownOp(effect, state);
  }
}

/**
 * Apply a list in order, threading the state through.
 *
 * ORDER IS SIGNIFICANT and it is the author's. `[{ resource: money, delta: -40 },
 * { flag: broke }]` is not the same as the reverse if anything reads money in between —
 * and more importantly, reordering would change the applied log the journal renders.
 *
 * INVARIANT: `applied.length === effects.length`. Every effect produces a record even when
 * it changed nothing, so an effect can never be silently dropped — the failure mode where a
 * typo'd op quietly does nothing for a whole release.
 */
export function applyEffects(
  state: RunState,
  effects: readonly Effect[],
  ctx: EffectContext,
): EffectApplication {
  let current = state;
  const applied: AppliedEffect[] = [];

  for (const effect of effects) {
    const result = applyEffect(current, effect, ctx);
    current = result.state;
    applied.push(result.applied);
  }

  return { state: current, applied };
}

/**
 * Compile-time exhaustiveness, runtime tolerance.
 *
 * The `never` parameter means adding an op without handling it fails to compile. At runtime
 * this is still reachable — a save or content pack from a newer build — and the engine does
 * not throw, so the effect is recorded as an unchanged no-op and the run continues.
 */
function unknownOp(
  effect: never,
  state: RunState,
): { readonly state: RunState; readonly applied: AppliedEffect } {
  const op = (effect as { readonly op?: unknown } | null)?.op;
  return {
    state,
    applied: {
      ...appliedEffect(effect, false),
      labelKey: 'effect.unknown-op',
      params: { op: typeof op === 'string' ? op : 'unknown' },
    },
  };
}
