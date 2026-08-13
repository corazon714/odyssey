<!--
  THE FIXTURE BALANCE BASELINE. Committed on purpose, and reviewed like code.

  reports/ is git-ignored and write-protected, because generated output should never be
  committed. This file is the opposite: a balance change should be visible as a diff somebody
  signed off on, not as a number that quietly moved between releases.

  Regenerate deliberately:  pnpm sim -- --runs=2000, then SPLICE the fresh report in below this
                            comment block. **Do not `cp` over this file** — the recipe here said
                            to for six milestones and it destroys the whole comment block, which
                            is the only part a human wrote. Keep it, replace the body under it,
                            and add a note saying what moved and why. Do not write the
                            close-comment marker anywhere in this prose either: diff-report.ts
                            strips the header by finding the FIRST line carrying it, so a stray
                            one in a sentence makes sim:diff compare the leftover header against
                            the report and flag everything.
  Compare without writing:  pnpm sim:diff -- --runs=2000

  ONE BASELINE PER PACK. This is the FIXTURE pack — nine hand-built events with EMPTY
  registries, and the stable control the golden runs are built on. The corpus baseline is
  docs/sim-baseline-corpus.md and is a different measurement, not a newer one.

  Regenerated at Phase 2B M-D. The open findings below are fixture gaps, not engine faults.

  WALL CLOCK IS MACHINE-DEPENDENT AND VARIES RUN TO RUN — 465-787 ms on this machine across
  trees with and without any given change. NOT a regression signal on its own. The budget that
  matters is the extrapolated 20,000-run figure against its 30 s target.

  REPORT FORMAT CHANGED at the Phase 2B verification pass: four lines added — modifier chips
  per check, checks under 2 chips, and universal-choice offer/pick rates. The numbers they
  report are new instrumentation, not new behaviour; every pre-existing line is unmoved.

  REPORT FORMAT CHANGED AGAIN at M3.8b: `hygiene` joins the resource trajectory table. It was
  added because it was needed — hygiene became a graded meter at that milestone and the report
  could not diagnose a meter it did not print, which is how a wrong prediction went unexplained
  for an hour. Both baselines were regenerated in the same commit as the format change, because
  diff-report.ts compares by line index and an inserted line otherwise flags everything below it.

  M3.10b MOVED THIS BASELINE, deliberately. Two engine drift constants changed: starvation
  damage softened (HOURS_PER_HUNGER_DAMAGE 10->16, HOURS_PER_STARVING_DAMAGE 5->9) and morale
  converted from a per-LEG drain to a per-HOUR one. The fixture pack is 10-16-leg routes, so it
  feels the change far less than the corpus does — but it is an engine change and the control
  necessarily moves with it.

  M3.10b FINAL: starvation softened again, 16/9 -> 28/14, after the morale conversion changed
  what the lever does. See docs/adr/0035.

  REPORT FORMAT CHANGED at M3.11: a "Checks over 7 chips" line joins the modifier block. The
  mean alone could not distinguish a band-wide creep from a tail, and those want opposite fixes.

  M3.11 CHIP COLLAPSE DID NOT MOVE THIS BASELINE, and the null result is the point rather than a
  missing measurement. `resolveModifiers` now also returns `resolution.chips` — the resolved rows
  grouped by `sourceKind` for the result screen — and the sim counts THAT instead of
  `resolution.modifiers`, because the 3-7 band is a budget on what the screen asks the player to
  hold. This pack carries `registries.modifiers: []` on purpose, so there is nothing to collapse:
  no check in it ever pulls two rows of one kind, and the two lists are the same list here.

  `pnpm sim:diff -- --runs=2000` reports no change, and the file below is unedited apart from
  this note. The corpus, which has 137 rows, moved 7.3 -> 6.9 chips/check and 38.5% -> 30.6%
  over band; see docs/sim-baseline-corpus.md and docs/adr/0037.

  The goldens did not move either, and that is the load-bearing check for this control: the chip
  list is returned from `resolveChoice` and never written into `RunState`, so `stateDigest`
  cannot see it. `pnpm golden:update` rewrote golden-runs.json byte-identically.

  M3.11c DID NOT MOVE THIS BASELINE EITHER, for the same reason the collapse did not: this pack
  carries `registries.modifiers: []`. The chip list is now BOUNDED at seven — six kind chips plus
  one overflow chip folding the rest — but no check here ever produces more than a handful of
  rows, let alone eight distinct `sourceKind`s, so the bound never bites and `collapseChips`
  returns exactly what it returned before.

  `pnpm sim:diff -- --runs=2000` reports no change, and the file below is unedited apart from
  this note. The corpus moved 6.9 -> 6.4 chips/check and 30.6% -> 0.0% over band; see
  docs/sim-baseline-corpus.md and the addendum to docs/adr/0037.

  The goldens did not move, and it is worth restating why that is a CHECK rather than a
  coincidence: the chip list is returned from `resolveChoice` and never written into `RunState`,
  so `stateDigest` cannot see it. `pnpm golden:update` rewrote golden-runs.json with identical
  digests, choice sequences, leg counts and endings — the only textual difference was prettier
  reflowing nine single-element arrays, so the regenerated file was discarded rather than
  committed.

  M3.11d MOVED THIS BASELINE HARD, and the size of the move is a FINDING about the change rather
  than a fault in this pack. Two engine drift constants were re-derived for the widened route set
  (HOURS_PER_MORALE 12 -> 20, HOURS_PER_HUNGER_DAMAGE 28 -> 44 with STARVING 14 -> 22); see
  docs/sim-baseline-corpus.md and docs/adr/0035.

    Completion rate    48.5% -> 75.3%   (ABOVE the 30-50% band)
    Median legs           12 -> 15
    failure_collapsed   8.4% -> 0.1%
    failure_gave_up    43.1% -> 24.6%

  THIS PACK IS NOW OUT OF BAND AND STARVATION IS VESTIGIAL ON IT, at 0.1% collapse. Stated
  plainly because it is the cost of the change, not a rounding artefact. It is also the clearest
  evidence for what the corpus baseline calls the structural problem: the drift is denominated in
  hours with no recovery term, these nine fixture routes are 10-16 legs and about 112 travel
  hours, and the corpus routes now run to 510. ONE per-hour economy cannot make both interesting
  — softening it enough to give a 400-hour route a chance necessarily makes a 112-hour route
  trivial. The two baselines now bracket that gap instead of hiding it.

  THAT IS NOT A REASON TO RE-TUNE AGAINST THIS PACK. This is the empty-registry CONTROL the
  golden runs are built on (ADR 0022, ADR 0032) — 3,682 checks pulling 0.3 chips, complication
  rate 0.0%, no universal choices — so its completion rate is a determinism reference, not a
  balance target. Its own header has said since M3.10b that an engine change necessarily moves
  it. The balance measurement is the corpus.

  THE GOLDENS MOVED THIS TIME, unlike at M3.11b and M3.11c where the regenerated file was
  discarded as a prettier reflow. `stateDigest` sees the drift, so it must: three runs get
  further (9 -> 13, 14 -> 16, 15 -> 16 legs) and two convert from failure to arrival
  (`failure_collapsed` -> `arrival_quiet`, `failure_gave_up` -> `arrival_quiet`). Six are
  unchanged in outcome. Every one of those deltas is in the direction a softened hour economy
  predicts, which is the review this diff wanted.

  M3.11f/g MOVED THIS BASELINE TOO, AND NOT FOR THE REASON IT MOVED THE CORPUS. The harness
  paired run `i` as `scenario = i % S; policy = i % P`, which enumerates the grid only when
  `gcd(S, P) === 1`. This pack runs 3 routes against 5 policies and `gcd(3, 5) = 1`, so the old
  stride already cycled all 15 of its cells — measured, 15 of 15 before and 15 of 15 after. THE
  FIXTURE WAS NEVER DEGENERATE, and being accidentally correct here is the whole reason the bug
  survived: the DEFAULT pack could not see it, and this is the pack every test and every casual
  `pnpm sim` runs. The corpus, at S = 25, was visiting 25 of its 125 cells. See docs/adr/0038.

  WHAT SHIPPED IS A LATIN SQUARE, `(i % S, (i % S + floor(i / S)) % P)` — the pairing every
  number below was produced by. An intermediate mixed-radix odometer was written, measured and
  REJECTED in the same pass, so no figure in this file was ever generated by it and none is
  quoted from it: it covers the full grid but a truncated prefix of R runs reaches only
  `ceil(R / P)` routes, which is a regression on the default invocation. The enumeration that
  killed it is in docs/adr/0038's addendum. Do not reconstruct an odometer story from this file.

  SO THIS PACK'S MOVE IS A RESAMPLE, NOT A COVERAGE FIX — and a narrower resample than that
  usually means. The scenario index is `i % 3` under BOTH the old stride and the Latin square,
  character for character, so all 2,000 runs play exactly the route they played before and the
  route marginal is 667/667/666 on both sides. ONLY THE POLICY MOVED: 1,598 of 2,000 runs
  (79.9%) now run a different policy under the same seed, and the policy marginal shifts
  400/400/400/400/400 -> 400/401/401/399/399, because 2,000 is not a multiple of 15 and the five
  leftover runs land on different cells.

    Completion rate            75.3% -> 74.0%   (1,506 -> 1,480 completions)
    Long-range payoff rate     90.3% -> 85.3%   (scheduled 31 -> 34, fires 28 -> 29)
    Beat fill rate             50.1% -> 50.2%
    Unresolved threads             3 -> 5
    Checks rolled              3,662 -> 3,682   (tracking total legs 31,184 -> 31,133)
    Endings   hollow           41.3% -> 40.1%   (827 -> 801 runs)
              gave_up          24.6% -> 25.9%   (491 -> 518)
              triumphant       16.9% -> 17.6%   (338 -> 352)
              quiet            17.1% -> 16.4%   (341 -> 327)
              collapsed         0.1% -> 0.1%    (3 -> 2)
    cash leg5 p90                540 -> 500

  EVERY MOVED LINE IS UNDER 1.5pp EXCEPT THE PAYOFF RATE, and that one is the line to distrust
  rather than the one to act on: its 5.0pp is 3 unresolved of 31 becoming 5 of 34. A metric whose
  denominator is ~32 across 2,000 runs is not a balance signal on this pack. `Median legs 15` and
  `Median in-game days 8` did NOT move, which is the null the M3.7 calibration wants, and
  chips/check stays 0.3 with `Checks over 7 chips` 0 — structural, there is no registry here.
  Uneventful legs, empty-pool fallbacks, the repeat-event rate, the choices-picked block, the
  flag block and the whole beat-type block are textually identical on both sides. Nothing here is
  a balance signal and this pack is not a balance target — it is the empty-registry control the
  golden runs are built on.

  NO ENGINE FILE WAS TOUCHED, and that is provable rather than argued: replaying the OLD pairing
  against the corrected tree reproduces the previous body of this file LINE FOR LINE apart from
  the two machine-dependent wall-clock lines, and the corpus's too. The goldens are unmoved for
  the same reason — `git status packages/engine` is empty — so this baseline moving is NOT the
  "an engine change necessarily moves the control" case its M3.10b note describes. It is the
  control being RE-SAMPLED underneath an unchanged engine, which is a weaker event and should not
  be read as the stronger one. Judge the goldens by CONTENT rather than by git status, because
  `pnpm golden:update` re-emits a different layout every time regardless.

  THE REPORT GAINED A LINE. `Grid cells sampled` prints how much of the route x policy grid the
  sample touched, and shouts when a whole route or policy never ran. It is the +1 in the body
  length, and it exists because this format contained the string "route" zero times while a
  pairing bug shipped, was baselined and was argued from underneath it.

  WHAT THAT LINE CANNOT SEE, recorded here because this is the pack where it bites. It catches
  HOLES, not IMBALANCE: a run count that is not a multiple of the grid size reaches its cells an
  unequal number of times, so both marginals can read full while the average is still tilted, and
  the line stays silent. This pack's grid is 15 cells and 2,000 is not a multiple of 15 — hence the
  400/401/401/399/399 policy marginal above. The tilt is negligible at 2,000 and is exactly zero
  only at multiples of 15.

  AND THIS PACK IS THE SHAPE WHERE THE LATIN SQUARE'S SECOND PROPERTY FAILS. "A prefix of
  max(S, P) runs touches every route and every policy" holds only when S >= P; it fails on the
  55 of 720 enumerated shapes with 2 <= S < P, and 3 x 5 is one of them — a prefix of 5 runs here
  reaches 3 of 3 routes but only 3 of 5 policies. Nothing reads it at that count, because the
  default of 100 covers this 15-cell grid six times over, but do not quote the property
  unconditionally off this file. docs/adr/0038's addendum has the enumeration.
