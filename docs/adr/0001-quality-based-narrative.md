# 0001 — Quality-Based Narrative, not an authored node graph

- **Status:** Accepted
- **Date:** 2026-08-07
- **Supersedes:** —

## Context

Odyssey targets 300+ events, 800+ outcomes, ~150 flags, ~60 items and ~40 NPC archetypes,
replayed many times by the same player. The narrative structure has to survive that scale
in two directions at once: authoring cost per new event, and the number of distinct runs
the content can produce.

The obvious structure — a directed graph where each outcome names the event that follows —
fails both.

**Authoring cost grows superlinearly.** In an authored graph the unit of work is not the
event, it is the edge. Adding event #200 does not mean writing one event; it means deciding
which of the existing 199 events may lead to it and which of them it may lead to. The
useful edge count grows roughly with n², so the marginal cost of an event rises for the
whole life of the project — exactly backwards from what a content-heavy game needs.

**Every edit is a potential breakage.** `nextEventId` is a hard reference. Renaming,
splitting, gating or deleting an event invalidates every outcome pointing at it, and
nothing detects a link that has become _unreachable_ rather than _dangling_ — a pointer to
an event whose `requires` can no longer be satisfied at that point in the run stays
syntactically valid while silently killing a branch.

**Combinatorial variety cannot be authored.** Distinct runs come from _state_: which
documents are missing, who is owed money, how hot the player is, how tired. A graph
encodes a fixed number of paths; the play space is bounded by what someone typed. The
design pillars ask for "the world reacts" and consequence-heavy memory, which is a
statement about state, not about topology.

## Decision

Build a **Quality-Based Narrative** engine. The narrative graph is emergent, not authored.

- Each event declares a `requires` **predicate over world state** and a `weight`. It does
  not declare its neighbours and has no knowledge of any other event.
- A **director** filters the event pool by predicate, context (location type, region, time
  of day, weather, transport mode), cooldown and occurrence caps, then scores the survivors
  by weight × context multiplier × tension fit × novelty × recency penalty × priority, and
  picks one with the seeded RNG.
- Adding an event is therefore an **O(1) edit**: write the YAML, and the director considers
  it wherever its predicate holds. No existing file changes.

**Memory is three separate mechanisms, deliberately not one.** Collapsing them into
"just use flags" produces the unmanageable 400-flag system this decision exists to avoid.

| Need                                            | Mechanism                                                  |
| ----------------------------------------------- | ---------------------------------------------------------- |
| Durable state read from many places later       | **flag** (`passport_lost`, `wanted`), optional `ttlLegs`   |
| A specific event should fire in a future window | **consequence queue** (`scheduleEvent`, `inLegs: [4, 12]`) |
| "You have been here before" variant text        | **eventMemory** counters                                   |
| An NPC's standing attitude                      | **relationships**                                          |

**The single sanctioned soft pointer is `scheduleEvent`.** It differs from `nextEventId` in
the ways that matter: it is a _request_ not a guarantee, it resolves over a leg _range_
rather than immediately, it carries its own `requires`, and the director may decline it. If
its target disappears, the queue entry is dropped — a no-op, not a broken link.

## Consequences

**Accepted costs.**

- Debugging is statistical, not structural. "Why did this event fire?" is answered by
  inspecting predicate evaluation and weights, not by reading an edge. Design pillar 2
  (_legible randomness_) pushes that explanation into the UI: the result screen surfaces
  the reason ("no visa · night crossing · nervous demeanor").
- Tightly-choreographed multi-beat sequences are harder to express than in a graph. This is
  the intended trade: `beatSchedule` plus `priority: beat` covers structural moments, and
  anything needing more is a signal the sequence should be state, not topology.
- Content bugs become _silent_ rather than loud — an event whose predicate is never
  satisfiable simply never fires. **This is why the simulation harness is a first-class
  Phase 1 deliverable, not a finishing touch.** The "never-fired events" and "scheduled
  2140×, fired 0×" lines in the sim report are the only way this class of bug is visible.

**Enforcement.** Rule 2.1 in `CLAUDE.md` forbids required event-to-event references, and
the content linter must reject `nextEventId`. Without that, the first tricky authoring
problem reintroduces the graph one field at a time.

## Alternatives considered

- **Authored node graph.** Rejected above.
- **Hybrid: authored spine, QBN filler.** Rejected for now. The spine tends to expand,
  because every hard-to-express moment is a candidate for promotion into it, and two
  systems must then be balanced against each other. `beatSchedule` provides the structural
  guarantees a spine would, without a second selection mechanism.
- **Storylet systems with explicit "decks"** (Fallen London style). Effectively QBN with
  extra grouping. Deferred: `exclusiveGroup` covers the mutual-exclusion case we actually
  have, and deck management can be added later without changing the event schema.
