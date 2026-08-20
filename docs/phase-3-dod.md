# Phase 3 — Definition of Done

> This is the PHASE gate. `CLAUDE.md` §7 is the per-TASK gate and every task still owes it; this
> file is the additional bar Phase 3 must clear before it closes.
>
> **It lives in the repo because it rotted outside it.** It was written in a plan file under
> `~/.claude/plans/`, where no diff review and no CI run could ever touch it, and by the time the
> phase was ready to close two of its nine gates ERRORED OUT on their own flags and one named a
> command that has never existed. A gate nobody can run is not a gate; it is a sentence. Every
> gate below names a command that runs against this tree today and a pass condition you can read
> off that command's output without a second source.

---

## The nine gates

### 1. Static checks

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm content:lint && pnpm format:check
```

**Pass:** all five exit 0.

`content:lint` exits 1 on an error and **0 with warnings**. A green exit is therefore not a clean
report — read the warnings, because they are real findings that were classified as non-structural
rather than as untrue. `docs/adr/0018` is the record of which call is which.

### 2. Fixture baseline — the control

```bash
pnpm sim:diff -- --runs=2000
```

**Pass:** `No change vs docs/sim-baseline.md.` — or a diff whose every line is explained.

**2,000, not 5,000.** Both baselines were generated at 2,000 and `sim:diff` REFUSES a mismatched
count rather than print sampling noise as a regression (`packages/tools/sim/cli.ts`, ADR 0032). A
bigger sample is a DIFFERENT sample, not a better one; asking for 5,000 here exits 1 with a message
telling you so, which is exactly what the old gate did every time anyone ran it.

The fixture pack is the **empty-registry control** the golden runs are built on. So a corpus-only
change must print nothing here, and **that null result is the evidence the change was corpus-only** —
it is the only gate on this list that is more useful when it says nothing.

### 3. Corpus baseline — the real content

```bash
pnpm sim:diff -- --pack=corpus --runs=2000
```

**Pass:** `No change vs docs/sim-baseline-corpus.md.`, or a diff explained line by line. Then read
four things off the regenerated report body:

- **`Completion rate` inside 30–50%.** The band is the phase's balance claim; ADR 0035 and ADR 0040
  are what put the number inside it, and ADR 0041 records the sweep that chose the knee.
- **`Beat fill rate` at the recorded acceptance** — which is **against its achievable ceiling, not
  against 100%**. **C3 emptied `pack.unfillableBeatTypes`**, so the structural ceiling that used to
  bound this line is gone: it read 28.2% against a 55.8% ceiling — the share of REACHED slots whose
  type had any event — and now reads **47.8% against 100%**. The four events are
  `road.the_first_hour`, `transit.the_boarding_queue`, `city.the_outskirts` and
  `city.the_last_kilometre`. Read the per-type table in `docs/sim-baseline-corpus.md`'s C3 block,
  not the pooled figure: the residual is no longer content absence but the fact that **a beat event
  COMPETES for its slot** against the whole eligible pool, so the slack-0 types (`departure` 31.2%,
  `ferry_boarding` 20.8%) fill far worse than slack-2 `approach` at 98.6%.
  `docs/phase-3-verification.md` §6.5(5) holds the per-band table and the acceptance it was read
  against, re-measured at C3.
- **`Never-fired events` accounted for.** Zero is the current state **and C3 kept it there** — the
  plan predicted `ferry_boarding` would create the first never-fired event on the theory that no
  corpus route takes a ferry, and four of the 23 routes do. A non-zero count is either a `requires`
  no route reaches or a weight that lost, and which one it is has to be named.
- **`Grid cells sampled` showing full marginals** — `115 (of 115 — 23/23 routes x 5/5 policies)`.
  **This figure MOVED AT C2 and the movement is the point of reading the marginals rather than the
  cell count.** It was `125 (of 125 — 25/25 routes x 5/5 policies)`; making `acceptByDiversity`
  measure overlap in both directions left one endpoint pair with 3 in-band routes instead of 5, so
  the grid is 23 × 5. **A SHORT MARGINAL IS A HOLE, NOT A SMALLER SAMPLE** — but a marginal that
  shrank because the route SET shrank is neither, and telling the two apart is why this gate names
  the marginals and not the product. If a route or a policy never ran, every rate printed below
  that line is averaged over a corpus that is missing it, and the report will look entirely healthy
  while doing it. This gate exists because that happened: the harness sampled 25 of 125 cells for
  several milestones because its stride shared a factor with the grid dimension. ADR 0038.

### 4. Goldens

```bash
pnpm test:engine
```

**Pass:** green, **and `pnpm golden:update` was not run to make it so.**

`packages/engine/src/loop/__tests__/golden-run.test.ts` replays fixed `(seed, choiceSequence,
contentVersion)` triples against `__fixtures__/golden-runs.json` and compares digests. A changed
digest is one of exactly two things: **an engine change you can state in one sentence**, or **the
nondeterminism the goldens exist to catch**. There is no third case, and regenerating the fixture
converts the second into a silent pass. If the digests moved, say which commit moved them and why
before touching `golden:update`, then review that diff by hand.

> **`pnpm test:engine` is the script that exists** — it is `vitest run --project engine`.
> Appending the flag to the root script instead does NOT do what it looks like: `pnpm test` is
> `vitest run` followed by the mobile Jest run, and pnpm appends extra args to the END of the
> whole string, so the flag lands on Jest and the full Vitest suite runs anyway.

### 5. Geo artifacts regenerate byte-identically

```bash
pnpm geo:build -- --check
```

**Pass:** `--check: byte-identical.` and exit 0. It regenerates the slice at the pinned bbox and
byte-compares instead of writing, which is what makes the build **reproducible** rather than merely
deterministic-looking.

**It needs a populated `.geo-cache/`.** If the cache is absent, this gate is **DEFERRED TO CI** and
must be stated as deferred in the phase-close report. Do not skip it silently and do not substitute
a hash of the committed artifacts — the committed artifacts are what the gate is checking, so
hashing them proves nothing.

### 6. `geo:verify` re-measured, every red gate OWNED

```bash
pnpm geo:verify
```

**Pass is NOT all-green.** Three gates fail and all three are handed to Phase 4 with their causes
measured. What this gate requires is that **the output MATCHES THE HANDOFF** in
`docs/phase-3-verification.md` §8:

1. **Route diversity** — Chongjin–Jeju City 80% (structural, floor 71%), now resolving at **rung 2**.
   **1 of 12 pairs, worst 80%.** Valencia–Palermo was the second row and the only genuine
   `acceptByDiversity` failure (85%, floor only 34%); **C2 closed it — 63% on three routes, PASS**,
   verified at 0 post-condition breaches over 1,498 enumerated pairs.
2. **The `selectPaths` benchmark** — FAIL at p90 and max against the phone budget, PASS at p50.
3. **`ILLICIT STRICTLY DOMINATES`** — 139 of 410 pairs, 33.9%.

> **These three lines were themselves re-measured at C2, because this gate applies to its own
> summary.** They read "2 of 12 / 85% / a genuine filter failure" and "142 of 410, 34.6%" before,
> and a gate that restates a stale handoff is the failure it exists to catch. The full re-measure —
> what moved, what closed, and what is permanent — is `docs/phase-3-verification.md` §3, §4(c)
> and §8.

**A red gate whose numbers have MOVED since the handoff was written is abandoned, not handed off.**
The handoff's value is that Phase 4 can reproduce the failure from the number; a stale number sends
them looking for a defect that is no longer the one they were told about. If a figure moved,
re-measure it into `docs/phase-3-verification.md` in the same commit and say what moved it.

**Except for item 2, which is a WALL-CLOCK measurement and must not be read this way.** An earlier
draft of this gate applied the rule above to all three items, which made it unsatisfiable: run
`pnpm geo:verify` twice on an unchanged tree and the benchmark moves — measured 42.11 → 42.95 ms at
p90 and 122.95 → 134.45 ms at max, with the break-evens sliding 3.56× → 3.49× and 1.22× → 1.12×.
No commit in this sequence could ever have cleared it.

What item 2 hands off is the **verdict per statistic** — PASS at mean and p50, FAIL at p90 and max —
together with the attribution (~95% of the call is Yen backfill; five raw Dijkstras are 0.63 ms) and
the break-even multipliers to one decimal. Those reproduce. **A changed VERDICT is the finding; a
changed millisecond is the clock.** Items 1 and 3 are exact counts and the rule applies to them
unaltered.

### 7. Route diversity

```bash
pnpm geo:diversity
```

**Pass:** median pairwise overlap **under 70%** (`DIVERSITY_PASS_THRESHOLD`,
`packages/tools/geo-build/audit-diversity.ts:160`), **and every pair above the ceiling explained by
its structural `floorPercent`** (`packages/tools/geo-build/route-structure.ts`).

The floor is the overlap forced by edges every candidate must use. So:

- **High floor, high overlap** — `structural`. A fact about the graph, unreachable for any filter
  over this candidate set. The fix is an edge, a ferry or a second corridor, never the filter.
- **Low floor, high overlap** — `filter`. Routes were admitted that did not have to be. **This is
  the only cause that is a failure of ours**, and it is the one the median alone hides.

Reporting the median without the causes is how Valencia–Palermo went unnoticed: it exited 0 at
**median 54% (n = 755)** with a **p90 of 88%**, and a genuine filter defect sat inside that pass.
Post-C2 the same command reads **median 53% (n = 747), p90 87%** — the median moved by a point and
the defect it was hiding is gone, which is the clearest available demonstration that **the median
was never the instrument that could see it**.

**Read the p90 correctly, because it is NOT the per-pair post-condition.** This command measures
each accepted route against the **union of all the others**; the union is a superset of every
pairwise edge set, so the number it prints is never smaller than the worst pairwise overlap the
filter bounds. A route 87% inside the union of four others can be under 70% against each one
individually. A fat tail here is a diversity observation; a breach is a pair failing
`max(overlap(a,b), overlap(b,a)) <= the rung's threshold`, and there are none.

