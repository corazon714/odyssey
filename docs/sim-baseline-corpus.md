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
-->

# Sim Report — seed=base contentVersion=c10af194 runs=2000

Completion rate             38.7%   (target band 30-50%)
Median legs                    23
Median in-game days             7
Never-fired events              0
Empty-pool fallbacks         0.0%   (target <2%)
Uneventful legs              0.0%   (target <2%)
Long-range payoff rate      18.2%   (target 80%)
Beat fill rate              24.2%
Repeat-event rate           64.5%
Complication rate           59.8%   (target 60%)
Modifier chips / check        7.3   (target 3-7, over 19553 checks)
Checks under 2 chips            0   (each one draws nothing the registry exists for)
Universal choices offered   38.5%   (share of choices shown)
Universal choices picked    39.7%   (over ~30% means they are flattening the corpus)
Unresolved threads             93

Wall clock                 2318 ms   (1.16 ms/run)
Extrapolated to 20,000     23.2 s   (target <30 s)

## Endings
  ending.failure_gave_up              39.2%
  ending.arrival_quiet                38.6%
  ending.failure_collapsed            22.0%
  ending.detained_at_border            0.2%

## Never-fired events
  (none)

## Choices picked <2%
  border.night_crossing/make_yourself_useful           0.0%   <- never picked
  breakdown.the_roadside_repair/find_someone_who_can   0.0%   <- never picked
  breakdown.the_roadside_repair/u:offer_to_work_for_it   0.0%   <- never picked
  encounter.the_other_traveller/u:use_an_item          0.0%   <- never picked
  filler.the_hours_between/u:use_an_item               0.0%   <- never picked
  filler.the_long_quiet_stretch/u:use_an_item          0.0%   <- never picked
  rest.the_shared_room/leave_the_bulk_behind           0.0%   <- never picked
  road.the_hitchhiker/u:use_an_item                    0.0%   <- never picked
  weather.the_storm_you_cannot_drive_through/find_the_mechanic_first   0.0%   <- never picked
  weather.the_storm_you_cannot_drive_through/u:use_an_item   0.0%   <- never picked
  breakdown.the_roadside_repair/fix_it_yourself        0.0%
  road.the_hitchhiker/leave_them_at_the_junction       0.0%
  road.the_hitchhiker/u:let_the_companion_handle_it    0.0%
  crime.the_offer/put_it_somewhere_they_will_not_look   0.0%
  weather.the_storm_you_cannot_drive_through/u:ask_for_help   0.0%
  encounter.the_other_traveller/u:let_the_companion_handle_it   0.0%
  breakdown.the_roadside_repair/nurse_it_along         0.0%
  weather.the_storm_you_cannot_drive_through/see_to_the_damage   0.0%
  authority.the_file_catches_up/u:bribe                0.0%
  city.the_address_that_moved/u:let_the_companion_handle_it   0.0%
  authority.the_file_catches_up/u:bluff_with_documents   0.0%
  authority.the_file_catches_up/answer_the_questions   0.0%
  authority.the_file_catches_up/u:run                  0.0%
  authority.the_file_catches_up/make_it_go_away        0.0%
  breakdown.the_roadside_repair/u:threaten             0.0%
  breakdown.the_roadside_repair/u:pay_the_asking_price   0.1%
  border.night_crossing/offer_something                0.1%
  rest.the_shared_room/u:threaten                      0.1%
  border.night_crossing/u:offer_to_work_for_it         0.1%
  filler.the_long_quiet_stretch/listen_to_the_engine   0.2%
  crime.the_offer/u:create_a_distraction               0.2%
  weather.the_storm_you_cannot_drive_through/push_on_through_it   0.2%
  weather.the_storm_you_cannot_drive_through/u:run     0.2%
  crime.the_offer/u:offer_to_work_for_it               0.2%
  transit.the_wrong_carriage/talk_your_way_through     0.2%
  transit.the_wrong_carriage/u:offer_to_work_for_it    0.2%
  weather.the_storm_you_cannot_drive_through/shelter_and_lose_the_day   0.3%
  transit.the_wrong_carriage/pay_the_difference        0.3%
  rest.the_shared_room/see_to_your_feet                0.3%
  opportunity.work_for_a_day/u:walk_away               0.3%
  road.the_hitchhiker/u:run                            0.4%
  border.night_crossing/present_papers                 0.4%
  border.night_crossing/u:bluff_with_documents         0.4%
  rest.the_shared_room/sleep_on_your_bag               0.5%
  encounter.the_other_traveller/u:walk_away            0.6%
  filler.the_long_quiet_stretch/keep_going             0.6%
  rest.the_shared_room/u:create_a_distraction          0.6%
  filler.the_long_quiet_stretch/u:wait_it_out          0.6%
  encounter.the_other_traveller/look_at_their_leg      0.6%
  city.the_address_that_moved/u:plead_ignorance        0.7%
  road.the_hitchhiker/drive_on                         0.7%
  city.the_address_that_moved/work_it_out_yourself     0.7%
  rest.the_shared_room/pay_for_a_private_room          0.8%
  authority.the_file_catches_up/stand_your_ground      0.8%
  rest.the_shared_room/u:pay_the_asking_price          0.8%
  road.the_hitchhiker/pull_over                        1.2%
  border.night_crossing/keep_it_out_of_sight           1.2%
  encounter.the_other_traveller/share_what_you_have    1.5%
  crime.the_offer/say_no                               1.8%
  transit.the_wrong_carriage/u:lie_about_destination   1.8%
  crime.the_offer/u:bribe                              1.8%
  opportunity.work_for_a_day/take_the_day_rate         1.9%

## Flags
  written: 20   read: 5
  written but NEVER READ:   bribe_on_record, burned_a_bridge, companion_local, detained, helped_a_stranger, made_a_scene, owed_a_favour, paid_a_local, papers_lost, papers_questioned, smuggler_contact, stash_used, ticket_purchased, took_the_long_way, travelling_light
  read but NEVER WRITTEN:   (none)   <- gate can never open

## Resource trajectories (p10/p50/p90 by leg)
  cash     leg5: 1131/1917/2507   leg15: 856/1681/2509   leg25: 519/1612/2624
  health   leg5: 9/10/10   leg15: 4/7/9   leg25: 1/4/7
  morale   leg5: 6/8/9   leg15: 2/6/10   leg25: 2/7/10
  energy   leg5: 0/4/7   leg15: 0/0/3   leg25: 0/0/1
  hygiene  leg5: 0/1/4   leg15: 0/0/0   leg25: 0/0/0

## Beat types no event can fill
  A slot for one of these can only expire, so the fill rate above is bounded below 100%.
  departure
  ferry_boarding
  approach
  finale
