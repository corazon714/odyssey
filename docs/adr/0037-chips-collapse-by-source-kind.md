# 0037 — Modifier chips collapse by `sourceKind` for presentation

- **Status:** Accepted, implemented 2026-08-12 (M3.11). **Partial: it moves the number in the
  right direction and does NOT land the 3–7 band. The premise that 12 `sourceKind`s bound the
  count "well inside" the band is false — the bound is 12. Measured below.**
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
  roll.

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