### 8. Engine purity under bare Node

```bash
node packages/engine/src/index.ts
```

**Pass:** exit 0.

This is CLAUDE.md rule 2.2 checked the only way that cannot be argued with — no bundler, no Expo
resolver, no React Native toolchain, no test runner. ESLint and tsconfig catch the import; this
catches everything they cannot see, including a transitive one.

### 9. NO ROUTE BELOW 3% COMPLETION

```bash
pnpm sim -- --pack=corpus --runs=280000 --by-route
```

**Pass:** the worst route's completion is at or above 3%, **reported with its standard error**.

The table also prints **`morale@0`** (the share of runs whose morale reaches 0) and, beneath it,
a **per-route ending histogram**. Those are not decoration: they are parts 2 and 3 of the
acceptance criterion any montage change owes, because two fixes can reach the same completion
through different failure mixes and a single figure cannot tell them apart (ADR 0046).

**The `peak` column was RETIRED at ADR 0046** and no longer appears. It failed its own charter on
the route set the spacing constraint produces, and `hours` — already printed — dominates it
corpus-wide. Do not re-add it without reading `by-route.ts`'s header.

**280,000 is derived, not round, and it is the only count this gate may be run at.** The corpus
grid is **28 routes × 5 policies = 140 cells**, and a floor is a claim about the WORST CELL, so
the count has to divide evenly into the grid or the marginal routes are sampled at a different
depth from the rest: `280000 / 140 = 2000` runs per cell exactly. Two earlier numbers circulated —
250,000 here and 230,000 in `by-route.ts`'s header — and **neither divides**: 250,000 predates the
sixth endpoint pair (ADR 0043) and leaves 1,785.7 per cell, 230,000 leaves 1,642.9. Both were
corrected to 280,000 rather than kept as "close enough", because a fractional cell depth is how
the sampling-stride defect of ADR 0038 stayed invisible. **If `CORPUS_PAIRS` changes, this number
changes with it** — recompute it as `routes × 5 × 2000` and update all three sites together.

