# 0008 — The Effect applier, and the seams Phase 2 plugs into

- **Status:** Accepted
- **Date:** 2026-08-08

## Context

CLAUDE.md rule 2.7 says every state mutation goes through an `Effect`, and rule 2.8 says the
engine is pure: `resolve(state, input) -> { state, log }`. M4 is where those become a
function. Effects are the write half of the contract whose read half is ADR 0007.

Two pressures shape it that a straightforward reducer would not feel: the applier runs
millions of times inside the simulation harness, and its output is read by the journal and
the sim report rather than only by the next reducer.

---

## Decision 1 — `AppliedEffect` records what HAPPENED, not what was asked

`{ op: resource, key: money, delta: -40 }` applied to a player holding 12 removes 12. A log
that records `-40` makes the sim's money trajectory a fiction, and "money floors at zero in
60% of runs after leg 15" — a real balance finding — becomes unobservable.

So each record carries `requested`, `applied`, the resulting value, and any `ClampEvent`.
This is ADR 0006 decision 2 followed through to its consequence: clamping is recorded at the
point of change, not only at run construction.

**`changed: false` is a first-class outcome**, not a dropped entry. A flag re-set to the value
it already held, an item removed that was not carried, time advanced by a negative delta —
all produce a record.

**Invariant: `applied.length === effects.length`.** It is what makes a silently skipped
effect impossible, which is the failure mode where a mistyped op quietly does nothing for a
whole release and nobody notices because nothing errors.

---

## Decision 2 — Structural sharing, and identity as the no-op signal

Each op rebuilds only the branch it touches: a resource change produces a new `resources`
object and leaves `flags`, `history`, `route` and the rest as the **same objects**. Cloning
the whole state per effect would be pure allocation across 20,000 runs of ~30 legs each.

When an effect changes nothing, the applier returns **the identical state object**. That
gives callers a free `next === state` no-op check, and it is what makes
`structural-sharing.test.ts` able to assert anything at all — a test that only compared
values could not tell sharing from copying.

Purity is enforced by **deep-freezing** the input in `purity-and-sharing.test.ts` and
applying all twelve ops. Module code is strict, so an in-place write throws rather than
silently succeeding. The freeze itself is guarded by a test, since a `deepFreeze` that
stopped descending would make every purity assertion vacuous.

---

## Decision 3 — Compound ops carry a nested tagged `field` union

`transport`, `document` and `route` change several things each. The obvious shape is a bag of
nullable properties — and it cannot express the difference between "leave `vehicleId` alone"
and "set `vehicleId` to none". Optional properties would express it and are ruled out by ADR
0006 decision 1.

So the payload is a second discriminated union:

```ts
type TransportChange =
  | { field: 'mode'; mode: TransportMode; vehicleId: string | null }
  | { field: 'condition'; delta: number }
  | { field: 'fuel'; delta: number }
  | { field: 'legal'; legal: boolean };
```

The passport cases are separate `field`s for the same reason ADR 0006 §4 keeps
`DocumentsState` detailed: losing a passport and never having had one are different stories
with different escapes, and a settable record destroys that distinction the first time
someone writes the obvious thing.

**`route` cannot change the route**, only the position along it. Re-routing needs pending-event
rebasing (M8) and route generation (Phase 2) to exist first; an effect that could swap the
node list today would be a way to corrupt a run.

---

## Decision 4 — No terse→canonical normalisation, unlike predicates

engine-spec §2 already writes effects as `{ op: resource, key: money, delta: -40 }`. `op` is a
proper discriminant in the authored YAML, so M5's schema validates rather than transforms.
The asymmetry with ADR 0007 decision 1 is a property of the spec's authoring syntax, not an
inconsistency in the engine.

Exhaustiveness is **verified, not asserted**: injecting a `teleport` op produced two errors —
one at the dispatcher's `never` guard, one at `EffectOp` — because `EFFECT_OPS` and the union
cross-check each other. Adding to one without the other does not compile.

---

## Decision 5 — `ModifierSource` ships empty, not absent

CLAUDE.md §9's four registries (`modifiers`, `complications`, `universal-choices`, `quirks`)
are Phase 2 content and out of Phase 1. Their **integration points are not.** Building them
later without a seam means rewriting the check resolver rather than plugging into it.

`runSkillCheck` (M6) therefore never reads `check.modifiers` directly. It collects from an
ordered list of `ModifierSource`. Phase 1 passes exactly one — `choiceModifierSource`,
filtering each modifier by its `when` predicate. Phase 2 appends `registryModifierSource` and
`quirkModifierSource` **with no change at the call site**.

> **Amended 2026-08-08 — the last sentence did not hold, and the prediction is left standing
> above so the miss is legible.** Phase 2A M2A.3 (`8013aac`) did NOT append a
> `registryModifierSource`; neither it nor `quirkModifierSource` exists in any source file.
> The registry is threaded as a fifth parameter to `runSkillCheck` and resolved by
> `modifiers/resolve-modifiers.ts`. `PHASE_1_MODIFIER_SOURCES` still holds one entry.
>
> **Why the seam was bypassed rather than used:** a `ModifierSource` returns a flat
> `readonly RollModifier[]` — `{ labelKey, delta }`. The registry's output is not flat. Its
> six-step pipeline has to report `rawDelta` alongside the post-diminishing delta, which rows
> a conflict deleted, and each row's share of the clamp, because pillar 2 requires the chips
> on the result screen to sum to the number shown. Widening `ModifierSource` to carry that
> would have made every source pay for the registry's needs. See ADR 0015.
>
> **What actually held, and is worth keeping:** `resolveChoice(state, pack, choiceId)` never
> changed, because the registry rides on the `pack` argument that already existed. Every
> caller — `advanceLeg`, `replayRun`, `sim/run-one.ts` — was untouched by `8013aac`. That is
> the property the seam was really buying. `runSkillCheck` itself is a published barrel export
> and its signature DID break (4 params → 5, `RollResult` → `CheckOutcome`), as did the
> `SkillCheckSpec` the seam takes, which gained a required `tags` field.
>
> The seam remains live and tested, and a genuinely flat per-choice source — a quirk — can
> still be appended to it without touching the resolver.

The seam is tested as a seam: an empty source list is inert, and a stub source appended after
the built-in one reaches the output. If it were decorative, that second test could not be
written.

**Collection order is (source index, modifier index).** The total is commutative; the chip
order on the result screen is not, so it must be a function of the content rather than of
iteration accident. Sorting by index also avoids a string comparator — which would have been
a `localeCompare` waiting to happen (ADR 0005 §3).

The complication hook, the other half of the seam requirement, attaches in the director
(M7) and draws from `encounterFlavor` so Phase 2 can consume randomness without shifting
`eventPick`.

---

## Consequences

- `EffectContext` holds only `sourceEventId` and deliberately **no `Rng`**. Applying an effect
  is fully determined by `(state, effect)`: `scheduleEvent` stores its leg window rather than
  rolling within it. One fewer place a cursor can drift.
- `scheduleEvent` **appends naively**. Caps, per-`eventId` limits, deterministic eviction and
  rebasing land in M8; building them now would mean building against a queue nothing reads.
- Duplicate schedules are kept separate here, per ADR 0001 — dedupe happens at fire time.
- An unknown op resolves to an unchanged no-op with `labelKey: 'effect.unknown-op'` rather
  than throwing, matching the predicate evaluator's `unknown-kind`.
