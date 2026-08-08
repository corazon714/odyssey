# 0016 — Three-tier money, and the first save migration

- **Status:** Accepted
- **Date:** 2026-08-08
- **Implements:** 09-WORLD-MAP-AND-ITEMS prompt W4
- **Bumps:** `SAVE_VERSION` 1 → 2 — the first real entry in the `MIGRATIONS` ladder

## Context

W4 asks for one currency unit in three forms: cash (stealable, untraceable, universally
accepted), bank (not stealable, traceable, only where the service exists), and valuables
(illiquid, need a buyer). `RESOURCE_KEYS` had a single `money`.

## Decision

**`cash` and `bank` are resource keys. Valuables are NOT.** Valuables are items carrying a
`value`, because being illiquid _is_ the mechanic — a third counter you could spend anywhere
would erase exactly the distinction the tier exists to create.

**`money` is renamed rather than kept.** Keeping it once `bank` existed would leave two keys
reading "money" and "not-cash money", which quietly teaches every future author the wrong
model. The human chose the rename over the cheaper option knowing it forces a save break.

**No real currencies and no exchange rates**, per the brief: tedious, a localisation problem,
and they add nothing over one abstract unit.

**Bank access is gated by place, not by a bound.** `RESOURCE_BOUNDS.bank` is `min: 0, max: null`,
identical to cash — "only at nodes with the service" is a gate on the _choices_ that move money,
expressed with the `locationType` predicate kind (city/town) added in ADR 0015. It is not a
property of the meter. Node services proper arrive with `packages/content/geo/`.

## The migration is not a field rename

`migrate_1_to_2` renames `resources.money` and adds `resources.bank: 0`. That is the obvious
half. The half that would have been missed:

**`key: 'money'` is persisted inside `pendingEvents[].requires`.** That field stores a
canonical `Predicate` tree, and `{ kind: 'resource', key: 'money' }` is a legal node in it. A
migration that renamed the resource and stopped would leave every queued promise gated on a
resource key that no longer exists — the gate reads `undefined`, compares false, and the
promise expires unfired. Silent, and it would present as a director bug.

So the tree is rewritten recursively, and the walk's `default` **recurses** rather than
returning, the same discipline `collect-refs.ts` uses (ADR 0009 §4): a future predicate kind
that nests children must not silently drop a rename passing through it.

Only a `resource` node's `key` is renamed. A **flag whose id happens to be `money`** is a
different thing entirely and survives untouched — asserted by a test, because a blanket
string replace over the tree is the obvious wrong implementation.

**`history` is deliberately NOT rewritten.** It carries `ClampEvent` and `AppliedEffect`
params that may name `money`, but `reconcileContent`'s policy is history-verbatim: a run's
past is what happened, and rewriting it to match today's vocabulary is precisely what that
policy forbids. An i18n alias keeps the retired key renderable.

**New accounts start at zero.** A v1 save predates banking entirely, so nobody had an account;
seeding a live run with a balance would hand it money it never earned.

## A NaN hazard this closes

`isRunStateShape` checked `resources` only as "an object". Its own docstring justifies the
exhaustive rng-cursor loop with "a missing cursor is silently catastrophic" — and a missing
resource key is exactly as catastrophic:

`resources[key] + delta` is `NaN`; `clampResources` compares `NaN < min` and `NaN > max`, both
false, so it writes the NaN straight through; `stateDigest` serialises it as `null`. The run
continues with a meter that is not a number and every comparison against it silently false.

Adding `bank` is what made that reachable — a v1 save has no such key, so a migration that
forgot it would produce exactly this. `RESOURCE_KEYS` and `SKILL_KEYS` are now checked
exhaustively, with tests for both the missing-key and the NaN case.

## Results

Sim delta at 2,000 runs is **two lines, and neither is a number**:

```
- # Sim Report — contentVersion=c78a13d7
+ # Sim Report — contentVersion=f25d740f
-   money    leg5: 220/280/540   leg15: 400/460/500
+   cash     leg5: 220/280/540   leg15: 400/460/500
```

Completion rate, endings, beat fill, payoff rate, repeat rate, every trajectory percentile —
identical. That is the correct outcome for a rename, and it is the evidence that no behaviour
rode along with it.

## Consequences

- **`MIGRATIONS` is no longer empty.** ADR 0012 refused to invent a fake migration to exercise
  the ladder; this is a real one, and the machinery it was built for now carries traffic.
- **Four existing tests changed deliberately**, each because it had assumed v1 was current:
  `accepts a current save unchanged` and the digest round-trip retarget to `SAVE_VERSION`; the
  synthetic-chain test starts from a current-shaped body (its migrations only add `weather` and
  `tension`, so a v1 body would fail the tightened shape guard for a reason unrelated to the
  chaining it tests); and `isRunStateShape accepts a real save` now uses v2 — **a v1 save is
  genuinely no longer a valid `RunState`**, and a new test asserts it is rejected.
- **New fixtures.** `save-v2.json` (required by the completeness meta-test) plus
  `save-v1-loaded.json` / `save-v2-loaded.json`. The plain v1 fixture has an empty inventory,
  no passport and a null `requires`, so every migration assertion against it was close to
  vacuous — the loaded pair is what actually exercises the predicate rewrite, and it carries
  the documents and inventory that M2A.5's container migration will need.
- **`bank` is live, not a dead field.** Two registry rows read it: `looks_broke` (low cash,
  high bank reads as broke to a guard — the mechanical point of the tier) and
  `cannot_cover_a_bribe`. Without them `bank` would be a resource nothing consults, which is
  the same defect as `Skills.languages` before ADR 0015.
- One over-broad rename was caught by the round-trip test: event **theme tags** contain `money`
  as a subject, not a key, and three had been renamed to `cash`. Reverted — the theme covers
  both tiers and `cash` would have been narrower than the events actually are.
