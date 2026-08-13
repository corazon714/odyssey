import { type ContentPack } from '../content/content-pack.ts';
import { advanceBeatSchedule, dueBeatSlot } from '../director/beat-slots.ts';
import {
  eventGate,
  quietGateParams,
  quietHistoryEntry,
  QUIET_GATE_REASON_KEY,
} from '../director/quiet-gate.ts';
import { duePendingEvents, selectEvent, type SelectionResult } from '../director/select-event.ts';
import { nextTension } from '../director/tension.ts';
import { engineError, type EngineError } from '../errors/engine-error.ts';
import { createPredicateContext } from '../predicate/predicate-context.ts';
import { consumePending, expirePending } from '../queue/expire-pending.ts';
import { type PendingDrop } from '../queue/pending-drop.ts';
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
      readonly queueDrops: readonly PendingDrop[];
      readonly beatsFilled: number;
      readonly beatsExpired: number;
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

  // Tension is recomputed AFTER the world tick and BEFORE selection, so the director scores
  // against the pressure the player is actually under this leg rather than last leg’s.
  next = { ...next, tension: nextTension(next, pack) };

  const failure = checkRunEnd(next);
  if (failure.ended) return { ok: true, ...endRun(next, failure, rng) };

  // Expire before selecting: an entry whose window closed must not be offered this leg, and
  // the drop is a real signal (scheduled, never became eligible) rather than housekeeping.
  const expired = expirePending(next.pendingEvents, legIndex);
  next = { ...next, pendingEvents: expired.pending };
  const queueDrops: PendingDrop[] = [...expired.dropped];

  // FORCED FIRE IS CHECKED FIRST (ADR 0029 D3). A due beat slot or a due queued event is never
  // gated: both are promises the run has already made. `isSlotOpen` keeps a slid slot open
  // across its whole window, so a real share of legs sit inside one and are unreachable by the
  // gate — MEASURED at 2,000 runs as 29.0% of corpus SELECTIONS and 33.5% of fixture ones,
  // essentially all of it beat-driven (the queue contributes 0.1%). The realised quiet share is
  // therefore `(1 − P) × (1 − forcedShare)`, not `(1 − P)`. Selections, not legs: the sim's
  // `legs` is a final leg INDEX and undercounts by one on a run that ends inside `resolveChoice`
  // (ADR 0029 addendum III), which is the population this identity has to be stated over.
  //
  // The scope string matches the one `selectEvent` builds, so the `{chance: p}` gates inside a
  // queued entry's `requires` answer identically at both call sites. They are cursor-free, so
  // asking twice costs no randomness (ADR 0005 decision 2).
  const gateCtx = createPredicateContext(next, pack.refs, `${next.route.id}:${String(legIndex)}`);
  const forced =
    dueBeatSlot(next.route, legIndex) !== null || duePendingEvents(next, pack, gateCtx).length > 0;

  const gate = forced ? null : eventGate(next, legIndex);
  const selection: SelectionResult =
    gate === null || gate.fires
      ? selectEvent(next, pack, rng)
      : {
          kind: 'quiet',
          reasonKey: QUIET_GATE_REASON_KEY,
          params: quietGateParams(gate, legIndex),
        };

  // Dedupe at fire time (ADR 0001): the promise that fired leaves the queue, and its siblings
  // go with it. Without this the queue never shrinks on success, every kept promise shows up
  // as an unresolved thread, and only maxOccurrences stops the payoff re-firing every leg of
  // its window — a filter doing the queue's job.
  if (selection.kind === 'event' && selection.fromQueue) {
    const consumed = consumePending(next.pendingEvents, selection.event.id, legIndex);
    next = { ...next, pendingEvents: consumed.pending };
    queueDrops.push(...consumed.dropped);
  }

  // Consume the beat schedule with what actually fired. A slot that reaches the end of its
  // slack unfilled expires and is reported — a beat-miss rate is a balance signal about
  // content, not an error.
  const beats = advanceBeatSchedule(
    next.route,
    legIndex,
    selection.kind === 'event' ? selection.event.beatType : null,
  );

  next = {
    ...next,
    route: { ...next.route, beatSchedule: beats.beatSchedule },
    rngCursors: rng.cursors(),
    // A QUIET LEG IS NOT A NO-OP. The clock has already advanced and the drift already applied
    // (`worldTick` above), and this is the journal line — without it a gated leg would vanish
    // from the run's own record and the journal would jump a day for no stated reason.
    //
    // It is written HERE because there is nowhere else it can be: `recordHistory` is reachable
    // only from `resolveChoice`, and a quiet leg presents no event and therefore no choice to
    // resolve. This is the first history entry `advanceLeg` has ever written — an `uneventful`
    // leg still writes none, which is why no golden digest can move while the base is 1:0.
    history:
      selection.kind === 'quiet'
        ? [...next.history, quietHistoryEntry(next, legIndex)]
        : next.history,
    presentation:
      selection.kind === 'event'
        ? {
            kind: 'event',
            eventId: selection.event.id,
            presentedAtLeg: legIndex,
            rung: selection.rung,
            // Persisted, not recomputed. resolveChoice runs on a later call against a state
            // this function has already rewritten, and a reload may swap the pack underneath
            // it — see the field's own docstring and ADR 0021.
            complicationId: selection.complication?.id ?? null,
          }
        : // `Presentation` REUSES its `uneventful` arm for a quiet leg (ADR 0029 D4). The shape
          // is byte-identical and `reasonKey` already carries the distinction, so there is no
          // fifth arm and NO `SAVE_VERSION` 6 — the save schema is untouched by this milestone.
          // `SelectionResult` splits them because it is an INSTRUMENT read by the sim; the
          // presentation is a SCREEN, and both cases draw the same one.
          { kind: 'uneventful', presentedAtLeg: legIndex, reasonKey: selection.reasonKey },
  };

  return {
    ok: true,
    state: next,
    selection,
    end: { ended: false },
    queueDrops,
    beatsFilled: beats.filled === null ? 0 : 1,
    beatsExpired: beats.expired.length,
  };
}

function endRun(
  state: RunState,
  verdict: RunEndVerdict & { ended: true },
  rng: ReturnType<typeof createRng>,
): {
  state: RunState;
  selection: null;
  end: RunEndVerdict;
  queueDrops: readonly PendingDrop[];
  beatsFilled: number;
  beatsExpired: number;
} {
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
    // The queue is NOT cleared on an ending. It feeds the journal's unresolved threads and
    // the sim's scheduled-but-never-fired line (see queue/unresolved-threads.ts).
    queueDrops: [],
    beatsFilled: 0,
    beatsExpired: 0,
  };
}
