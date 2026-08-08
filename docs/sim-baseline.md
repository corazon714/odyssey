<!--
  THE BALANCE BASELINE. Committed on purpose, and reviewed like code.

  reports/sim-latest.md is git-ignored and write-protected, because generated output should
  never be committed. This file is the opposite: a balance change should be visible as a diff
  somebody signed off on, not as a number that quietly moved between releases.

  Regenerate deliberately:  pnpm sim -- --runs=2000  &&  cp reports/sim-latest.md docs/sim-baseline.md
  Compare without writing:  pnpm sim:diff -- --runs=2000

  Regenerated at Phase 2A M2A.4 (ADR 0016) against the nine-event FIXTURE pack. The open
  findings below are fixture gaps, not engine faults — see docs/PROGRESS.md.
-->

# Sim Report — seed=base contentVersion=f25d740f runs=2000

Completion rate             31.2%   (target band 30-50%)
Median legs                    10
Median in-game days             5
Never-fired events              0
Empty-pool fallbacks         0.0%   (target <2%)
Uneventful legs              0.0%   (target <2%)
Long-range payoff rate     100.0%   (target 80%)
Beat fill rate              51.8%
Repeat-event rate           58.4%
Unresolved threads              0

Wall clock                 484 ms   (0.24 ms/run)
Extrapolated to 20,000     4.8 s   (target <30 s)

## Endings
  ending.failure_collapsed            35.6%
  ending.failure_gave_up              33.2%
  ending.arrival_hollow               22.1%
  ending.arrival_triumphant            8.8%
  ending.arrival_quiet                 0.3%

## Never-fired events
  (none)

## Choices picked <2%
  border.bribe_attempt/present_documents               0.0%   <- never picked
  border.bribe_attempt/turn_back                       0.0%   <- never picked
  border.guard_remembers/acknowledge                   0.1%
  border.bribe_attempt/offer_bribe                     0.4%
  crisis.breakdown/find_help                           1.4%
  transit.bus_ejection/get_off                         1.6%
  transit.bus_ejection/plead_with_driver               2.0%

## Flags
  written: 4   read: 2
  written but NEVER READ:   bribe_on_record, detained, took_the_long_way
  read but NEVER WRITTEN:   wanted   <- gate can never open

## Resource trajectories (p10/p50/p90 by leg)
  cash     leg5: 220/280/540   leg15: 400/460/500   leg25: —
  health   leg5: 9/10/10   leg15: 0/0/2   leg25: —
  morale   leg5: 4/6/7   leg15: 0/3/6   leg25: —
  energy   leg5: 0/2/8   leg15: 0/0/7   leg25: —

## Beat types no event can fill
  A slot for one of these can only expire, so the fill rate above is bounded below 100%.
  departure
  ferry_boarding
  approach
