import { createRunState } from '../../../state/create-run-state.ts';
import { createRunInit } from '../../../state/run-init.ts';
import { type RunState } from '../../../state/run-state.ts';
import { makeRoute } from '../../../state/__tests__/support/make-route.ts';
import {
  ALL_REFS_KNOWN,
  createPredicateContext,
  type ContentRefs,
  type PredicateContext,
} from '../../predicate-context.ts';

export function makeState(overrides: Partial<RunState> = {}): RunState {
  const result = createRunState(createRunInit('predicate-seed', 'content-v1', makeRoute()));
  if (!result.ok) throw new Error(`fixture route rejected: ${result.error.code}`);
  return { ...result.state, status: 'travelling', ...overrides };
}

export function makeContext(
  overrides: Partial<RunState> = {},
  refs: ContentRefs = ALL_REFS_KNOWN,
): PredicateContext {
  return createPredicateContext(makeState(overrides), refs, 'test.event:0');
}

/** A refs stub that knows nothing, for the unknown-ref path. */
export const NO_REFS_KNOWN: ContentRefs = Object.freeze({
  hasEvent: () => false,
  hasNpc: () => false,
  hasItem: () => false,
  hasTrait: () => false,
});
