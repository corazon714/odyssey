# 0011 — The consequence queue: caps, eviction, and what happens at the end

- **Status:** Accepted
- **Date:** 2026-08-08

## Context

`scheduleEvent` is the single sanctioned soft pointer between events (ADR 0001). M4 shipped it
appending naively, deliberately: caps and eviction built against a queue nothing read would
have been built against a guess.

M6 gave it a reader. M8 makes it survivable.

**Building it surfaced a real defect.** Nothing removed a pending entry when it fired. The
promise stayed queued for the rest of the run, and only `maxOccurrences` stopped the payoff
re-firing on every leg of its window — a filter doing the queue's job. Every kept promise would
also have surfaced in the journal as an unresolved thread. The sim now shows 18 queue
departures against 18 fires, and zero unresolved threads.

---

## Decision 1 — Eviction uses a TOTAL order, ending in an insertion index

`(latestLeg, scheduledAtLeg, eventId, insertionIndex)`, ascending.

The first three are the meaningful comparisons. The fourth exists solely to make ties
**impossible**. A merely-sorted order leaves equal entries resolved by input permutation, and
the input permutation depends on the order effects happened to be applied in — which is exactly
the kind of thing that can differ between a replay and the original run.

`queue.test.ts` evicts from **every permutation** of a deliberately tie-heavy set and asserts a
single answer. That is a stronger claim than "the comparator looks total", and it is cheap for
four entries.

String comparison uses `<`, never `localeCompare` (ADR 0005 §3).

**What gets evicted: the entry due furthest out.** An entry due soon is a promise about the
near future and the most likely to pay off; one due twenty legs away on a twenty-four-leg route
is speculative, and if the run ends first it was never going to pay off anyway.

**The per-event cap runs before the global one**, so a single repeated promise cannot crowd out
three different ones before the global cap even applies.

**Survivors are rebuilt in insertion order, not sorted order.** The queue's own order is part of
the state digest; re-sorting on every schedule would churn it for no reason.

---

## Decision 2 — Append then evict, rather than reject when full

The new entry competes on the same total order as everything already queued, so a promise due
next leg displaces one due twenty legs out.

Rejecting at the door would make the queue's contents depend on **arrival order** rather than
on value — the first thirty-two promises would hold their places against anything more urgent,
which is precisely backwards.

---

## Decision 3 — A route change COMPRESSES windows; it does not drop them

`rebasePendingEvents` shifts every window by the leg delta, then clamps it into the legs that
remain. An entry whose `earliestLeg` is already behind the current leg is pulled forward, not
discarded — the promise is still good, it just becomes due immediately.

Dropping instead would reproduce ADR 0001's "scheduled 2140×, fired 0×" every time a player
took a detour. The long-range payoff rate is a headline number in the sim report precisely
because that class of loss is otherwise invisible.

An entry is dropped only when there is **genuinely no leg left** — `newLegCount - 1 <
newLegIndex`. A property test sweeps leg counts 1–30 against deltas −10 to +10 and asserts no
survivor ever has an inverted window.

**NOTHING CALLS THIS YET.** Re-routing needs route generation, which is Phase 2. But the
queue's shape — absolute windows plus `scheduledAtLeg` — was chosen specifically so a route
change could be survived, and a shape chosen for a capability nobody has implemented is a shape
nobody has checked. The test is the deliverable; wiring it is a one-line change.

---

## Decision 4 — Duplicates stay separate, and are deduped at FIRE time

ADR 0001 and ADR 0008 established the first half: merging `[4,12]` with `[2,6]` gives `[2,12]`,
which is both earlier and likelier than either author intended, and destroys the `source`
provenance the journal wants — "the guard you bribed at the mountain pass" needs to know which
pass.

M8 adds the second half. `consumePending` removes the entry that fired **and its siblings**,
recording the first as `fired` and the rest as `superseded`. Without it, "keep them separate"
would mean the same payoff could fire from three different promises.

---

## Decision 5 — The queue survives an ending

Clearing it on `status: 'ended'` would have been one line, and would have thrown away the two
things it is worth most for:

- **The journal.** "Dmitri never found you" is a better closing line than silence, and design
  pillar 1 — consequence over difficulty — is about the story a run leaves behind.
- **The sim.** `unresolvedThreads` is the instrument for ADR 0001's silent-content-bug class.

`known: false` marks a thread whose target no longer exists in the pack — content changed under
a save. Reported rather than filtered, so a content update that orphans a payoff shows up as a
number instead of as nothing.

---

## Decision 6 — Every departure is recorded, with a reason

`PendingDrop` carries one of `fired`, `superseded`, `expired`, `evicted-global-cap`,
`evicted-per-event-cap`, `rebase-no-room`, plus the leg it happened on.

A queue that dropped entries quietly would make the sim's payoff line unreadable: you could not
distinguish a promise that never became eligible from one evicted to make room. Those are
different bugs with different fixes — one is content, one is a cap that is too tight.

---

## Consequences

- **The sim gained two lines**: unresolved threads and queue departures. Both read zero and
  eighteen respectively against the fixture pack, which is what a healthy queue looks like.
- **No behaviour change in the fixture corpus.** Nine events schedule one payoff; the caps are
  never approached. That is expected — the caps are a bound on pathological runs, not a tuning
  knob, and the fixture pack cannot exercise them. The unit tests do.
- `expirePending` runs once per leg, **before** selection, so an entry whose window closed is
  not offered on the leg it expires.
- `scheduleEvent`'s `AppliedEffect` now reports an `evicted` count — queue pressure becomes
  visible in the effect log rather than only in aggregate.
