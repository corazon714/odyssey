# 0018 — What the content linter can decide, and what needs the simulation

- **Status:** Accepted
- **Date:** 2026-08-08
- **Implements:** Phase 2A M2A.6 / M2A.7
- **Relates to:** ADR 0001 (silent content bugs), ADR 0009 §4 (content-lint subsumes the ref walk)

## Context

ADR 0001 accepts that content bugs in a quality-based narrative are **silent**: an event whose
`requires` names a deleted npc simply never fires, and nothing errors. Phase 1's only
instrument for that class was the sim — which finds real bugs, but 20,000 runs after the
mistake was made.

`content:lint` moves the _declarable_ half of that class to build time. The question this ADR
settles is which half, because a linter that overclaims is worse than one nobody runs: it looks
like coverage.

## Decision

**The linter decides properties of the content GRAPH. The sim decides properties of the state
DISTRIBUTION that graph induces.** A predicate's _satisfiability_ is sometimes static; its
_reachability_ never is.

### Fully static — the linter owns these

Schema validity · duplicate ids · id naming · undeclared flag/item/npc/trait/ending references ·
derived i18n keys present in `en/` · `imageRef` in the manifest · outcome weights summing above
zero · a choice whose every outcome is gated on one side of a check · word counts against
pillar 5 · check-tag coverage · `LOCAL_MODIFIER` · `MISSING_CHECK_TAGS` · orphan flags.

### Static only within a named fragment

**`CONTRADICTORY_REQUIRES_NUMERIC` says NUMERIC in its name on purpose.** Decidable:
conjunctions of numeric comparisons on the same key inside an `all` (including nested `all`s) —
intersect the intervals, empty means unsatisfiable. Also `flag isSet` beside `flag notSet`, and
any `all` containing `never`.

Not decidable, and deliberately not attempted: anything under `any` (satisfiable if any branch
is), anything involving `chance`, and every cross-key implication — `heat >= 6 AND cash >= 400`
is satisfiable on paper and may be unreachable in play. A rule called
`CONTRADICTORY_REQUIRES` would be claiming the general case; the suffix puts the limit in front
of anyone suppressing it.

**The item-liability rule is made decidable by inverting it.** "Every item must be capable of
being a liability" is a judgement about outcome _semantics_, not a graph property. Rather than
ship a heuristic that produces false confidence, `items.yaml` carries a required `liability:`
naming the events where carrying it hurts, and the linter checks the two things it can: that
the events exist, and that they read the item. The judgement moves to the author at declaration
time, where it belongs.

### Needs the sim, and no amount of linter work changes it

| What                                 | Why it is not static                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Is an event ever _eligible_?         | Joint state distribution across legs. `border.guard_remembers` was scheduled 20× and fired 0× with a perfectly satisfiable predicate. |
| Is a choice ever _picked_?           | Policy, plus which choices were visible at presentation.                                                                              |
| Does an outcome branch fire?         | Check success rates → resolved modifiers → state.                                                                                     |
| Is a flag _actually_ set at runtime? | **The linter's own false negative**: a flag written on an outcome nobody reaches reads as perfectly healthy.                          |
| Do the ±6/−8 clamps bind?            | Pure runtime distribution.                                                                                                            |
| Beat fill, completion, trajectories  | Not properties of the graph at all.                                                                                                   |

**The linter's job is to make sim findings rare and cheap, not to replace them.** Phase 1's
record is the evidence: five bugs found by running the thing, none of which any unit test saw.

## Severity is a decision, not a mood

`error` fails CI. `warn` asks a human to look. Rules that can produce false positives are
warnings — above all the §11 safety patterns, which are regexes over prose and will
occasionally fire on nothing. **A §11 rule that fails CI on a false positive gets suppressed,
and a suppressed §11 check is strictly worse than no check because it looks like coverage.**

Two corollaries the report shape follows from:

- **An absent locale produces ONE finding, not a hundred.** Reporting every missing key when
  the real problem is that `i18n/en/` is empty buries the cause under its own consequences.
  Same for the image manifest.
- **No silent caps.** `content:stats` lists at most twelve thin cells and then says
  `showing 12 of 1399`. A report claiming twelve holes while hiding 1,387 is worse than none.

## `--fix` is scoped to what cannot change meaning

Two operations: sort a declaration registry by id, and dedupe repeated entries in a list field.
Both are set-preserving rewrites with exactly one correct answer.

It deliberately will **not**:

- **Touch i18n.** Scaffolding a missing key with a placeholder writes a user-visible string,
  which is rule 2.4 — the thing the linter exists to protect. A `--fix` that violates the rule
  it enforces is indefensible.
- **Hoist a local modifier into the registry.** It looks mechanical and is not: the hoisted row
  needs an id, a priority, a `sourceKind` and a stacking decision, none of them derivable from
  the thing being moved. Guessing them writes balance nobody chose.
- **Delete anything.** Every fix is a reordering.

The cost it does pay: per-entry YAML comments do not survive a rewrite, which is why it only
writes when the sorted output genuinely differs.

## `content:stats` has no region axis

`EventContext` has no region field, `packages/content/geo/` is empty so there are no region ids
to bucket by, and adding region gating to events is precisely what CLAUDE.md §11 warns against
unless the regions are abstract terrain bands rather than places. A region column would render
as coverage data and be nothing of the kind. It lands with `geo/`. A test asserts its absence
so it cannot be added carelessly.

The number the coverage report leads with is **filler-only cells**, not empty ones: a cell
covered because two universal fillers can fire there is a hole with a rug over it, and it is
the same finding the sim reports from the other end as fillers being 75% of everything.

## Consequences

- The linter found three real errors on its first run, one of which (`wanted` read and never
  written) the sim had reported every run since Phase 1 and `docs/PROGRESS.md` had carried as
  a known gap. Fixed rather than downgraded.
- It also found the gap ADR 0017 names — `search` has registry rows and no caller — without
  being told to look.
- 29 warnings remain, all honest fixture gaps, tabulated in `docs/PROGRESS.md` with what closes
  each. **They are the Phase 2B to-do list, and they should go to zero as the seed corpus
  lands, not be suppressed.**
