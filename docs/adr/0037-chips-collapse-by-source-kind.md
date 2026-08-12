# 0037 — Modifier chips collapse by `sourceKind` for presentation

- **Status:** Accepted, implemented 2026-08-12 (M3.11). **Partial: it moves the number in the
  right direction and does NOT land the 3–7 band. The premise that 12 `sourceKind`s bound the
  count "well inside" the band is false — the bound is 12. Measured below.**
  **Superseded in its numbers, not its decision, by the addendum at the bottom of this file
  (M3.11c, same day): the chip list is now bounded at seven and the band IS met, by
  construction. Everything below still describes what the grouping does and why; read the
  addendum for what happens after the grouping.**
- **Relates to:** ADR 0015 (the modifier resolution pipeline), ADR 0020 (the search routes
  through the pipeline rather than around it), ADR 0023 (check tags), ADR 0032 (a baseline
  belongs to its run count), CLAUDE.md design pillar 2

## Context

The corpus sim at M3.11 measured the modifier pipeline against 08-DIVERSITY-SYSTEMS D1's
"a typical check should pull 3–7":

```
Modifier chips / check        7.3   (target 3-7, over 19553 checks)
Checks over 7 chips          7525   (38.5% of checks; worst pulls 13)
```

The mechanical impact is already bounded — conflicts resolve, non-stackers collapse, diminishing
returns discounts everything past the third of a sign, and the total clamps at +6/−8. So this is
not a balance problem. It is a **pillar 2** problem: _the player must be able to reconstruct why
something happened_, and a thirteen-row list is not a reconstruction, it is a receipt.

## Decision

Add `chips` to `ModifierResolution`: the resolved rows grouped by `sourceKind` and summed, as a
**seventh, presentation-only step** of `resolveModifiers`. `modifiers` is unchanged and remains
the audit trail; `runSkillCheck` still builds its `RollModifier[]` from `modifiers`, never from
`chips`.

A group of one keeps the row's own `check.modifier.<id>` label — folding a single modifier into
its kind would delete information for no gain, and "How you are −2" reads as a system message
where "Badly hurt −2" reads as the story. A group of two or more takes `check.kind.<sourceKind>`
and renders as "How you are ×3, −4". Twelve new keys, one per entry of `MODIFIER_SOURCE_KINDS`;
the vocabulary is a closed enum, so the set is complete by construction and
`packages/content/__tests__/locale.test.ts` asserts it both ways (every key resolves, no key is
orphaned).

**Why `sourceKind`.** It is the only field on a row that is already an authored answer to "what
KIND of thing is this", and it is the same key step 4 of the pipeline already groups by for the
non-stacking collapse. A player who learns "conditions do not stack" then reads the same bucket
on the result screen that the rule operates on.

**Why the maths cannot move.** The collapse runs after the total is computed, over rows whose
`delta` is already post-diminish and post-clamp, and it only sums integers. Nothing reads it
back. `collapse-chips.test.ts` asserts this as a property over 600 generated resolutions rather
than as an example — the interesting inputs are the ones where apportionment has already
rewritten per-row magnitudes, and those are easy to hand-pick favourably. The load-bearing
invariant is **roll neutrality**: `rng.roll(dc, fromChips)` and `rng.roll(dc, fromRows)` from the
same seed and cursor produce an identical `RollResult` — same die, same `modifierTotal`, same
`success`, same `margin`. It holds because `roll` draws its die before it reads the list and
consumes a word count independent of the list's length.

## The measurement

`pnpm sim -- --pack=corpus --runs=2000`, before and after. **Two lines moved and no others** —
completion, endings, beats, flags and every trajectory are byte-identical:

|                        | before        | after             |
| ---------------------- | ------------- | ----------------- |
| Modifier chips / check | 7.3           | **6.9**           |
| Checks over 7 chips    | 7,525 (38.5%) | **5,980 (30.6%)** |
| Worst check            | 13            | **11**            |
| Checks under 2 chips   | 0             | 0                 |

**It does not land the band, and that is recorded rather than hidden.** An exploratory pass over
25,994 corpus checks says why: **94.6% of groups have exactly one member** (165,025 singletons,
9,505 pairs, 758 triples). There is almost nothing to fold. Checks do not pull eight rows of one
kind; they pull one row from each of eight-to-eleven different kinds. The post-collapse
distribution is `4:913 · 5:3465 · 6:7261 · 7:7084 · 8:4045 · 9:2772 · 10:285 · 11:62`.

The residual is therefore a **breadth** problem, not a depth one, and `modifiers.yaml`'s own
header predicted it: _"breadth for 3–7 modifiers on a check comes from across the twelve
sourceKinds, NOT from many rows within one."_ The registry was authored to spread across kinds.
Collapsing by kind is, by design, collapsing along the axis with the least to collapse.