Use `--runs=28000` (200/cell) while iterating: it resolves a 10pp+ contrast in ~27 s and cannot
resolve anything nearer the floor than about ±1pp. Confirm at 280,000 only. It writes nothing.

This is the surviving half of ADR 0041's acceptance (the `|Kendall tau| < 0.6` clause was refuted
by construction and dropped — `worn` is a monotone reparametrisation of the hour axis, so no knee
anywhere can break a rank correlation). A route nobody can finish under any play is design pillar
4's dead end, and it is invisible in the pooled number. Print the SE or the gate is decorative:
the difference between a route that reads 3.1% and is safe and one that reads 3.1% and is a 2.7%
route that got lucky is the only thing this gate is for.

> **THIS GATE PASSES AS OF 2026-08-20 (ADR 0046), AND IT HAS BEEN RED TWICE BEFORE.** It first
> read a passing world in the present tense — "the worst route sits at 4.8%, a margin as thin as
> 4.1 standard errors" — describing a 25-route grid that no longer existed. On the 28-route corpus
> this repo ships it then failed outright, with `route.illicit.r1dlxpt5` at 2.32% (−4.5 SE) and
> `route.illicit.r16kyujq` at 2.81% (−1.1 SE) while pooled completion read a comfortable 46.1%.
> **The pooled number being healthy while the gate failed is the whole point of the gate.**
>
> The montage spacing constraint (ADR 0046) closed it: no route is below the floor, and the two
> that were now read 6.95% (+15.5 SE) and 12.26% (+28.2 SE). **`route.illicit.r1gjd3s6` regressed
> in the same change**, 16.51% → 11.32%, and ADR 0046 §Consequences owns that.
>
> **Live figures belong in the command's output, never here.** This block records that the gate has
> twice been wrong in this file, which is the reason it names a command instead of a number.

