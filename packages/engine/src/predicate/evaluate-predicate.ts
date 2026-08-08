import { evaluateMemoryLeaf } from './evaluate-memory-leaf.ts';
import { evaluateStateLeaf } from './evaluate-state-leaf.ts';
import { evaluateWorldLeaf } from './evaluate-world-leaf.ts';
import { type PredicateContext } from './predicate-context.ts';
import { type Predicate } from './predicate.ts';
import { EMPTY_REASONS, leafReason, type ReasonNode } from './reason-node.ts';

export type PredicateResult = {
  readonly value: boolean;
  readonly trace: ReasonNode;
};

/**
 * Evaluate a predicate against a run, producing both an answer and the reasoning.
 *
 * The trace is always built, even when the answer is obvious. Building it lazily was
 * considered and rejected: the director needs the trace on the SELECTED event to explain
 * itself, and it does not know which event that is until after scoring — so a lazy path
 * would have to re-evaluate, which for a `chance` node means asking a question twice. (The
 * expensive case, tracing every REJECTED candidate for debugging, is the director's
 * `explain` flag in M7, not this function's problem.)
 *
 * `path` addresses a node's position in the tree, and exists for `chance`: two gates in one
 * predicate must not share an address. Callers pass the root path.
 *
 * NO SHORT-CIRCUIT in `all`/`any`. A short-circuiting `all` would stop at the first failure
 * and produce a chip list showing one reason where three applied, which is exactly the
 * legibility design pillar 2 asks for. Predicates are tiny; the cost is nil.
 */
export function evaluatePredicate(
  predicate: Predicate,
  ctx: PredicateContext,
  path = 'r',
): PredicateResult {
  const trace = traceOf(predicate, ctx, path);
  return { value: trace.value, trace };
}

function traceOf(predicate: Predicate, ctx: PredicateContext, path: string): ReasonNode {
  switch (predicate.kind) {
    case 'always':
      return leafReason('always', true, 'reason.always');

    case 'never':
      return leafReason('never', false, 'reason.never');

    case 'all': {
      const children = predicate.of.map((child, i) => traceOf(child, ctx, `${path}.${i}`));
      return {
        kind: 'all',
        value: children.every((child) => child.value),
        labelKey: 'reason.all',
        params: { count: children.length },
        children,
      };
    }

    case 'any': {
      const children = predicate.of.map((child, i) => traceOf(child, ctx, `${path}.${i}`));
      return {
        kind: 'any',
        // An empty `any` is FALSE (nothing satisfied it) while an empty `all` is TRUE
        // (nothing failed). Both follow from every/some, and both are what an author writing
        // an empty list would expect.
        value: children.some((child) => child.value),
        labelKey: 'reason.any',
        params: { count: children.length },
        children,
      };
    }

    case 'not': {
      const child = traceOf(predicate.of, ctx, `${path}.0`);
      return {
        kind: 'not',
        value: !child.value,
        labelKey: 'reason.not',
        params: {},
        children: [child],
      };
    }

    case 'resource':
    case 'skill':
    case 'language':
    case 'trait':
    case 'item':
    case 'passport':
    case 'visa':
    case 'transportMode':
    case 'transportStat':
    case 'vehicleLegal':
      return evaluateStateLeaf(predicate, ctx);

    case 'flag':
    case 'relationship':
    case 'npcMet':
    case 'eventMemory':
      return evaluateMemoryLeaf(predicate, ctx);

    case 'weather':
    case 'locationType':
    case 'timeOfDay':
    case 'routeProfile':
    case 'status':
    case 'leg':
    case 'day':
    case 'tension':
    case 'chance':
      return evaluateWorldLeaf(predicate, ctx, path);

    default:
      return unknownKind(predicate);
  }
}

/**
 * Compile-time exhaustiveness with runtime safety.
 *
 * The `never` parameter means adding a kind to Predicate without handling it above fails to
 * compile. At runtime this is still reachable — a save or content pack from a newer build
 * can carry a kind this one has never heard of — and the engine does not throw, so it
 * resolves to false with a distinguishable node.
 */
function unknownKind(predicate: never): ReasonNode {
  const kind = (predicate as { readonly kind?: unknown } | null)?.kind;
  return {
    kind: 'unknown-kind',
    value: false,
    labelKey: 'reason.unknown-kind',
    params: { kind: typeof kind === 'string' ? kind : 'unknown' },
    children: EMPTY_REASONS,
  };
}