## Alternatives rejected

**Grouping by check tag.** A row may declare several `appliesTo` tags, so the groups would not
partition the rows: a row would have to be assigned arbitrarily to one of its tags (unexplainable)
or counted in several (breaks the sum). Rejected on correctness, not taste.

**Grouping by sign — "bonuses +6, penalties −8".** Bounded at two chips and destroys the entire
"why". An unreconstructable total is the exact failure this exists to fix.

**Grouping by `sourceKind` × sign.** Keeps a mixed-sign group honest. Rejected because it is a
strict refinement of `sourceKind`, so its chip count is **always ≥** the chosen grouping's — it
can only split the groups that were doing the work. Measured on the exploratory pass: 30.8% over
band versus 27.6%, worst 13 versus 11. The problem it solves is small: mixed-sign groups are
3,073 of 175,288, under 2%.

**Grouping by magnitude bucket.** Groups by the number already printed on the chip and says
nothing about cause.

**Tightening `when` predicates across the 137 rows.** The direct attack on breadth, and it was
refused for this change rather than dismissed. It is 137 hand edits to a file whose balance is
the subject of a committed baseline, every one of which changes _which_ modifiers apply and
therefore moves real deltas, real rolls, real completion and the goldens. That is a balance change
wearing a legibility change's clothes, and it would have to be justified row by row against the
diversity the registry exists to provide — a row that fires less often is a row buying less
variety. It also cannot be verified the way this change can: there is no property that says
"tightening row 84 preserved the maths", because it does not.

**Recalibrating the 3–7 band.** Moving the target to 3–11 would turn the report green without
changing anything a player sees. The band came from 08-DIVERSITY-SYSTEMS D1 as a claim about
_readability_, and pillar 5 puts the whole event body at 60 words; eleven chips is not a
15-second read. Changing the measuring stick because the measurement is inconvenient is how a
target stops meaning anything. If the band is wrong it should be re-derived from a real result
screen in Phase 7B, with a screen to look at — not from a sim line.

## Deferred, with numbers, so the next pass starts from data

Neither is in this change, because each is a second design decision that deserves its own
sign-off, and one logical change per commit:

- **Suppress zero-delta groups.** 5.2% of rows and 4.2% of groups contribute exactly 0 after the
  clamp. Dropping a group that sums to zero is delta-preserving by definition. Measured: 27.6% →
  **19.1%** over band, worst 11 → 10. The cost is real: "you were carrying it and it counted for
  nothing" is arguably precisely what pillar 2 wants shown.
- **An overflow chip.** Keep the top six groups by magnitude and fold the rest into one "and N
  more". Bounded at **exactly 7 by construction**, still delta-preserving, measured 0.0% over
  band. The cost is that the overflow chip has no cause at all, which is the thing pillar 2 asks
  for — acceptable only if the tail it hides is genuinely the part that does not explain the
  roll. **NO LONGER DEFERRED — built the same day; see the addendum at the bottom of this file,
  which is where the decision now lives.**

## Consequences

- `ModifierResolution` gains `chips`; `EMPTY_RESOLUTION` gains `chips: []`. Additive — no
  existing field changed type or meaning.
- The sim counts `resolution.chips`, not `resolution.modifiers`. The band is a budget on what
  the SCREEN asks the player to hold, so counting the audit trail measured a number no screen
  shows. Only `docs/sim-baseline-corpus.md` moves; `docs/sim-baseline.md` does not, because the
  fixture pack carries `registries.modifiers: []` and no check in it pulls two rows of one kind.
- **The golden runs do not move, and that is a load-bearing observation rather than luck.** The
  chip list is returned from `resolveChoice`, never written into `RunState`: `recordHistory`
  stores `legIndex/day/eventId/choiceId/textKey/params/tags` and nothing else, and `stateDigest`
  hashes `RunState` alone. `pnpm golden:update` regenerates `golden-runs.json`
  **byte-identically** — same digests, same `choiceSequence`, same `expectedEndings`, same
  `expectedLegs`. Any movement there would have been a bug introduced by this change.
- Phase 7B's dice animation renders `chips`, with `memberIds` as the drill-down. `modifiers` is
  still there for the "show me every row" affordance, and `suppressed` still says what lost.

---

# Addendum — the overflow chip, 2026-08-12 (M3.11c)

- **Status:** Accepted, implemented 2026-08-12. **This is the deferred "an overflow chip" option
  above, built. The band is now met by construction: `collapseChips` cannot return more than
  seven chips for any input.** The parent decision is unchanged — grouping is still by
  `sourceKind`, the arithmetic is still untouched, `modifiers` is still what the roll is built
  from. This bounds the list the grouping produces.

