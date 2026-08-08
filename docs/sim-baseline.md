<!--
  THE BALANCE BASELINE. Committed on purpose, and reviewed like code.

  reports/sim-latest.md is git-ignored and write-protected, because generated output should
  never be committed. This file is the opposite: a balance change should be visible as a diff
  somebody signed off on, not as a number that quietly moved between releases.

  Regenerate deliberately:  pnpm sim -- --runs=2000  &&  cp reports/sim-latest.md docs/sim-baseline.md
  Compare without writing:  pnpm sim:diff -- --runs=2000

  Generated at Phase 1 M10 against the nine-event FIXTURE pack. The open findings below are
  fixture gaps, not engine faults — see docs/PROGRESS.md.
-->

# Sim Report — seed=base contentVersion=7f34f65d runs=2000

Completion rate             30.1%   (target band 30-50%)
Median legs                    11
Median in-game days             5
Never-fired events              0
Empty-pool fallbacks         0.0%   (target <2%)
Uneventful legs              0.0%   (target <2%)
Long-range payoff rate     100.0%   (target 80%)
Beat fill rate              47.9%
Repeat-event rate           62.4%
Unresolved threads              0

Wall clock                 476 ms   (0.24 ms/run)
Extrapolated to 20,000     4.8 s   (target <30 s)

## Endings
  ending.failure_gave_up              39.1%
  ending.failure_collapsed            30.8%
  ending.arrival_hollow               20.6%
  ending.arrival_triumphant            7.5%
  ending.arrival_quiet                 1.9%

## Never-fired events
  (none)

## Choices picked <2%
  border.bribe_attempt/present_documents               0.0%   <- never picked
  border.bribe_attempt/turn_back                       0.0%   <- never picked
  border.guard_remembers/acknowledge                   0.2%
  border.bribe_attempt/offer_bribe                     0.4%
  crisis.breakdown/find_help                           1.1%
  transit.bus_ejection/get_off                         1.5%
  transit.bus_ejection/plead_with_driver               1.8%

## Flags
  written: 4   read: 2
  written but NEVER READ:   bribe_on_record, detained, took_the_long_way
  read but NEVER WRITTEN:   wanted   <- gate can never open

## Resource trajectories (p10/p50/p90 by leg)
  money    leg5: 220/280/540   leg15: 180/260/500   leg25: —
  health   leg5: 10/10/10   leg15: 0/0/1   leg25: —
  morale   leg5: 5/6/7   leg15: 2/5/7   leg25: —
  energy   leg5: 0/3/8   leg15: 0/2/6   leg25: —

## Beat types no event can fill
  A slot for one of these can only expire, so the fill rate above is bounded below 100%.
  departure
  ferry_boarding
  approach
