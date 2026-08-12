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
  matters more than completion: arrival 41.0%, gave_up 32.8%, collapsed 26.1%. Neither failure
  mode is the majority ending, where the shipped state had gave_up at 52.2%. Both mechanics stay
  well clear of the pillar-1 floor that refused 32/16 at M3.10b.

  WHAT WAS MEASURED, AND WHAT WAS REFUTED. Completion on this pack is a near-deterministic
  function of ONE number — the route's total travel hours — and not of legs or kilometres. Per
  route, 25 scenarios, 200 runs each: under 150 hours completes 55-85%, over 250 hours completed
  0.0% before this change. The two train routes settle it, because they break the km ordering:
  6,090 km over 36 legs is 151 hours by train and completed 58.0%, while 5,790 km over 34 legs
  is 213 hours by car and completed 1.0%. Same distance, same leg band, four times the
  completion, and the discriminator is hours.

  THE PAIR SET WAS PRICED AND IS NOT THE FIX. Capping CORPUS_PAIRS at the phase plan's 13,000 km
  ceiling moves completion 19.2% -> 23.7% — still below the floor — and applied on top of this
  change it would report 57.1%, ABOVE the band. It also points the wrong way: sampled over 898
  city pairs on this slice, 46-48 legs is 51.4% of everything in the 22-48 band, so the
  one-pair-per-bucket rule already UNDER-weights the hard tail at 20%. Trimming the set would
  make the sim measure an easier world than the map offers. CORPUS_PAIRS is untouched.

  STILL OPEN, and it is structural rather than tuning. Five of the 25 corpus routes still
  complete at 0.0% — every one over 380 travel hours, i.e. over ~11,000 km. The distribution is
  bimodal exactly as ADR 0026's addendum described it, and the aggregate being in band is again
  an average over which side of the cliff the pair set samples. No per-hour constant fixes this:
  drain is linear in hours and there is no recovery term anywhere in the engine, so survival is
  a fixed hour budget that cannot scale with the journey. The fixture control shows the same
  wall from the other side — see docs/sim-baseline.md. The next move is a recovery mechanic or a
  route-length contract the generator enforces, not another sweep. See docs/adr/0035.

  ALSO MOVED, and expected: long-range payoff 18.0% -> 14.0% with unresolved threads 55 -> 63.
  Runs now last long enough to schedule consequences and then ARRIVE before resolving them, which
  is the same effect ADR 0035 recorded when median legs rose. It is a queue-drain question, not
  a director bug, but it is drifting further from the 80% target and wants its own look.
-->

# Sim Report — seed=base contentVersion=c10af194 runs=2000

Completion rate             41.0%   (target band 30-50%)
Median legs                    26
Median in-game days            10
Never-fired events              0
Empty-pool fallbacks         0.0%   (target <2%)
Uneventful legs              0.0%   (target <2%)
Long-range payoff rate      14.0%   (target 80%)
Beat fill rate              29.2%
Repeat-event rate           67.9%
Complication rate           60.3%   (target 60%)
Modifier chips / check        6.4   (target 3-7, over 21063 checks)
Checks under 2 chips            0   (each one draws nothing the registry exists for)
Checks over 7 chips             0   (0.0% of checks; worst pulls 7)
Universal choices offered   37.6%   (share of choices shown)
Universal choices picked    38.7%   (over ~30% means they are flattening the corpus)
Unresolved threads             63

Wall clock                 1871 ms   (0.94 ms/run)
Extrapolated to 20,000     18.7 s   (target <30 s)