## Why now, and why not more grouping

The measurement above closed the door on grouping harder. 94.6% of groups have exactly one
member; checks pull one row from each of eight-to-eleven **different** kinds, so every
alternative grouping key is a refinement of a partition that is already almost discrete. There is
no grouping of eleven singletons that yields seven buckets and still says what caused what.

So the fix stops being a better bucket and becomes a **budget**. Keep the six chips that explain
the roll, fold the rest into one, and enforce the ceiling in the function rather than hope the
registry stays small. `MAX_MODIFIER_CHIPS = 7` is now a property of the code, not an observation
about the corpus, which is the whole appeal: the line stays at 0.0% when `modifiers.yaml` grows
past 137 rows. The `sourceKind` grouping earned its place anyway — it is what turns a twelve-row
check into six named causes plus a small footnote, instead of six named causes plus a footnote
covering half the check.

## Decision

`collapseChips` groups by `sourceKind` as before, sorts, and then — **only when the groups exceed
seven** — keeps the first six and folds the remainder into one overflow chip:

| field        | value                                                                         |
| ------------ | ----------------------------------------------------------------------------- |
| `labelKey`   | `check.overflow` — "Everything else"                                          |
| `sourceKind` | `null`; it stands for several kinds, so it has none. This IS the discriminant |
| `delta`      | Σ of the folded groups' `delta`                                               |
| `rawDelta`   | Σ of the folded groups' `rawDelta`                                            |
| `count`      | how many **rows** it stands for — the count param the label renders with      |
| `memberIds`  | those rows, in resolution order: the drill-down, and the partition's receipt  |

### Which six survive: `byExplanatoryWeight`, in three keys

1. **|delta| descending.** The chips that moved the number most are the ones that explain the
   roll. Reconstructing a −7 wants the −4 before the −1.
2. **row count descending.** New in this increment. Equal magnitudes are the common case — a ±1
   registry row is the modal row — and at a tie the chip standing for three rows accounts for
   more of the world than the chip standing for one. Without this key the survivor at a tie is
   chosen by spelling, which explains nothing. It is a **selection** rule now, not only a display
   order, which is why it is worth adding here and was not worth adding before.
3. **`sourceKind` ascending.** The bottom, and the reason this is a **total** order: there is
   exactly one group per kind, so key 3 cannot tie, so the comparator never returns 0 and the
   result cannot depend on `Map` iteration order or on the order `resolveModifiers` emitted rows
   in. Same rule as `leg-plan.ts`'s `dullness` comparator — it reads only its two arguments, no
   index, no rank, no global. `collapse-chips.test.ts` asserts it by rotating the finished row
   list and demanding identical chips, and that test now takes the overflowing cases first,
   because input order decides **which six survive** rather than merely how they are listed.

### The overflow chip is pinned last, not re-sorted

Its delta is a sum across unrelated kinds, so it is not commensurable with the single-cause chips
above it: "everything else, together, −5" is a footnote to the list, not a line in it. Re-sorting
would also let a large footnote displace the specific reason a player is scanning for, which
inverts the point of the ordering.

### "And 1 other" cannot happen — arithmetic, not a guard

`KEEP_CHIPS` is `MAX_MODIFIER_CHIPS − 1` and the fold runs only when the groups **exceed**
`MAX_MODIFIER_CHIPS`, so the tail is always at least two groups and therefore at least two rows.
That was the third question this increment had to answer, and it answers itself: folding one row
into "and 1 other" would delete its label for **no reduction in list length** — the same argument
this ADR already used for keeping a single-member group's own label. The rule, if the constants
ever move so a one-group tail becomes possible, is "emit that group's own chip", not "fold it
anyway". A property test asserts the overflow never stands for fewer than two rows, so a change
to the constants cannot pass silently.

### A zero-summing overflow renders

5.2% of rows contribute exactly 0 after the clamp, so an overflow chip can legitimately read
"Everything else ×4, ±0". It renders, for three reasons in increasing order of force:

- **"You were carrying it and it counted for nothing" is a reconstruction**, and pillar 2 asks
  for reconstruction. A player who matched eleven rows and sees seven chips has to be able to
  reconcile the two.
- **Suppression is a separate decision** with its own cost, still deferred above, and one logical
  change per commit.
- **It would break the partition.** Dropping the chip drops its `memberIds`, so `chips` would no
  longer account for every row exactly once — and the partition property exists to catch exactly
  one failure mode, a row that reached no chip. Weakening the guard to permit the thing it guards
  against is not a trade worth making for a shorter list. There is a hand-built test for this
  case, because the clamp cannot be asked for a zero-summing **tail** on demand.

