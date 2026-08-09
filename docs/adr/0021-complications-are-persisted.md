# 0021 — A complication is persisted, not recomputed

- **Status:** Accepted
- **Date:** 2026-08-09
- **Fills the seam shipped empty in:** ADR 0010 §6 (`ComplicationSource`)
- **Relates to:** ADR 0005 (RNG addressing), ADR 0012 (save versioning), ADR 0020 (the search check)

## Context

CLAUDE.md §9 names four registries. `complications.yaml` is the second, and its integration
point has existed since Phase 1 as a typed, tested hook that produced a value nothing consumed:
`Complication` was `{ id, labelKey, params }` — a display chip that could not change a DC, add
or remove a choice, or apply an effect, and which no production caller could even cause to be
non-empty, because `advanceLeg` never passed a source.

Making it mechanical raises one question that decides the whole design: `advanceLeg` selects,
and `resolveChoice` runs on a **later call**. Where does the complication live in between?

## Decision — persist the id in `Presentation`; `SAVE_VERSION` 3 → 4

The alternative was to recompute it in `resolveChoice` from `(seed, eventId, presentedAtLeg,
state)`. That is cheaper, needs no migration, and is **wrong for four reasons of ascending
severity**:

1. **The two call sites do not see the same state.** `advance-leg.ts` rewrites `pendingEvents`
   (queue dedupe), `route.beatSchedule` and `rngCursors` _after_ `selectEvent` returns.
   Recomputation is stable today only because no predicate kind reads any of those. Nothing
   says one never will, and the consequence queue is one of the four named memory mechanisms.
2. **`chanceScope` differs between them.** `selectEvent` scopes by route id, `resolveChoice` by
   event id. A `{ chance: p }` inside a complication's `requires` — the most natural way to
   author "sometimes it is raining" — would answer differently at each.
3. **The cursor drain.** `advanceLeg` writes `rng.cursors()` back and `resolveChoice` writes
   again, so a cursor-advancing recompute would consume `encounterFlavor` twice per event.
   Avoidable by construction, but it means "just use `encounterFlavor`" is not sufficient — it
   has to be the _cursor-free_ use of it.
4. **The decisive one: reload.** `reconcileContent` **tolerates** a `contentVersion` mismatch
   by policy, because content ships in every app update and refusing would delete in-progress
   runs. So: the player reads "a second officer is watching", sees +3 difficulty and one fewer
   option, closes the app, updates, reopens. Under recomputation the complication is re-derived
   against the **new** `complications.yaml` and they resolve a different situation than the one
   they read. Under persistence the id no longer resolves, one `Map.get` returns undefined, and
   the event degrades to no-complication — the same policy the queue already applies to a
   pending event whose target vanished.

`isRunStateShape` needs **no** change: it never inspects `presentation`, and a null complication
is a no-op rather than a NaN. What it does need is that `migrate_3_to_4` **writes** `null`
rather than leaving the key absent — an absent key loads clean, reads `undefined`, and
`undefined !== null` at every guard site sends `resolveChoice` looking up a complication by an
undefined id. Silent, and it would present as a content bug.

**Both v4 save fixtures are byte-copies of the v3 ones with `version` flipped**, because both
were captured between legs (`presentation: {kind:'none'}`). So the fixture-completeness
meta-test is satisfied while the migration's only real branch never runs — two tests were added
for exactly that gap.

## Decision — selection is cursor-free

Both draws are content-addressed through `deriveKey`, the `chanceGate` pattern, rather than
taken from a running counter:

```
base   = streamKey(seed, 'encounterFlavor')
attach = drawWord(deriveKey(base, `${eventId}:${leg}:attach`), 0)
pick   = drawWord(deriveKey(base, `${eventId}:${leg}:pick`),   0)
```

`encounterFlavor`'s cursor therefore stays 0 forever. Stream isolation already guaranteed that
drawing here could not shift `eventPick`; this additionally guarantees that **adding a row to
`complications.yaml` shifts no other event's complication** — which matters because M-E adds
twenty-five at once. A cursor-advancing draw would make the draw _count_ depend on how many
rows were evaluated, the ADR 0005 §2 hazard.

`ATTACH_PERCENT` is one named constant, separate from the row weights. Weights decide WHICH;
this decides WHETHER. If attachment were emergent from how many rows happened to match, the
rate would drift every time the corpus grew and there would be nothing to tune. The sim reports
the measured rate against it.

## Decision — `checkDelta`, routed through `resolveModifiers`

The brief said `dcDelta`. Applying it as a raw `SkillCheck.dc` adjustment breaks three things:
it bypasses the **+6/−8 clamp**, the one mechanism stopping a pile of situational numbers
deciding an outcome alone; it bypasses conflict resolution and non-stacking collapse, so a
complication and a registry row expressing the same pressure double-count; and it is invisible
in `ModifierResolution`, the structure `resolveChoice` returns _specifically_ so design pillar 2
can render reason chips. A silent DC bump is a number the player cannot reconstruct.

It enters instead as a synthetic `RegistryModifier` with `appliesTo: CHECK_TAGS` — a
complication is a fact about the SITUATION, so it applies to whatever the player attempts in it,
unlike a registry row keyed to a kind of contest. `sourceKind: 'context'` puts it in the same
non-stacking bucket as the place-and-time rows, at `priority: 80` so that when two `context`
rows collapse, the one the player just READ in the body text is the one they see in the chips.

Same call ADR 0020 made for the search's container bonus, for the same reasons.

## Decision — `presentedChoices` is one function, used by both paths

```ts
export function presentedChoices(event, complication): readonly Choice[];
```

The app renders the presented list; `resolveChoice` looks a choice up by id on the next call.
Two implementations of "what is on offer" would let the screen offer a choice the engine
refuses — the class of bug CLAUDE.md 2.7 exists to prevent, reintroduced by a feature meant to
add texture. `resolve-choice.ts` no longer touches `event.choices` directly.

**A `removesChoice` that would empty the list is DECLINED, not applied.** `resolveChoice` would
otherwise reject every id a caller could pass and the leg would be unresolvable — a content
mistake becoming a stuck run. Under-applying a complication is strictly better than stranding a
player.

## Scope cut

**`effects[]` and `exclusiveWith[]` are not built**, approved before implementation. `effects`
would make `advanceLeg` an effect applier: a new `applied` field on `AdvanceLegResult`, a new
contract for the app and the sim, and a re-application question on reload. `exclusiveWith` is
degenerate while the cap is one complication per event — the same reason `maxPerEvent` was
degenerate for universal choices. `checkDelta` + `addsChoice` + `removesChoice` + text is the
whole play value.

## Consequences

- `SAVE_VERSION` 4. Every golden `expectedDigest` moved, and **only** those: `RunState.version`
  is inside `stateDigest`, so a format bump necessarily moves all nine while `choiceSequence`,
  `expectedHistoryKeys`, `expectedLegs` and `expectedEndings` stay byte-identical. That
  signature — digests only — is what distinguishes a format bump from a behaviour change.
- `contentVersion` did **not** move: the registry ships empty and was already a key on
  `ContentRegistries` from M-A.
- The Phase 1 seam survives unchanged and still produces display chips. Its stub test still
  asserts something real, so the two layers are independent rather than one having replaced the
  other.
- The sim gained a `Complication rate` line against the `ATTACH_PERCENT` target. It reads 0.0%
  until M-E writes rows.
