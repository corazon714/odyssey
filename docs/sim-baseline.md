<!--
  THE FIXTURE BALANCE BASELINE. Committed on purpose, and reviewed like code.

  reports/ is git-ignored and write-protected, because generated output should never be
  committed. This file is the opposite: a balance change should be visible as a diff somebody
  signed off on, not as a number that quietly moved between releases.

  Regenerate deliberately:  pnpm sim -- --runs=2000  &&  cp reports/sim-latest-fixture.md docs/sim-baseline.md
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
-->

# Sim Report — seed=base contentVersion=aee5a082 runs=2000

Completion rate             35.1%   (target band 30-50%)
Median legs                    11
Median in-game days             6
Never-fired events              0
Empty-pool fallbacks         0.0%   (target <2%)
Uneventful legs              0.0%   (target <2%)
Long-range payoff rate      61.9%   (target 80%)
Beat fill rate              55.6%
Repeat-event rate           63.1%
Complication rate            0.0%   (target 60%)
Modifier chips / check        0.2   (over 3385 checks; NO modifier registry in this pack)
Checks under 2 chips         3385   (expected — there is no registry here, so this is not a finding)
Universal choices offered    0.0%   (share of choices shown)
Universal choices picked     0.0%   (over ~30% means they are flattening the corpus)
Unresolved threads              8

Wall clock                 549 ms   (0.27 ms/run)
Extrapolated to 20,000     5.5 s   (target <30 s)

## Endings
  ending.failure_collapsed            33.8%
  ending.failure_gave_up              31.1%
  ending.arrival_hollow               20.6%
  ending.arrival_triumphant           13.3%
  ending.arrival_quiet                 1.2%

## Never-fired events
  (none)

## Choices picked <2%
  border.bribe_attempt/present_documents               0.0%   <- never picked
  border.bribe_attempt/turn_back                       0.0%   <- never picked
  border.guard_remembers/acknowledge                   0.1%
  border.bribe_attempt/offer_bribe                     0.2%
  border.bribe_attempt/hide_the_cash                   0.4%
  transit.bus_ejection/get_off                         1.4%
  crisis.breakdown/find_help                           1.5%
  transit.bus_ejection/plead_with_driver               1.7%

## Flags
  written: 5   read: 2
  written but NEVER READ:   bribe_on_record, detained, took_the_long_way
  read but NEVER WRITTEN:   (none)   <- gate can never open

## Resource trajectories (p10/p50/p90 by leg)
  cash     leg5: 220/280/540   leg15: 400/460/500   leg25: —
  health   leg5: 9/10/10   leg15: 2/4/6   leg25: —
  morale   leg5: 4/6/7   leg15: 1/3/5   leg25: —
  energy   leg5: 0/2/8   leg15: 0/0/5   leg25: —
  hygiene  leg5: 0/2/3   leg15: 0/0/0   leg25: —

## Beat types no event can fill
  A slot for one of these can only expire, so the fill rate above is bounded below 100%.
  departure
  ferry_boarding
  approach
