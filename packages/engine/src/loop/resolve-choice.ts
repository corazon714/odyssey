import { type ContentPack } from '../content/content-pack.ts';
import { type Choice, type GameEvent, type Outcome } from '../content/game-event.ts';
import { applyEffects } from '../effects/apply-effects.ts';
import { createEffectContext } from '../effects/effect-context.ts';
import { type AppliedEffect } from '../effects/applied-effect.ts';
import { PHASE_1_MODIFIER_SOURCES } from '../effects/modifier-source.ts';
import { engineError, type EngineError } from '../errors/engine-error.ts';
import { type ChoiceId } from '../ids/content-ids.ts';
import { evaluatePredicate } from '../predicate/evaluate-predicate.ts';
import { createPredicateContext } from '../predicate/predicate-context.ts';
import { createRng, type Rng } from '../rng/rng.ts';
import { type RollResult } from '../rng/roll-result.ts';
import { type WeightedEntry } from '../rng/weighted-pick.ts';
import { type RunState } from '../state/run-state.ts';
import { checkRunEnd, type RunEndVerdict } from './check-run-end.ts';
import { runSkillCheck } from './run-skill-check.ts';

/**
 * Resolve the presented event with the chosen option.
 *
 * The sequence is fixed and each step is observable in the returned log: pay costs, run the
 * check, pick an outcome, apply its effects, record history. Costs are paid BEFORE the check
 * so a failed bribe still costs the money — which is the design the spec's example implies
 * and the more interesting one.
 */
export type ResolveChoiceResult =
  | { readonly ok: false; readonly error: EngineError }
  | {
      readonly ok: true;
      readonly state: RunState;
      readonly outcome: Outcome | null;
      readonly check: RollResult | null;
      readonly applied: readonly AppliedEffect[];
      readonly end: RunEndVerdict;
    };

export function resolveChoice(
  state: RunState,
  pack: ContentPack,
  choiceId: ChoiceId,
): ResolveChoiceResult {
  if (state.status !== 'travelling') {
    return { ok: false, error: engineError('loop/wrong-status', { status: state.status }) };
  }
  if (state.presentation.kind !== 'event') {
    return { ok: false, error: engineError('loop/no-presented-event', {}) };
  }

  const event = pack.byId.get(state.presentation.eventId);
  if (event === undefined) {
    return {
      ok: false,
      error: engineError('loop/no-presented-event', { eventId: state.presentation.eventId }),
    };
  }

  const rng = createRng(state.seed, state.rngCursors);
  const ctx = createPredicateContext(
    state,
    pack.refs,
    `${event.id}:${String(state.route.legIndex)}`,
  );

  const choice = event.choices.find((c) => c.id === choiceId);
  if (choice === undefined) {
    return { ok: false, error: engineError('loop/unknown-choice', { choiceId, event: event.id }) };
  }
  // A choice the UI should not have offered is refused rather than silently allowed — the
  // engine is the authority on legality, not the screen (CLAUDE.md 2.7).
  if (!evaluatePredicate(choice.requires, ctx, `choice:${choice.id}`).value) {
    return {
      ok: false,
      error: engineError('loop/unknown-choice', { choiceId, reason: 'requires' }),
    };
  }

  const effectCtx = createEffectContext(event.id);
  const applied: AppliedEffect[] = [];

  let next = state;
  const costs = applyEffects(next, choice.costs, effectCtx);
  next = costs.state;
  applied.push(...costs.applied);

  const check =
    choice.skillCheck === null
      ? null
      : runSkillCheck(
          choice.skillCheck,
          createPredicateContext(next, pack.refs, `${event.id}:${String(next.route.legIndex)}`),
          rng,
          PHASE_1_MODIFIER_SOURCES,
        );

  const outcome = pickOutcome(choice, check, next, pack, rng);
  if (outcome !== null) {
    const effects = applyEffects(next, outcome.effects, effectCtx);
    next = effects.state;
    applied.push(...effects.applied);
  }

  next = recordHistory(next, event, choice, outcome);
  next = { ...next, rngCursors: rng.cursors(), presentation: { kind: 'none' } };

  const end = checkRunEnd(next);
  if (end.ended) {
    const unlocked = [...next.unlockedEndings];
    for (const id of end.endingIds) if (!unlocked.includes(id)) unlocked.push(id);
    next = { ...next, status: 'ended', unlockedEndings: unlocked };
  }

  return { ok: true, state: next, outcome, check, applied, end };
}

/**
 * Choose among the outcomes whose gate holds.
 *
 * Returning null when nothing is eligible is deliberate. A choice whose every outcome is
 * gated out is a CONTENT bug, and the honest response is to resolve with no effects and let
 * the sim count it — throwing would take down a run over an authoring mistake, and silently
 * applying an ineligible outcome would hide the mistake entirely.
 */
export function pickOutcome(
  choice: Choice,
  check: RollResult | null,
  state: RunState,
  pack: ContentPack,
  rng: Rng,
): Outcome | null {
  const ctx = createPredicateContext(state, pack.refs, `outcome:${choice.id}`);

  const entries: WeightedEntry<Outcome>[] = [];
  for (const outcome of choice.outcomes) {
    if (outcome.onCheck !== null) {
      if (check === null) continue;
      if (outcome.onCheck === 'success' && !check.success) continue;
      if (outcome.onCheck === 'failure' && check.success) continue;
    }
    if (!evaluatePredicate(outcome.requires, ctx, `out:${choice.id}`).value) continue;
    if (outcome.weight > 0) entries.push({ value: outcome, weight: outcome.weight });
  }

  return rng.weightedPick(entries, 'outcomeRoll');
}

function recordHistory(
  state: RunState,
  event: GameEvent,
  choice: Choice,
  outcome: Outcome | null,
): RunState {
  const previous = state.eventMemory[event.id];

  return {
    ...state,
    eventMemory: {
      ...state.eventMemory,
      [event.id]: {
        count: (previous?.count ?? 0) + 1,
        lastLeg: state.route.legIndex,
        lastChoiceId: choice.id,
      },
    },
    history: [
      ...state.history,
      {
        legIndex: state.route.legIndex,
        day: state.clock.day,
        eventId: event.id,
        choiceId: choice.id,
        textKey: outcome?.textKey ?? 'events.outcome.none',
        params: {},
        // Tags are copied from the event at fire time rather than looked up later, so the
        // run's own history stays the source of truth for its pacing even after a content
        // update (M7's tag-saturation penalty reads this).
        tags: event.tags,
      },
    ],
  };
}
