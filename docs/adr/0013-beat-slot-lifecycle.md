# 0013 — The beat slot lifecycle

- **Status:** Accepted
- **Date:** 2026-08-08

## Context

ADR 0001 chose an emergent narrative graph over an authored one, and accepted a cost: tightly
choreographed multi-beat sequences become harder to express. `beatSchedule` plus
`priority: beat` is the compensation — the mechanism that guarantees a run has _shape_ without
reintroducing a spine.

M2 declared `BeatSlot` and M7 gave the beat gate a rung on the relaxation ladder. Neither
consumed a slot. M9 found the consequence: **a slot stayed `pending` forever**, so the same
beat could fire again on any later leg in range, and the `slid` status declared in M2's type
had never once been reachable.

---

## Decision 1 — `legIndex` never moves; sliding is a STATUS

A slot is open over the window `[legIndex, legIndex + slackLegs]`. Sliding sets
`status: 'slid'` and changes nothing else.

The alternative — advance `legIndex`, decrement `slackLegs` — reads more naturally and is
wrong for one reason that only appears later: **the original leg is what a pacing report
wants.** "The midpoint crisis was scheduled for leg 12 and fired at 14" is the sentence the
sim needs to be able to write, and a mutated `legIndex` has destroyed the 12.

Cost is one comparison per slot per leg. `isSlotOpen` is the only place the window is
computed, so the invariant cannot drift.

---

## Decision 2 — Slide rather than drop, because the two failures are not symmetric

An unfillable slot is a **pacing** miss: the beat happens two legs later than planned and
almost nobody notices. Firing an event whose context is wrong is a **coherence** miss: a border
scene in the middle of a desert, which cannot be unseen.

The schedule can absorb the first and not the second. That asymmetry is the same reason the
beat gate is **rung 1** of the relaxation ladder (ADR 0010 §4) — it is the cheapest constraint
to give up, so it goes first.

A slot that reaches the end of its slack becomes `expired` **and is reported**. The sim turns
that into a beat-fill rate, which is a balance signal about content, not an error.

---

## Decision 3 — `unfillableBeatTypes` is a product of the pack, not a test

`createContentPack` reports beat types no event can fill, alongside `danglingRefs` and
`duplicateIds`.

Without it the failure is silent in the way ADR 0001 warns about: the slot opens, nothing is
eligible, it slides, it expires, and the only trace is a beat-fill rate that reads like a
balance problem rather than a missing event. The fixture pack currently cannot fill
`departure`, `ferry_boarding` or `approach`, which is why the sim prints those names directly
beneath the 47.9% fill rate — the number is otherwise misleading.

---

## Decision 4 — Generation stays out of Phase 1

The engine consumes and validates a caller-supplied schedule. It does not produce one.

Placement policy is recorded for whoever builds it: slots come from two sources — derived from
the route graph (a border edge produces a `border_crossing` slot at that leg) and from a
normalised pacing curve at _fractions_ of `legCount`, with jitter drawn from the **`routeGen`**
stream so that adding director draws later never moves the beats.

It is not built because leg density by terrain is a Phase 3 design decision needing terrain
data and sim tuning, and a provisional fraction table would lock in numbers that must be
unpicked.

---

## Consequences

- `RouteState.beatSchedule` is now genuinely mutated during a run — the first Phase 1 field
  whose value the engine changes without an authored effect asking it to.
- The `route/beatStatus` effect op (M4) remains available for content that wants to mark a slot
  explicitly, but the loop does not use it: `advanceBeatSchedule` runs unconditionally after
  selection, which keeps slot consumption a property of the loop rather than of content
  remembering to ask.
- Exactly one slot can be filled per leg, because exactly one event fires per leg. If that ever
  stops being true, `advanceBeatSchedule`'s `filled === null` guard is the line to revisit.
