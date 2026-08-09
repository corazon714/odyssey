# 0022 — Universal choices are spliced at pack build, and the fixtures moved out of the corpus

- **Status:** Accepted
- **Date:** 2026-08-09
- **Amends:** ADR 0009 §5 (the fixture pack must not become the seed corpus)
- **Relates to:** ADR 0021 (complication persistence), ADR 0001 (silent content bugs)

## Context

Two of CLAUDE.md §9's four registries landed in Phase 2B, and the seed corpus landed with them.
Both raised a decision worth recording, and the second one changed a rule ADR 0009 had stated
as a prohibition without saying where the fixtures should live instead.

## Decision 1 — universal choices are spliced into `GameEvent.choices` at `createContentPack`

The alternative was injecting at selection time, per-leg. Splicing at pack build wins because:

- **The presented list and the lookup list are the same array.** `resolveChoice` does
  `pack.byId.get(eventId)` then a `.find` by id. Splice once, at construction, and "the UI
  offered a choice the engine refuses" is unrepresentable. Injecting at selection puts the list
  on `SelectionResult`, which is not persisted — recreating the exact problem ADR 0021 had to
  solve for complications, and worse, because it is a list rather than a single id.
- **`contentVersion` moves for the right reason.** The splice is applied to `sorted` _before_
  `contentVersion(sorted, registries)`, so the version fingerprints what the pack actually
  plays. The registry also lives inside `ContentRegistries`, so it is hashed twice — harmless,
  and it means the version moves the moment a row _could_ start matching.

What it costs: matching reads the EVENT only, never the run. That is the right trade —
`appliesTo` asks "does this kind of situation admit this option", which is a property of the
event; whether the player can take it _now_ is the row's own `requires`, evaluated at resolve
time exactly as a hand-authored choice's is.

### The id prefix is `u:`, not `u.`

`ChoiceId` is unique only _within_ an event and `resolveChoice` uses `.find`, so a collision
does not error: the injected choice is displayed, the player picks it, and the **authored**
choice's outcomes fire. Silent, and worse than a crash.

`ID_PATTERN` is `/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/` — **dots are legal**, precisely so ids
can be namespaced by category, so a `u.` prefix would be forgeable by an author. `:` is outside
the pattern and cannot be written. Complications use `c:` for the same reason.
`ContentPack.shadowedInjections` reports a collision anyway, because "unreachable" is only worth
saying if something checks it.

### "Never more than half the choices shown" is `i ≤ a`

With `a` authored and `i` injected, `i ≤ (a+i)/2` reduces to `i ≤ a`. So the cap is
`min(3, authored.length)` — static, state-free, and computable where the splice happens. It is
a statement about authoring density rather than about one player's state, which is the right
thing for it to be.

### What the first real registry taught us

`UNIVERSAL_NEVER_INJECTED` fired on **three of fifteen rows** the first time the registry had
content. The cause was structural, not a typo: with a 3-per-event cap and one row per family, a
row that is both **low priority and broadly targeted** never lands — it loses its family contest
wherever it matches and loses the cap where it does not.

The fix was not to raise priorities, which only moves the problem to whoever gets displaced. It
was to make each row in a family target a **different kind of event** and win there, so the
family cap arbitrates between genuinely competing options rather than between a good row and a
broad one. Two rows also shared a family they had no business sharing (`create_a_distraction`
and `offer_to_work_for_it` are not two ways of doing the same thing), which made the cheaper one
unreachable.

**Guidance for the next 285 rows: `appliesTo` breadth is a cost, not a benefit.** A row that
matches everything wins nowhere in particular and starves its family.

## Decision 2 — the fixture pack moved to `packages/content/__fixtures__/events/`

ADR 0009 §5 said the fixtures must not become the seed corpus. It did not say where they should
go, and they were sitting in `packages/content/events/` — the only directory the corpus could
occupy.

They now live in `__fixtures__/events/`, and the split is what let the seed corpus land without
touching a single golden run: `mini-pack.json`, `golden-runs.json` and `docs/sim-baseline.md`
are all unchanged across the entire milestone.

**Why not regenerate against the corpus instead.** The fixture tests do not hard-code _ids_;
they hard-code **properties the fixture was engineered to have** — an event unsatisfiable under
poverty, one with `maxOccurrences: 1`, one ineligible at rung 0 but eligible at rung 3. Keeping
those green against the corpus would mean either constraining narrative design to satisfy engine
tests, or weakening the ladder's correctness boundary during the exact phase that modifies
selection and resolution.

**The cost, stated plainly:** the nine fixture YAMLs are now **unlinted** — `content:lint` reads
`events/` only. That is acceptable because they are frozen data whose sole contract is
reproducing `mini-pack.json` byte-for-byte, and `round-trip.test.ts` checks exactly that. It is
recorded in that file's docstring so nobody later "fixes" the gap by moving them back.

`pnpm sim --pack=fixture|corpus` follows from the split, with **one baseline per pack**. A single
shared baseline would be overwritten by whichever ran last, so "no change" would mean "no change
since somebody else's run" — worse than no baseline, because it looks like coverage.

## Consequences

- **Completion rate reached the design band by adding content, not by tuning.** Three rounds of
  trimming food and rest moved it 60.0 → 59.1 → 53.1 → 52.1 and stopped paying; landing the two
  registries took it to **44.1%**, inside engine-spec 6's 30–50%. Diversity and difficulty
  turned out to be the same lever, which is the strongest evidence the §9 architecture is right.
- **`selectableChoices` in the sim had to go through `presentedChoices`.** Reading
  `event.choices` was correct until a complication could remove one; then the sim offered a
  choice `resolveChoice` refuses and 2000 runs produced `loop/unknown-choice`. The engine
  refusing is CLAUDE.md 2.7 working — and it means every caller that renders a choice list must
  derive it the same way. That is why `presentedChoices` is one exported function.
- Two content bugs were found by the first corpus sim and neither was findable any other way: a
  queued payoff authored as a `beat` event (scheduled 129×, fired 1.6%), and an event gated on a
  transport condition the corpus never reached (never fired in 2000 runs).
