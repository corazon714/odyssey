/**
 * The `requires` DSL — a kind-tagged discriminated union.
 *
 * MINIMAL IN M2, EXPANDED IN M3. Only the two trivial nodes exist so far, because
 * PendingEvent needs the type to reference. Growing a union is additive, so nothing written
 * against it now needs rework.
 *
 * Why tagged rather than the terse `{ resource: money, gte: 30 }` shape engine-spec 2 shows
 * in YAML: key-as-discriminant cannot be a TypeScript discriminated union — narrowing needs
 * `in` checks, which defeat `switch` exhaustiveness, `noFallthroughCasesInSwitch` and
 * `noImplicitReturns`, and produce an evaluator nobody can extend safely. Authors keep the
 * terse YAML; M5's Zod schema normalises terse to canonical with `.transform()`. The
 * canonical form is what gets persisted in pendingEvents, so the save format is stable and
 * independently versionable.
 */
export type Predicate = { readonly kind: 'always' } | { readonly kind: 'never' };

export const ALWAYS: Predicate = Object.freeze({ kind: 'always' });
export const NEVER: Predicate = Object.freeze({ kind: 'never' });
