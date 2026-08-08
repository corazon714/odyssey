# 0007 — The predicate DSL, and the reason trace as a frozen contract

- **Status:** Accepted
- **Date:** 2026-08-08

## Context

`requires` is the mechanism ADR 0001 leans on entirely. In a Quality-Based Narrative there
is no authored edge between events — an event fires because a predicate over world state
holds. That makes the predicate evaluator the closest thing this engine has to a control
flow graph, and its output the closest thing to a stack trace.

It also has a second, less obvious job. Design pillar 2 (_legible randomness_) requires the
player be able to reconstruct why something happened, and Phase 7's motion system renders
that reconstruction as the dice modifier chips. So the evaluator's explanation is **user-
facing output**, not debug output.

---

## Decision 1 — Canonical `kind`-tagged union in the engine; content normalises

engine-spec §2 shows the authored form as key-as-discriminant: `{ resource: money, gte: 30 }`,
`{ not: { flag: bribed } }`. That is pleasant YAML and an unusable TypeScript type.

Narrowing key-as-discriminant needs `in` checks, which defeat `switch` exhaustiveness,
`noFallthroughCasesInSwitch` and `noImplicitReturns` — the three flags that make adding a
predicate kind safe. The engine's `Predicate` is therefore a `kind`-tagged union, and M5's
Zod schema normalises terse → canonical with `.transform()`.

Three things this buys:

- **Adding a kind is a compile error at every site that must handle it.** Verified, not
  asserted: injecting a `moonPhase` kind into the union fails with
  `TS2345: … not assignable to parameter of type 'never'` at the evaluator's exhaustiveness
  guard.
- Authors keep the short form the spec promises.
- The canonical form is what gets **persisted** in `pendingEvents[].requires`, so the save
  format is stable and independently versionable from the authoring syntax.

**Accepted cost:** engine tests write the verbose form. They are testing the evaluator, not
authoring content.

---

## Decision 2 — `ReasonNode` and `ReasonLine` are frozen from M3

```ts
type ReasonNode = {
  readonly kind: PredicateKind | 'unknown-ref' | 'unknown-kind';
  readonly value: boolean;
  readonly labelKey: string;
  readonly params: Readonly<Record<string, string | number | boolean>>;
  readonly children: readonly ReasonNode[];
};
```

Two user-facing consumers depend on this shape — the result screen (pillar 2) and Phase 7's
modifier chips (MO2) — and they are being built in different phases by different work. A
shape that drifts between them is a rewrite of both. **Changing either type needs an ADR.**

Specifics:

- **`labelKey` is always an i18n key** (CLAUDE.md 2.4), from a bounded set:
  `reason.<kind>` or `reason.<kind>.<op>`. Values live in `params` so translators get the
  numbers without needing a key per value. A test asserts the key shape and rejects prose.
- **`params` is JSON primitives only**, so a trace can be written into `history` or a bug
  report without a serialiser.
- **Leaves carry `EMPTY_REASONS`, not an optional field** — RunState's no-optional-property
  rule (ADR 0006 §1), and walkers never branch on undefined.
- Every leaf reports **`actual` alongside `required`**. A chip reading "money 12 / 30" is
  strictly more use than one reading "not enough money", and the number is most of the why.

`describeReason` flattens a trace to chips. Polarity is **not** the node's own value: under a
`not`, a leaf that was true is what made the requirement fail, so it renders as a `con`.
Inversion is tracked through the walk, so nested negation composes.

---

## Decision 3 — `all` and `any` do not short-circuit

A short-circuiting `all` stops at the first failing child and produces a chip list showing
one reason where three applied. That is precisely the legibility pillar 2 asks for, thrown
away to save nothing: predicates are a handful of nodes deep.

The trace is likewise built **eagerly**, even when the answer is obvious. A lazy trace would
have to re-evaluate to explain the selected event, and for a `chance` node re-evaluating
means asking the same question twice. (The genuinely expensive case — tracing every
_rejected_ candidate for debugging — is the director's `explain` flag in M7, not this
function's concern.)

**Empty `all` is true, empty `any` is false.** Both follow from `every`/`some`, and both are
what an author writing an empty list expects.

---

## Decision 4 — A missing content reference is not a false; a missing flag is

Asymmetric on purpose.

| Reference               | Missing means                  | Result                                         |
| ----------------------- | ------------------------------ | ---------------------------------------------- |
| npc, event, item, trait | content was renamed or deleted | `{ kind: 'unknown-ref' }`, value false         |
| flag                    | never set, or expired          | ordinary `flag` node, value per the comparison |

An unrecognised **content id** is a bug — ADR 0001 warns that content bugs in a QBN engine
are silent, and the sim report's "never-fired events" line is the only instrument that sees
them. Giving these their own node kind means the sim can count them instead of them
dissolving into a generic false.

An unrecognised **flag id** is not a bug. Flags are runtime data with no registry to be
missing from, and an old save may legitimately carry a retired one.

`unknown-kind` is the third case: a predicate kind from a newer build. It resolves to false
rather than throwing, per the engine's no-throw contract.

---

## Decision 5 — Flag TTL is applied at read time

`readFlag` returns null for an expired flag rather than a sweep deleting it.

A leg that never runs a housekeeping pass cannot then leave a stale flag readable, and the
entry survives with its `setAtLeg`, so "when did this happen" stays answerable after the flag
stops being true — which the journal wants.

`expiresAtLeg` is the leg at which the flag **stops** being true: `ttlLegs: 1` set at leg 4
gives `expiresAtLeg: 5` and reads as set on leg 4 only.

**`isSet` does not mean truthy.** A flag set to `false` or `0` is still set. Conflating them
breaks "you already tried this here" the moment someone stores a count instead of a boolean.

---

## Consequences

- The `chance` node is the only predicate touching randomness, and it consumes **no cursor** —
  see ADR 0005 decision 2 for why, and `chance-gate.test.ts` for the assertion that all
  cursors stay at zero across 50 evaluations.
- `PredicateContext` carries a `ContentRefs` interface rather than the content pack, so
  `predicate/` does not depend on `content/` (M5) and tests can stub it.
- The evaluator returns `{ value, trace }` rather than a bare boolean everywhere. Callers
  that only want the answer read `.value`; nothing is saved by offering both.
