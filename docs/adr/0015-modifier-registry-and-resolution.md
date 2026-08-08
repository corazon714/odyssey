# 0015 — The global modifier registry and its resolution pipeline

- **Status:** Accepted
- **Date:** 2026-08-08
- **Implements:** 08-DIVERSITY-SYSTEMS prompt D1
- **Touches:** ADR 0005 §2 (chance addressing), ADR 0007 (predicate kinds), ADR 0009 (conformance surface)

## Context

Modifiers declared per choice do not scale. At 800 choices the same "you look like you slept
in a ditch" penalty is hand-copied into every social event, drifts in value between copies, and
adding one means editing hundreds of files. D1's fix is a global registry: declare a modifier
once, apply it to every check whose **tags** match.

That requires three things the engine did not have: a vocabulary of check tags, a place for the
registry to live that `contentVersion` covers, and a resolution pipeline with defined ordering.

## Decision

### 1. Check tags, and the pairing rule

`CHECK_TAGS` has 18 members. A tag is not a skill and not a location — it is the _nature of the
contest_, and it is the only one of the three a registry row can usefully match on.

**A check tags the broad tag AND its specific flavour**: a bribe is
`[social, bribery, authority, crime]`. That is what makes `appliesTo` intersection pay —
"dishevelled" lands on all four social flavours, "silver tongue" only on `deception`. Without
the rule the registry fragments into per-flavour duplicates, which is the problem it exists to
solve. `SKILL_IMPLIES_TAG` gives `content:lint` the mapping to enforce it.

Deviations from the vocabulary in the brief, each with a reason:

- **Dropped `border`** — a location, not a kind of test. Replaced by a new `locationType`
  predicate kind (the 28th), which is strictly more general: it serves ports, checkpoints and
  wilderness too. It also closes a real spec gap — `docs/engine-spec.md:143` writes
  `requires: { context: { locationTypes: [...] } }` inside a `scheduleEvent`, and no predicate
  kind could express it.
- **Added `bribery`** — the money spec needs "large cash raises suspicion" and "cash below a
  threshold locks out bribes" as rows. `haggle` is commerce; bribery is money + authority +
  criminal exposure, and a modifier for one must not fire on the other.
- **Added `documents`** — passport/visa/ticket is a subsystem with a predicate kind, an effect
  op and a container link, and had no tag.
- **Added `search`** — required by the container model. `stealth` is hiding yourself,
  `perception` is noticing; being searched is a distinct contest where `searchDC` and
  `concealability` apply.
- **Added `language`** — `Skills.languages` exists in state and **nothing read it**. One
  `no_shared_language` row replaces the same modifier hand-copied into every social event.

`luck` is the thinnest: no skill backs it, so it can only collect flat charm modifiers. Kept,
flagged, and worth removing in Phase 2B if the registry leaves it empty.

### 2. The registry lives inside `ContentRegistries`, not beside it

`contentVersion()` hashes `canonicalJson({ events, registries })`. A registry hung off
`ContentPack` as a sibling field **would not be in that hash**. `pack.version` would not move
when `modifiers.yaml` changed, `replayRun`'s contentVersion refusal would never fire,
`reconcileContent` would report `changed: false`, and every golden run would silently replay
against different modifier maths **with a green suite**.

Being inside the registries makes that impossible by construction, and
`content-pack.test.ts` asserts the version moves when one delta changes by 1.

The pack surfaces it as `pack.modifiers`, so `resolveChoice` reaches it with no new parameter
and no caller can hand in a different one — the same argument ADR 0005 makes for deriving the
RNG from state rather than injecting it.

### 3. Pipeline order is balance contract

Six steps, each ordered against a counterexample pinned in
`modifiers/__tests__/resolve-modifiers.test.ts`:

| Step        | Why here                                                                                                                                                                                              |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1+2 collect | Order does not reach the total — step 5 sorts by magnitude — only chip order.                                                                                                                         |
| 3 conflicts | **Before** the collapse, or a conflict declared against a specific modifier silently retargets whichever survived. `+3/−4` with a `+2` same-kind sibling totals **−2** this way and **−4** the other. |
| 4 collapse  | **Before** DR, or DR is computed over entries about to be deleted.                                                                                                                                    |
| 5 diminish  | **Before** the clamp, or the clamp leaves non-integer shares for DR to work on.                                                                                                                       |
| 6 clamp     | Last, with the reduction attributed back so chips still sum to the total.                                                                                                                             |

