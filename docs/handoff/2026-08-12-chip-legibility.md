# Handoff — chip legibility, and what it left open (2026-08-12)

You have read `CLAUDE.md` and nothing else.

**Read this one for the modifier/chip thread. Its sibling
`docs/handoff/2026-08-12-m3-11-geo-scale-up.md` is the OPEN task** — the geo scale-up — and is
still current apart from its chips TODO, which this note closes.

`dev` is pushed and level with `origin/dev` at `7328454`. Tree clean, all five checks green.
Nothing is half-applied and there are **no temporary hacks** — see §6.

---

## 1. Task and acceptance

**The chip thread is COMPLETE.** `Modifier chips / check` was 7.3 against a 3–7 legibility band.
It is now **6.4 with 0 checks over 7, bounded at 7 by construction** — verified over 194,453 real
corpus checks at 20,000 runs, not just the mandated 2,000.

Acceptance was: get inside the band **without moving any roll outcome**. Both halves hold, and the
second is the one that mattered — every step was delta-preserving and provably so.

**The task actually in progress is M3.11's geo body of work**: switch the committed slice to the
wider bbox, re-author `overlay.yaml`, close the 48 Afro-Eurasian fragments. Acceptance criteria,
traps and next steps for that are in the sibling note. Do not start it from this file.

---

## 2. Files touched, and why

Three commits: `6f4ffcb` (instrument), `06f462b` (collapse), `7328454` (bound). Plus `2e38375`,
the `CORPUS_PAIRS` fix, which is a different defect that surfaced in the same report.