> **`--by-route` SHIPPED at C4** (`packages/tools/sim/by-route.ts`, ADR 0042), so this gate runs
> today and is the last of the nine to become measurable. It shipped as a **separate output mode,
> on the `--json` precedent** — not as an extra section appended to the standard report. `packages/tools/sim/diff-report.ts` compares the
> two reports **by line index**, so an appended section offsets every line beneath it and a
> formatting change alone would force BOTH baselines to regenerate. That is the same class of
> false positive ADR 0032 exists to prevent.

---

## Removed from the old list, with the reason

- **`pnpm geo:routes -- --check`** — **this command has never existed.** It presumed a committed
  `corpus-routes.json` artifact that could go stale. ADR 0034 decided the opposite: corpus routes
  are **generated at sim time** from the geo slice, so there is no artifact to check and gate 5
  already covers the input it would have been derived from.
- **`--runs=5000` on both `sim:diff` gates** — **refused by design.** See gate 2. Both baselines
  were generated at 2,000 and `sim:diff` exits 1 on a mismatched count. These are the two gates
  that errored out; they were not failing, they were never running.

---

## M3.12b is NOT a Phase 3 gate

The old list ended with _"the four quiet-leg calibration targets met at M3.12b"_ (ADR 0029
Decision 7). **That is removed, and the removal is deliberate rather than a concession.**

M3.12b's PRECONDITIONS are milestone-sized, and none of them is tuning:

- **`forcedFireShare` must be re-measured on the tree the sweep runs on.** It drifted **29.0% →
  28.6%** with nobody touching it, C2 took it to **27.8%**, and **C3 has now moved it to 26.3%** —
  measured, on this tree, at 2,000 runs. It sets the CEILING on how quiet the game can get (a quiet
  leg is by definition not forced), so the reachable quiet share is now bounded at **73.7%**. The
  C3 movement is arithmetic rather than sampling: an unfillable slot forced `slackLegs + 1`
  consecutive legs and filled none, and a fillable one forces one leg and fills it. **Sweep against
  26.3%, and re-measure it again if anything touches beat content or the route set.**
- **Three fenced rates are mixed-unit subtractions** — `complicationRate`, `uneventfulRate` and
  `fallbackRate` are per-SELECTION counts subtracted from a leg-INDEX sum. The absolute error is
  pinned while the remainder it sits in shrinks with the quiet share, so **the relative error GROWS
  precisely as the sweep does its work.** Deciding which population all three belong over is an
  M3.12b deliverable in ADR 0029, not a Phase 3 gate.
- **`Near-repeat rate` needs a null baseline subtracted, and the sign is PACK-DEPENDENT.** Fewer
  draws per run thins the pool without thinning the recency window, which moves the line ~10pp on
  its own. Attributing that to the director would be reading the instrument as the mechanism.

Listing it would make the phase **uncloseable on work that is correctly deferred**.

**The dependency runs one way, and only one way.** **C3 → M3.12b is MANDATORY**: beat content moves
the denominator every quiet-leg target is measured against, so a sweep run before C3 is measuring a
corpus that will not exist. **The reverse does not hold** — beat slots are forced-fire and skip the
odds gate entirely, so no value of `BASE_EVENT_ODDS` can change whether a beat event fires. C3 does
not wait for M3.12b.