**Diminishing returns is computed once over the tail SUM, not per entry.** Per-entry
`trunc(delta × 3/5)` sends a `±1` to zero, and under magnitude-descending ordering the `±1`s
are exactly what lands in the tail — so four `+1`s would total `+3` and **eight `+1`s would
also total `+3`**, making every modifier past the third free in precisely the
many-small-modifiers case DR exists to control.

**And it rounds half-up rather than truncating**, which a test caught after the tail-sum fix:
truncation still sends 60% of a _single_ `+1` to zero, reproducing the same pathology one
entry at a time. `mulDivRound` uses the integer `2a + b` form, so no float rounding semantics
are relied on.

### 4. The clamp attributes by largest remainder

Per sign, independently. Weights are apportioned so the shares **sum to the cap exactly**:
`qᵢ = ⌊mᵢ·C / S⌋`, then the `C − Σqᵢ` remainder is distributed by (remainder desc, weight desc,
id asc).

That exactness is the requirement, not a nicety: design pillar 2 says the player must be able
to reconstruct the number, so the chips have to sum to the total shown. Rejected alternatives:
float-proportional (not reproducible bit-for-bit across engines) and trim-smallest-first (it
_deletes_ chips, leaving a total nobody can rebuild from the screen).

A share may legitimately reach **0**. There is deliberately no minimum of 1 — a floor would
break the sum guarantee — so the chip renders as `0 (was +1, capped)`.

### 5. Skill bypasses the clamp

`total = d20 + skill + clamp(modifiers, −8 .. +6)`. The bounds exist to stop a pile of
situational modifiers deciding an outcome on their own; a character's competence is not
situational. Putting skill through the pipeline would cap it at +6 alongside everything else,
so a skill-10 specialist and a skill-6 generalist would roll identically once either had gear.
Settled with the human before the pipeline was written. The skill still appears as a chip.

## A correlated-randomness bug this fixes

`effects/modifier-source.ts:45` called `evaluatePredicate(modifier.when, ctx)` **with no
`path`**. The path defaults to the root `'r'`, and a `chance` gate's RNG address is derived
from `(scope, path)` where scope is `<eventId>:<legIndex>`.

So **every `{chance}` gate in every modifier, across every source, in one event on one leg
shared a single address and returned a single answer.** Harmless with Phase 1's one
hand-authored modifier per choice; catastrophic with a registry, where "30% the guard is
distracted" would fire simultaneously for every row using it.

Both paths are now **content-addressed** — `m:<modifierId>` for registry rows,
`c<index>:<labelKey>` for choice-local ones. Content-addressed and not positional, because a
positional address shifts every later gate when a row is inserted, which is the exact hazard
ADR 0005 §2 exists to prevent.

## Consequences

- **`SkillCheckSpec` gains a required `tags`**, putting it on ADR 0009's conformance surface
  via `SkillCheck`. The content schema requires at least one tag with no default: forgetting
  it is silent otherwise, because the check still rolls, it just draws no registry modifiers.
- **`collectRefs` and `collectFlagUsage` now walk the registry.** Both walked events only; a
  flag read _only_ by a registry modifier would have been reported as written-never-read, a
  false positive on the most valuable line in the sim report.
- **`resolveChoice` returns `resolution`** alongside `check` — the presentation-ready chips,
  with `rawDelta`, `diminished` and `capped`. This is the Phase 7B dice-animation contract.
- **`sim:diff` no longer ignores the report header.** It treated the whole `# Sim Report` line
  as volatile because seed and run count change per invocation — which meant a changed
  `contentVersion` was invisible and the tool would say "no change" while the pack moved
  underneath the baseline. Seed and runs are now blanked and the version is compared. Found
  here, when a real version change reported clean.
- **The sim delta for this milestone is exactly one line: `contentVersion`**
  `7f34f65d → c78a13d7`. Every behavioural number — completion rate, endings, trajectories,
  beat fill, payoff rate — is unchanged, because the fixture registry is empty and the fixture
  modifiers' totals are unaffected by the new pipeline. The registry's real balance effect
  arrives with the Phase 2B corpus.
- Three phantom references to a `scoring-order.test.ts` that never existed are corrected to
  `director/__tests__/scoring.test.ts`.
