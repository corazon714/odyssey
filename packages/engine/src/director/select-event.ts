import { type ContentPack } from '../content/content-pack.ts';
import { type GameEvent } from '../content/game-event.ts';
import { evaluatePredicate } from '../predicate/evaluate-predicate.ts';
import { createPredicateContext, type PredicateContext } from '../predicate/predicate-context.ts';
import { type Rng } from '../rng/rng.ts';
import { type WeightedEntry } from '../rng/weighted-pick.ts';
import { type RunState } from '../state/run-state.ts';
import { type TextParams } from '../text-params.ts';
import {
  collectComplications,
  EMPTY_COMPLICATIONS,
  PHASE_1_COMPLICATION_SOURCES,
  type Complication,
  type ComplicationSource,
} from './complication-source.ts';
import { type RegistryComplication } from '../content/registry-complication.ts';
import { filterEvent } from './hard-filters.ts';
import { selectComplication } from './select-complication.ts';
import { FILLER_RUNG, RELAXATION_RUNGS, UNEVENTFUL_RUNG } from './relaxation-rung.ts';
import { pickWeight } from './score-event.ts';

/**
 * What the director decided, as a discriminated union. IT NEVER THROWS.
 *
 * A content gap in one region must not become a hard crash in a player's 30-leg run, so the
 * failure mode is a typed `uneventful` result the loop can present. Every fallback carries the
 * rung it reached, which surfaces as engine-spec 6's "empty-pool fallbacks" line — the only
 * instrument that can see this class of problem.
 */
export type SelectionResult =
  | {
      readonly kind: 'event';
      readonly event: GameEvent;
      /** Relaxation rung reached. 0 = nothing relaxed. */
      readonly rung: number;
      readonly fromQueue: boolean;
      readonly complications: readonly Complication[];
      /**
       * The registry row the director attached, or null.
       *
       * Distinct from `complications` above, which is the Phase 1 seam's DISPLAY chips and
       * still works exactly as it did. This is the authored row that carries `checkDelta`,
       * `addsChoice` and `removesChoice` — the mechanical half. `advanceLeg` persists its id
       * so `resolveChoice` resolves the same one on the next call.
       */
      readonly complication: RegistryComplication | null;
    }
  | { readonly kind: 'uneventful'; readonly reasonKey: string; readonly params: TextParams };

export type SelectOptions = {
  readonly complicationSources: readonly ComplicationSource[];
};

const DEFAULT_OPTIONS: SelectOptions = Object.freeze({
  complicationSources: PHASE_1_COMPLICATION_SOURCES,
});

export function selectEvent(
  state: RunState,
  pack: ContentPack,
  rng: Rng,
  opts: SelectOptions = DEFAULT_OPTIONS,
): SelectionResult {
  const ctx = createPredicateContext(
    state,
    pack.refs,
    `${state.route.id}:${String(state.route.legIndex)}`,
  );

  const chosen = choose(state, pack, rng, ctx);
  if (chosen === null) {
    return {
      kind: 'uneventful',
      reasonKey: 'director.uneventful.emptyPool',
      params: { leg: state.route.legIndex, poolSize: pack.events.length, rung: UNEVENTFUL_RUNG },
    };
  }

  // The registry, post-selection. Cursor-free (see `selectComplication`), so it consumes no
  // randomness at all — the promise the Phase 1 seam made about `encounterFlavor` is kept
  // more strictly than it needed to be, and no golden digest can move for this reason ever.
  const complication = selectComplication(
    chosen.event,
    state.seed,
    state.route.legIndex,
    pack.complications,
    ctx,
  );

  // The Phase 1 seam, unchanged and still empty by default. It produces DISPLAY chips; the
  // row above carries the mechanics. Keeping both means the seam's test — a stub source whose
  // output must reach the caller — still asserts something real.
  return {
    ...chosen,
    complication,
    complications:
      opts.complicationSources.length === 0
        ? EMPTY_COMPLICATIONS
        : collectComplications(chosen.event, state, rng, opts.complicationSources),
  };
}

type Chosen = { kind: 'event'; event: GameEvent; rung: number; fromQueue: boolean };

function choose(
  state: RunState,
  pack: ContentPack,
  rng: Rng,
  ctx: PredicateContext,
): Chosen | null {
  // 1. The consequence queue has priority. A scheduled event that is due and still satisfies
  //    its own gate fires ahead of the general pool — the whole point of the queue, and why
  //    the payoff rate is a headline number in the sim report.
  const due = duePendingEvents(state, pack, ctx);
  if (due.length > 0) {
    const picked = rng.pick(due, 'eventPick');
    if (picked !== null) return { kind: 'event', event: picked, rung: 0, fromQueue: true };
  }

  // 2. Walk the rungs. Candidates come from the pack's CANONICAL order, so the pool — and
  //    therefore the weighted accumulation — is identical on every platform (ADR 0009 §3).
  for (const [rung, relax] of RELAXATION_RUNGS.entries()) {
    const claimed = claimedGroups(state, pack);
    const eligible = pack.events.filter(
      (event) => filterEvent(event, state, pack, ctx, relax, claimed).eligible,
    );
    const picked = pickScored(eligible, state, rng);
    if (picked !== null) return { kind: 'event', event: picked, rung, fromQueue: false };
  }

  // 3. The filler pool, context ignored entirely. `requires` still holds.
  const fillers = pack.fillers.filter(
    (event) => evaluatePredicate(event.requires, ctx, `req:${event.id}`).value,
  );
  const filler = pickScored(fillers, state, rng);
  if (filler !== null) return { kind: 'event', event: filler, rung: FILLER_RUNG, fromQueue: false };

  return null;
}

/** Weight-proportional selection over the six scoring factors. */
function pickScored(events: readonly GameEvent[], state: RunState, rng: Rng): GameEvent | null {
  if (events.length === 0) return null;

  const entries: WeightedEntry<GameEvent>[] = events.map((event) => ({
    value: event,
    weight: pickWeight(event, state),
  }));

  return rng.weightedPick(entries, 'eventPick');
}

/**
 * Groups already used this leg.
 *
 * M6 presented one event per leg, so this was always empty. It is derived from `history`
 * rather than tracked in a new field, so it cannot drift out of step with what actually
 * fired — and it costs nothing while one-event-per-leg holds.
 */
function claimedGroups(state: RunState, pack: ContentPack): ReadonlySet<string> {
  const claimed = new Set<string>();
  for (let i = state.history.length - 1; i >= 0; i -= 1) {
    const entry = state.history[i];
    if (entry === undefined || entry.legIndex !== state.route.legIndex) break;
    if (entry.eventId === null) continue;
    const group = pack.byId.get(entry.eventId)?.exclusiveGroup;
    if (group !== undefined && group !== null) claimed.add(group);
  }
  return claimed;
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
