import { type EventId, type ItemId, type NpcId, type TraitId } from '../ids/content-ids.ts';
import { deriveKey, streamKey } from '../rng/stream-key.ts';
import { type RunState } from '../state/run-state.ts';

/**
 * What the evaluator needs to know about the content pack.
 *
 * An interface rather than the pack itself, so `predicate/` does not depend on `content/`
 * (which lands in M5) and so tests can supply a stub. M5's ContentPack satisfies it.
 */
export type ContentRefs = {
  hasEvent(id: EventId): boolean;
  hasNpc(id: NpcId): boolean;
  hasItem(id: ItemId): boolean;
  hasTrait(id: TraitId): boolean;
};

/** Accepts every id. For tests, and for evaluation before a pack is loaded. */
export const ALL_REFS_KNOWN: ContentRefs = Object.freeze({
  hasEvent: () => true,
  hasNpc: () => true,
  hasItem: () => true,
  hasTrait: () => true,
});

export type PredicateContext = {
  readonly state: RunState;
  readonly refs: ContentRefs;
  /**
   * Base key for `chance` nodes, derived once from the run seed. Cursor-free: see ADR 0005
   * decision 2 for why a chance gate must not consume `eventPick`.
   */
  readonly chanceKey: number;
  /**
   * What the predicate is being evaluated FOR — typically `<eventId>:<legIndex>`. Combined
   * with the node's path in the tree, it addresses one specific gate, so two different
   * events asking for a 30% chance on the same leg get independent answers, and re-asking
   * the same question gives the same answer.
   */
  readonly chanceScope: string;
};

export function createPredicateContext(
  state: RunState,
  refs: ContentRefs,
  chanceScope: string,
): PredicateContext {
  return {
    state,
    refs,
    chanceKey: streamKey(state.seed, 'chanceGate'),
    chanceScope,
  };
}

/** The address of one `chance` node: its scope plus its path within the predicate tree. */
export function chanceAddress(ctx: PredicateContext, path: string): number {
  return deriveKey(ctx.chanceKey, `${ctx.chanceScope}:${path}`);
}
