# 0032 — A sim baseline belongs to its run count, and `sim:diff` refuses to cross them

- **Status:** Accepted, implemented 2026-08-12
- **Date:** 2026-08-12
- **Changes:** CLAUDE.md §7 DoD item 6
- **Relates to:** ADR 0023 (measuring the registries)

## Context

I reported both sim baselines as drifted. They were not, and the false alarm cost a bisect across
twenty commits.

Both baselines are `runs=2000` and say so in their own headers. CLAUDE.md §7 item 6 said to diff at
`--runs=5000`. Every rate in a baseline is a sample of exactly the runs that produced it, so a
bigger sample is a different sample: at 5,000 the endings move ~0.7pp, the repeat rate 0.1pp, three
resource percentiles shift by one unit, and the check count goes 2,923 → 7,325. That last is a
**2.506× jump against a 2.5× run-count ratio** — the whole of it.

Nothing caught it because `diff-report.ts` **normalises the header**: it blanks `seed=` and `runs=`
and compares `contentVersion=`. Blanking the count is correct for the diff — the count is not a
balance property — but it hides the one input that changes every sampled number underneath. The
report carried the answer in its own first line and the diff deliberately erased it.

## Decision — refuse, do not warn

`runCountOf` reads the count out of the baseline and `sim:diff` exits 1 on a mismatch:

```
sim: docs/sim-baseline.md was generated at runs=2000, and you asked for runs=5000.
Those are not comparable — the diff would be sampling noise dressed as a finding.
```

A warning printed above a diff that _looks_ like a finding loses to the diff. The comparison is the
thing that must not happen, so the comparison is what is refused.

It lives in `diff-report.ts` beside the `normalise` call that caused the problem, with a test
pinning the pair: two reports differing ONLY in run count diff clean, while `runCountOf` tells them
apart.

## Decision — the count in CLAUDE.md matches the baselines, not the other way round

DoD item 6 now says `pnpm sim:diff -- --runs=2000`. Raising the baselines to 5,000 was the
alternative and is worse: 2,000 runs already gives stable rates, and regenerating both baselines to
match a documentation error would have written the error into the data.

## Consequences

- A stale instruction that had silently produced a false finding for four sessions is now
  impossible to follow.
- Changing the baseline run count deliberately still works — regenerate, and the header carries the
  new number.
- **A second reporting fault of the same family was fixed alongside**: `Modifier chips / check`
  printed "target 3-7" against the fixture pack, which carries `registries.modifiers: []` on
  purpose and cannot ever meet it. Both that line and its neighbour now read the pack. A target a
  pack is structurally unable to meet is not a target, it is a permanent false finding — and it is
  what sent me looking at the run count in the first place.

The family lesson, which `audit-diversity` learned separately in the same session: **a report must
read its diagnosis off its own measurement, never print a conclusion the measurement does not
support.**
