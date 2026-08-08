import { type ContentPack } from '../content/content-pack.ts';
import { selectEvent, type SelectionResult } from '../director/select-event.ts';
import { engineError, type EngineError } from '../errors/engine-error.ts';
import { createRng } from '../rng/rng.ts';
import { type RunState } from '../state/run-state.ts';
import { checkRunEnd, type RunEndVerdict } from './check-run-end.ts';
import { worldTick } from './world-tick.ts';

/**
 * Move the run forward one leg and present whatever the director selected.
 *
 * The RNG is built from `(state.seed, state.rngCursors)` at the top and drained back at the
 * bottom. It is never injected: a caller-supplied generator whose cursors are not in state
 * would break replay, which is the one guarantee the engine exists to provide (ADR 0005).
 *
 * Order matters and is the balance-visible part: world tick runs BEFORE selection, so an
 * event is chosen against the state the player is actually in — hungry, after dark, low on
 * fuel — rather than against yesterday's.
 */
export type AdvanceLegResult =
  | { readonly ok: false; readonly error: EngineError }
  | {
      readonly ok: true;
      readonly state: RunState;
      readonly selection: SelectionResult | null;
      readonly end: RunEndVerdict;
    };

export function advanceLeg(state: RunState, pack: ContentPack): AdvanceLegResult {
  if (state.status === 'ended') {
    return { ok: false, error: engineError('loop/wrong-status', { status: state.status }) };
  }

  // A presented event must be resolved first. Silently discarding it would let the UI skip a
  // consequence, which is exactly the class of bug rule 2.7 exists to prevent.
  if (state.presentation.kind === 'event') {
    return {
      ok: false,
      error: engineError('loop/wrong-status', {
        status: state.status,
        presented: state.presentation.eventId,
      }),
    };
  }

  const rng = createRng(state.seed, state.rngCursors);

  // The first call leaves leg 0 in place and starts travelling; later calls step forward.
  const started = state.status === 'preparing';
  const legIndex = started ? 0 : state.route.legIndex + 1;

  let next: RunState = {
    ...state,
    status: 'travelling',
    route: { ...state.route, legIndex },
    presentation: { kind: 'none' },
  };

  const arrival = checkRunEnd(next);
  if (arrival.ended) return { ok: true, ...endRun(next, arrival, rng) };

  next = worldTick(next, rng);

  const failure = checkRunEnd(next);
  if (failure.ended) return { ok: true, ...endRun(next, failure, rng) };

  const selection = selectEvent(next, pack, rng);
  next = {
    ...next,
    rngCursors: rng.cursors(),
    presentation:
      selection.kind === 'event'
        ? {
            kind: 'event',
            eventId: selection.event.id,
            presentedAtLeg: legIndex,
            rung: selection.rung,
          }
        : { kind: 'uneventful', presentedAtLeg: legIndex, reasonKey: selection.reasonKey },
  };

  return { ok: true, state: next, selection, end: { ended: false } };
}

function endRun(
  state: RunState,
  verdict: RunEndVerdict & { ended: true },
  rng: ReturnType<typeof createRng>,
): { state: RunState; selection: null; end: RunEndVerdict } {
  const unlocked = [...state.unlockedEndings];
  for (const id of verdict.endingIds) {
    if (!unlocked.includes(id)) unlocked.push(id);
  }

  return {
    state: {
      ...state,
      status: 'ended',
      rngCursors: rng.cursors(),
      unlockedEndings: unlocked,
      presentation: { kind: 'none' },
    },
    selection: null,
    end: verdict,
  };
}
