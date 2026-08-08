import { type ClampEvent } from '../state/clamp-event.ts';
import { type RunState } from '../state/run-state.ts';
import { NO_TEXT_PARAMS, type TextParams } from '../text-params.ts';
import { type Effect, type EffectOp } from './effect.ts';

/**
 * What an effect ACTUALLY did — not what it asked for.
 *
 * The distinction is the whole reason this type exists. `{ op: resource, key: money,
 * delta: -40 }` applied to a player holding 12 removes 12, not 40, and a log that records
 * the request rather than the result makes "money floors at 0 in 60% of runs after leg 15"
 * invisible to the simulation harness (engine-spec 6). `clamps` is how that shows up.
 *
 * `changed: false` is the noop case — a flag set to the value it already had, an item
 * removed that was not carried. Recording it rather than dropping it is what lets
 * `applied.length === effects.length` be an invariant, so an effect can never be silently
 * skipped.
 *
 * `labelKey` and `params` are what the journal and the result screen render (CLAUDE.md 2.4).
 */
export type AppliedEffect = {
  readonly op: EffectOp;
  readonly effect: Effect;
  readonly changed: boolean;
  readonly clamps: readonly ClampEvent[];
  readonly labelKey: string;
  readonly params: TextParams;
};

export type EffectApplication = {
  readonly state: RunState;
  readonly applied: readonly AppliedEffect[];
};

const NO_CLAMP_EVENTS: readonly ClampEvent[] = Object.freeze([]);

export function appliedEffect(
  effect: Effect,
  changed: boolean,
  params: TextParams = NO_TEXT_PARAMS,
  clamps: readonly ClampEvent[] = NO_CLAMP_EVENTS,
): AppliedEffect {
  return {
    op: effect.op,
    effect,
    changed,
    clamps,
    labelKey: `effect.${effect.op}${changed ? '' : '.noop'}`,
    params,
  };
}
