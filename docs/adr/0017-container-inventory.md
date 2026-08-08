# 0017 — Container inventory

- **Status:** Accepted
- **Date:** 2026-08-08
- **Implements:** 09-WORLD-MAP-AND-ITEMS prompt W3
- **Bumps:** `SAVE_VERSION` 2 → 3

## Context

`RunState.inventory` was a flat `InventoryEntry[]`. That cannot express the one thing this
game's theft, search and border mechanics all turn on: **which things go together when
something is lost**. A bag stolen as a unit takes everything in it — including, if you kept it
there, your passport. That link is the best memory chain the game has, and a flat list cannot
represent it.

## Decision

Four containers. `person` always exists; `bag`, `vehicle` and `stash` are acquired and lost in
play, so they are nullable — and `null` versus an empty container is a real distinction: no bag
at all versus an empty one you are still carrying.

**Slots count UNITS, not stacks.** A stack-based cap would make `{ ration, count: 99 }` occupy
one of person's six, which is not a capacity system.

**Documents record their container; visas do not.** A visa is a stamp _in_ the passport. Two
independently-losable records for one physical object is a content-bug generator — an author
writes "you lose your passport" and the visa survives. Visa reads inherit the passport, which
is also what the fiction says.

**Three new ops, not four.** `moveItem`, `loseContainer`, `grantContainer`. The brief listed
`searchContainer` as a fourth; see "What is deferred" below.

## The divergence this fixes

`evaluate-state-leaf.ts` **summed** item counts across stacks; `apply-carried-effects.ts` took
the **first** match. Unreachable before containers, because nothing could produce a duplicate
stack — and trivially reachable after.

Concretely: 2 rations on your person and 2 in the vehicle. `item gte 3` sums to 4 and enables
the choice; a first-match removal of 3 takes 2. **The player pays less than the price they were
shown, silently.** No error, no clamp report that anyone reads, design pillar 2 broken.

The fix is a pair of decisions that have to agree:

- the predicate **sums across every container**, with a new `in: ContainerKind | null` field
  for when the author means to ask about one;
- a removal **drains across every container** in `DRAIN_ORDER` (person → bag → vehicle →
  stash) until satisfied.

Pinned by a property test: for any state and any `n`, the total after removing `n` is
`max(0, before − n)`.

The invariant that makes both tractable is **at most one entry per item id per container**,
merged on insert. Without it "how many rations do I have" has two answers again.

## Overflow fills what fits and reports the rest

Following the convention `applyItem` already set for removals clamping at zero:
`{ applied, refused }` in the params, and `changed: false` only when nothing fit at all.

**No auto-spill.** Beyond W3's "items are lost, never silently relocated", spill would make an
effect's meaning depend on which containers the player happens to have — the same authored
effect would do different things in different runs, and the journal could not explain it.

## `isRunStateShape` had to change in the same commit

`inventory` was in the array-check list. Leaving it there while the type changed would have
been the worst available failure: `migrate_2_to_3` runs, produces a correct container
inventory, and the guard then rejects it — `migrateSave` returns `save/shape-invalid` with
reason `post-migration`, so **every save becomes unloadable and the error blames the migration
rather than the guard**.

**Capacity is deliberately not a shape invariant.** The migration overfills the bag rather than
dropping a player's property, so checking capacity here would turn a legal old save into an
unloadable one. Capacity is enforced on insert, which is where it belongs.

## The migration never drops and never errors

Entries are sorted by id first: a v1/v2 inventory's order is `applyItem` push order —
deterministic within a run but arbitrary as data — and sorting makes the migration a pure
function of the SET.

Person fills to six, the remainder goes to a bag, and **a bag is granted only if something did
not fit**, so a light run keeps the container topology it had. The bag may overflow.

Every document defaults to `person`. Any other default would retroactively change a live run's
risk profile: a save that survived twenty legs with a passport would suddenly be one
`loseContainer` away from losing it, for a reason that predates the mechanic.

## What is deferred, and why it is not a gap

**`searchContainer` is not shipped.** ADR 0015 already recorded the deviation — it is not an
effect op, because `effect-context.ts` makes the absence of an `Rng` an explicit contract and a
search _writes_. The plan resolves it as `Outcome.search`, a spec resolved through
`runSkillCheck` on the existing `skillCheck` stream.

It is deferred rather than half-built because the data it consumes now exists and is inert
without content: `searchDC` per container and `concealability` per item are declared, the
`search` check tag exists, and the registry can already modify a search. What is missing is any
event that performs one — which is Phase 2B's seed corpus, not this milestone. Shipping the
roll now would mean shipping it untested against real content.

**This is a real gap and it is named as one**: the `search` check tag currently has registry
rows and no caller.

## Results

Sim delta at 2,000 runs: `contentVersion` only. Every behavioural number is unchanged, because
the fixture pack has one item effect and no container ops — the container model is data the
seed corpus will use, not a change to how the nine fixture events play.

## Consequences

- `SAVE_VERSION` 3, `MIGRATIONS` has two rungs, and `save-v3.json` plus `save-v3-loaded.json`
  join the fixture set. The v2 loaded fixture keeps a job: a test applies `MIGRATIONS[0]`
  directly and asserts it produces exactly that file.
- **`migrateSave` cannot stop at a superseded version any more**, because its post-migration
  guard describes TODAY's `RunState`. That is correct, and now asserted rather than left as a
  surprise — the intermediate rung is tested by calling the migration function directly.
- `countIn` tolerates `undefined` as well as `null`. It reads values that arrive from a save
  file, and a missing key is exactly the shape a pre-container save produces — found when the
  fixture pack's `item` effects, written before the `container` field existed, produced
  `[undefined]` as a target list.
- The `item` predicate gains `in`, and the `item` effect gains `container`. Both are on ADR
  0009's conformance surface, so the schema, the fixtures and the terse YAML all moved with
  them.
