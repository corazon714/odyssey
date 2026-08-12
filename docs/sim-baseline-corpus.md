<!--
  THE CORPUS BALANCE BASELINE. Committed on purpose, and reviewed like code.

  Regenerate deliberately:  pnpm sim -- --runs=2000 --pack=corpus  &&  cp reports/sim-latest-corpus.md docs/sim-baseline-corpus.md
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
-->

# Sim Report — seed=base contentVersion=c10af194 runs=2000

Completion rate             44.0%   (target band 30-50%)
Median legs                    12
Median in-game days             4
Never-fired events              0
Empty-pool fallbacks         0.0%   (target <2%)
Uneventful legs              0.0%   (target <2%)
Long-range payoff rate      78.3%   (target 80%)
Beat fill rate              30.1%
Repeat-event rate           35.5%
Complication rate           59.5%   (target 60%)
Modifier chips / check        6.7   (target 3-7, over 10947 checks)
Checks under 2 chips            0   (each one draws nothing the registry exists for)
Universal choices offered   38.5%   (share of choices shown)
Universal choices picked    36.2%   (over ~30% means they are flattening the corpus)
Unresolved threads              5

Wall clock                 1000 ms   (0.50 ms/run)
Extrapolated to 20,000     10.0 s   (target <30 s)

## Endings
  ending.failure_collapsed            45.3%
  ending.arrival_quiet                44.0%
  ending.failure_gave_up              10.8%

## Never-fired events
  (none)

## Choices picked <2%
  authority.the_file_catches_up/make_it_go_away        0.0%   <- never picked
  authority.the_file_catches_up/u:bribe                0.0%   <- never picked
  border.night_crossing/make_yourself_useful           0.0%   <- never picked
  crime.the_offer/put_it_somewhere_they_will_not_look   0.0%   <- never picked
  encounter.the_other_traveller/u:use_an_item          0.0%   <- never picked
  filler.the_hours_between/u:use_an_item               0.0%   <- never picked
  filler.the_long_quiet_stretch/u:use_an_item          0.0%   <- never picked
  rest.the_shared_room/leave_the_bulk_behind           0.0%   <- never picked
  road.the_hitchhiker/u:use_an_item                    0.0%   <- never picked
  weather.the_storm_you_cannot_drive_through/find_the_mechanic_first   0.0%   <- never picked
  weather.the_storm_you_cannot_drive_through/u:use_an_item   0.0%   <- never picked
  authority.the_file_catches_up/u:bluff_with_documents   0.0%
  authority.the_file_catches_up/u:run                  0.0%
  authority.the_file_catches_up/answer_the_questions   0.0%
  border.night_crossing/u:offer_to_work_for_it         0.0%
  breakdown.the_roadside_repair/fix_it_yourself        0.0%
  city.the_address_that_moved/u:let_the_companion_handle_it   0.0%
  breakdown.the_roadside_repair/find_someone_who_can   0.0%
  border.night_crossing/offer_something                0.0%
  breakdown.the_roadside_repair/u:offer_to_work_for_it   0.0%
  road.the_hitchhiker/u:let_the_companion_handle_it    0.0%
  road.the_hitchhiker/leave_them_at_the_junction       0.0%
  border.night_crossing/u:bribe                        0.0%
  breakdown.the_roadside_repair/nurse_it_along         0.1%
  weather.the_storm_you_cannot_drive_through/see_to_the_damage   0.1%
  encounter.the_other_traveller/u:let_the_companion_handle_it   0.1%
  authority.the_file_catches_up/stand_your_ground      0.1%
  border.night_crossing/present_papers                 0.1%
  border.night_crossing/keep_it_out_of_sight           0.1%
  breakdown.the_roadside_repair/u:threaten             0.1%
  transit.the_wrong_carriage/pay_the_difference        0.2%
  border.night_crossing/u:bluff_with_documents         0.2%
  transit.the_wrong_carriage/u:offer_to_work_for_it    0.2%
  breakdown.the_roadside_repair/u:pay_the_asking_price   0.2%
  transit.the_wrong_carriage/talk_your_way_through     0.2%
  weather.the_storm_you_cannot_drive_through/u:ask_for_help   0.2%
  crime.the_offer/u:offer_to_work_for_it               0.2%
  crime.the_offer/u:create_a_distraction               0.3%
  rest.the_shared_room/u:threaten                      0.3%
  filler.the_long_quiet_stretch/listen_to_the_engine   0.3%
  opportunity.work_for_a_day/u:walk_away               0.4%
  city.the_address_that_moved/work_it_out_yourself     0.5%
  filler.the_long_quiet_stretch/keep_going             0.6%
  filler.the_long_quiet_stretch/u:wait_it_out          0.6%
  encounter.the_other_traveller/u:walk_away            0.7%
  city.the_address_that_moved/u:plead_ignorance        0.7%
  rest.the_shared_room/see_to_your_feet                0.8%
  rest.the_shared_room/sleep_on_your_bag               1.2%
  transit.the_wrong_carriage/u:lie_about_destination   1.2%
  transit.the_wrong_carriage/u:pay_the_asking_price    1.3%
  city.the_address_that_moved/ask_in_the_shop          1.3%
  city.the_address_that_moved/pay_a_kid_to_take_you    1.3%
  encounter.the_other_traveller/look_at_their_leg      1.3%
  road.the_hitchhiker/u:run                            1.5%
  rest.the_shared_room/u:create_a_distraction          1.5%
  weather.the_storm_you_cannot_drive_through/push_on_through_it   1.6%
  weather.the_storm_you_cannot_drive_through/u:run     1.6%
  city.the_address_that_moved/u:pay_the_asking_price   1.7%
  rest.the_shared_room/u:pay_the_asking_price          1.7%
  rest.the_shared_room/pay_for_a_private_room          1.8%
  crime.the_offer/u:bribe                              1.9%
  opportunity.work_for_a_day/take_the_day_rate         1.9%
  crime.the_offer/say_no                               2.0%

## Flags
  written: 20   read: 5
  written but NEVER READ:   bribe_on_record, burned_a_bridge, companion_local, detained, helped_a_stranger, made_a_scene, owed_a_favour, paid_a_local, papers_lost, papers_questioned, smuggler_contact, stash_used, ticket_purchased, took_the_long_way, travelling_light
  read but NEVER WRITTEN:   (none)   <- gate can never open

## Resource trajectories (p10/p50/p90 by leg)
  cash     leg5: 28/318/570   leg15: 0/181/440   leg25: —
  health   leg5: 9/10/10   leg15: 0/1/3   leg25: —
  morale   leg5: 6/8/10   leg15: 1/5/8   leg25: —
  energy   leg5: 1/5/8   leg15: 0/0/1   leg25: —
  hygiene  leg5: 1/2/4   leg15: 0/0/0   leg25: —

## Beat types no event can fill
  A slot for one of these can only expire, so the fill rate above is bounded below 100%.
  departure
  ferry_boarding
  approach
  finale
