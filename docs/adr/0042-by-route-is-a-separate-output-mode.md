# 0042 — `--by-route` is a separate output MODE, not a section of the report

- **Status:** Accepted 2026-08-14 (C4)
- **Date:** 2026-08-14
- **Changes:** `packages/tools/sim/by-route.ts` (new), `packages/tools/sim/__tests__/by-route.test.ts`
  (new, 16 tests), `packages/tools/sim/parse-args.ts`, `packages/tools/sim/cli.ts`,
  `packages/tools/sim/run-many.ts`, `packages/engine/src/index.ts` (exports `legHours`),
  `CLAUDE.md` §5
- **Relates to:** ADR 0032 (a baseline belongs to its run count), ADR 0041 (the knee sweep, whose
  per-route figures this replaces), `docs/phase-3-dod.md` gate 9

## Context

`docs/phase-3-dod.md` gate 9 is **NO ROUTE BELOW 3% COMPLETION**. It is the only one of the nine
gates that had no command. Every per-route completion figure ever quoted in this repo — ADR 0041's
knee sweep, `docs/phase-3-verification.md`'s twelve-band table, the recovery milestone's per-route
S — came from a **scratchpad harness that was written, read once and thrown away.** The same
measurement was rebuilt from scratch at least four times, and each rebuild was free to differ from
the last in ways nobody could diff.

A gate that only a discarded script can measure is not a gate. So it had to move into the repo.
The question this ADR settles is _where_: a new section of the standard sim report, or a third
output mode alongside `--json`.

## Decision

**A separate output mode.** `pnpm sim -- --pack=corpus --runs=280000 --by-route` prints a per-route
table and **returns from `cli.ts` before `formatReport` is ever called.**

Three consequences, and each is the point rather than a side effect:

1. it writes no `reports/sim-latest-<pack>.md`;
2. it cannot move `docs/sim-baseline.md` or `docs/sim-baseline-corpus.md`;
3. `pnpm sim:diff` on both packs prints "No change" the day it ships, which is the test that it
   was built right.

### Why not a report section — the mechanical reason

`packages/tools/sim/diff-report.ts` compares the two reports **by line index.** Appending a
per-route table to `format-report.ts` offsets every line beneath it, so _a pure formatting change
would force BOTH baselines to be regenerated._ That is precisely the false positive ADR 0032
exists to prevent, and this repo has already paid for it twice (M3.8b added one hygiene line and
had to rebaseline both packs in the same commit; M3.11f did it again).

There is a second reason that is not mechanical. The standard report is a **pooled** instrument —
one completion rate over the whole grid. Gate 9 is a claim about the **worst cell.** Printing a
28-row table inside a document whose headline is a single pooled percentage invites reading the
pooled number and skipping the table, which is the exact failure gate 9 was written against: at
the chosen knee the pool read a comfortable 42.7% while the worst route sat at 4.8%.

### Why the standard error is printed, not optional

A floor is a claim about a tail, and a tail is where sampling noise is largest. A route printed as
"3.1%" is either above the floor or a 2.7% route that got lucky, and nothing in the rate itself
says which. Every row therefore carries `sqrt(p(1-p)/n)` and its distance from the floor **in
standard errors**, and the verdict line repeats the worst route's margin in SE.

**Wald, not Wilson or Agresti-Coull** — deliberately, because Wald is what ADR 0041's sweep
reported (4.3% ± 0.32pp), so these numbers are comparable with the ones the knee was chosen
against. Its known degeneracy is at `p = 0`, where it returns 0 and claims a certainty it has not
got; `marginInSe` returns `null` there rather than dividing, and a route at exactly 0.0% is under
the floor by inspection anyway.

### `hours` is the route's STATIC hour content, not the mean of what the runs banked

`RouteStat.hours` is `Σ legHours(legKm[i], startingMode, isMontage(i))` — the same quantity
`RoutePreview.travelHours` reports, from the same function the tick bills from. It is **not** the
average of hours accumulated by the runs, and that is a correctness decision rather than a
convenience: realised hours are an OUTCOME (a run that dies on leg 6 banks six legs of hours), so
averaging them ranks routes by how survivable they are and then offers that ranking as the
explanation for how survivable they are. The circularity would have been invisible in the table.

`legHours` is exported from the engine barrel for this, rather than the sim keeping its own copy
of the overhead and speed tables. One definition of what a leg costs in time.

### Three modes, mutually exclusive, refused rather than ranked

`--json` already exited before the `--diff` block, so `--json --diff` silently ignored the diff — a
pre-existing wart, and not one to reproduce a second time. `parse-args` now **errors** on
`--by-route --diff` (there is no baseline to diff against; that is the whole point of the mode) and
on `--by-route --json` (two different outputs). Saying so beats printing one of three and letting
the reader assume they got another.

## Consequences

- Gate 9 is measurable by a committed command for the first time. Whether it PASSES is a separate
  question, answered in `docs/PROGRESS.md` — it does not.
- A route with zero runs is still a row. Dropping it would turn a hole in the grid into a shorter,
  healthier-looking table, which is the defect the `Grid cells sampled` line exists to catch one
  level up; the mode reprints that line with the same marginals guard.
- Rows are sorted **worst first**, ties broken on route id. Worst-first because the row that
  decides the gate is then the first one; the id tiebreak because a table whose order depends on
  `Map` insertion is one `sim:diff` could never be pointed at later.
- The exit code is NOT the gate verdict. It is 1 only on engine errors or turn-cap hits — the same
  contract the other modes have. The gate verdict is the `GATE 9 PASS/FAIL` line, read by a human
  or by CI grepping for it. Conflating "the sim ran" with "the design is acceptable" would make a
  failing gate indistinguishable from a broken harness.
- **This does not make `--by-route` a `sim:diff` target.** There is no by-route baseline and this
  ADR does not create one; if one is ever wanted it needs ADR 0032's run-count discipline applied
  to it from the start, because per-route rates at 10,000 runs/route are noisier than the pooled
  rate at 280,000.
