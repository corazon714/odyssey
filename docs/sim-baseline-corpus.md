<!--
  THE CORPUS BALANCE BASELINE. Committed on purpose, and reviewed like code.

  Regenerate deliberately:  pnpm sim -- --runs=2000 --pack=corpus, then SPLICE the fresh report
                            in below this comment block. **Do not `cp` over this file** — the
                            recipe here said to for six milestones and it destroys the whole
                            comment block, which is the only part a human wrote. Keep it,
                            replace the body under it, and add a note saying what moved and why.
                            Do not write the close-comment marker anywhere in this prose either:
                            diff-report.ts strips the header by finding the FIRST line carrying
                            it, so a stray one in a sentence makes sim:diff compare the leftover
                            header against the report and flag everything.
  Compare without writing:  pnpm sim -- --runs=2000 --pack=corpus --diff

  THE FULL SEED CORPUS: 13 events, 137 modifiers, 25 complications, 15 universal choices, and a
  complete en locale. A different measurement from docs/sim-baseline.md (nine hand-built
  fixtures, EMPTY registries), not a newer one.

  THE HEADLINE, AND THE ARGUMENT FOR THE WHOLE ARCHITECTURE: completion is 44.1%, inside
  engine-spec 6's 30-50% band. It did not get there by tuning. Three rounds of trimming food and
  rest moved it 60.0 -> 59.1 -> 53.1 -> 52.1 and then stopped paying; what took it to 44.1% was
  landing the two REGISTRIES, which add costly options a player will actually take. Diversity
  and difficulty turned out to be the same lever.

  Complication rate 59.5% against an ATTACH_PERCENT of 60 — the tunable measures what it says.

  Long-range payoff 73.9% (target 80%) with 6 unresolved threads, from 1.6% and 125 before the
  `priority: beat` bug on authority.the_file_catches_up was found by the first corpus run.

  ONE BUG THE FIRST FULL-REGISTRY RUN FOUND. The sim read `event.choices` directly, so when a
  complication REMOVED a choice it offered one `resolveChoice` refuses — 2000 runs, a crop of
  `loop/unknown-choice`. The engine refusing is the design working (CLAUDE.md 2.7: the engine is
  the authority on legality, not the screen, and the sim is a screen). `selectableChoices` now
  goes through `presentedChoices`, which is the whole reason that is ONE exported function
  rather than two inline expressions. The app layer will need it too.

  STILL OPEN, and it is content work rather than tuning:
    - Beat fill 30.1%. The corpus fills border_crossing and midpoint_crisis; the fixture routes
      also schedule departure, approach and finale. Wants corpus routes, which want route
      generation — Phase 3 engine/src/route/.
      CORRECTED at Phase 3 M3.1: ferry_boarding was listed here and NO fixture route schedules
      it. Measured: 13 slots = departure x3, border_crossing x2, midpoint_crisis x3, approach x2,
      finale x3. Ceiling is 5/13 = 38.5%, so 30.1% is 78% of what is reachable, and route
      generation alone lands at 39-49%. See docs/adr/0027 Decision 5.

  REPORT FORMAT CHANGED at the Phase 2B verification pass: four lines added — modifier chips
  per check, checks under 2 chips, and universal-choice offer/pick rates. The numbers they
  report are new instrumentation, not new behaviour; every pre-existing line is unmoved.

  REPORT FORMAT CHANGED AGAIN at M3.8b: `hygiene` joins the resource trajectory table. It was
  added because it was needed — hygiene became a graded meter at that milestone and the report
  could not diagnose a meter it did not print, which is how a wrong prediction went unexplained
  for an hour. Both baselines were regenerated in the same commit as the format change, because
  diff-report.ts compares by line index and an inserted line otherwise flags everything below it.

  WHAT THE HYGIENE LINE SHOWS, and it is the M3.8b finding: under the old 6-hour cliff the
  corpus read 3/5/6 at leg 5 and 0/0/3 at leg 15 — already floored for 90%+ of runs by mid-run.
  Graded, it reads 1/2/4 and 0/0/0. Grading moved WHEN hygiene floors, not WHETHER, which is
  why completion moved 0.1pp against a predicted 3-7pp.

  ROUTES CHANGED AT M3.10a: the corpus no longer borrows the fixture routes. It runs on
  routes GENERATED from the committed geo slice (docs/adr/0034), in the 10-16 leg short band.
  Every number below is against a different route set, so this baseline does not compare to the
  one before it — completion 44.1% -> 74.4% is the route change, not a balance regression.

  M3.10b: 22-48 leg routes with the reworked drift. Completion 3.6% -> the figure below.
  STILL BELOW THE 30-50% BAND, and that is recorded rather than hidden — see docs/adr/0035.
  Energy is the next binding meter: it floors by mid-run, which is what keeps the morale drain
  running, and no constant in this file can lift completion past ~28% while it does.

  M3.10b FINAL: completion is IN BAND at the figure below, on 22-48 leg routes. The path was
  3.6% -> 26.1% (morale per-hour) -> in band (starvation 16/9 -> 28/14). ENERGY WAS NOT THE
  BINDING METER — slowing it 3x moved completion 26.1% -> 27.4%. Health was, the whole time.

  ROUTE SET RE-PICKED after M3.11: the previous four pairs all shared one DESTINATION, so
  every corpus route finished in the same city and the report looked healthy while measuring
  one endpoint four times. Endpoints are now >=900 km apart pairwise: 4 destinations, 4
  transport modes, 22-46 legs. Completion 47.3% -> 38.7% is the harder, more varied route set,
  not a balance regression — and it sits more centrally in the 30-50 band.

  REPORT FORMAT CHANGED at M3.11: a "Checks over 7 chips" line joins the modifier block, and it
  is what turned the 7.3 mean into an actionable finding — 38.5% of checks exceed the band and
  the worst pulls 13. Across-the-board, not a tail. MEASURED, NOT FIXED: see docs/adr/0023 and
  the handoff note. The mechanical impact is bounded (diminish after 3, clamp +6/-8), so this is
  a pillar-2 legibility problem rather than a balance one.

  M3.11 COLLAPSED THE CHIPS, and exactly two lines moved. `resolution.chips` groups the resolved
  rows by `sourceKind` for the RESULT SCREEN; `resolution.modifiers` is untouched and is still
  what the roll is built from, so no delta and no verdict can move. That is proved as a property
  over 600 generated resolutions (roll neutrality: same die, same total, same verdict off either
  list) and confirmed here — every other line below, completion included, is unchanged. The
  golden runs regenerate byte-identically, because the chip list never enters `RunState`.

  The sim now counts `resolution.chips`, not `resolution.modifiers`: the 3-7 band is a budget on
  what the SCREEN asks the player to hold, not on how many rows the registry matched.

    Modifier chips / check   7.3 -> 6.9
    Checks over 7 chips      7525 (38.5%, worst 13) -> 5980 (30.6%, worst 11)

  STILL OUT OF BAND, and that is recorded rather than hidden. The premise that twelve
  sourceKinds bound the count well inside 3-7 is FALSE — the bound is 12, and 94.6% of groups
  have exactly one member, so there is almost nothing to fold. Checks do not pull eight rows of
  one kind; they pull one row from each of eight-to-eleven DIFFERENT kinds. This is a breadth
  problem, which is what `modifiers.yaml`'s own header says the registry was authored for.
  Two measured follow-ups (suppress zero-delta groups -> 19.1%; an overflow chip -> 0.0%) are
  deferred with their numbers in docs/adr/0037.

  M3.11c BOUNDED THE CHIP LIST AT SEVEN, and again exactly two lines moved. `collapseChips`
  now keeps the six most explanatory kind chips and folds everything past them into ONE overflow
  chip carrying the summed delta and the number of rows it stands for. `resolution.modifiers` is
  still untouched and is still what `runSkillCheck` builds its `RollModifier[]` from — asserted
  directly now, not only by inference: a twelve-kind check feeds the roll 13 modifiers while the
  screen shows 7 chips, and the roll's own `modifiers` list is counted to prove which list it
  read. Every other line below, completion included, is unchanged, and the goldens regenerate
  semantically identically.

    Modifier chips / check   6.9 -> 6.4
    Checks over 7 chips      5980 (30.6%, worst 11) -> 0 (0.0%, worst 7)

  ZERO BY CONSTRUCTION, NOT BY TUNING, and that distinction is the whole point of the change.
  `collapseChips` cannot return more than MAX_MODIFIER_CHIPS for any input, so this line stays 0
  when `modifiers.yaml` grows past 137 rows. Grouping by `sourceKind` reduced the number but its
  ceiling was 12, so the line could drift back out of band with the registry; a ceiling of 7
  cannot.

  WHAT IT COSTS, stated rather than buried. The bound bites on exactly the checks that were over
  band before — 5,980 of 19,553, 30.6% — so roughly a third of result screens now end in
  "Everything else". At worst it folds five kind groups into that one chip. Those five are the
  five SMALLEST contributions by |delta|, which is the argument for the whole thing: the tail
  that gets hidden is the part that did not explain the roll. The player can still drill down —
  `memberIds` names every folded row, and `resolution.modifiers` is still the full audit trail.

  M3.11 SWITCHED THE SLICE to Afro-Eurasia: 263 -> 692 nodes, 404 -> 1215 edges, one
  component after 48 fragments were dropped (ADR 0036). New CORPUS_PAIRS, one per leg bucket.
  COMPLETION FELL 38.7% -> 19.2% AND IS BELOW THE BAND. Not a balance regression and not the
  slice being wrong: 48 legs now means ~15,300 km where it meant ~6,000, so each leg is far
  longer in hours and the M3.10b drift constants were tuned against the shorter ones. Same
  class of problem as M3.10b and it wants the same treatment — read the ending mix, not the
  survival-conditioned trajectory table. Recorded rather than chased.

  M3.11d RE-DERIVED THE HOUR ECONOMY AND THE BAND IS MET AGAIN: 19.2% -> 41.0%, median legs
  20 -> 26. Two drift constants moved, together, and "together" is the finding rather than an
  implementation detail:

    HOURS_PER_MORALE          12 -> 20
    HOURS_PER_HUNGER_DAMAGE   28 -> 44   (HOURS_PER_STARVING_DAMAGE 14 -> 22, the 2:1 rung held)

  NEITHER LEVER REACHES THE BAND ALONE, because the failure mode is conserved — the third time
  this project has measured that and the second time it was nearly mistaken for progress.
  Morale 12/16/20/26/34 gives 19.2/22.4/24.1/25.4/26.6% while `gave_up` falls 52.2% -> 6.5% and
  `collapsed` RISES 28.5% -> 66.8%. Starvation 28/14 -> 44/22 alone gives 28.1% while
  `collapsed` falls to 6.4% and `gave_up` climbs to 65.4%. Each lever deletes its own failure
  mode and hands the runs to the other meter. Only both together clear the floor.

  THE ENDING MIX IS THE HEALTHIEST THIS PACK HAS EVER MEASURED, and it is the number that
  matters more than completion: arrival 41.9%, gave_up 38.3%, collapsed 19.8%. Neither failure
  mode is the majority ending, where the shipped state had gave_up at 52.2%. Both mechanics stay
  well clear of the pillar-1 floor that refused 32/16 at M3.10b.

  Those three read 41.0 / 32.8 / 26.1 until M3.11f/g re-measured them on an unwelded harness. The
  32.8 is not a typo for 32.9: EVERY ending share in this report divides by the ENDING total, not
  by the run count, and the two are not equal — 2,002 endings over 2,000 runs, because two runs
  emit `detained_at_border` AND a terminal ending. 657/2002 is 32.82%. The
  PROPERTY holds — neither failure mode is the majority — but the RATIO it rests on does not:
  collapsed:gave_up moved 0.79 to 0.52 with no engine constant changing. The M3.11d sweep below
  was scored against the welded split, so read the M3.11f/g block at the end of this header before
  quoting that table's `collapsed` and `gave_up` columns for anything.

  WHAT WAS MEASURED, AND WHAT WAS REFUTED. Completion on this pack is dominated by ONE number —
  the route's total travel hours — and not by legs or kilometres. THE VARIABLE SURVIVED M3.11f's
  re-measurement and came out stronger; THE THRESHOLDS DID NOT, because the per-route figures
  behind them came from a harness that showed each route exactly one of the five policies. Every
  number in this paragraph is taken from the full 25 x 5 grid, and EACH ONE CARRIES ITS SAMPLE,
  because this header quotes two different samples of the same quantities and the larger one wins:

    under 150 hours     80.2% to 96.8%    1,000 runs/cell   (this said 55-85%)
    250 to 300 hours    21.1% to 26.1%   25,000 runs/cell   (this said 0.0%; nothing is near zero
                                                             until 383 h)

  THE 250-300 BAND READ "21.3% to 25.8%" AT 1,000 RUNS/CELL AND THAT IS SUPERSEDED, not merely
  refined. The band holds exactly four routes — 260, 272, 281 and 285 h — and at 25,000 runs/cell
  they read 22.32 / 26.14 / 21.06 / 24.88, so the top of the band is ABOVE the 25.8% ceiling this
  file used to print. The under-150 band keeps its 1,000-runs/cell sample rather than being
  restated, because a 25,000-runs/cell rate is recorded here for only three routes in it
  (112 h 95.24%, 116 h 96.64%, 140 h 80.13%) and nothing in this file shows those are all of them.
  Do not re-derive its extremes; re-measure them or leave the sample attached.

  The two train routes still settle that the variable is hours rather than distance, because they
  break the km ordering — but by a smaller multiple than this paragraph claimed: 6,090 km over 36
  legs is 151 hours by train and completes 85.23%, while 5,790 km over 34 legs is 213 hours by car
  and completes 46.09% (both at 25,000 runs/cell; 85.4% and 46.4% at 1,000). Same distance, same
  leg band, 1.8x the completion. It said "four times", which was the welded 58.0% against the
  welded 1.0%.

  HOURS DOMINATE WITH POLICY CONTROLLED FOR, which is the check the old sampling could not run at
  all. Kendall tau-b against completion, computed inside each policy column (n=25 routes): hours
  -0.850 to -0.934, km -0.696 to -0.759, legs -0.653 to -0.703. Hours beats both under all five
  policies with no exception and no near-miss. Dropping the seven doomed routes so the cliff
  cannot do the sorting (n=18) WIDENS the gap rather than closing it: hours -0.732 to -0.922
  against km -0.542 to -0.577 and legs -0.402 to -0.447.

  TWO TIE-FREE CHECKS, worth more than the correlation. km is refuted outright by four pairs
  where MORE kilometres buy MORE completion, every one of them a mode switch that costs fewer
  hours. THIS PARAGRAPH USED TO QUOTE SIX OF THESE EIGHT RATES AT 1,000 RUNS/CELL, thirty lines
  above better ones — the same rule this file states twice below applies to it, so each rate now
  carries its sample and the six are superseded:

    5,990 km/222 h bus   50.4%   [1,000]   to  6,090 km/151 h train  85.23%  [25,000]
    6,356 km/260 h truck 22.32%  [25,000]  to  7,334 km/180 h train  70.06%  [25,000]
    8,306 km/281 h bus   21.06%  [25,000]  to  8,353 km/191 h train  70.65%  [25,000]
    8,741 km/285 h car   24.88%  [25,000]  to  9,026 km/202 h train  60.2%   [1,000]

  The six that moved, in the order they are read above: 151 h 85.4 -> 85.23, 260 h 21.9 -> 22.32,
  180 h 69.7 -> 70.06, 281 h 21.3 -> 21.06, 191 h 69.7 -> 70.65, 285 h 24.5 -> 24.88. All four
  pairs still point the same way and the check is unweakened. The 222 h and 202 h routes are LEFT AT 1,000
  runs/cell because no 25,000-runs/cell figure for either is recorded anywhere in these docs —
  state the bound the sample supports rather than round a better-looking one into existence.
  Legs are refuted by a natural experiment: two routes at exactly 43 legs complete 60.2%
  [1,000 runs/cell] and 0.06% [0.060% at both 1,000 and 25,000 runs/cell], and the hours are 202
  against 383.

  MONOTONICITY WITHIN A MODE, RE-MEASURED AT 25,000 RUNS PER CELL — 125,000 per route, 3.125M
  runs over the grid, zero engine errors, on a seed stream that shares no prefix with the
  harness's. Ordering by hours inside each mode: CAR is strictly monotone across all ten of its
  routes, BUS across all five, and TRUCK is monotone only weakly, because its four routes above
  490 h are all exactly 0 of 125,000 — a tie, not an ordering. TRAIN IS THE EXCEPTION, and train
  is the mode this file used to name as monotone: 180 h completes 70.06% (87,569 of 125,000)
  against 191 h at 70.65% (88,312), +0.59pp with a 95% interval of [0.24, 0.95] that excludes
  zero. One inversion, and it is in train rather than in car.

  THE CAR INVERSION THIS FILE CLAIMED DOES NOT REPRODUCE. It read 395 h at 0.04% against 407 h at
  0.10% — 2 completions against 5 in 5,000, which cannot resolve a sign either way. At 125,000
  runs per route the order is the expected one: 395 h completes 0.100% (125 completions) and
  407 h 0.047% (59), a gap of +0.05pp at roughly five standard errors. THE RULE THIS COST: a
  count in the single digits is not a measurement and two of them are not a comparison. Do not
  order two routes by completions you can count on one hand — either measure until the interval
  closes, or write the counts and decline to order them.

  THE RESIDUAL TRACKS MODE, NOT DISTANCE, AND IT IS LARGER THAN THIS FILE SAID. Ordering all 25
  routes by hours leaves SEVEN adjacent inversions, and ALL SEVEN are mode switches — every one a
  slower mode giving way to a faster one. At 125,000 runs per route, with 95% intervals:

    112 h car    95.24%  ->  116 h bus    96.64%   +1.40pp  [1.25, 1.56]
    140 h car    80.13%  ->  151 h train  85.23%   +5.10pp  [4.81, 5.40]
    187 h car    61.91%  ->  191 h train  70.65%   +8.74pp  [8.37, 9.11]
    213 h car    46.09%  ->  219 h bus    54.24%   +8.14pp  [7.75, 8.53]
    260 h truck  22.32%  ->  272 h car    26.14%   +3.82pp  [3.48, 4.15]
    281 h bus    21.06%  ->  285 h car    24.88%   +3.82pp  [3.49, 4.15]
    383 h truck   0.06%  ->  395 h car     0.10%   +0.04pp  [0.02, 0.06]

  THIS FILE SAID "within 7.4pp everywhere". IT IS NOT. The largest inversion is +8.7pp and a
  second breaches at +8.1pp; both intervals clear 7.4 with room, so this is a refutation rather
  than a rounding difference. The honest form is A BOUND WITH ITS SAMPLE SIZE ATTACHED: over this
  route set, at 125,000 runs per route, no adjacent pair in the hours ordering inverts by more
  than 8.7pp (upper end of the interval 9.1pp) against a 95pp span. Quote it that way and not as
  "everywhere" — "everywhere" is a claim about routes nobody ran. The residual cannot be resolved
  further on THIS route set either:
  mode is nearly a function of hour band here (all six truck routes sit at 260-510 h, all four
  train routes at 151-202 h) and `legHours` is itself built from a per-mode overhead and speed,
  so "hours" partly IS "mode". Separating them needs routes that hold hours fixed across modes,
  and none exist in `CORPUS_PAIRS`.

  THE PAIR SET WAS PRICED AND IS NOT THE FIX. Capping CORPUS_PAIRS at the phase plan's 13,000 km
  ceiling moves completion 19.2% -> 23.7% — still below the floor — and applied on top of this
  change it would report 57.1%, ABOVE the band. It also points the wrong way: sampled over 898
  city pairs on this slice, 46-48 legs is 51.4% of everything in the 22-48 band, so the
  one-pair-per-bucket rule already UNDER-weights the hard tail at 20%. Trimming the set would
  make the sim measure an easier world than the map offers. CORPUS_PAIRS is untouched.

  STILL OPEN, and it is structural rather than tuning. SEVEN of the 25 corpus routes complete
  UNDER 0.2% — every one over 380 travel hours (383 to 510 h), 10,992 km and up. The COUNT,
  the hour range and the km floor all survived M3.11f/g's re-measurement unchanged, to the hour and
  to the kilometre. What did not survive is the flat "0.0%" and the provenance sentence under it,
  which described 1,000 runs per route against ONE policy each:

    383 h / 10,992 km   0.060%  (3 of 5,000)     490 h / 16,983 km   0.000%  (0 of 5,000)
    395 h / 15,444 km   0.040%  (2 of 5,000)     494 h / 17,521 km   0.000%  (0 of 5,000)
    407 h / 15,296 km   0.100%  (5 of 5,000)     498 h / 17,243 km   0.000%  (0 of 5,000)
                                                 510 h / 17,999 km   0.000%  (0 of 5,000)

  Four are true zeros over 5,000 runs; three are not, and are written as 3, 2 and 5 completions
  rather than rounded to 0.0% so nobody re-derives a false absolute from a rounding artefact.
  That is 28% of the pair set, not 20%.

  THOSE THREE COUNTS DO NOT ORDER THEIR ROUTES, and the table above must not be read as if they
  did. Re-measured at 125,000 runs per route the same three read 383 h 0.060% (75 completions),
  395 h 0.100% (125) and 407 h 0.047% (59): the 5,000-run column gets 383 h right to three
  decimal places and gets the 395/407 pair BACKWARDS. Keeping them as counts is what makes that
  visible. Read them as evidence that the routes are doomed, never as a ranking among them — see
  the car-inversion paragraph above for what ranking them cost.

  AND "UNDER 0.2%" RATHER THAN "AT OR BELOW 0.1%", because a bound has to survive its own interval.
  The worst of the seven is `route.scenic.r29ui5g` (395 h), and 0.100% at 125,000 runs is 125
  completions with a 95% interval of [0.082, 0.118] — it straddles 0.1 and cannot settle which side
  the route is on. Two further independent 125,000-run streams read 0.123% [0.104, 0.143] and
  0.112% [0.094, 0.131]; pooled over 250,000 runs that is 0.118% [0.104, 0.131], ABOVE 0.1. So the
  route is not "at or below 0.1%" and the claim was a precision the sample never had. Every one of
  the seven is comfortably under 0.2% on every stream measured, and that is the form to quote.
  Same rule as the car inversion: either measure until the interval closes, or state the bound the
  sample supports.

  DOOMED UNDER ALL FIVE POLICIES, which is the question the welded harness could not ask. Those
  seven span 35 route x policy cells at 1,000 runs each: 30 of the 35 are exactly 0 of 1,000, and
  the single best cell anywhere in the set is 3 of 1,000. No policy rescues any of them, not by a
  percentage point — so the doom is a property of the ROUTE, not of how it is played.

  THE CLIFF IS BOUNDED, NOT LOCATED, and the old text overstated what was known. It lies in
  (285 h, 383 h]: 285 h completes 24.88% at 25,000 runs/cell (24.5% at 1,000; this said 15.0%)
  and 383 h completes 0.06% (0.060% at both samples). The 98-hour
  span between them contains NO ROUTE, and that is a hole in `CORPUS_PAIRS` — which takes one pair
  per leg bucket — rather than a measured dead zone. Write "between 285 and 383 hours"; do not
  pick a number inside it. The distribution either side is bimodal exactly as ADR 0026's addendum
  described, and the aggregate being in band is again an average over which side of the cliff the
  pair set samples. No per-hour constant fixes this:
  drain is linear in hours and there is no recovery term anywhere in the engine, so survival is
  a fixed hour budget that cannot scale with the journey. The fixture control shows the same
  wall from the other side — see docs/sim-baseline.md. The next move is a recovery mechanic or a
  route-length contract the generator enforces, not another sweep. See docs/adr/0035.

  LONG-RANGE PAYOFF IS 24.8% WITH 46 UNRESOLVED THREADS, and the explanation this paragraph used
  to carry is WITHDRAWN. It read 18.0% -> 14.0% with threads 55 -> 63, and blamed runs lasting
  long enough to schedule consequences and then arriving before resolving them. Unwelding the
  harness moved it to 24.8% / 46 WITHOUT TOUCHING THE ENGINE — only which policy each route is
  played under — so a +10.8pp swing says the rate was being measured on a biased fifth of the
  grid, not that runs arrive early. It is also the lowest-n line in this report by an order of
  magnitude: 113 schedules and 28 fires across 2,000 runs, where completion rests on 2,000. Still
  far from the 80% target, still wants its own look, and it wants a bigger instrument before
  anyone tunes against it.

  M3.11f/g REBASELINED BOTH PACKS AFTER A SAMPLING BUG IN THE HARNESS. NO ENGINE FILE MOVED.
  `runMany` paired run `i` as `scenario = i % S; policy = i % P`, which enumerates the grid only
  when `gcd(S, P) === 1`. On this pack S is 25 and P is 5, so `i % 5` was fully determined by
  `i % 25`: every route was welded to exactly ONE policy and the sim visited 25 of its 125
  route x policy cells.

  THAT SENTENCE USED TO READ "every number in this file above this block is that biased fifth."
  It was true when this block was appended to an all-welded header and it is FALSE NOW: the
  M3.11f/g passes inserted corrected paragraphs ABOVE it — :173-174 (the full 25 x 5 grid), :222
  (monotonicity re-measured at 25,000 runs/cell), :241 (125,000 runs/route with intervals), and
  the doomed-route and tau-b tables — so as written it retroactively disowned the very
  measurements that replaced the biased fifth. A blanket that names a POSITION ("everything
  above") rather than a MEASUREMENT cannot survive an insertion above it; each corrected
  paragraph now carries its own sample tag instead, and that is the durable form.

  WHAT SHIPPED IS A LATIN SQUARE, `cellFor(i, S, P) = (i % S, (i % S + floor(i / S)) % P)`, and
  that is the pairing the body below was generated by. IT HAS TWO PROPERTIES AND THEY DO NOT HOLD
  UNDER THE SAME CONDITIONS, so do not read them as one sentence:

    (a) a bijection onto the grid, for every S and P — coprime or not, S < P, either count 1.
        UNCONDITIONAL.
    (b) a prefix of max(S, P) runs already touches every route and every policy — the property
        that matters, because `--runs` is a round number and the grid size is not.
        ONLY WHEN S >= P.

  (b) FAILS ON 55 OF THE 720 ENUMERATED SHAPES, all of them and exactly those with 2 <= S < P —
  INCLUDING THE FIXTURE PACK'S OWN 3 x 5, where a prefix of max(3, 5) = 5 runs reaches 3 of 3
  routes but only 3 of 5 policies. This pack is 25 x 5 and sits on the safe side; the fixture is
  not, and is saved by covering its 15-cell grid six times over at the default rather than by the
  property. Do not quote (b) unconditionally. docs/adr/0038's addendum has the enumeration and the
  variant that closes the gap.

  An intermediate mixed-radix odometer (policies on the low digit, scenarios on the high one) was
  written, measured and REJECTED inside the same pass: it has (a) and fails (b) for every S > 1 < P,
  so at the `--runs=100` default CLAUDE.md 5 documents it sampled 20 of 25 routes — always the same
  five dropped, the five profiles of the HIGHEST LEG BUCKET, and five of the seven near-zero routes
  — and reported completion 10.6pp optimistic. No number in this file was ever produced by it and
  none is quoted from it; do not reconstruct an odometer story from this file. The enumeration that
  killed it, and the near-miss one operator away from the Latin square, are in docs/adr/0038 and
  its addendum.

  THIS IS A MEASUREMENT CORRECTION, NOT A BALANCE CHANGE, and that is provable rather than
  asserted. Replaying the OLD pairing against the corrected tree reproduces the previous body of
  this file LINE FOR LINE — the only two lines that differ are the wall-clock pair this header
  already documents as machine-dependent — and the fixture's too. So the engine returns identical
  output for identical (seed, scenario, policy) triples, and 100% of the movement below is
  attributable to which cells got sampled. The goldens are unmoved for the same reason:
  `packages/engine` was not touched, and `git status` on it is empty.

    Completion rate            41.0% -> 41.9%   (821 -> 838 completions; mid-band before and after)
    Median legs                   26 -> 25
    Long-range payoff rate     14.0% -> 24.8%   (largest mover; see the note above)
    Beat fill rate             29.2% -> 28.0%
    Repeat-event rate          67.9% -> 67.5%
    Complication rate          60.3% -> 60.2%   (ATTACH_PERCENT is 60)
    Universal choices picked   38.7% -> 38.3%
    Unresolved threads            63 -> 46
    Checks rolled             21,063 -> 20,501
    Endings   arrival          41.0% -> 41.9%   (821 -> 838 runs)
              gave_up          32.8% -> 38.3%   (657 -> 766)
              collapsed        26.1% -> 19.8%   (522 -> 396)
              detained          0.1% -> 0.1%    (two runs under both — unmoved)
    cash leg25 p10/p50/p90   873/1966/3280 -> 616/1946/3248
    Modifier chips / check       6.4 -> 6.4    (6.3677 -> 6.3740 — the invariant that proves it)

  THE MARGINALS DID NOT MOVE; ONLY THE JOINT DID, and on this pack not even the route marginal's
  membership. The scenario index is `i % 25` under BOTH pairings, character for character, so
  every one of the 2,000 runs plays exactly the route it played before and each route still gets
  exactly 80 runs; each policy still gets exactly 400. What changed is which policy plays which
  route, for 1,600 of the 2,000 runs (80.0%) — and the cell count with it, 25 of 125 to 125 of
  125, every cell visited exactly 16 times. That is also why the aggregate barely moved while
  every per-route number was worthless: the weld's biases cancelled to within ~1.64pp in the
  average, AT 25,000 RUNS/CELL. The 41.0% headline was right by luck, not by construction —
  weighting all 125 cells equally, the true figure is 42.53% and the welded diagonal's is 40.89%.
  The same quantity reads ~1.70pp at 2,000 runs/cell (42.53% against 40.83%), which is the figure
  quoted lower in this header; they are two samples of one number, not a disagreement.

  THE ENDING SHIFT IS DECOMPOSED RATHER THAN WAVED AT, because 6.3pp of a failure mode deserves
  better than "sampling". The weld put the two collapse-heavy policies on the routes where they
  collapse hardest, and the gave_up-heavy ones where they give up least. Measured on the
  1,000-runs-per-cell grid, welded subset against all 25 routes — 400 is the per-POLICY count in
  a 2,000-run report, never a per-cell one, and a cell in that report holds 80 runs welded or 16
  corrected:

    adversarial-worst-case   collapsed  64.9% welded   vs  39.1% over all routes
    risk-taker               collapsed  38.4% welded   vs  27.9% over all routes
    random                   gave_up    59.8% welded   vs  74.4% over all routes
    greedy-fast              gave_up     3.5% welded   vs  15.1% over all routes

  Re-weighting those is the whole of the -6.3pp collapsed / +5.4pp gave_up move.

  WHAT DID NOT MOVE IS THE MORE USEFUL HALF. Empty-pool fallbacks and uneventful legs stay 0.0%,
  errors and turn-cap hits stay 0, and chips/check is 6.37 under both pairings with `Checks over
  7 chips` at 0 and the worst pull at 7. The fix executes 100 route x policy combinations this
  harness had NEVER run, and not one produced an engine error, an empty pool or a turn-cap hit.
  That is a robustness result bought by the new coverage, not a regression. The chip line is the
  cleanest control of the lot: it is a property of the registry and the check tags, independent
  of which route or policy is running, and it is invariant to three significant figures.

  ONE PER-POLICY FINDING THE GRID MAKES UNAVOIDABLE, not caused by this fix and not repaired by
  it. Over 25,000 runs each: random 21.3%, greedy-safe 24.9%, greedy-fast 63.9%, risk-taker
  42.4%, adversarial-worst-case 60.1%. `policy.ts`'s own header says a rate under `random` and
  under `adversarial-worst-case` bound the range a real player lives in. They do not — adversarial
  has the SECOND-HIGHEST completion of the five, 39pp above random. The intended lower bound is in
  the upper half of the range. This was invisible before, because every policy was seen on a
  different, non-overlapping fifth of the routes and the columns were not comparable.

  READING THE DIFF THAT PRODUCED THIS FILE: `city.the_address_that_moved/ask_in_the_shop` crossed
  1.9% -> 2.0% and left the "Choices picked <2%" list, so that section is one line shorter and
  diff-report.ts, which compares by LINE INDEX on purpose, reported every line below it as moved.
  The `energy` and `hygiene` rows, the flag block and the whole beat-type block are textually
  identical on both sides. Do not read them as findings. THAT SECTION IS THE NOISIEST IN THE
  REPORT and one departure is the whole of its membership change: rows are sorted by share with
  ties broken by key, so a one-run move swaps two adjacent rows and the line-index diff reports
  both. Read it by key, never by position.

  WHERE THE LATIN SQUARE EARNS ITS KEEP IS BELOW THE GRID, NOT AT 2,000 RUNS. At 2,000 this pack
  is covered exactly 16 times over and the shipped pairing and the rejected odometer are the same
  sample — 125 of 125 cells, every cell 16 times, route marginal 80, policy marginal 400 under
  both, so the choice between them is worth nothing here. It is worth everything at the counts
  people actually type: at `--runs=100` the Latin square runs 25/25 routes and 5/5 policies with
  a cell-weighted completion of 42.3%, against the full grid's 42.5%; the odometer ran 20/25 and
  53.2%. In one line: WHEN S >= P, A PREFIX OF max(S, P) RUNS TOUCHES EVERY ROUTE AND EVERY
  POLICY — and 25 x 5 is such a shape, which is why the claim is safe HERE and not in general.
  Both figures are re-measured at 25,000 runs per cell rather than the 16 the first pass used.

  WHAT THE COVERAGE LINE CANNOT SEE, stated as a bound rather than left to be discovered: it
  catches HOLES, not IMBALANCE. Between the round counts, a prefix can carry real bias with BOTH
  marginals reading full and the line therefore silent, because the cells it did reach are reached
  unequal numbers of times. Measured on this 25 x 5 grid at 2,000 runs per cell, against the
  full grid's cell-weighted 42.5%:

    --runs=39     +8.4pp optimistic     25/25 routes, 5/5 policies — the line says nothing
    --runs=50     +1.5pp                25/25 routes, 5/5 policies — the line says nothing
    --runs=100    -0.2pp                25/25 routes, 5/5 policies
    --runs=125    exactly 0             and at every multiple of 125, this file's 2,000 included

  So the bias is zero only at multiples of the 125-cell grid — among round numbers, 250 and up.
  That is still strictly better than the old stride, which was ~1.70pp off at EVERY R — that
  figure at 2,000 runs/cell, the sample this table is taken at; the same bias is ~1.64pp at
  25,000 runs/cell, quoted above — because it
  could never reach more than 25 of the 125 cells; the Latin square's error is a truncation
  artefact that closes, not a permanent weld. If you run a count that is not a multiple of 125,
  read the number as a sample and not as the grid.

  THE REPORT GAINED A LINE, which is the +1 in the body length. `Grid cells sampled` prints the
  sample before the first rate computed over it, because until now this format contained the
  string "route" zero times — a pairing bug shipped, was baselined and was argued from, and the
  artifact everyone reads said nothing about which part of the space had been measured.

  M3.12a ADDED TWO REPORT LINES AND MOVED NOTHING ELSE (2026-08-13, ADR 0029).
  `Quiet legs (designed)` and `Forced-fire legs` sit directly under `Uneventful legs`, because
  Decision 7 item 4 requires designed silence and a content gap to stay distinguishable and
  adjacency is what makes that readable. THE DIFF IS ADDITIVE ONLY: all 115 pre-existing lines
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

  FORCED-FIRE SHARE, MEASURED FOR THE FIRST TIME AT 2,000 RUNS: 29.0% of corpus SELECTIONS
  never reach the gate at all (the fixture baseline measures 33.5%). ADR 0029 Decision 3 estimated roughly
  10-13 legs of a 24-leg route, i.e. ~42-54% OF LEGS, so it is materially HIGH: the gate reaches
  MORE legs than the ADR assumed, and a base picked against that estimate overshoots the quiet
  ratio by about 1.4x. The new Forced-fire legs line prints the resulting ceiling on the quiet
  share on every run, so M3.12b does not have to rederive it.

  MIND THE UNITS IN THAT COMPARISON, AND THIS IS THE PACK WHERE IT IS VISIBLE: the ~42-54%
  estimate is denominated in LEGS and the 29.0% measured here is denominated in SELECTIONS. Over
  legs this pack reads 29.2%, so the ~0.2pp gap is systematic, not noise — it is the 315-run
  effect below. The finding survives either way (19pp against a 0.2pp unit difference), but do not
  quote the pair as like-for-like without saying which is which. ADR 0029's 400-run table is
  LEGS-denominated, and its apparent agreement with the 2,000-run selections figures was withdrawn
  as a cross-unit comparison: 29.0% over legs at 400 runs against 29.0% over selections at 2,000 is
  a rounding coincidence. Within one unit the shipped harness reads 29.2%/28.9% at 400 runs and
  29.2%/29.0% at 2,000 (legs/selections).

  IT IS DENOMINATED IN SELECTIONS, NOT LEGS, since the M3.12a follow-up, and on THIS pack that
  moves the printed figure: 29.2% -> 29.0%, ceiling 70.8% -> 71.0%. The sim's legs field is
  state.route.legIndex, a final INDEX, while quietLegs, forcedFireLegs and uneventfulLegs are all
  counted per SELECTION; a run that ends inside resolveChoice selects once more than its index
  says. Measured: 315 of 2,000 corpus runs, 20 of 2,000 fixture runs — a 0.59% and 0.06%
  denominator error. Only Quiet legs and Forced-fire legs were re-cut, because they are the two
  lines M3.12a ADDED and so are not fenced, and because ADR 0029 D3's identity
  realised quiet = (1 - P) x (1 - forcedFireShare) is an identity only over the population the
  gate actually decided on. Complication rate, Uneventful legs and Empty-pool fallbacks stay on
  their leg denominators DELIBERATELY: Complication rate is a pre-existing baseline number and
  re-cutting it would move it by ~0.59% here and break the additive-only fence that is M3.12a's
  whole claim. That question is separable, pre-existing and invisible today (uneventful and
  fallback both measure 0), and it is an M3.12b deliverable.

  THE ~0.59% IS THE VALUE AT 1:0 AND IT GROWS AT M3.12b, which is exactly where the deferral
  lands, and this is the pack that carries it. attemptedLegs and presentedLegs are MIXED-UNIT
  SUBTRACTIONS — a leg-INDEX sum (totalLegs = 53,451) minus per-SELECTION counts (quiet,
  uneventful; totalSelections = 53,766) — so the absolute error is pinned at 315 selections while
  the remainder it sits in shrinks with the quiet share, and the relative error concentrates:

      q=0%  0.589%    q=10%  0.655%    q=20%  0.738%    q=30%  0.844%    q=40%  0.986%

  That is 315 / (53,451 - q x 53,766). It is a FLOOR rather than the whole error, because
  uneventful measures exactly 0 today, so only the totalLegs term is currently mismatched; the
  moment uneventful or fallback becomes non-zero they inherit the same denominator. By q=40% the
  error has nearly doubled — a third-decimal problem, not a fourth.

  THE FIX IS TO COUNT THE SUBTRAHENDS AND THE MINUEND OVER ONE POPULATION, NOT TO "DIVIDE BY
  SELECTIONS". Reading the paragraph above as "so at M3.12b, divide Complication rate by
  totalSelections" is the wrong conclusion and a reader could easily reach it: that throws away the
  subtraction these three rates exist to have — only a leg that ATTEMPTED selection can fall back,
  only one that PRESENTED an event can carry a complication — and would move the number far more
  than 0.6-1.0%. The defect is INSIDE the subtraction. attemptedLegs wants totalSelections - quiet,
  and presentedLegs wants attemptedLegs - uneventful, so that minuend, subtrahends and numerators
  (complicated, fallback and uneventful are all counted per selection) share one population.
  Lifting the minuend to selections or pushing the subtrahends down to legs is M3.12b's call;
  leaving the two sides on different populations is not an option either way.

  M3.12a FOLLOW-UP: ONE MORE REPORT LINE, AND NOTHING ELSE MOVED (2026-08-13, ADR 0029
  addendum). Near-repeat rate sits directly under Repeat-event rate. THE DIFF IS ADDITIVE ONLY:
  all 118 pre-existing lines of this report were compared line-for-line against the pre-change
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

      CORPUS   near-repeat 25.99% -> 33.57%   (+7.6pp;  Repeat-event rate moves -9.1pp)
      FIXTURE  near-repeat 62.29% -> 56.63%   (-5.7pp;  Repeat-event rate moves -6.9pp)

  Comparable in magnitude to the confound it replaces, AND THE SIGN IS PACK-DEPENDENT. Sharing
  units on both sides removes the SCALING confound (unique is pool-capped, fired is not); it does
  NOT remove SEQUENCE COMPRESSION, which is what deleting draws is. On THIS pack repeats are
  sparse — 13 events over 26.88 draws — so most repeat pairs sit outside the 5-draw window,
  compression pulls them IN, and the rate RISES. On the fixture, where 62% of draws are already
  near-repeats, deleting a member destroys the pair and it FALLS.

  SO M3.12b MUST SUBTRACT A NULL BASELINE BEFORE ATTRIBUTING ANY MOVEMENT TO THE DIRECTOR. Re-run
  the compression against these 1:0 sequences at the realised quiet share and read the RESIDUAL.
  On this pack a RISE of up to ~8pp at a 30% quiet share is the null expectation, not a finding —
  and the ADR's own "a rise is the real finding" row said the opposite until this addendum. The
  line is kept — it moves less, and for a reason that is measurable and subtractable — but it is
  sold as LESS CONFOUNDED, never as unconfounded.

  ONE DIRECTOR WINDOW ALSO CHANGED UNIT, and is invisible here for the reason the three
  denominators were. recency now counts DRAWS since an event last fired rather than legs, which
  is the same number while quiet is 0 and uneventful measures exactly 0 — it does, on both packs
  at 2,000 runs and in 9 of 9 golden runs. cooldownLegs deliberately stays WALL-CLOCK: it is
  authored content in a field named for its unit, and a montage stretch is quiet by design, so a
  draws unit would freeze every cooldown across it. golden-runs.json is byte-identical. Both
  calls, and the four further leg-denominated sites that were swept and left alone, are in the
  ADR 0029 addendum.

-->

# Sim Report — seed=base contentVersion=c10af194 runs=2000

Grid cells sampled            125   (of 125 — 25/25 routes x 5/5 policies)
Completion rate             41.9%   (target band 30-50%)
Median legs                    25
Median in-game days            10
Never-fired events              0
Empty-pool fallbacks         0.0%   (target <2%)
Uneventful legs              0.0%   (target <2%)
Quiet legs (designed)        0.0%   (odds gate — designed silence, NOT the two gaps above)
Forced-fire legs            29.0%   (beat slot or queue due — never gated; caps quiet at 71.0%)
Long-range payoff rate      24.8%   (target 80%)
Beat fill rate              28.0%
Repeat-event rate           67.5%
Near-repeat rate            26.0%   (a redraw inside recency's own 6-event window; 26.88 draws/run — LESS confounded than the line above, NOT unconfounded: subtract a null baseline before reading it)
Complication rate           60.2%   (target 60%)
Modifier chips / check        6.4   (target 3-7, over 20501 checks)
Checks under 2 chips            0   (each one draws nothing the registry exists for)
Checks over 7 chips             0   (0.0% of checks; worst pulls 7)
Universal choices offered   37.5%   (share of choices shown)
Universal choices picked    38.3%   (over ~30% means they are flattening the corpus)
Unresolved threads             46

Wall clock                 1894 ms   (0.95 ms/run)
Extrapolated to 20,000     18.9 s   (target <30 s)

## Endings
  ending.arrival_quiet                41.9%
  ending.failure_gave_up              38.3%
  ending.failure_collapsed            19.8%
  ending.detained_at_border            0.1%

## Never-fired events
  (none)

## Choices picked <2%
  border.night_crossing/make_yourself_useful           0.0%   <- never picked
  encounter.the_other_traveller/u:use_an_item          0.0%   <- never picked
  filler.the_hours_between/u:use_an_item               0.0%   <- never picked
  filler.the_long_quiet_stretch/u:use_an_item          0.0%   <- never picked
  rest.the_shared_room/leave_the_bulk_behind           0.0%   <- never picked
  road.the_hitchhiker/u:use_an_item                    0.0%   <- never picked
  weather.the_storm_you_cannot_drive_through/find_the_mechanic_first   0.0%   <- never picked
  weather.the_storm_you_cannot_drive_through/u:use_an_item   0.0%   <- never picked
  breakdown.the_roadside_repair/u:offer_to_work_for_it   0.0%
  breakdown.the_roadside_repair/find_someone_who_can   0.0%
  weather.the_storm_you_cannot_drive_through/see_to_the_damage   0.0%
  authority.the_file_catches_up/make_it_go_away        0.0%
  breakdown.the_roadside_repair/fix_it_yourself        0.0%
  crime.the_offer/put_it_somewhere_they_will_not_look   0.0%
  authority.the_file_catches_up/u:bluff_with_documents   0.0%
  authority.the_file_catches_up/answer_the_questions   0.0%
  authority.the_file_catches_up/u:run                  0.0%
  authority.the_file_catches_up/u:bribe                0.0%
  city.the_address_that_moved/u:let_the_companion_handle_it   0.0%
  road.the_hitchhiker/u:let_the_companion_handle_it    0.0%
  weather.the_storm_you_cannot_drive_through/u:ask_for_help   0.0%
  road.the_hitchhiker/leave_them_at_the_junction       0.0%
  breakdown.the_roadside_repair/nurse_it_along         0.1%
  rest.the_shared_room/u:threaten                      0.1%
  encounter.the_other_traveller/u:let_the_companion_handle_it   0.1%
  border.night_crossing/offer_something                0.1%
  border.night_crossing/u:offer_to_work_for_it         0.1%
  transit.the_wrong_carriage/u:offer_to_work_for_it    0.2%
  transit.the_wrong_carriage/pay_the_difference        0.2%
  breakdown.the_roadside_repair/u:pay_the_asking_price   0.2%
  transit.the_wrong_carriage/talk_your_way_through     0.2%
  crime.the_offer/u:create_a_distraction               0.2%
  crime.the_offer/u:offer_to_work_for_it               0.2%
  breakdown.the_roadside_repair/u:threaten             0.2%
  rest.the_shared_room/see_to_your_feet                0.3%
  rest.the_shared_room/sleep_on_your_bag               0.3%
  filler.the_long_quiet_stretch/listen_to_the_engine   0.3%
  opportunity.work_for_a_day/u:walk_away               0.3%
  border.night_crossing/present_papers                 0.3%
  border.night_crossing/u:bluff_with_documents         0.3%
  weather.the_storm_you_cannot_drive_through/u:run     0.3%
  rest.the_shared_room/u:create_a_distraction          0.3%
  weather.the_storm_you_cannot_drive_through/push_on_through_it   0.4%
  weather.the_storm_you_cannot_drive_through/shelter_and_lose_the_day   0.4%
  authority.the_file_catches_up/stand_your_ground      0.6%
  encounter.the_other_traveller/u:walk_away            0.6%
  city.the_address_that_moved/u:plead_ignorance        0.6%
  rest.the_shared_room/u:pay_the_asking_price          0.6%
  encounter.the_other_traveller/look_at_their_leg      0.6%
  filler.the_long_quiet_stretch/keep_going             0.6%
  filler.the_long_quiet_stretch/u:wait_it_out          0.6%
  rest.the_shared_room/pay_for_a_private_room          0.6%
  city.the_address_that_moved/work_it_out_yourself     0.6%
  border.night_crossing/keep_it_out_of_sight           0.9%
  road.the_hitchhiker/u:run                            1.1%
  transit.the_wrong_carriage/u:lie_about_destination   1.2%
  encounter.the_other_traveller/share_what_you_have    1.3%
  crime.the_offer/u:bribe                              1.5%
  crime.the_offer/say_no                               1.6%
  transit.the_wrong_carriage/u:pay_the_asking_price    1.6%
  opportunity.work_for_a_day/take_the_day_rate         1.7%
  border.night_crossing/u:bribe                        1.8%
  road.the_hitchhiker/drive_on                         1.8%
  opportunity.work_for_a_day/haggle_the_rate_first     2.0%

## Flags
  written: 20   read: 5
  written but NEVER READ:   bribe_on_record, burned_a_bridge, companion_local, detained, helped_a_stranger, made_a_scene, owed_a_favour, paid_a_local, papers_lost, papers_questioned, smuggler_contact, stash_used, ticket_purchased, took_the_long_way, travelling_light
  read but NEVER WRITTEN:   (none)   <- gate can never open

## Resource trajectories (p10/p50/p90 by leg)
  cash     leg5: 1145/2156/4264   leg15: 909/1948/4080   leg25: 616/1946/3248
  health   leg5: 9/10/10   leg15: 4/7/9   leg25: 2/5/7
  morale   leg5: 6/8/10   leg15: 2/6/9   leg25: 2/6/10
  energy   leg5: 0/1/6   leg15: 0/0/0   leg25: 0/0/0
  hygiene  leg5: 0/1/3   leg15: 0/0/0   leg25: 0/0/0

## Beat types no event can fill
  A slot for one of these can only expire, so the fill rate above is bounded below 100%.
  departure
  ferry_boarding
  approach
  finale