-->

# Sim Report — seed=base contentVersion=aee5a082 runs=2000

Grid cells sampled             15   (of 15 — 3/3 routes x 5/5 policies)
Completion rate             74.0%   (target band 30-50%)
Median legs                    15
Median in-game days             8
Never-fired events              0
Empty-pool fallbacks         0.0%   (target <2%)
Uneventful legs              0.0%   (target <2%)
Long-range payoff rate      85.3%   (target 80%)
Beat fill rate              50.2%
Repeat-event rate           67.8%
Complication rate            0.0%   (target 60%)
Modifier chips / check        0.3   (over 3682 checks; NO modifier registry in this pack)
Checks under 2 chips         3682   (expected — there is no registry here, so this is not a finding)
Checks over 7 chips             0   (no registry in this pack)
Universal choices offered    0.0%   (share of choices shown)
Universal choices picked     0.0%   (over ~30% means they are flattening the corpus)
Unresolved threads              5

Wall clock                 566 ms   (0.28 ms/run)
Extrapolated to 20,000     5.7 s   (target <30 s)

## Endings
  ending.arrival_hollow               40.1%
  ending.failure_gave_up              25.9%
  ending.arrival_triumphant           17.6%
  ending.arrival_quiet                16.4%
  ending.failure_collapsed             0.1%

