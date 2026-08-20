# 0045 — A phase may close with a RED gate, under stated conditions

**Status:** accepted
**Date:** 2026-08-20
**Relates to:** `docs/phase-3-dod.md` (the nine gates) · `docs/phase-3-closeout.md` (the first
artefact produced under this ADR) · `docs/adr/0032` (baseline circularity) · `docs/adr/0044`

---

## Context

Phase 3's definition of done is nine gates. Eight pass. **Gate 9 — no route below 3% completion —
fails**, on `route.illicit.r1dlxpt5` (2.32%, −4.5 SE) and `route.illicit.r16kyujq` (2.81%,
−1.1 SE), and the fix for it is understood, named, and deliberately not made.

The obvious readings are all wrong:

- **"Then the phase isn't done."** The phase's work IS done. What remains is a route-generation
  change whose validation requires regenerating the corpus baseline — which is the next phase's
  business, not this one's.
- **"Then fix it before closing."** The fix moves `legKm` on every corpus route, therefore
  `docs/sim-baseline-corpus.md`, therefore gate 9 itself. Declaring the gate green against a
  baseline the fix regenerated is exactly the circularity ADR 0032 exists to prevent, arriving
  through the front door.
- **"Then lower the floor."** Tuning a gate until the result clears it is the failure mode gates
  exist to prevent. 3% was chosen at ADR 0041 against a stated pillar-4 rationale and nothing
  about that rationale changed.

So there needs to be a third state — **closed, red, documented** — and rules for when it is
legitimate, or it becomes the excuse that closes every future phase.

## Decision

**A phase MAY close with a red gate. It may do so only when all six of the following hold, and
the closing artefact must demonstrate each.**

1. **The failure is MEASURED, with its margin — not estimated, not remembered.** A red gate
   closes on a number produced by a committed command on the closing tree, reported with its
   standard error. Gate 9: `pnpm sim -- --pack=corpus --runs=280000 --by-route`.
2. **The cause is explained, OR explicitly labelled unexplained.** Both are acceptable; silence
   is not. A gate nobody can explain may still close, but the artefact has to say that in those
   words rather than imply understanding it does not have.
3. **The fix is named with a file, an owner and an ACCEPTANCE CRITERION** written before the fix
   exists. A criterion invented after the fact is a description of what happened.
4. **The reason for deferral is a property of the WORK, not of the schedule.** "It moves the
   measure that would validate it" qualifies. "We ran out of time" does not. This is the clause
   that stops the ADR becoming an excuse, and it is the one to argue about first.
5. **A closing artefact exists, and it states the red gate BEFORE anything else.** Not in a
   status table halfway down; in the first lines, at heading level, naming the failing units and
   their figures. The failure mode being defended against is a future session reading "Phase N
   closed" and assuming green.
6. **The phase's own authority file is corrected so it no longer describes a passing world.**
   `docs/phase-3-dod.md`'s gate 9 section quoted a comfortable worst-route figure in the present
   tense and had to be rewritten; a gate that documents itself as passing while failing is worse
   than no documentation, because it is trusted.

**What is NOT required:** that the red gate be the only red thing. Gate 6 closes with three red
sub-results and passes because it MATCHES its handoff — a different and older mechanism, and a
good one. This ADR governs a gate that fails outright.

## Consequences

- **`docs/phase-N-closeout.md` becomes a required output of any phase that closes red**, and
  `CLAUDE.md` §1 must name it and state the red gate in the status block. Both done for Phase 3.
- **The carry-forward acceptance criterion is binding on the next phase.** carry-forward item #1 may
  not be declared done on completion alone; the criterion is three parts (completion with its SE,
  the morale-floor share, the ending histogram against a healthy comparable) and it was fixed
  before the fix was attempted, precisely so it could not be relaxed to fit.
- **A gate closed red stays red in the record.** When carry-forward item #1 lands, gate 9 is re-run and
  its result recorded against the NEW baseline, with the baseline change reviewed as its own
  diff. Gate 9 does not retroactively become a Phase 3 pass.
- **This ADR is quotable in both directions.** If a future phase wants to close red on condition
  4 — "the reason is a property of the work" — that claim has to survive the same scrutiny this
  one did. If it cannot, the phase stays open.

## The specific application, for the record

Phase 3 closes red on gate 9 because the fix (a montage spacing constraint in
`packages/engine/src/route/leg-plan.ts`) moves `legKm` corpus-wide → the corpus baseline → gate 9
itself. Additionally, the two failing routes **share 88.9% of their edges**: gate 9 fails on one
corridor sampled twice, so any fix clearing it today is validated on n = 1. Both reasons are
properties of the work. `docs/phase-3-closeout.md` is the artefact.
