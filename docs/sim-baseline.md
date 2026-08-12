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
-->

# Sim Report — seed=base contentVersion=aee5a082 runs=2000

Completion rate             31.2%   (target band 30-50%)
Median legs                    10
Median in-game days             5
Never-fired events              0
Empty-pool fallbacks         0.0%   (target <2%)
Uneventful legs              0.0%   (target <2%)
Long-range payoff rate     100.0%   (target 80%)
Beat fill rate              53.2%
Repeat-event rate           57.1%
Complication rate            0.0%   (target 60%)
Modifier chips / check        0.2   (over 2917 checks; NO modifier registry in this pack)
Checks under 2 chips         2917   (expected — there is no registry here, so this is not a finding)
Universal choices offered    0.0%   (share of choices shown)
Universal choices picked     0.0%   (over ~30% means they are flattening the corpus)
Unresolved threads              0

Wall clock                 454 ms   (0.23 ms/run)
Extrapolated to 20,000     4.5 s   (target <30 s)

## Endings
  ending.failure_collapsed            39.0%
  ending.failure_gave_up              29.8%
  ending.arrival_hollow               22.1%
  ending.arrival_triumphant            8.8%
  ending.arrival_quiet                 0.3%

## Never-fired events
  (none)

## Choices picked <2%
  border.bribe_attempt/present_documents               0.0%   <- never picked
  border.bribe_attempt/turn_back                       0.0%   <- never picked
  border.guard_remembers/acknowledge                   0.0%
  border.bribe_attempt/offer_bribe                     0.1%
  border.bribe_attempt/hide_the_cash                   0.3%
  crisis.breakdown/find_help                           1.5%
  transit.bus_ejection/get_off                         1.7%

## Flags
  written: 5   read: 2
  written but NEVER READ:   bribe_on_record, detained, took_the_long_way
  read but NEVER WRITTEN:   (none)   <- gate can never open

## Resource trajectories (p10/p50/p90 by leg)
  cash     leg5: 220/280/540   leg15: 400/460/500   leg25: —
  health   leg5: 8/10/10   leg15: 0/0/2   leg25: —
  morale   leg5: 4/6/7   leg15: 0/3/6   leg25: —
  energy   leg5: 0/2/8   leg15: 0/0/7   leg25: —

## Beat types no event can fill
  A slot for one of these can only expire, so the fill rate above is bounded below 100%.
  departure
  ferry_boarding
  approach