## The measurement

`pnpm sim -- --pack=corpus --runs=2000`, against the parent decision as the base (`06f462b`).
**Two lines moved and no others** — completion, endings, beats, flags and every resource
trajectory are identical:

|                        | before 0037   | after 0037    | after this addendum |
| ---------------------- | ------------- | ------------- | ------------------- |
| Modifier chips / check | 7.3           | 6.9           | **6.4**             |
| Checks over 7 chips    | 7,525 (38.5%) | 5,980 (30.6%) | **0 (0.0%)**        |
| Worst check            | 13            | 11            | **7**               |
| Checks under 2 chips   | 0             | 0             | 0                   |
| Completion rate        | 38.7%         | 38.7%         | **38.7%**           |

`docs/sim-baseline.md` (the fixture control) does not move: that pack carries
`registries.modifiers: []`, so no check in it reaches eight kinds and the bound never bites.

**What it costs, stated rather than buried.** The bound bites on exactly the checks that were
over band before — 5,980 of 19,553, 30.6% — so roughly a third of result screens now end in
"Everything else", and at worst it folds five kind groups into that one chip. Those five are
always the five **smallest** contributions by |delta|, which is the argument for the whole thing:
the tail that gets hidden is the part that did not explain the roll. Nothing is lost from the
model — `memberIds` names every folded row and `resolution.modifiers` is still the complete audit
trail, so Phase 7B's drill-down can expand the chip.

## Rejected in this increment

**Re-sorting the overflow chip by its own magnitude.** Covered above: a sum across unrelated
kinds is not comparable with a single cause, and it would let the footnote take the top line.

**A redundant `overflow: boolean` beside `sourceKind`.** `sourceKind === null` already narrows in
TypeScript and is true on exactly the chip whose `labelKey` is `CHIP_OVERFLOW_LABEL_KEY`. A
second field encoding the same fact is a second thing that can disagree. CLAUDE.md §6 prefers a
discriminated union over optional-field soup, and a nullable field _is_ the discriminated union
here — the ceremony of two named variants buys nothing when they differ in one field's domain.

**Interpolating the count into the string — `"and {{count}} others"`.** Every `check.kind.*` key
is a noun phrase and the renderer composes the count and the delta around it: "Condition ×3, −4".
`check.overflow` follows that convention, which also keeps it free of a plural form, and so clear
of the open Hermes `Intl.PluralRules` risk in `docs/stack-notes.md`. The count param is
`chip.count`, which every chip already carries.

**Keeping seven kind chips and adding the overflow as an eighth.** That is eight chips. The
ceiling is the deliverable.

**Suppressing zero-delta groups instead.** Still deferred, and this change makes it close to
moot: with a hard ceiling of seven, suppression can only shorten lists that are already in band,
at the cost of the "it counted for nothing" information. If it is ever revisited it should be for
legibility on its own terms, not to move a number that is now 0.0%.

## Consequences of the addendum

- `ModifierChip.sourceKind` widens to `ModifierSourceKind | null`. **This is the one breaking
  shape change**, and it is confined to the presentation type — `ResolvedModifier.sourceKind` is
  untouched, so nothing in the pipeline or the schema sees it.
- Two new exports from the barrel: `MAX_MODIFIER_CHIPS` and `CHIP_OVERFLOW_LABEL_KEY`. The locale
  test reads the key from the engine rather than spelling it, so the two cannot drift.
- One new i18n key, `check.overflow`. It is in the same blind spot as `check.kind.*` —
  `content:lint`'s `i18nCoverage` walks event-derived keys and a chip label is not reachable from
  an event — so `packages/content/__tests__/locale.test.ts` covers it in both directions, present
  and not orphaned.
- The sim's `> 7` band test and the engine's ceiling now coincide at 7 **by agreement, not by
  reference**: the band is 08-DIVERSITY-SYSTEMS D1's claim about readability and the ceiling is an
  implementation choice, and wiring the report to import the constant would make the report unable
  to report a violation. They are deliberately two numbers that happen to be equal.
- **The golden runs still do not move.** `pnpm golden:update` regenerates `golden-runs.json` with
  identical digests, choice sequences, leg counts and endings; the only textual difference was
  prettier reflowing nine single-element arrays, so the regenerated file was discarded. Movement
  there would have meant the chip list had reached `RunState`, which is the bug this observation
  exists to catch.
- The roll-neutrality claim is now asserted **directly** as well as by property: a twelve-kind
  check feeds `runSkillCheck` thirteen `RollModifier`s while the screen shows seven chips, and
  the test counts `RollResult.modifiers` to prove which list the roll read. Before the bound the
  two lists were often the same length, so that test could not have failed.
