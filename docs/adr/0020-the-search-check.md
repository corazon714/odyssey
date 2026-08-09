# 0020 — The search check: on the choice, and success means concealed

- **Status:** Accepted
- **Date:** 2026-08-09
- **Implements the deferral in:** ADR 0017 §"What is deferred, and why it is not a gap"
- **Relates to:** ADR 0015 (modifier registry), ADR 0005 (RNG addressing)
- **Corrects:** `docs/PROGRESS.md` "Next step" §2, and the example YAML in the Phase 2A plan file

## Context

ADR 0017 shipped container `searchDC` and item `concealability` as live data with no consumer,
and named that a real gap: the `search` check tag had four registry rows and nothing that could
draw them. It also settled the hard part — a search is **not** an effect op, because
`effect-context.ts` makes the absence of an `Rng` an explicit contract and a search rolls.

What it left open was the authoring shape. Two documents describe it and **they disagree with
each other in two places**, so building it meant deciding rather than transcribing.

## Decision 1 — `search` sits on the **Choice**, as an alternative to `check`

`docs/PROGRESS.md` says to add `search: SearchSpec | null` to `Outcome`. The Phase 2A plan
file's worked example puts `search:` at **choice** level, as a sibling of `hiddenUnless` and
`outcomes`, and gates the outcomes with `onCheck`.

The plan file is right and PROGRESS's prose is wrong, because `onCheck` is defined as branching
on **the choice's** roll (`resolve-choice.ts` passes one `RollResult` into `pickOutcome`). A
search on the _outcome_ resolves after outcome selection, so `onCheck` could not read it and
the branching mechanism both documents name would not exist.

So `Choice` gains `search: SearchSpec | null`, and it is an **alternative** to `skillCheck`,
never a companion — both feed the single `RollResult`, so allowing both would leave
`onCheck: success` with two referents. The schema rejects the pair rather than defining a
precedence, on the same reasoning that already rejects `variants` beside `textVariants`: a
precedence rule is a puzzle every author has to remember.

## Decision 2 — success means it stayed **hidden**

The plan file's example comments `onCheck: failure` as "the SEARCH failed: they did not find
it", i.e. the searcher rolls and success means found.

**That direction cannot be right, because it contradicts the registry that shipped two
milestones earlier.** Every `search`-tagged row in `modifiers.yaml` is signed from the player's
side:

| row                     | delta | reads as                       |
| ----------------------- | ----- | ------------------------------ |
| `cash_concealed`        | +2    | a cash belt helps you          |
| `looks_broke`           | +1    | nothing worth taking helps you |
| `large_cash_on_person`  | −2    | a bulge in your coat hurts you |
| `wanted_by_authorities` | −3    | being in the system hurts you  |

`runSkillCheck` is documented as `d20 + skill + clamp(modifiers)` from the player's side. Under
a searcher-rolls framing all four rows apply backwards — a cash belt would make it _easier_ to
find your cash. The registry is shipped code with a stated sign convention; the plan file is a
superseded planning document. **The player rolls to keep it hidden; `onCheck: failure` is the
outcome where they find it.**

This is the one place where reading the two source documents literally would have produced a
silently inverted mechanic that no test would have caught, because no event used a search.

## Decision 3 — the container's `searchDC` is a **modifier**, not a change to the DC

`dc` on the spec is the authored half: how thorough the search is. The container contributes a
chip through the ordinary modifier list.

Folding it into `dc` would have been one line shorter and wrong three ways: it bypasses the
+6/−8 clamp, the one mechanism stopping a pile of situational numbers deciding an outcome
alone; it bypasses conflict resolution and non-stacking collapse, so a container bonus and a
registry row expressing the same pressure would double-count; and it is invisible in
`ModifierResolution`, which is the structure `resolveChoice` returns _specifically_ so design
pillar 2 can render the reason chips. A silent DC bump is a number the player cannot
reconstruct.

## Decision 4 — `searchDC` is read from **state**, not from `CONTAINER_SPECS`

ADR 0017 put the container numbers in state "so a future bigger vehicle or a reinforced bag is
a preparation choice rather than an engine change". Reading the frozen defaults in
`searchCheck` would compile, pass every obvious test, and quietly make that sentence false.
`search-check.test.ts` pins it with a bag whose `searchDC` is 11 and asserts the modifier is
11 rather than `CONTAINER_SPECS.bag.searchDC`.

## A finding this milestone surfaced, unrelated to the search

**The fixture pack ships an EMPTY modifier registry, so the ten rows in `modifiers.yaml` have
never applied in a golden run or a sim run.** `mini-pack.json` has `registries.modifiers: []`,
and `packages/tools/sim/load-pack.ts` reads that same file.

M2A.3's sim delta was recorded as "`contentVersion` only". That is true, and the reason is not
the one implied: `contentVersion` moved because the `modifiers` **key** went from absent to
`[]`, not because the rows entered the pack. The registry is exercised by
`packages/content`'s own unit tests and by `content:lint`'s static analysis, and by nothing
that runs the engine.

Recorded here rather than fixed, because the fix belongs with the corpus split (M-D), where the
sim gains a pack that loads `modifiers.yaml` properly. **Until then, no sim number can be
evidence about the registry.** The same trap applies to the ~162 rows planned for M-E: they
will not move a sim number until the sim's pack carries them.

## Consequences

- `UNUSED_TAG: search` is gone from `content:lint`; `search` now reads as a `THIN_TAG`
  (1 event, 4 modifiers), which is the honest next state.
- `LIABILITY_UNBACKED: cash_belt` is gone: `collectRefs` now walks `search.item`, so
  `border.bribe_attempt` genuinely reads the item its liability declaration named.
- `content:lint` learned to see a search's tags. `MISSING_CHECK_TAGS`, `STARVED_CHECK`,
  `ONE_SIDED_CHECK` and `tagCoverage` all read `rolledChecks(choice)` rather than
  `choice.skillCheck`, or a search would get a free pass on the two failures that matter most.
- `hiddenUnless` is no longer dead. ADR 0012 recorded that it had exactly one instance and that
  instance never fired; `hide_the_cash` gates at `cash >= 100`, which a fixture run starting on
  320 reaches. It is now picked in 0.3% of sim runs.
- Sim delta is a redistribution, not a difficulty change: `offer_bribe` 0.4% → 0.1%,
  `hide_the_cash` 0.3% new, and `border.guard_remembers` 0.2% → 0.0% because fewer bribes fire
  to schedule it. Completion rate is unmoved at 31.2%.
