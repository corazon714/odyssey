import { type PredicateKind } from './predicate.ts';

/**
 * The evaluation trace. FROZEN CONTRACT from M3 — changing it needs an ADR.
 *
 * This is not debug output. Design pillar 2 requires the player be able to reconstruct why
 * something happened, and Phase 7's motion system (MO2) renders these as the dice modifier
 * chips — "no visa · night crossing · nervous demeanor". Two consumers, both user-facing.
 *
 * `labelKey` is always an i18n KEY, never prose (CLAUDE.md 2.4), and the key set is bounded:
 * `reason.<kind>` or `reason.<kind>.<op>`. Specifics live in `params` so translators get the
 * numbers without needing a key per value.
 *
 * `params` is restricted to JSON primitives so a trace can be persisted into `history` or a
 * bug report without a serialiser.
 *
 * Leaves carry EMPTY_REASONS rather than an optional field — RunState's no-optional-property
 * rule, and it means callers never branch on undefined while walking.
 */
export type ReasonParams = Readonly<Record<string, string | number | boolean>>;

export type ReasonNode = {
  readonly kind: PredicateKind | 'unknown-ref' | 'unknown-kind';
  readonly value: boolean;
  readonly labelKey: string;
  readonly params: ReasonParams;
  readonly children: readonly ReasonNode[];
};

export const EMPTY_REASONS: readonly ReasonNode[] = Object.freeze([]);
export const NO_PARAMS: ReasonParams = Object.freeze({});

export function leafReason(
  kind: ReasonNode['kind'],
  value: boolean,
  labelKey: string,
  params: ReasonParams = NO_PARAMS,
): ReasonNode {
  return { kind, value, labelKey, params, children: EMPTY_REASONS };
}

/**
 * A reference to content that does not exist in the pack — a renamed or deleted event, npc,
 * item or trait. Resolves to FALSE, but with its own node kind so the sim can count these
 * instead of them vanishing into a generic false (see the content-reconciliation policy).
 *
 * An unset FLAG is not this case: flags are runtime data, not content, so an unrecognised
 * flag id is simply a flag that was never set.
 */
export function unknownRefReason(refKind: string, id: string): ReasonNode {
  return leafReason('unknown-ref', false, 'reason.unknown-ref', { refKind, id });
}