## Endings
  ending.arrival_quiet                41.0%
  ending.failure_gave_up              32.8%
  ending.failure_collapsed            26.1%
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
  weather.the_storm_you_cannot_drive_through/see_to_the_damage   0.0%   <- never picked
  weather.the_storm_you_cannot_drive_through/u:use_an_item   0.0%   <- never picked
  breakdown.the_roadside_repair/u:offer_to_work_for_it   0.0%
  breakdown.the_roadside_repair/fix_it_yourself        0.0%
  breakdown.the_roadside_repair/find_someone_who_can   0.0%
  crime.the_offer/put_it_somewhere_they_will_not_look   0.0%
  authority.the_file_catches_up/answer_the_questions   0.0%
  authority.the_file_catches_up/make_it_go_away        0.0%
  breakdown.the_roadside_repair/nurse_it_along         0.0%
  authority.the_file_catches_up/u:bluff_with_documents   0.0%
  breakdown.the_roadside_repair/u:pay_the_asking_price   0.0%
  weather.the_storm_you_cannot_drive_through/u:ask_for_help   0.0%
  authority.the_file_catches_up/u:run                  0.0%
  authority.the_file_catches_up/u:bribe                0.0%
  city.the_address_that_moved/u:let_the_companion_handle_it   0.0%
  road.the_hitchhiker/leave_them_at_the_junction       0.0%
  road.the_hitchhiker/u:let_the_companion_handle_it    0.1%
  rest.the_shared_room/u:threaten                      0.1%
  encounter.the_other_traveller/u:let_the_companion_handle_it   0.1%
  border.night_crossing/offer_something                0.2%
  border.night_crossing/u:offer_to_work_for_it         0.2%
  breakdown.the_roadside_repair/u:threaten             0.2%
  crime.the_offer/u:create_a_distraction               0.2%
  crime.the_offer/u:offer_to_work_for_it               0.2%
  weather.the_storm_you_cannot_drive_through/shelter_and_lose_the_day   0.2%
  transit.the_wrong_carriage/talk_your_way_through     0.2%
  transit.the_wrong_carriage/pay_the_difference        0.2%
  rest.the_shared_room/sleep_on_your_bag               0.2%
  rest.the_shared_room/see_to_your_feet                0.2%
  transit.the_wrong_carriage/u:offer_to_work_for_it    0.3%
  filler.the_long_quiet_stretch/listen_to_the_engine   0.3%
  opportunity.work_for_a_day/u:walk_away               0.3%
  weather.the_storm_you_cannot_drive_through/push_on_through_it   0.4%
  rest.the_shared_room/u:create_a_distraction          0.4%
  border.night_crossing/present_papers                 0.4%
  border.night_crossing/u:bluff_with_documents         0.4%
  city.the_address_that_moved/u:plead_ignorance        0.4%
  rest.the_shared_room/pay_for_a_private_room          0.5%
  authority.the_file_catches_up/stand_your_ground      0.6%
  encounter.the_other_traveller/u:walk_away            0.6%
  city.the_address_that_moved/work_it_out_yourself     0.6%
  encounter.the_other_traveller/look_at_their_leg      0.6%
  filler.the_long_quiet_stretch/u:wait_it_out          0.7%
  weather.the_storm_you_cannot_drive_through/u:run     0.7%
  filler.the_long_quiet_stretch/keep_going             0.7%
  border.night_crossing/keep_it_out_of_sight           0.8%
  rest.the_shared_room/u:pay_the_asking_price          0.8%
  road.the_hitchhiker/u:run                            0.8%
  transit.the_wrong_carriage/u:pay_the_asking_price    0.9%
  encounter.the_other_traveller/share_what_you_have    1.3%
  opportunity.work_for_a_day/take_the_day_rate         1.5%
  crime.the_offer/say_no                               1.5%
  transit.the_wrong_carriage/u:lie_about_destination   1.6%
  crime.the_offer/u:bribe                              1.6%
  road.the_hitchhiker/drive_on                         1.8%
  opportunity.work_for_a_day/haggle_the_rate_first     1.8%
  border.night_crossing/u:bribe                        1.8%
  city.the_address_that_moved/ask_in_the_shop          1.9%

## Flags
  written: 20   read: 5
  written but NEVER READ:   bribe_on_record, burned_a_bridge, companion_local, detained, helped_a_stranger, made_a_scene, owed_a_favour, paid_a_local, papers_lost, papers_questioned, smuggler_contact, stash_used, ticket_purchased, took_the_long_way, travelling_light
  read but NEVER WRITTEN:   (none)   <- gate can never open

## Resource trajectories (p10/p50/p90 by leg)
  cash     leg5: 1165/2167/4212   leg15: 867/2018/3896   leg25: 873/1966/3280
  health   leg5: 9/10/10   leg15: 4/7/9   leg25: 2/4/7
  morale   leg5: 6/8/10   leg15: 2/6/10   leg25: 2/6/9
  energy   leg5: 0/1/6   leg15: 0/0/0   leg25: 0/0/0
  hygiene  leg5: 0/1/3   leg15: 0/0/0   leg25: 0/0/0

## Beat types no event can fill
  A slot for one of these can only expire, so the fill rate above is bounded below 100%.
  departure
  ferry_boarding
  approach
  finale