| file                                                               | why                                                                                                                                                                                     |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/engine/src/modifiers/collapse-chips.ts`                  | NEW. Groups resolved rows by `sourceKind`, then keeps the 6 most explanatory and folds the rest into one overflow chip. Exports `MAX_MODIFIER_CHIPS` (7) and `CHIP_OVERFLOW_LABEL_KEY`. |
| `.../modifiers/__tests__/collapse-chips.test.ts`                   | NEW, 20 tests. The load-bearing ones are PARTITION and ROLL NEUTRALITY — see §4.                                                                                                        |
| `.../modifiers/resolve-modifiers.ts`, `resolved-modifier.ts`       | `ModifierResolution` gains `chips`. `modifiers` is UNTOUCHED and is still the roll's input.                                                                                             |
| `packages/engine/src/index.ts`                                     | barrel exports for the above.                                                                                                                                                           |
| `packages/content/i18n/en/checks.json`                             | 12 `check.kind.<sourceKind>` keys + `check.overflow`.                                                                                                                                   |
| `packages/content/__tests__/locale.test.ts`                        | the new keys wired into `requiredKeys()` so the orphan assertion still holds in BOTH directions.                                                                                        |
| `packages/tools/sim/run-one.ts`, `run-many.ts`, `format-report.ts` | the `Checks over 7 chips` line, and the sim switched to counting `resolution.chips`.                                                                                                    |
| `packages/tools/sim/load-pack.ts`                                  | `CORPUS_PAIRS` re-picked under a spread constraint (`2e38375`).                                                                                                                         |
| `docs/adr/0037-chips-collapse-by-source-kind.md`                   | the decision plus its addendum for the bound.                                                                                                                                           |
| `docs/sim-baseline{,-corpus}.md`                                   | regenerated three times; each header records what moved and why.                                                                                                                        |

---

## 3. Decisions, and what was rejected

**Group by `sourceKind`.** Rejected: `sourceKind × sign` (a strict refinement, so its count is
always ≥ `sourceKind`'s — 30.8% vs 27.6% measured); **check tag** (a row declares several
`appliesTo`, so groups would not PARTITION, which breaks the one property everything rests on);
**sign only** (2 chips, destroys the "why").

**Then bound at 7 with an overflow chip.** Rejected: **suppressing zero-delta groups** (reaches
19.1%, still out of band, and depends on the distribution cooperating); **tightening `when` across
137 rows** (moves real deltas and rolls — a balance change wearing a legibility change's clothes,
and no preservation property can verify it); **recalibrating the band** (moving the measuring
stick).

**Ordering: |delta| desc, then row count desc, then `sourceKind` asc.** The middle key is a
SELECTION rule, not a display one — equal magnitudes are the modal case, and at a tie the chip
standing for three rows accounts for more of the world than one standing for one. The third key
cannot tie (one group per kind), so the comparator never returns 0 and the output cannot depend on
`Map` iteration order.

**A zero-delta overflow RENDERS.** Dropping it would break the partition — `memberIds` would
vanish and `chips` would stop accounting for every row exactly once. Weakening the guard to permit
the thing it guards against is not a trade worth making for a shorter list.

**Collapsing by `sourceKind` alone was MY recommendation and it was wrong.** It got 7.3 → 6.9 and
38.5% → 30.6%, not into the band. 94.6% of groups are singletons: checks pull one row from each of
8–11 _different_ kinds, because `modifiers.yaml` was authored for breadth across the twelve kinds
rather than depth within one. Right grouping key, wrong axis to expect folding on. That is why the
bound — which is `O(1)` in the distribution — is the thing that actually worked.

---

## 4. Traps

**THE GOLDENS CANNOT CATCH A MODIFIER-PIPELINE REGRESSION.** The chip list is returned from
`resolveChoice` and never written into `RunState`, so `stateDigest` cannot see it. Mutating
`run-skill-check.ts:52` to build the roll from `chips` instead of `modifiers` — the exact break
this work must never cause — was caught by **exactly one test in the whole engine suite**, the one
added here. If you touch the pipeline, that test is your only guard of its class. Do not delete it
as redundant.

**A sum test cannot see a lost zero.** 5.2% of rows contribute exactly 0 after the clamp, so
dropping one preserves the total and every per-chip sum. The PARTITION assertion
(`collapse-chips.test.ts`, "loses no row and duplicates none") is what bites. Verified by
injecting the mutation: the total-sum test did not fire; partition did.

**`pnpm golden:update` has PRE-EXISTING Prettier drift.** It re-wraps nine single-element
`expectedEndings` arrays onto three lines (27 insertions / 9 deletions) with no code change at all.
Do not read that as movement. The clean way to prove neutrality: regenerate at clean HEAD AND with
your change, then diff **the two regenerations against each other**.

**The sim's band check is hardcoded `> 7` at `run-one.ts` and deliberately does NOT import
`MAX_MODIFIER_CHIPS`.** If it imported the constant the check would be tautological and could
never report a violation. Leave it hardcoded.

**A plain `cp reports/... docs/sim-baseline*.md` DESTROYS the hand-written `<!-- -->` header.** The
generated report does not contain it. Splice: keep everything up to and including `-->`, then
append the report.

**When delegating to subagents, their reports contain false claims.** One reported goldens
regenerating "byte-identically" when `git status` showed the file dirty; the cause turned out to be
the Prettier drift above, which made the underlying claim _stronger_ — but only an independent
adversarial pass established that. Run one. Mutation-test the property tests rather than reading
them. And make every agent assert the before-state before touching anything: an earlier fan-out had
two of five agents measure against a 22-commit-stale worktree base.

---

## 5. The exact next 3 steps

These are the geo thread. **Full detail is in the sibling note; this is the index.**

1. **Switch the slice to Afro-Eurasia.** Change `geo:build`'s bbox in the root `package.json` from
   `-12,36,30,60` to `-18,-35,180,72`, run `pnpm geo:build`, then `--check`. Expect 692 nodes /
   1215 edges / 1 component / `DROPPED 113 node(s) in 48 fragment(s)`. `content:lint` will then
   fail with 11+ `GEO_OVERLAY_STALE` errors — correct and expected; step 2 fixes it. **Do not
   commit between steps 1 and 2**; the tree is red in between.
2. **Re-author `packages/content/geo/overlay.yaml`.** Every row naming a dropped node repointed or
   deleted; preserve the header's reasoning. Then re-measure `GEO_UNDECLARED_BRIDGE`'s budget
   (13, calibrated on 263 nodes) and update it with what it was measured against.
3. **Re-pick `CORPUS_PAIRS` and regenerate both baselines.** See the TODO in §6 — the current ids
   will not survive re-selection.

---

## 6. TODO(handoff)

**There are no temporary hacks in this thread.** No stubs, no skipped tests, no commented-out
code, no uncommitted work. Two genuine follow-ups:

**TODO(handoff): `CORPUS_PAIRS` ids will not survive the bbox change.** They were re-picked at
`2e38375` under a constraint — candidates sampled across the whole sorted city list, a pair taken
only if BOTH endpoints are ≥900 km from every endpoint already chosen — because the previous four
all shared one destination and the report looked healthy while measuring one endpoint four times.
After step 1 the ids change. **Re-pick with the same constraint; do not revert to "measure and take
the best", which is what produced the shared-hub set.**

**TODO(handoff): `sim.test.ts`'s payoff floor is still 0.2, lowered from 0.5 at M3.10b.** A weaker
guard than it was. ADR 0035 says tighten it and raise the sample if unresolved threads climb in
either baseline. Corpus unresolved threads are currently 93 — high, but that is short-route
consequence expiry, not a payoff bug.

**Not a TODO, but a judgement nobody can make yet:** roughly a third of result screens now end in
"Everything else", folding at worst five kind groups — always the five smallest by |delta|.
`memberIds` names every folded row and `resolution.modifiers` is still complete, so nothing is
lost, only deferred to a detail view. Whether that READS well is a UI question and there is no
result screen until Phase 7B. Revisit it there, with the screen in front of you.
