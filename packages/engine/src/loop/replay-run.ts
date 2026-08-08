import { type ContentPack } from '../content/content-pack.ts';
import { engineError, type EngineError } from '../errors/engine-error.ts';
import { type ChoiceId } from '../ids/content-ids.ts';
import { createRunState } from '../state/create-run-state.ts';
import { type RunInit } from '../state/run-init.ts';
import { type RunState } from '../state/run-state.ts';
import { stateDigest } from '../state/state-digest.ts';
import { advanceLeg } from './advance-leg.ts';
import { resolveChoice } from './resolve-choice.ts';

/**
 * Replay a run from `(seed, choiceSequence, contentVersion)`.
 *
 * This is the function CLAUDE.md rule 2.3 is really about, and ADR 0002 named as the only
 * backstop that survives a determined violation of the lint rules. Everything else in the
 * engine — the counter-based RNG, the canonical pack ordering, the integer weights, the ban
 * on transcendental math — exists so that this can be an equality rather than an
 * approximation.
 *
 * A `contentVersion` MISMATCH IS REFUSED, not tolerated. The reconciliation policy is
 * deliberately generous to players (a content update must not delete an in-progress run), but
 * replay is the test that proves determinism, and a tolerant replay proves nothing. The two
 * policies point in opposite directions on purpose.
 */
export type ReplayResult =
  | { readonly ok: false; readonly error: EngineError }
  | {
      readonly ok: true;
      readonly state: RunState;
      readonly digest: string;
      /** The outcome text keys, in order. A digest alone can be too coarse to notice a swap. */
      readonly historyKeys: readonly string[];
      /** How many choices the sequence actually consumed. */
      readonly consumed: number;
      /** True when the run ended before the sequence ran out. */
      readonly ended: boolean;
    };

const MAX_TURNS = 500;

export function replayRun(
  init: RunInit,
  pack: ContentPack,
  choiceSequence: readonly ChoiceId[],
): ReplayResult {
  if (init.contentVersion !== pack.version) {
    return {
      ok: false,
      error: engineError('replay/content-version-mismatch', {
        expected: init.contentVersion,
        actual: pack.version,
      }),
    };
  }

  const created = createRunState(init);
  if (!created.ok) return { ok: false, error: created.error };

  let state = created.state;
  let consumed = 0;
  let turns = 0;

  while (state.status !== 'ended' && turns < MAX_TURNS) {
    turns += 1;

    const advanced = advanceLeg(state, pack);
    if (!advanced.ok) return { ok: false, error: advanced.error };
    state = advanced.state;

    if (advanced.selection?.kind !== 'event') continue;

    const choiceId = choiceSequence[consumed];
    // Running out of recorded choices is not an error: a golden run may deliberately cover
    // only the first N decisions. The digest is taken wherever it stops.
    if (choiceId === undefined) break;
    consumed += 1;

    const resolved = resolveChoice(state, pack, choiceId);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    state = resolved.state;
  }

  return {
    ok: true,
    state,
    digest: stateDigest(state),
    historyKeys: state.history.map((entry) => entry.textKey),
    consumed,
    ended: state.status === 'ended',
  };
}
