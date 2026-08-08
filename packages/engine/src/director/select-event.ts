import { type ContentPack } from '../content/content-pack.ts';
import { type GameEvent } from '../content/game-event.ts';
import { evaluatePredicate } from '../predicate/evaluate-predicate.ts';
import { createPredicateContext, type PredicateContext } from '../predicate/predicate-context.ts';
import { type Rng } from '../rng/rng.ts';
import { type WeightedEntry } from '../rng/weighted-pick.ts';
import { type RunState } from '../state/run-state.ts';
import { type TextParams } from '../text-params.ts';
import { filterEvent, RELAX_NOTHING, type Relaxation } from './hard-filters.ts';

/**
 * What the director decided, as a discriminated union. IT NEVER THROWS.
 *
 * A content gap in one region must not become a hard crash in a player's 30-leg run, so the
 * failure mode is a typed `uneventful` result the loop can present. Every fallback is counted
 * and surfaces as engine-spec 6's "empty-pool fallbacks" line — the only instrument that can
 * see this class of problem.
 */
export type SelectionResult =
  | {
      readonly kind: 'event';
      readonly event: GameEvent;
      /** Relaxation rung reached. 0 = nothing relaxed. M6 only ever produces 0. */
      readonly rung: number;
      readonly fromQueue: boolean;
    }
  | { readonly kind: 'uneventful'; readonly reasonKey: string; readonly params: TextParams };

/**
 * M6's ladder, deliberately short: rung 0, then the filler pool, then `uneventful`.
 *
 * The full seven-rung ladder (beat gate → exclusiveGroup → soft context → cooldown →
 * locationTypes → filler → uneventful) lands in M7. Shipping it now would mean tuning
 * relaxation before anything can measure how often it fires.
 */
const M6_RUNGS: readonly Relaxation[] = [
  RELAX_NOTHING,
  { softContext: true, cooldown: true, locationTypes: true, exclusiveGroup: true },
];

export function selectEvent(state: RunState, pack: ContentPack, rng: Rng): SelectionResult {
  const ctx = createPredicateContext(
    state,
    pack.refs,
    `${state.route.id}:${String(state.route.legIndex)}`,
  );

  // 1. The consequence queue has priority. A scheduled event that is due and still satisfies
  //    its own gate fires ahead of the general pool — that is the whole point of the queue,
  //    and it is why the payoff rate is a headline number in the sim report.
  const due = duePendingEvents(state, pack, ctx);
  if (due.length > 0) {
    const picked = rng.pick(due, 'eventPick');
    if (picked !== null) return { kind: 'event', event: picked, rung: 0, fromQueue: true };
  }

  // 2. Walk the rungs. Candidates are drawn from the pack's CANONICAL order, so the pool is
  //    identical on every platform (ADR 0009 §3).
  for (const [rung, relax] of M6_RUNGS.entries()) {
    const eligible = pack.events.filter(
      (event) => filterEvent(event, state, pack, ctx, relax).eligible,
    );
    const picked = pickUniform(eligible, rng);
    if (picked !== null) return { kind: 'event', event: picked, rung, fromQueue: false };
  }

  // 3. The filler pool, ignoring context entirely.
  const fillers = pack.fillers.filter(
    (event) => evaluatePredicate(event.requires, ctx, `req:${event.id}`).value,
  );
  const filler = pickUniform(fillers, rng);
  if (filler !== null) {
    return { kind: 'event', event: filler, rung: M6_RUNGS.length, fromQueue: false };
  }

  // 4. Nothing at all. Tested against a pack with ZERO fillers, because `content-lint` does
  //    not exist and "the linter guarantees fillers" is an assertion with no enforcement.
  return {
    kind: 'uneventful',
    reasonKey: 'director.uneventful.emptyPool',
    params: { leg: state.route.legIndex, poolSize: pack.events.length },
  };
}

/**
 * Uniform selection in M6 — every eligible event carries weight 1.
 *
 * Authored weights and the six scoring factors arrive in M7. Using them now would mean
 * balancing a director nothing has measured, and a uniform pick makes an unreachable event
 * MORE visible in the sim rather than less.
 */
function pickUniform(events: readonly GameEvent[], rng: Rng): GameEvent | null {
  if (events.length === 0) return null;
  const entries: WeightedEntry<GameEvent>[] = events.map((event) => ({ value: event, weight: 1 }));
  return rng.weightedPick(entries, 'eventPick');
}

/** Queue entries that are in window, still exist in the pack, and pass their own gate. */
export function duePendingEvents(
  state: RunState,
  pack: ContentPack,
  ctx: PredicateContext,
): readonly GameEvent[] {
  const leg = state.route.legIndex;
  const out: GameEvent[] = [];

  for (const pending of state.pendingEvents) {
    if (leg < pending.earliestLeg || leg > pending.latestLeg) continue;

    // A target that no longer exists is DROPPED, not an error. ADR 0001: if a scheduled
    // event disappears the entry is a no-op, never a broken link.
    const event = pack.byId.get(pending.eventId);
    if (event === undefined) continue;

    if (pending.requires !== null) {
      if (!evaluatePredicate(pending.requires, ctx, `queue:${pending.eventId}`).value) continue;
    }
    if (!filterEvent(event, state, pack, ctx).eligible) continue;

    out.push(event);
  }

  return out;
}
