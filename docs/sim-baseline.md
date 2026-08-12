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
-->

# Sim Report — seed=base contentVersion=aee5a082 runs=2000

Completion rate             48.5%   (target band 30-50%)
Median legs                    12
Median in-game days             6
Never-fired events              0
Empty-pool fallbacks         0.0%   (target <2%)
Uneventful legs              0.0%   (target <2%)
Long-range payoff rate      92.9%   (target 80%)
Beat fill rate              54.0%
Repeat-event rate           65.0%
Complication rate            0.0%   (target 60%)
Modifier chips / check        0.3   (over 3521 checks; NO modifier registry in this pack)
Checks under 2 chips         3521   (expected — there is no registry here, so this is not a finding)
Checks over 7 chips             0   (no registry in this pack)
Universal choices offered    0.0%   (share of choices shown)
Universal choices picked     0.0%   (over ~30% means they are flattening the corpus)
Unresolved threads              2

Wall clock                 738 ms   (0.37 ms/run)
Extrapolated to 20,000     7.4 s   (target <30 s)

## Endings
  ending.failure_gave_up              43.1%
  ending.arrival_hollow               29.8%
  ending.arrival_triumphant           15.0%
  ending.failure_collapsed             8.4%
  ending.arrival_quiet                 3.6%

## Never-fired events
  (none)

## Choices picked <2%
  border.bribe_attempt/present_documents               0.0%   <- never picked
  border.bribe_attempt/turn_back                       0.0%   <- never picked
  border.guard_remembers/acknowledge                   0.1%
  border.bribe_attempt/offer_bribe                     0.2%
  border.bribe_attempt/hide_the_cash                   0.4%
  transit.bus_ejection/get_off                         1.3%
  crisis.breakdown/find_help                           1.4%
  transit.bus_ejection/plead_with_driver               1.5%

## Flags
  written: 5   read: 2
  written but NEVER READ:   bribe_on_record, detained, took_the_long_way
  read but NEVER WRITTEN:   (none)   <- gate can never open

## Resource trajectories (p10/p50/p90 by leg)
  cash     leg5: 220/280/540   leg15: 180/460/500   leg25: —
  health   leg5: 9/10/10   leg15: 1/6/8   leg25: —
  morale   leg5: 4/6/7   leg15: 0/3/5   leg25: —
  energy   leg5: 0/2/8   leg15: 0/0/4   leg25: —
  hygiene  leg5: 0/2/3   leg15: 0/0/0   leg25: —

## Beat types no event can fill
  A slot for one of these can only expire, so the fill rate above is bounded below 100%.
  departure
  ferry_boarding
  approach
