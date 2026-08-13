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

  M3.12a ADDED TWO REPORT LINES AND MOVED NOTHING ELSE (2026-08-13, ADR 0029).
  `Quiet legs (designed)` and `Forced-fire legs` sit directly under `Uneventful legs`, because
  Decision 7 item 4 requires designed silence and a content gap to stay distinguishable and
  adjacency is what makes that readable. THE DIFF IS ADDITIVE ONLY: all 59 pre-existing lines
  of this report were compared byte-for-byte against the pre-change run and every one is
  identical. That is the fence rather than a courtesy — the quiet-leg gate ships at
  BASE_EVENT_ODDS = 1:0, i.e. P = 1 exactly, so ANY moved number would mean it is not fenced.

  THREE DENOMINATORS ALSO CHANGED, and are invisible here for the same reason. Empty-pool
  fallbacks and Uneventful legs now divide by totalLegs minus quiet — only a leg that ATTEMPTED
  selection can fall back or find the ladder empty — and Complication rate divides by
  presentedLegs, totalLegs minus uneventful minus quiet. With quiet = 0 all three are
  arithmetically exactly what they were. They diverge the moment M3.12b sets a real base. The
  reasoning is the block comment in packages/tools/sim/run-many.ts and the ADR 0029 addendum;
  note that Decision 6's own table is WRONG about the fallback denominator and the addendum
  corrects it.

  FORCED-FIRE SHARE, MEASURED FOR THE FIRST TIME AT 2,000 RUNS: 33.5% of fixture SELECTIONS
  never reach the gate at all (the corpus baseline measures 29.0%). ADR 0029 Decision 3 estimated roughly
  10-13 legs of a 24-leg route, i.e. ~42-54% OF LEGS, so it is materially HIGH: the gate reaches
  MORE legs than the ADR assumed, and a base picked against that estimate overshoots the quiet
  ratio by about 1.4x. The new Forced-fire legs line prints the resulting ceiling on the quiet
  share on every run, so M3.12b does not have to rederive it.

  MIND THE UNITS IN THAT COMPARISON: the ~42-54% estimate is denominated in LEGS and the 33.5%
  measured here is denominated in SELECTIONS. The finding does not depend on the difference — this
  pack reads 33.5% over legs too, the two populations differing by 20 of 2,000 runs — but do not
  quote the pair as a like-for-like without saying so. The corpus, where the gap is visible, reads
  29.2% over legs against 29.0% over selections. ADR 0029's 400-run table is LEGS-denominated and
  its apparent agreement with the 2,000-run selections figures was withdrawn as a cross-unit
  comparison; see that ADR before citing it.

  IT IS DENOMINATED IN SELECTIONS, NOT LEGS, since the M3.12a follow-up. The sim's legs field is
  state.route.legIndex, a final INDEX, while quietLegs, forcedFireLegs and uneventfulLegs are all
  counted per SELECTION; a run that ends inside resolveChoice selects once more than its index
  says. Measured: 20 of 2,000 fixture runs, 315 of 2,000 corpus runs — a 0.06% and 0.59%
  denominator error. Only Quiet legs and Forced-fire legs were re-cut, because they are the two
  lines M3.12a ADDED and so are not fenced, and because ADR 0029 D3's identity
  realised quiet = (1 - P) x (1 - forcedFireShare) is an identity only over the population the
  gate actually decided on. Complication rate, Uneventful legs and Empty-pool fallbacks stay on
  their leg denominators DELIBERATELY: Complication rate is a pre-existing baseline number and
  re-cutting it would move it (~0.59% on corpus) and break the additive-only fence. That question
  is separable, pre-existing and invisible today (uneventful and fallback both measure 0), and it
  is an M3.12b deliverable. On this pack the visible effect is nil: 33.5% either way.

  THE ~0.59% IS THE VALUE AT 1:0 AND IT GROWS AT M3.12b, which is exactly where the deferral
  lands. attemptedLegs and presentedLegs are MIXED-UNIT SUBTRACTIONS — a leg-INDEX sum (totalLegs)
  minus per-SELECTION counts (quiet, uneventful) — so the absolute error is pinned at 315 corpus
  selections while the remainder it sits in shrinks with the quiet share, and the relative error
  concentrates:  q=0% 0.589%  q=10% 0.655%  q=20% 0.738%  q=30% 0.844%  q=40% 0.986%. That is
  315 / (53,451 - q x 53,766), and it is a floor rather than the whole error, because uneventful
  measures 0 today so only the totalLegs term is currently mismatched.

  THE FIX IS TO COUNT THE SUBTRAHENDS AND THE MINUEND OVER ONE POPULATION, NOT TO "DIVIDE BY
  SELECTIONS". Reading the paragraph above as "so at M3.12b, divide Complication rate by
  totalSelections" is the wrong conclusion and a reader could easily reach it: that throws away the
  subtraction these three rates exist to have — only a leg that ATTEMPTED selection can fall back,
  only one that PRESENTED an event can carry a complication — and would move the number far more
  than 0.6-1.0%. The defect is INSIDE the subtraction. attemptedLegs wants totalSelections - quiet,
  and presentedLegs wants attemptedLegs - uneventful, so that minuend, subtrahends and numerators
  are all per-selection. Lifting the minuend to selections or pushing the subtrahends down to legs
  is M3.12b's call; leaving the two sides on different populations is not an option either way.

  M3.12a FOLLOW-UP: ONE MORE REPORT LINE, AND NOTHING ELSE MOVED (2026-08-13, ADR 0029
  addendum). Near-repeat rate sits directly under Repeat-event rate. THE DIFF IS ADDITIVE ONLY:
  all 62 pre-existing lines of this report were compared line-for-line against the pre-change
  run and every one is identical, apart from the two volatile wall-clock lines diff-report.ts
  already ignores. Same fence as M3.12a and for the same reason: at BASE_EVENT_ODDS = 1:0 no leg
  can be quiet, so a moved number would mean the gate is not fenced.

  WHY A SECOND REPETITION LINE RATHER THAN A FIX TO THE FIRST. Repeat-event rate is
  1 - unique/fired over a whole run, so it falls about 10pp at a 30% quiet share with the
  DIRECTOR UNTOUCHED: the draws shrink while unique is capped by the event pool. It is not wrong
  — the player really was shown that share of re-runs — it is LENGTH-SENSITIVE, and no
  redefinition can be both unconfounded at a positive quiet share and arithmetically identical
  at 1:0, which the fence requires. Those two properties are jointly unsatisfiable, so the line
  is kept exactly and Near-repeat rate — a redraw inside recency's own window, denominated in
  FIRED EVENTS on both sides — sits beside it as the BETTER of the two. It prints draws/run
  beside itself so the scale of the confound sits next to the confounded figure.

  RETRACTION (M3.12a follow-up, ADR 0029 addendum III). Near-repeat rate shipped advertised as
  UNCONFOUNDED — "the quiet share cancels out of it", "diff THIS across a base change". THAT IS
  FALSE and it was measured false with the DIRECTOR LITERALLY UNCHANGED, by deleting draws from
  these very sequences with a non-periodic mask at a 30% quiet share, 2,000 runs, ten mask seeds:

      FIXTURE  near-repeat 62.29% -> 56.63%   (-5.7pp;  Repeat-event rate moves -6.9pp)
      CORPUS   near-repeat 25.99% -> 33.57%   (+7.6pp;  Repeat-event rate moves -9.1pp)

  Comparable in magnitude to the confound it replaces, AND THE SIGN IS PACK-DEPENDENT. Sharing
  units on both sides removes the SCALING confound (unique is pool-capped, fired is not); it does
  NOT remove SEQUENCE COMPRESSION, which is what deleting draws is. Deleting draws both pulls
  distant repeats INTO the 5-draw window (this pack's sparse case) and destroys near-repeat pairs
  by deleting a member (its dense case); which dominates depends on baseline density.

  SO M3.12b MUST SUBTRACT A NULL BASELINE BEFORE ATTRIBUTING ANY MOVEMENT TO THE DIRECTOR. Re-run
  the compression against these 1:0 sequences at the realised quiet share and read the RESIDUAL.
  On the fixture a FALL of up to ~6pp at a 30% quiet share is the null expectation, not a finding.
  The line is kept — it moves less, and for a reason that is measurable and subtractable — but it
  is sold as LESS CONFOUNDED, never as unconfounded.

  ONE DIRECTOR WINDOW ALSO CHANGED UNIT, and is invisible here for the reason the three
  denominators were. recency now counts DRAWS since an event last fired rather than legs, which
  is the same number while quiet is 0 and uneventful measures exactly 0 — it does, on both packs
  at 2,000 runs and in 9 of 9 golden runs. cooldownLegs deliberately stays WALL-CLOCK: it is
  authored content in a field named for its unit, and a montage stretch is quiet by design, so a
  draws unit would freeze every cooldown across it. golden-runs.json is byte-identical. Both
  calls, and the four further leg-denominated sites that were swept and left alone, are in the
  ADR 0029 addendum.


  M3.12b STEP 1 — VERIFIED UNMOVED, WHICH IS NOT THE SAME AS NOT REGENERATED. The sim's policy
  scoring was summing raw resource deltas, so it read `hunger` and `heat` — the two inverted
  scales, where higher is worse — backwards, and scored eating as a loss. It now goes through the
  engine's `RESOURCE_POLARITY`. THE BODY BELOW IS BYTE-IDENTICAL to the one before it apart
  from the wall-clock line, which this header already declares machine-dependent and not a
  signal. The regeneration was run to establish that rather than skipped: 0 of 2,000 fixture
  runs changed a single choice.

  NOT VACUOUS. This pack carries 4 heat and 1 hunger effects, so the fix could have reached it.
  It did not, and the reason is narrower than "no ordering is decided" — that phrasing stood here
  briefly and is false. The sign DOES decide one: on `border.bribe_attempt`, `hide_the_cash`
  (heat +1; cash -60, heat +3) has a best case of +1 under the old scorer and -1 under the new,
  which crosses `present_documents`' flat 0 and flips `risk-taker`'s pick. That pair is simply
  never co-presented — `present_documents` carries `requires: {kind: passport, present: true,
  valid: true}` and no fixture scenario satisfies it, which is why it reads 0.0% never picked
  below. So this pack is immune BY A CONTENT ACCIDENT, not by structure: give a fixture run a
  valid passport and the control would move. The control stayed a control
  while the corpus moved -2.2pp on completion and inverted its ending mix. What moved there, and
  why it is an instrument fix rather than a balance change, is in docs/sim-baseline-corpus.md.

  REPORT FORMAT CHANGED at the recovery milestone step 1: `hunger` joins the resource
  trajectory table, and the local key list is renamed `TRAJECTORY_KEYS`. It had been called
  `RESOURCE_KEYS`, shadowing the engine export of that name with a five-element subset — the
  same shape of defect as the sign bug fixed in this commit, a private copy of engine knowledge
  that silently disagrees with it. Hunger was the meter the table could not plot, and
  `world-tick.ts` charges health only once hunger passes HUNGER_HURTS, so the whole starvation
  story was happening off-camera. Step 2 sizes a recovery mechanic against exactly that meter.
  Both baselines regenerate together because diff-report.ts compares by line index.

  UNMOVED at the recovery milestone step 3, and this time BY STRUCTURE rather than by content
  accident. That step weighted `playerTotal` by a per-resource cash-equivalent worth
  (packages/tools/sim/resource-weights.ts), which reordered choices all over the corpus pack —
  pooled completion there moved 41.3% -> 36.0% and `adversarial-worst-case` fell 64.7% -> 6.9%.
  Here, **0 of 27 (event x scoring-policy) argmaxes flip against 13 of 39 on the corpus**: these
  nine events separate their choices by cash sums far larger than any meter term can reach even
  at heat's weight of 40, so no weight in that table can cross two of them.

  Note the contrast with the step-1 entry above, which found this pack immune to the SIGN fix
  only because `present_documents` is unreachable without a passport no scenario grants. A
  control that is immune by accident tells you nothing when the accident changes; a control that
  is immune because its numbers are two orders of magnitude apart is one you can rely on. Both
  regenerated at 2,000 runs and this body came back byte-identical.
-->

# Sim Report — seed=base contentVersion=aee5a082 runs=2000

Grid cells sampled             15   (of 15 — 3/3 routes x 5/5 policies)
Completion rate             74.0%   (target band 30-50%)
Median legs                    15
Median in-game days             8
Never-fired events              0
Empty-pool fallbacks         0.0%   (target <2%)
Uneventful legs              0.0%   (target <2%)
Quiet legs (designed)        0.0%   (odds gate — designed silence, NOT the two gaps above)
Forced-fire legs            33.5%   (beat slot or queue due — never gated; caps quiet at 66.5%)
Long-range payoff rate      85.3%   (target 80%)
Beat fill rate              50.2%
Repeat-event rate           67.8%
Near-repeat rate            62.3%   (a redraw inside recency's own 6-event window; 15.58 draws/run — LESS confounded than the line above, NOT unconfounded: subtract a null baseline before reading it)
Complication rate            0.0%   (target 60%)
Modifier chips / check        0.3   (over 3682 checks; NO modifier registry in this pack)
Checks under 2 chips         3682   (expected — there is no registry here, so this is not a finding)
Checks over 7 chips             0   (no registry in this pack)
Universal choices offered    0.0%   (share of choices shown)
Universal choices picked     0.0%   (over ~30% means they are flattening the corpus)
Unresolved threads              5

Wall clock                 874 ms   (0.44 ms/run)
Extrapolated to 20,000     8.7 s   (target <30 s)

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
  hunger   leg5: 5/8/10   leg15: 10/10/10   leg25: —
  hygiene  leg5: 0/2/3   leg15: 0/0/0   leg25: —

## Beat types no event can fill
  A slot for one of these can only expire, so the fill rate above is bounded below 100%.
  departure
  ferry_boarding
  approach
