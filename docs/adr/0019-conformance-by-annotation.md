# 0019 — Conformance is enforced by annotation, not by identity

- **Status:** Accepted
- **Date:** 2026-08-08
- **Supersedes the mechanism described in:** ADR 0009 §"held identical", CLAUDE.md §9
- **Relates to:** ADR 0009 (type ownership)

## Context

ADR 0009 requires the Zod schemas and the engine's hand-written types to be held identical by a
compile-time assertion rather than by convention, and CLAUDE.md §9 described that assertion as
"bidirectional (mutual-extends)". `conformance.test.ts` implements something stronger on paper —
`Equals<z.infer<S>, T>`, TypeScript's identity relation — with an anti-vacuity guard (L1′)
added in M2A.1 after the recursion problem surfaced.

In session 5 the harness was measured rather than read: each kind of schema/engine disagreement
was introduced one at a time and the build was run. **Eight kinds fail the build. One does not,
and the reason is that most of the L1 assertions cannot fail at all.**

## What was measured

| Break                                                   | Outcome                                    |
| ------------------------------------------------------- | ------------------------------------------ |
| engine type gains a field                               | `TS2741` at `buildEvent`                   |
| schema gains a field                                    | `TS2353` at `buildEvent`                   |
| `?: T \| undefined` where the engine says `: T \| null` | `TS2322` at `buildEvent`                   |
| engine type drops a `readonly`                          | `TS2322` at `buildEvent`                   |
| a new engine vocabulary with no schema                  | L2 fails and names it                      |
| a schema annotated `: z.ZodType<T>`                     | L1′ **and** the source scan, independently |
| a schema enum narrower than the engine's                | `_beatType` L1 assertion goes red          |
| a transform's meaning flipped, types intact             | 0 type errors, 13 test failures (L3)       |
| **schema widens `readonly T[]` to `T[]`**               | **nothing**                                |

## Decision

**Accept that conformance is carried by return-type annotation, and say so.**

`buildEvent`/`buildChoice`/`buildOutcome`/`buildCheck` are declared `: GameEvent`/`: Choice`/…
and every predicate and effect arm is `.transform((v): Predicate => …)`. That makes
`z.infer<S>` the engine type **by declaration**, so `_event`, `_choice`, `_outcome`, `_check`,
`_modifier`, `_context`, `_predicate` and `_effect` are tautologies — eight of the thirteen L1
assertions cannot go red.

This is not the hole it looks like. The annotation does not remove the check, it **moves** it:
the builder body is checked against the engine type by assignability, and the first four rows
above are that check working, with materially better errors than `Equals` produces. `Equals`
remains load-bearing exactly where nothing annotates the output — the scalar vocabularies —
which row 7 proves.

**Two mechanisms, then, and the split is principled:**

- **Schemas that end in a transform** → the transform's return annotation. Assignability.
- **Schemas that are bare `z.enum`/`z.literal`** → `Equals`. Identity.
- Neither is a substitute for **L2** (a type with no schema is silently conformant, so the
  barrel is enumerated at runtime) or **L3** (semantics `Equals` is blind to — row 8).

**And one thing better than either: derivation.** `beatTypeSchema = z.enum(BEAT_TYPES)` is built
from the engine's own array, so a vocabulary growing a member propagates automatically and
cannot drift. Where a schema can be derived rather than asserted-about, derive it.

## The gap we are accepting

A schema widening `readonly T[]` to `T[]` is invisible: a mutable array is assignable to a
readonly one, so the builder takes it and the annotation covers it.

**Accepted, for three reasons.** It is harmless — the runtime value is the same object, and the
engine treats content as readonly regardless. The dangerous direction is caught: when the
_engine_ type loses a `readonly`, the schema's readonly value stops being assignable and the
build fails (row 4). And closing it costs more than it returns.

**Rejected: dropping the builder annotations** and asserting
`Equals<ReturnType<typeof buildEvent>, GameEvent>` instead. That would make all thirteen L1
assertions real and close the gap. It would also turn every conformance failure from
"Property 'mood' is missing in type … but required in type 'GameEvent'" into "Type 'false' is
not assignable to type 'true'" at a line that names no field. For the overwhelmingly common
failure — someone adds a field to one side — that trade makes the guard worse at the job it
exists for. A guard nobody can act on quickly is a guard people work around.

**Rejected: annotating _and_ asserting.** With the annotation present there is no
independently-derived type left to compare against; any such assertion is the tautology again.

## Consequences

- CLAUDE.md §9's "bidirectional compile-time assertion (mutual-extends)" was wrong twice over —
  it was never mutual-extends, and for most types it is not an assertion. Corrected in place
  with a pointer here.
- `conformance.test.ts`'s L1 comment now states which assertions are load-bearing and which are
  not, so nobody re-derives this by experiment a third time.
- **The honest one-line summary, for anyone writing docs about this:** the schemas and the
  engine types cannot disagree about a field's presence, its type, or its nullability without
  failing the build. They can disagree about `readonly`, in the direction that does not matter.
- If the trade is ever revisited, the measurement to repeat is in `docs/PROGRESS.md` under
  session 5 — one break at a time, `pnpm --filter @odyssey/content run typecheck` for the type
  layers and `pnpm vitest run --project content` for L2/L3.