## Never-fired events
  (none)

## Choices picked <2%
  border.bribe_attempt/present_documents               0.0%   <- never picked
  border.bribe_attempt/turn_back                       0.0%   <- never picked
  border.guard_remembers/acknowledge                   0.1%
  border.bribe_attempt/offer_bribe                     0.2%
  border.bribe_attempt/hide_the_cash                   0.4%
  transit.bus_ejection/get_off                         1.1%
  crisis.breakdown/find_help                           1.3%
  transit.bus_ejection/plead_with_driver               1.4%

## Flags
  written: 5   read: 2
  written but NEVER READ:   bribe_on_record, detained, took_the_long_way
  read but NEVER WRITTEN:   (none)   <- gate can never open

## Resource trajectories (p10/p50/p90 by leg)
  cash     leg5: 220/280/500   leg15: 180/440/500   leg25: —
  health   leg5: 9/10/10   leg15: 3/7/9   leg25: —
  morale   leg5: 5/6/7   leg15: 1/3/5   leg25: —
  energy   leg5: 0/2/8   leg15: 0/0/3   leg25: —
  hygiene  leg5: 0/2/3   leg15: 0/0/0   leg25: —

## Beat types no event can fill
  A slot for one of these can only expire, so the fill rate above is bounded below 100%.
  departure
  ferry_boarding
  approach
