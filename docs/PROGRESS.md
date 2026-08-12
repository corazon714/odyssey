# PROGRESS

> Updated at the end of every session (`CLAUDE.md` §12). Assume the next session starts
> with zero memory of this one.

---

## Shipped this session (2026-08-12, session 7) — **PHASE 3 THROUGH M3.5**

Steps 1–5 of the Phase 3 plan (`~/.claude/plans/plan-mode-build-the-synthetic-bird.md`) are
done. **The route generator runs on real geography and the M3.5 diversity gate PASSES at a
median 59% route overlap against a 70% ceiling.** It got there after failing at 83%, and almost
none of the fix was where the plan predicted — see ADRs 0030 and 0031.

### The slice, as committed

`263 nodes` (170 settlements + 93 border crossings) · `404 edges` · **1 connected component** ·
0 orphans · 35 bridges · 33 tolled edges · 129 rail corridors · 58 `unavoidable` hard edges.
Derived from GeoNames + Natural Earth only; no OSM anywhere (ADR 0024).

### Prove it

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm content:lint && pnpm format:check
```

```bash
pnpm geo:build       # 1 component, 0 orphans, overlay issues none
pnpm geo:diversity   # VERDICT: PASS — median 59% against a 70% ceiling
pnpm geo:verify      # named pairs, pathologies, benchmark
node packages/tools/geo-build/cli.ts --stage=all --real --bbox=-12,36,30,60 --check
pnpm sim:diff -- --runs=2000                    # "No change vs docs/sim-baseline.md."
pnpm sim -- --pack=corpus --runs=2000 --diff    # "No change vs docs/sim-baseline-corpus.md."
```

`--stage=all` needs `.geo-cache/` populated (seven archives, `sources.lock.json` lists them).
Everything else runs on committed artifacts.

### What landed, in commit order

| commit    | what                                                                                     |
| --------- | ---------------------------------------------------------------------------------------- |
| `ff5f5e3` | last 5 components closed via overlay; `--stage=diversity`, which names its own cause     |
| `d9b55be` | `place-borders.ts` — 51 controlled crossings, 42 of them forced by connectivity          |
| `9d539cd` | `classify-terrain` precedence: `hill` 0 → 12, `desert` correctly still 0 in Europe       |
| `8e42227` | `tolled` was declared and NEVER READ; `train` tested endpoints not corridors (93% → 36%) |
| `59d71e0` | `safest`'s terrain mask cut the graph into 52 pieces; `GeoEdge.unavoidable` fixes it     |
| `b702315` | **the gate PASSES** — `TWO_HOP_RATIO` 1.6 → 1.2 took the median 72% → 59%                |
| `c9c86ae` | there was no sim baseline drift; `sim:diff` now refuses a mismatched run count           |
| `606c407` | the fixture pack is the empty-registry control and must stop being reported as failing   |
| `3f6522a` | `pnpm geo:verify` — and three findings it turned up                                      |
| `846a4e8` | ADRs 0030–0032                                                                           |

### The three things worth remembering

1. **A mask must not disconnect the graph** (ADR 0030). The boundary mask left 43 components,
   the terrain mask 52. The ladder then rescued every profile by dropping masks, after which all
   five searched one identical graph and "diversity" was arithmetic. Both masks now carry a
   derived Kruskal exemption, and what is NOT exempted is the point.
2. **Diversity came from graph density, not the cost functions** (ADR 0031). Three real
   cost-model fixes moved identical `fastest`/`cheapest` pairs 170 → 167. Moving the 2-hop prune
   from 1.6 to 1.2 took it to 102 and the median from 72% to 59%.
3. **A report must read its diagnosis off its own measurement** (ADR 0032). Two reports printed
   conclusions their data did not support. One cost a twenty-commit bisect for a drift that did
   not exist.

---

## Half-done

Nothing is left broken. These are absent or partial, with paths:

- **`packages/content/geo/overlay.json` should be `overlay.yaml`.** Its own header says M3.6
  moves it behind a loader in `packages/content`, where `yaml` is already declared. It is JSON
  today only because `packages/tools` cannot reach `yaml`.
- **`packages/content/package.json` has no `"./geo"` export.** M3.6 needs one. Adding it is a
  `ROOT_TRIGGERS` commit and takes the full-monorepo DoD.
- **`densify-corridors.ts` was never built.** 16 edges (4%) exceed 450 km, the largest `D_max`
  in the plan; the max is 573 km. A `GEO_EDGE_TOO_LONG` rule added at M3.6 goes red on our own
  data immediately — the plan warns about exactly this.
- **`place-borders` and `mark-unavoidable` are global over-approximations.** Both compute one
  spanning set for the whole graph rather than per origin–destination pair (ADR 0030).
- **`docs/geo-data-licensing.md` §6 contradicts the code.** It describes a _per-terrain_
  circuity factor with a "not yet measured" table; `bf1164e` measured ONE global 1.39 and
  rejected per-terrain. It also references `overlay.yaml`, which does not exist yet.
- **`world.simplified.json` does not exist.** Deferred to M3.11 with the scale-up.
- **The 22–48 leg band is unsurvivable** — 0% completion at 24+ legs, measured (ADR 0026
  addendum). Still open, and it gates M3.10b.

---

## Next step — ONE task

**M3.6: `packages/content/loader/load-geo.ts` plus the `content:lint` geo rules that can hold
against a 263-node slice.**

A fresh agent can start here:

1. Read `docs/adr/0024-geography-data-and-node-identity.md` (node ids, the OSM firewall, the
   services table) and the header comment in `packages/content/geo/overlay.json`.
2. Move `overlay.json` → `overlay.yaml`. `yaml` is already declared in
   `packages/content/package.json`; `packages/tools/geo-build/cli.ts` currently `JSON.parse`s it
   in `generate()`, and that call site moves behind the new loader.
3. Write `load-geo.ts` beside `load-content.ts`, following the `readLocale` precedent
   (`load-content.ts:84-87`): return `{ geo: null, issues: [] }` when no geo files exist. Do NOT
   return a missing-file `ContentIssue` — that becomes an `error('SCHEMA', …)` and turns
   `lint.test.ts:25-28` red for the milestones before the data lands.
4. Add `"./geo"` to `packages/content/package.json` exports. Full-monorepo DoD.
5. Write `packages/tools/content-lint/rules-geo.ts`, each rule with a synthetic-bundle test:
   `GEO_DISCONNECTED`, `GEO_ORPHAN_NODE`, `GEO_EDGE_ENDPOINT_UNRESOLVED`, `GEO_OVERLAY_STALE`,
   `GEO_NAMED_BORDER`, `GEO_PLACE_BEHAVIOUR`, `GEO_NAME_FIELD_MISPLACED`, `GEO_OSM_SOURCE`,
   `GEO_NODES_DIGEST_STALE`.
6. **Do NOT add `GEO_EDGE_TOO_LONG` or a node-count band rule** unless open question 1 below is
   answered otherwise. Both fail on the current slice by construction. Deferring them is a
   decision — record it in the commit.
7. DoD: `pnpm content:lint` clean, and `lint.test.ts` must still pin `MISSING_IMAGE_MANIFEST` as
   the only gap.

---

## Open questions for the human

1. **`GEO_EDGE_TOO_LONG`: defer to M3.11, or build `densify-corridors.ts` now?** Recommendation
   is defer — waypoint density is a function of the final node set, so calibrating it against 263
   nodes means redoing it at 1,200. This is the one M3.6 decision that changes what gets built.
2. **The 70% diversity guarantee is directional, and nobody decided that.**
   `acceptByDiversity` tests each new candidate against what is already accepted, normalised by
   the candidate's length, and never re-tests an earlier route against a later one. On
   Barcelona–Palermo, `fastest` is 79% inside `safest` while `safest` was accepted at 69%. Is a
   symmetric check wanted, or is the one-way guarantee the intended contract? (ADR 0031.)
3. **Yen has no length ceiling.** Vienna–Budapest is 297 km direct and the pool also holds 866,
   1,186 and 1,352 km routes. Sample-wide the longest/shortest ratio is p50 1.36×, tail 10.32×.
   Should `kShortestPaths` reject a backfill beyond some multiple of the shortest?
4. **`illicit` strictly dominates on 9 of 168 sampled pairs** — shorter than every other route,
   no more borders, no harder ground. The illegal route is meant to be a trade. Accept, or price
   it?
5. **The 22–48 leg band is unsurvivable and M3.10b depends on it.** Health is a one-way ratchet
   with two `+2` restores in the whole corpus. Content problem or tuning problem?
6. **Is ~40% the accepted beat-fill number for Phase 3**, or do the four missing beat events
   (`departure`, `ferry_boarding`, `approach`, `finale`) come into scope? Unchanged from session
   6, and it gates M3.10b's acceptance criteria.

---

## Shipped this session (2026-08-09, session 6) — **PHASE 2B COMPLETE**, M0 through M-F

**Phase 2B is complete. All seven milestones landed in one session.** The plan — 162
modifiers, 25 complications, 15 universal choices, 12 seed events, a real `en/` locale and a
style guide, across seven milestones — is at
`~/.claude/plans/plan-mode-author-the-enchanted-pizza.md`, approved with four decisions
recorded in its Context section. **The seed corpus exists, has words, and plays inside its
design band: 13 events, 137 modifiers, 25 complications, 15 universal choices, a complete `en`
locale, and `content:lint` at 0 errors / 1 warning — from 31 warnings at session start.**

**Prove it:**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm format:check
```

```bash
pnpm content:lint                          # exit 0 — 0 errors, 31 warnings
pnpm sim:diff -- --runs=2000               # "No change vs docs/sim-baseline.md."
pnpm sim -- --runs=2000 --pack=corpus --diff   # "No change vs docs/sim-baseline-corpus.md."
pnpm vitest run --project engine src/loop/__tests__/search-check.test.ts   # 6 tests
```

Totals moved 1055 → **1142 Vitest + 3 Jest across 53 files**.

### What M0 delivers

`Choice.search` — a container search that resolves through the existing `runSkillCheck` on the
existing `skillCheck` stream. No new RNG stream, no `RngCursors` change, no save migration.
`docs/adr/0020` is the reasoning; the two decisions worth knowing without reading it:

- **`search` is on the CHOICE, not the Outcome** (PROGRESS's own prose said Outcome and was
  wrong — `onCheck` branches on the choice's roll, so a search on the outcome resolves too late
  for the branching mechanism both documents named).
- **Success means it stayed HIDDEN.** The Phase 2A plan file's example comments this the other
  way round. Every `search`-tagged row in `modifiers.yaml` is signed from the player's side —
  `cash_concealed` +2, `wanted_by_authorities` −3 — so a searcher-rolls framing makes all four
  apply backwards. Reading either document literally would have shipped a silently inverted
  mechanic that no test could catch, because no event used a search.

Two warnings closed and four opened, all honest: `UNUSED_TAG: search` is gone (the completion
signal the old next-step named), `LIABILITY_UNBACKED: cash_belt` is gone because `collectRefs`
now walks `search.item`. New: `stealth` is a `THIN_TAG` twice over, because the registry has no
stealth rows — M-E's job. 29 → 31.

`hiddenUnless` is **no longer dead**. ADR 0012 recorded that it had exactly one instance and
that instance never fired; `hide_the_cash` gates at `cash >= 100`, which a fixture run starting
on 320 reaches, and it is picked in 0.3% of runs.

### ⚠ The finding: the fixture pack ships an EMPTY modifier registry

**The ten rows in `packages/content/modifiers.yaml` have never applied in a golden run or a sim
run.** `mini-pack.json` has `registries.modifiers: []`, and `packages/tools/sim/load-pack.ts`
reads that same file. They are exercised by `packages/content`'s unit tests and by
`content:lint`'s static analysis, and by nothing that runs the engine.

M2A.3's sim delta was recorded as "`contentVersion` only". True — but because the `modifiers`
**key** went from absent to `[]`, not because the rows entered the pack.

Not fixed here: the fix belongs with M-D, where the sim gains a pack that loads `modifiers.yaml`.
**Until then no sim number is evidence about the registry** — including the ~162 rows M-E adds.

### Sim delta — a redistribution, not a difficulty change

`offer_bribe` 0.4% → 0.1%, `hide_the_cash` 0.3% (new), `border.guard_remembers/acknowledge`
0.2% → 0.0% because fewer bribes fire to schedule it. Endings moved ±0.3pp inside that same
chain. **Completion rate unmoved at 31.2%.** Golden runs: exactly 18 lines changed, 9
`contentVersion` and 9 `expectedDigest`, everything else byte-identical.

**Wall clock is not comparable across machines and the baseline now says so.** It reads ~740 ms
where M2A.6 read 496 ms; the pre-M0 tree measures 758–787 ms on the same machine, so the whole
difference is hardware. Measured both ways before believing it.

### M-A — the `ContentRegistries` shape commit

`ContentRegistries` gains `complications` and `universalChoices`, **both shipped empty**, so the
`contentVersion` hit is taken once and reviewed on its own rather than mixed into the milestone
that fills them. `contentVersion` moved `819cb199` → `aee5a082`.

**The invariant it exists to demonstrate held:** the `golden-runs.json` diff is exactly 18
lines — 9 `contentVersion`, 9 `expectedDigest` — with `choiceSequence`, `expectedHistoryKeys`,
`expectedLegs` and `expectedEndings` byte-identical across all nine runs. `pnpm sim:diff` says
"No change". Zero behaviour moved.

Both element types are defined in full now rather than stubbed: `RegistryComplication`
(`content/registry-complication.ts`) and `UniversalChoice` (`content/universal-choice.ts`),
plus a 13th branded id, `ComplicationId`. Defining them early costs nothing — `contentVersion`
hashes `[]` identically whatever the element type is — and it makes M-B and M-C purely
additive.

Three things settled here that the later milestones depend on:

- **`UniversalChoice` embeds a whole `Choice`** rather than flattening its fields. A flattened
  copy is a second definition of `Choice` that drifts the first time either gains a field —
  which `search` just demonstrated by being added in M0.
- **`UNIVERSAL_CHOICE_PREFIX` is `'u:'`, not `'u.'`.** `:` is outside `ID_PATTERN`; a dot is
  legal precisely so ids can be namespaced, so a `u.` prefix would be forgeable. The failure it
  prevents is not a crash: `resolveChoice` uses `.find`, so a colliding injected id would be
  displayed, picked, and resolve the AUTHORED choice's outcomes.
- **`MAX_UNIVERSAL_PER_EVENT = 3`, and "never more than half the choices shown" reduces to
  `i <= a`** — with `a` authored and `i` injected, `i <= (a+i)/2` is exactly `i <= a`. So the
  cap is `min(3, authored.length)`: static, state-free, and computable where the splice happens.

Two new `content-pack.test.ts` blocks assert the version moves when a complication's
`checkDelta` or a universal choice's `labelKey` changes, plus an anti-vacuity case — the
placement is otherwise untested until the milestone that fills the registries, which is the
milestone that would have to debug it.

`conformance.test.ts`'s L2 layer caught both new empty constants and demanded they be
classified. Working as designed; they are recorded as `'empty constant'` alongside
`EMPTY_MODIFIER_REGISTRY`.

### M-B — universal choices

The subsystem, shipped with an **empty registry**. `injectUniversalChoices` splices matching
rows into `GameEvent.choices` inside `createContentPack`, before the `contentVersion` call, so
`pack.version` fingerprints what the pack actually plays rather than what was authored.

**The proof: `contentVersion` did not move** (still `aee5a082`), `golden-runs.json` is
byte-identical to the M-A state, and `pnpm sim:diff` says "No change". A whole subsystem landed
and nothing observable changed — which is only checkable because the registry ships empty.

New: `content/inject-universal-choices.ts`, `content/event-tags.ts`,
`content/schema/universal-choice.ts`, `content/loader/load-universal-choices.ts`,
`content/universal-choices.yaml` (empty, with the authoring rules in its header),
`tools/content-lint/rules-universal.ts`. `content:lint` is now **14 rules**.

Things settled here that are easy to get wrong later:

- **`tagsOf` moved from `director/` to `content/event-tags.ts`.** Pack construction needs it,
  and `content/` depending on `director/` to build a pack inverts the layering — the director
  consumes content, not the reverse. Still exported from the barrel, so no API break.
- **The splice is the identity on an empty registry, down to object reference.** Tested. A
  rebuilt-but-equal array would also be correct, but this is the stronger claim and it is what
  makes "nothing moved" mean something.
- **`buildOutcome` now takes a `keyBase`, not an event id.** That indirection is the whole
  reason universal choices are affordable: row-scoped keys (`universal.walk_away.label`) mint
  ONE key however many events a row lands in. Event-scoped derivation would have minted one per
  event x per row — twelve events and three rows is thirty-six keys for three strings, each one
  a `MISSING_I18N_KEY` error.
- **The schema reuses `event.ts`'s `skillCheckSchema` / `searchSchema` / `outcomeSchema`**
  rather than restating them. A second definition of what a choice may contain drifts the first
  time either gains a field — which `search` demonstrated one milestone ago.
- **The "never strictly the best option" rule is half-mechanised.** The schema rejects a row
  with no costs, no roll and no effects; a roll counts as a cost because risk is one. The rest
  is review and `content:lint`.
- **`content-lint` runs the REAL splice** rather than reimplementing matching, the cap and
  families. A linter with its own copy of the rule reports on a second implementation.

### M-C — complications. `docs/adr/0021`. **The first milestone to touch `RunState`.**

The subsystem, shipped with an **empty registry**. `Presentation` gains `complicationId`;
`SAVE_VERSION` is **4**; `MIGRATIONS` has a third entry.

**What moved and what did not:** all nine `expectedDigest` values moved and **nothing else
did** — `contentVersion` is still `aee5a082`, and `choiceSequence`, `expectedHistoryKeys`,
`expectedLegs` and `expectedEndings` are byte-identical. `RunState.version` is inside
`stateDigest`, so a save-format bump necessarily moves every digest. **That signature —
digests only — is what distinguishes a format bump from a behaviour change**, and it is the
thing to check if M-D or M-E ever produces a diff you cannot explain.

New: `director/select-complication.ts`, `content/presented-choices.ts`,
`content/schema/complication.ts`, `content/loader/load-complications.ts`,
`content/complications.yaml` (empty, rules in its header). The sim gained a **`Complication
rate`** line against the `ATTACH_PERCENT` target; it reads 0.0% until M-E writes rows.

Four decisions, all argued in ADR 0021 — the ones worth knowing here:

- **Persisted, not recomputed.** The decisive reason is not the state drift or the differing
  `chanceScope` between the two call sites, both of which are real; it is RELOAD.
  `reconcileContent` tolerates a `contentVersion` mismatch by policy, so a player who reads a
  complication, closes the app, updates and reopens would — under recomputation — resolve a
  different situation than the one they read. A persisted id that no longer resolves degrades
  to no-complication in one `Map.get`.
- **`migrate_3_to_4` WRITES `null` rather than leaving the key absent.** `isRunStateShape` does
  not inspect `presentation`, so an absent key loads clean, reads `undefined`, and
  `undefined !== null` sends `resolveChoice` looking up a complication by an undefined id.
  Both v4 fixtures are byte-copies of the v3 ones (`presentation: {kind:'none'}`), so the
  meta-test passes while the migration's only branch never runs — **two tests were added for
  exactly that gap.**
- **Selection is cursor-free**, so `encounterFlavor`'s cursor stays 0 forever and adding a row
  shifts no other event's complication. That property is load-bearing: M-E adds twenty-five at
  once. Pinned by a test.
- **`presentedChoices` is ONE function used by both the presentation path and
  `resolveChoice`'s lookup.** `resolve-choice.ts` no longer touches `event.choices` directly.
  A `removesChoice` that would empty the list is DECLINED — a content mistake must not become
  a stuck run.

`effects[]` and `exclusiveWith[]` were cut before implementation, approved: the first would
make `advanceLeg` an effect applier, the second is degenerate at one complication per event.

### M-D, part 1 — prerequisites and the `--pack` machinery

**A plan bug, found before it cost anything.** The plan said "modifiers before events". That is
**impossible as the tests stood**, and the two assertions bound in opposite directions:

- `modifier-registry.test.ts:43` — every npc/item/flag a MODIFIER's `when` names must be declared.
- `declarations.test.ts:55` — every DECLARED id must be referenced by an EVENT; it walked
  `collectRefs(events.events)` with no registry argument.

Between them a modifier could not name an id unless an event named it too, so `modifiers.yaml`
could never grow ahead of the corpus — the order `STARVED_CHECK` demands. **`content:lint` never
had the bug**: `rules-references.ts` already passes `bundle.modifiers` to both walks. The test
now does too. That is the test catching up with the tool, not a relaxation — a flag a modifier
reads is read, and the anti-pattern being guarded is a declaration NOTHING consumes.
Behaviour-neutral today; verified.

**`docs/content-style-guide.md` written.** Its subject is the one question that decides
everything else: does this belong in an event or in a registry? It also records the
non-stacking-collapse rule that shapes every modifier, the check-tag pairing rule, the two
`sourceKind`s with no state behind them (`region`, `companion`), the i18n cliff, and the §11
place-neutrality rule in authoring terms.

**`pnpm sim -- --pack=fixture|corpus`.** `loadCorpusPack` builds from `packages/content/` —
YAML events plus `modifiers.yaml`, `complications.yaml` and `universal-choices.yaml`.

> **This closes the M0 finding: `modifiers.yaml` has now reached a running engine.** Same nine
> events, same routes, ten modifier rows live: **completion 31.2% → 30.8%**. That is what the
> registry does, measured for the first time.

**One baseline per pack**, tagged in the filename. A single shared file would be overwritten by
whichever ran last, so "no change" would mean "no change since somebody else's run" — worse than
no baseline, because it looks like coverage. `docs/sim-baseline.md` keeps its name;
`docs/sim-baseline-corpus.md` is new. Both diff clean.

**`docs/sim-baseline*.md` are now in `.prettierignore`**, found the hard way: Prettier collapsed
the corpus report's column alignment, and `sim:diff` compares line by line — so every headline
metric read as changed against a file that was byte-identical in substance.

Corpus routes are deliberately still the fixture routes: route generation is Phase 2B
`engine/src/route/`, and inventing a corpus route file here would pre-empt it. Flagged in the
baseline header to revisit when the corpus lands.

### M-D, part 2 — the corpus split. **The seed corpus exists.**

Thirteen events across all twelve categories, **137 modifiers** covering all twelve
`sourceKind`s, twenty declared flags, ten items, six npcs, ten traits. The nine fixture YAMLs
moved to `packages/content/__fixtures__/events/`; `round-trip.test.ts` repointed in one line.

**`content:lint` went 31 warnings → 3, zero errors.** Every `THIN_TAG` and `UNUSED_TAG` is gone:
all eighteen check tags now have **≥3 events and ≥5 modifiers**. The three that remain are
`MISSING_LOCALE`, `SAFETY_NOT_SCANNED` and `MISSING_IMAGE_MANIFEST` — the locale and the image
manifest, both of which are their own commits and neither of which may be stubbed.

**The fixture control survived intact:** golden runs byte-identical, `pnpm sim:diff` "No change".
That is what the split was for.

#### Two content bugs the first corpus sim found

Both are the class of silent failure ADR 0001 says content has no other instrument for:

- **`authority.the_file_catches_up` was `priority: beat`.** A beat event only fires when a beat
  SLOT of its type is due, and the consequence queue cannot arrange one — so the payoff was
  scheduled 129 times and paid off **1.6%**. Made `normal`: **1.6% → 67%**, unresolved threads
  125 → 42. **A queued payoff must never be a beat event**, and that is now the rule.
- **`breakdown.the_roadside_repair` gated on `transportStat condition lte 7`.** Transport starts
  at 10 and only a failed storm takes 2 off it, so the event **never fired in 2000 runs**.
  Now `lte 9`; never-fired 1 → 0.

#### Three tools tests were asserting the fixture's gaps, not a property

Worth reading before writing the next one:

- `lint.test.ts` asserted `UNUSED_TAG` is REPORTED. That was the honest state of a nine-event
  fixture; the corpus covers every tag, so the assertion was inverted into its positive form —
  tag coverage is now pinned as `expect(coverage).toEqual([])` rather than left to a warning.
- `lint.test.ts`'s rule-SELECTION test keyed on `tag-coverage` and expected a non-empty set, so
  filling the gaps broke a test that has nothing to do with rule selection. Re-keyed to `i18n`.
- `stats.test.ts` asserted `not.toContain('region')` to mean "there is no region AXIS". It
  passed only because no modifier used `sourceKind: region`; four now do, and the word appeared
  under "Modifiers by source kind" while the property was still true. **A substring match on a
  vocabulary member was never testing what its comment claimed.** Now asserts on headings.

#### Open, and left for M-F rather than tuned further here

**Completion 52.1% against engine-spec 6's 30–50% band.** The fixture sat at 31% because it had
no food at all and every long run converged to health 0; the corpus added food and rest and
overshot. Three trims took it 60.0 → 59.1 → 53.1 → 52.1 — diminishing returns on the wrong
lever. Median legs is 13, so runs COMPLETE rather than survive, and the remaining distance is
route length, not recovery. Corpus routes want route generation (`engine/src/route/`).

Beat fill 30.3%: the corpus fills `border_crossing` and `midpoint_crisis`; the fixture routes
also schedule `departure`, `approach` and `finale`.

> **Corrected at Phase 3 M3.1: `ferry_boarding` was in that list and no fixture route schedules
> it.** `grep -c ferry_boarding packages/engine/src/__tests__/__fixtures__/routes.json` → 0. The
> 13 slots are departure ×3, border_crossing ×2, midpoint_crisis ×3, approach ×2, finale ×3. The
> error originated in the M9 note far below and propagated into three places. Measured inventory
> and the resulting beat-fill ceiling: `docs/adr/0027` Decision 5.

### The `en` locale — the game has words now

**Twelve files, 157 event keys, 146 check-chip keys, in one commit** — because the locale is a
cliff, not a slope: `MISSING_I18N_KEY` is an error that fires PER KEY the moment `i18n/en/`
holds any `.json`, so half a locale is hundreds of errors.

**`content:lint`: 3 warnings → 1, still zero errors.** `MISSING_LOCALE` and `SAFETY_NOT_SCANNED`
are closed. Landing it also switched on `BODY_TOO_LONG`, `CHOICE_TOO_LONG` and the four §11
`SAFETY_*` scans **for the first time**, and all of them are clean — longest body 54/60, longest
choice label 7/8.

The one warning left is `MISSING_IMAGE_MANIFEST`, and it is **structural rather than a to-do**:
`packages/tools/imagegen/` is empty, no image exists, and a manifest mapping thirteen keys to
nothing is a stub of exactly the kind CLAUDE.md §5 forbids. Leave it until imagegen lands.

#### The gap the linter has, and the test that covers it

**`content:lint` does not check modifier chip labels, and cannot.** `i18nCoverage` walks keys
reachable FROM an event; a modifier is not reachable from one, because it applies by tag
intersection at roll time. So a missing `check.modifier.<id>` does not fail a build — it ships
the raw key to the result screen, which is precisely what design pillar 2 exists to prevent.

`packages/content/__tests__/locale.test.ts` is that check: every modifier's `labelKey`, every
`check.modifier.skill.<key>` that `runSkillCheck` synthesises, and every
`check.modifier.container.<kind>` that `searchCheck` synthesises — none of which is authored
anywhere, so nothing else would have caught their absence. It also asserts the reverse (no
orphaned strings), no duplicate key across files, and the pillar-5 budgets as assertions rather
than warnings.

#### `lint.test.ts` had been wrong twice; it is now keyed to nothing

The rule-SELECTION test named the rules it expected to fire — first `{THIN_TAG, UNUSED_TAG}`,
then `{MISSING_LOCALE}` — and **both broke when the corpus improved**, for reasons with nothing
to do with rule selection. It now asserts the actual contract, which holds on a clean corpus and
a broken one alike: every single-rule run is a subset of the full run, and the union of all of
them is the whole of it.

Worth generalising: **a test that asserts a linter REPORTS something is asserting a to-do list.**
Three of them broke this session for that reason. Assert the positive property instead.

### M-F — the last two registries. **Phase 2B is complete.**

25 complications and 15 universal choices, with their locale. `docs/adr/0022` records the
decisions; `docs/adr/0009` §5 is amended for the fixture move it should have specified.

#### The headline: completion reached the band by adding CONTENT, not by tuning

**44.1%**, inside engine-spec 6's 30–50%. Three rounds of trimming food and rest moved it
60.0 → 59.1 → 53.1 → 52.1 and then stopped paying. What took it the rest of the way was landing
the two registries, which add **costly options a player will actually take**.

**Diversity and difficulty turned out to be the same lever**, which is the strongest evidence so
far that CLAUDE.md §9's architecture is the right one. It is also the argument to reach for when
the next balance problem looks like a tuning problem.

`Complication rate 59.5%` against an `ATTACH_PERCENT` of 60 — the tunable measures what it says.
Payoff 73.9% with 6 unresolved threads (from 1.6% and 125 before the `priority: beat` bug).

#### A bug the first full-registry run found, and why it is good news

`resolveChoice: loop/unknown-choice`, across 2000 runs. The sim read `event.choices` directly,
so when a complication **removed** a choice it offered one the engine refuses.

**The engine refusing is CLAUDE.md 2.7 working** — it is the authority on legality, not the
screen, and the sim is a screen. The fix is that `selectableChoices` now goes through
`presentedChoices`, which is the entire reason that is ONE exported function rather than two
inline expressions. **The app layer will need it too**; anything that renders a choice list must
derive it the same way.

#### What the first real registry taught us about `appliesTo`

`UNIVERSAL_NEVER_INJECTED` fired on **three of fifteen rows** — the rule written in M-B, firing
on content for the first time. The cause is structural: with a 3-per-event cap and one row per
family, a row that is both **low priority and broadly targeted never lands anywhere**. It loses
its family contest where it matches and loses the cap where it does not.

Raising priorities only moves the problem to whoever gets displaced. The fix was to make each
row in a family target a **different kind of event** and win there. Two rows also shared a family
they had no business sharing — a distraction and a day's labour are not two ways of doing the
same thing — which made the cheaper one unreachable.

**`appliesTo` breadth is a cost, not a benefit.** A row matching everything wins nowhere in
particular and starves its family. That is now in the style guide.

#### Corpus totals

|                   |                                                                          |
| ----------------- | ------------------------------------------------------------------------ |
| events            | 13, all twelve categories, two fillers for the ladder floor              |
| modifiers         | **137** — 3 under the brief's floor, see below; all twelve `sourceKind`s |
| complications     | 25                                                                       |
| universal choices | 15, all reachable                                                        |
| declarations      | 20 flags, 10 items, 6 npcs, 10 traits, 7 endings                         |
| locale            | complete `en` — 157 event keys, 146 chip keys, plus both registries      |
| `content:lint`    | **0 errors, 1 warning** (`MISSING_IMAGE_MANIFEST`, structural)           |

#### ⚠ The one deliverable that came in under its number — and the measurement that says leave it

**137 modifiers against a brief of "140–180" and an approved list of 162.** Three under the
floor, twenty-five under the plan. It was reported as a count in every milestone summary and
never flagged as a shortfall, which it should have been.

Where the 25 went, and why: **`item`, `trait`, `companion` and `region` rows are the ones that
need declarations**, and declarations are constrained from both sides — a flag a modifier reads
must be WRITTEN by an event (`FLAG_READ_NEVER_WRITTEN` is an error), and an item needs a
liability event that reads it. Thirteen events can only back so many. The rows were cut during
authoring rather than declared and left dangling, which was the right call; not saying so was
not.

**But the count was a proxy, and the property it stood for is met.** The brief's actual
requirement was "a typical check should pull 3–7". Measured over all 29 checks in the corpus
against a representative mid-run state:

```
min 3 · median 7 · max 9 · mean 6.4
```

The registry is at the top of the target band and slightly over it — **the twelve checks outside
3–7 are outside it on the HIGH side (8–9), not the low.** Adding 25 rows to reach 162 would push
more checks further above the range the number existed to produce.

**So: do not top this up to hit 162.** If the count is revisited, the honest lever is the
`item`/`trait` kinds, and only alongside events that give the declarations something to be
backed by. Recorded rather than fixed.

### Also shipped, after the milestones: a verification pass and a constitution audit

Neither was planned. Both came out of being asked "is it finished?" twice, and both found things.

**Sim instrumentation.** None of the D1 metrics existed. Added: `Modifier chips / check`,
`Checks under 2 chips`, `Universal choices offered`, `Universal choices picked`, and
`pnpm sim -- --json` for a per-run TRACE (fired events and picks in order) rather than the
aggregate. `docs/adr/0023` records what they measure and why the row count is not the metric.

**`content-stats` was reporting a wrong number, and had been since M0.** It read
`choice.skillCheck?.tags`, so the `search` tag showed **1** use when three choices carry it —
both actual searches were invisible. The tool whose job is finding content holes had a hole in
it. Helper now shared at `packages/tools/shared/rolled-checks.ts`.

**`REGION_MODIFIER_NOT_DOCUMENT`** — proposed in the plan, never built. Now built, wired (15
rules), and **tested against a deliberate violation**, because a rule that has never fired is a
rule nobody has checked. Silent on the shipped corpus, which is correct.

**CLAUDE.md 502 to 405 lines**, closing open question 1 after six sessions. Everything MOVED, not
deleted: `docs/enforcement.md` and `docs/stack-notes.md` are new. The audit found **six stale
claims** — listed in the closed question below.

---

## Half-done

**Nothing is broken, stubbed, or partially applied.** Working tree clean, all checks green. What
follows is live data with no consumer, or a number below its stated target — each with the file
that closes it.

### 1. `quirks.yaml` — the fourth §9 registry does not exist

`packages/content/` has `modifiers`, `complications` and `universal-choices`. CLAUDE.md §9 names
four; `quirks.yaml` (NPC personality traits that register as modifiers) is `(planned)`. It was
never in Phase 2B's brief, so this is a gap rather than a regression — but §9 promises four.

The seam it plugs into is `packages/engine/src/effects/modifier-source.ts`, which still ships
empty and still has a test appending a stub. ADR 0008's prediction that Phase 2 would append a
`quirkModifierSource` there is the one part of it still outstanding.

### 2. 137 modifiers against a brief of 140-180

Three under the floor, 25 under the approved list. **Measured, it does not need fixing**: 6.7
chips per check over 27,395 checks, top of the 3-7 band, 0 checks under two. Adding rows
overshoots. `docs/adr/0023` decision 1. Left deliberately.

### 3. Universal choices are offered more than they are taken

38.5% of choices shown, 36.0% picked — but per policy: `random` 0.99 pick/offer, `greedy-safe`
0.56, `risk-taker` **0.02**. They are **too many, not too strong**, and `risk-taker` at 0.6%
means they are near-dead for aggressive play. The lever is measured
(`MAX_UNIVERSAL_PER_EVENT` 3 to 2 gives offered 30.2% / picked 31.8%) and **not applied**.
ADR 0023 decisions 2-3.

### 4. Beat fill 30.6%

The corpus fills `border_crossing` and `midpoint_crisis`. The fixture routes also schedule
`departure`, `approach` and `finale` — **not `ferry_boarding`, which no fixture route schedules
at all** (corrected at Phase 3 M3.1). This is not a director fault and not tunable — it wants
corpus routes, which want route generation.

**And route generation alone will not close it.** Measured at Phase 3 M3.0: 5 of the 13 fixture
slots are of a type the corpus can fill, so the ceiling is 38.5% and the observed 30.1% is 78% of
what is reachable. A generated route with 2–4 border crossings lands at 39–49%. The rest needs
`departure`, `approach` and `finale` events — and `finale` is the one to write first, because it
is scheduled on every route and the corpus lost it when it replaced the fixture pack, which does
have `arrival.final_stretch`. See `docs/adr/0027` Decision 5.

### 5. `MISSING_IMAGE_MANIFEST` — the one remaining lint warning

`packages/tools/imagegen/` is empty and no image exists. A manifest mapping 13 keys to nothing
is the stub CLAUDE.md §5 forbids. Correct to leave.

---

## Next step (ONE task, start here)

**Build `packages/engine/src/route/` — route generation. It is the last `(planned)` engine
directory, and it closes steps 1-3 of the game loop, which have never existed.**

A fresh agent can start with no other context:

1. **Read first, in order:** `CLAUDE.md` §1 (the loop — steps 1-4 are the missing half),
   `docs/engine-spec.md` **Part II** (Part I is the pre-Phase-1 design doc and diverges; see
   open question 4), and `docs/adr/0005` §1 for the `routeGen` RNG stream, which **already
   exists, is named, and has never been drawn from**.

2. **What the engine already assumes about a route.** `RouteState` is caller-supplied today via
   `RunInit.route` and validated by `packages/engine/src/state/validate-route.ts`. It carries
   `nodes[]`, `edges[]`, `legIndex`, `legCount`, `progressKm`, `totalKm`, `beatSchedule[]` and
   **`legLocations[]` — one `LocationType` per leg, and `validateRoute` rejects a length
   mismatch**. Generation must produce all of it, including the beat schedule.

3. **The three fixture routes in `packages/engine/src/__tests__/__fixtures__/routes.json` are
   the specification by example** — read them before writing anything. Each carries a `start`
   block (transport, cash, startHour, weather); `packages/tools/sim/load-pack.ts` documents why
   route and start block are inseparable, and the walking skeleton had 5 of 9 events never
   firing when they came apart.

4. **Use the `routeGen` stream.** Do not add one: an `RngCursors` key is a `SAVE_VERSION` bump
   and a migration (currently 4). If generation's draw COUNT would depend on how much content
   exists, use the cursor-free `deriveKey` form — see `director/select-complication.ts` for the
   pattern and ADR 0021 for why.

5. **`geo/` is empty** (`nodes.json`, `edges.json`, `world.simplified.geojson` are `(planned)`).
   Deciding whether generation reads real geography or synthesises a graph is the first real
   design question, and **CLAUDE.md §11 constrains it**: the map may use real cities and
   distances, but no data file may carry a per-country danger index, and difficulty must come
   from the route PROFILE and player STATE.

6. **What it unblocks, and the measurement that proves it worked:** a corpus routes file, which
   is what beat fill at 30.6% is actually asking for. Success is
   `pnpm sim -- --pack=corpus --runs=5000` showing beat fill materially up with completion still
   inside 30-50%.

**DoD:** `pnpm typecheck && pnpm lint && pnpm test && pnpm content:lint`, a regression test, both
sim baselines diffed (`pnpm sim:diff` and `--pack=corpus --diff`), and an ADR if the geography
question is answered either way.

---

## Open questions for the human

**Two are decisions I am holding, not opinions I lack** — I have a recommendation on both and
have deliberately not acted:

1. **Apply `MAX_UNIVERSAL_PER_EVENT` 3 to 2?** My recommendation is **no** (ADR 0023 §3). It
   buys 4pp on a metric distorted by the `random` policy and costs a third of the injection
   diversity. One-line change if you disagree.

2. **Top the modifier registry up to 140+?** My recommendation is **no** (ADR 0023 §1) —
   chips/check is already at the top of the band. Say the word and I will add rows in the
   declaration-free kinds (`condition`, `context`, `momentum`, `skill`, `transport`, `document`),
   which need no new declarations.

The rest are carried forward unchanged and listed in full further down: `CHECK_DIE_SIDES` still
a placeholder, **Hermes still unproven** (ADR 0012 §3 — the engine has never executed on the
runtime it ships on), whether `engine-spec.md` Part I should be deleted, the conformance
harness's `readonly`-widening gap (ADR 0019), and whether losing a container should mark tickets
rather than delete them.

**Open question 1 — CLAUDE.md over its cap — is CLOSED**, see below.

---

## Superseded — the M-D part 2 brief

**`git mv` the nine fixture YAMLs to
`packages/content/__fixtures__/events/`, repoint `round-trip.test.ts` and `structure.test.ts`,
add `sim --pack=fixture|corpus` plus a corpus routes file — **and land the seed corpus in the
same commit**. `declarations.test.ts:72,88-101` asserts every declared flag, npc, item and
trait is actually used, so there is no intermediate state where `events/` is empty and the
suite is green.

Decide there, not later: `sim:diff` compares against exactly one `docs/sim-baseline.md`, and
two packs means two baselines or a pack-tagged one.

**Carry forward:** the fixture pack ships an empty MODIFIER registry (see the finding above),
so M-D is also where `modifiers.yaml` first reaches a running engine.

---

## Shipped in session 5 (2026-08-08) — Phase 2A under adversarial verification

**No new features. The deliverable is knowing which of Phase 2A's guarantees are real.** Six
checks against what session 4 claimed. Four confirmed it; **two did not, and both produced a
fix.** Every number below came from running something, not from reading the code.

What is different in the repo afterwards: one engine bug fixed, three documents that asserted
things the code contradicted corrected, and two new tests.

**Prove it, from a clean checkout:**

```bash
pnpm i && pnpm typecheck && pnpm lint && pnpm test && pnpm format:check
```

```bash
pnpm content:lint              # exit 0 — 0 errors, 29 warnings
pnpm sim -- --runs=5000        # 31.2% completion, contentVersion 4c57cd5c
pnpm sim:diff -- --runs=2000   # "No change vs docs/sim-baseline.md."
```

```bash
pnpm vitest run --project engine src/effects/__tests__/containers.test.ts
```

That last one is the session in miniature: 13 tests, of which the two added here are the
`loseContainer` contract in full and the visa bug it exposed. Totals moved 1053 → **1055
Vitest + 3 Jest across 47 files**.

### What was verified, and how

| #   | Claim                                                                      | Verdict                                                            |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | `content:lint`'s rules all fire                                            | **33 of 33 rule IDs fired**, one break at a time                   |
| 2   | Schema/engine drift fails the build                                        | **8 kinds proven to fail**; one kind does not, characterised below |
| 3   | The registry plugs into the `ModifierSource` seam with no call-site change | **FALSE.** Corrected in three places                               |
| 4   | Losing a bag takes the passport in it                                      | **True** — and writing the full test found a live bug              |
| 5   | The sim is unmoved                                                         | `pnpm sim:diff -- --runs=2000` → "No change"                       |

### 1. Every linter rule fires — 33 rule IDs, not 13

The 13 entries in `RULES` emit **33 distinct rule IDs** (the four `UNDECLARED_*` are
template-constructed from `ContentRefKind`, so they never appear as string literals in the
source). Each was fired individually against a throwaway copy of `packages/content`, diffed
against the pristine 29-warning baseline so corpus-global rules could be told apart from
pre-existing findings.

**`ZERO_WEIGHT_CHOICE` is unreachable through the YAML loader.** Both routes to it are closed
earlier by a strictly stronger schema: `weight: intSchema.positive()` rejects `weight: 0`
("Too small: expected number to be >0") and `outcomes: z.array(...).min(1)` rejects an empty
list. Handed a zero-weight event directly, the rule fires correctly — so it is dead code with
respect to authored content, not a broken rule. Leave it: it guards `runLint`'s actual input
type, which is `GameEvent[]` and does permit weight 0.

### 2. The drift guard works — but not by the mechanism the comment claimed

Eight kinds of disagreement were each made to fail the build: engine gains a field (TS2741),
schema gains a field (TS2353), optional-vs-null (TS2322), engine drops a `readonly` (TS2322),
a new engine vocabulary with no schema (L2 names it), the vacuity annotation (L1' **and** the
source scan, independently), a schema enum narrower than the engine's (the `_beatType`
`Equals`), and a semantic-only transform flip (0 type errors, 13 test failures).

**The finding: most of the `Equals` assertions are tautologies, and the real work is done
elsewhere.** `buildEvent` is declared `: GameEvent` and every predicate/effect arm is
`.transform((v): Predicate => …)`, so `z.infer` of those schemas IS the engine type by
declaration. `_event`, `_choice`, `_outcome`, `_check`, `_modifier`, `_context`, `_predicate`
and `_effect` cannot go red. That is **not a hole** — the annotation moves the check to the
builder body, where assignability catches everything above with better error messages than
`Equals` gives. `_beatType` proves L1 is genuinely load-bearing where no transform annotates
the output.

**The one uncaught kind: the schema widening `readonly T[]` to `T[]`.** A mutable array is
assignable to a readonly one, so the builder accepts it. Harmless — same object at runtime,
and the dangerous direction (the _engine_ going mutable) is caught. Recorded as an open
question rather than fixed, because closing it means dropping the builder annotations and
taking worse errors in exchange.

Also worth knowing: **an engine vocabulary growing a member cannot drift at all.** The schemas
are built from the engine arrays (`z.enum(BEAT_TYPES)`), so adding a beat type propagates
automatically. Derivation beats assertion.

### 3. The `ModifierSource` seam claim was false — corrected in three places

ADR 0008 promised "Phase 2 appends `registryModifierSource` and `quirkModifierSource` **with no
change at the call site**." Neither function exists in any source file. `git grep` returns only
the ADR line and a code comment repeating it. `PHASE_1_MODIFIER_SOURCES` still holds exactly one
entry. M2A.3 **bypassed the seam**: it threaded the registry as a fifth parameter to
`runSkillCheck` and resolved it in `modifiers/resolve-modifiers.ts`.

And the call site did change: `runSkillCheck` went 4 params → 5 and `RollResult` →
`CheckOutcome` (it is a public barrel export, so that is a published-API break);
`SkillCheckSpec` gained a required `tags`; `resolve-choice.ts` changed across 24 lines.

**Why the bypass was right, which is the part nobody wrote down:** a `ModifierSource` returns a
flat `RollModifier[]` of `{ labelKey, delta }`. The registry's output is not flat — pillar 2
needs `rawDelta`, which rows a conflict deleted, and each row's share of the clamp. Widening the
seam would have made every source pay for the registry's needs.

**What is actually true, and is the claim to make instead:** `resolveChoice(state, pack,
choiceId)` never changed, because the registry rides on the `pack` argument that already
existed. `advanceLeg`, `replayRun` and `sim/run-one.ts` were untouched by `8013aac`.

Corrected in `effects/modifier-source.ts`, `docs/adr/0008` (amended, prediction left standing
so the miss stays legible) and the stale cell in this file's session-3 table.

_One claim NOT repeated:_ the golden digests did move at `8013aac`, but in exactly the 18 lines
`contentVersion` moved, with `choiceSequence` and `expectedHistoryKeys` untouched — and
`stateDigest` hashes the whole state including `contentVersion`. Fully explained; not evidence
of behavioural change.

### 4. A live bug: a visa outlived the passport it is stamped in

`documents-state.ts` and ADR 0017 both state "**visa reads inherit the passport**" — that is the
stated reason `VisaState` has no container of its own, so that one physical object cannot become
two independently-losable records. `evaluate-state-leaf.ts` never implemented it: the `visa` arm
read only `documents.visas[region]`.

So the exact scenario the design ruled out was live. Bag stolen → passport in it marked
`present: false` → **`visa` still reports `held: true`**. Fixed; the read now requires
`passport.present === true`, and the trace carries `noPassport` so pillar 2 can distinguish "no
visa" from "no passport to show it in". The visa RECORD still survives in state, deliberately —
a recovered passport keeps its stamps.

**Nothing could have caught this.** The state shape was right, the ADR was right, and no test
tied them together; no event in the corpus uses a `visa` predicate, which is also why the fix is
sim-neutral. It was found by writing the test the design implied.

The same test pins the three other things losing a bag does, because they disagree with each
other: items go, the passport is **marked**, tickets are **hard-deleted**, and
`passport.container` still reads `'bag'` after the bag is null.

### What changed in the repo

| File                                    | Why                                                                  |
| --------------------------------------- | -------------------------------------------------------------------- |
| `predicate/evaluate-state-leaf.ts`      | the visa fix                                                         |
| `effects/__tests__/containers.test.ts`  | +2 tests: the full `loseContainer` contract, and the visa regression |
| `effects/modifier-source.ts`            | the seam comment promised something that never happened              |
| `docs/adr/0008`                         | same promise, amended with the prediction left standing              |
| `docs/adr/0017`                         | records that the visa inheritance it specified was never implemented |
| `docs/adr/0019`                         | **new** — conformance is enforced by annotation, not identity        |
| `content/__tests__/conformance.test.ts` | the L1 comment overstated what L1 catches                            |
| `CLAUDE.md` §9                          | "bidirectional (mutual-extends)" was wrong twice over                |

**Half-done, the next step and the open questions are unchanged in shape and live below** —
this session added no features, so gap 1 (`searchContainer`) is still the next task. Two new
entries: open question 5, and a design question under Half-done 4.

---

## Shipped in session 4 (2026-08-08) — **PHASE 2A COMPLETE**, M2A.0–M2A.7

`packages/content` is now a real content pipeline: YAML in, validated `GameEvent[]` out, with a
compiler-enforced conformance harness holding the Zod schemas identical to the engine's types,
five declaration registries, a global modifier registry with a 6-step resolution pipeline,
container inventory, three-tier money, and two tools — `content:lint` and `content:stats`.

**Prove it, from a clean checkout:**

```bash
pnpm i && pnpm typecheck && pnpm lint && pnpm test && pnpm format:check
```

```bash
pnpm content:lint          # exit 0 — 0 errors, 29 warnings (tabulated below)
pnpm content:stats         # 9 events, 8 modifiers, 1400-cell coverage pass
pnpm sim:diff -- --runs=2000   # "No change" against docs/sim-baseline.md
pnpm sim -- --runs=20000   # the full balance report
```

Totals: **1053 Vitest + 3 Jest across 47 files**, up from 851 at Phase 1. Eight milestones,
~20 commits. Review gates after M2A.2 and M2A.5 were both passed.

**Every behavioural sim number is unchanged since M2A.0's deliberate retune**, except two 0.1pp
ending shifts M2A.6 caused by fixing `wanted`. M2A.3/4/5 moved `contentVersion` only.

Three questions were settled by the human before planning: rename `money` → `cash` and add
`bank`; skill bypasses the modifier clamp (`d20 + skill + clamp(mods, −8..+6)`); fix `worldTick`
first as its own milestone. The plan is at
`~/.claude/plans/phase-2a-plan-mode-precious-elephant.md`.

### M2A.0 — the drift curve. `docs/adr/0014`. Two commits.

`worldTick` now charges every drain against the **clock span the leg covers**, not the leg.
Open question 1 is **closed**.

- **The defect, measured:** health first dropped on leg 8 in **1500 of 1500 runs**, distinct=1.
  Identical, not clustered — because every drain was per-leg and unconditional, so a nine-hour
  walk cost the same as a four-hour train ride and nothing read the hour jitter.
- **After:** distinct=**9** (legs 5–14). Completion 30.1% → 31.2%, inside the 30–50% band, so
  this is not a difficulty change. `gave_up` 39.1% → 33.2%, `collapsed` 30.8% → 35.6% — the two
  failure modes are near-balanced where one dominated.
- **`spanPoints(before, hours, per)`** carries the remainder across legs, so summed cost is
  exactly `floor(total / per)` (property test). **No new state** — the clock is already the
  accumulator, so `SAVE_VERSION` is untouched and there is no migration.
- **The finding worth keeping (ADR 0014 §3): grade a penalty on an unbounded meter, never on a
  floored one.** Energy floors at 0 and most runs sit there, so a second harsher morale rung is
  a penalty the whole population takes on the same leg — it _synchronises_ the collapse.
  Measured: it drove leg-15 morale from `0/2/6` to `0/0/0`. Hunger has no ceiling, so grading
  there spreads. This cost the most to learn.
- **`worldTick` had no unit test at all**, which is how a curve that resolves to a constant
  survived to a sim report. It has 12 now, pinning the _shape_ not the constants; verified
  failing on a deliberate violation first.
- **`pnpm golden:update` now exists.** `golden-runs.json`'s header and `golden-run.test.ts` both
  said to regenerate with `ODYSSEY_UPDATE_GOLDEN=1`; **nothing implemented it.** The generator is
  `packages/tools/sim/regenerate-goldens.ts` — outside the engine because the engine may not
  touch `process` or write files, and it derives expectations from `replayRun` rather than the
  simulator so the two cannot drift apart and still look green.

**Still true and not fixed by M2A.0:** the fixture pack contains **no food** — nothing reduces
hunger, one effect grants energy. Health decline is therefore irreversible and every long run
still converges to 0; only the leg it _starts_ varies. A wide p10/p90 at a fixed late leg needs
the seed corpus.

Baseline regenerated; `pnpm sim:diff -- --runs=2000` reports no change. 863 Vitest + 3 Jest.

### M2A.1 — schema foundations + the conformance harness. Four commits.

**The three experiments were run first, and the load-bearing one came back NO.** Zod 4.4.3
cannot infer a recursive transforming schema (TS7022), and the annotation that fixes it
(`z.ZodType<Predicate>`) makes ADR 0009's assertion a **tautology** — `z.infer` of an annotated
schema IS the annotation, so it passes on a schema that parses nothing, and because `Equals` is
deep it poisons `GameEvent`/`Choice`/`Outcome` too: five of twelve, including the four that
matter. Fix: annotate **only the recursive back-reference**, leave the union inferred.

The anti-vacuity guard is better than the one the plan proposed. Hand-mirroring a terse input
type is brittle (the readonly boundary differs between annotated and inferred arms). What works
is `Equals<z.input<S>, unknown> = false` — an annotated schema's input collapses to `unknown`.

**The harness, four layers, each verified failing on a deliberate violation:**

| Layer                                     | Catches                          | Proven by                                          |
| ----------------------------------------- | -------------------------------- | -------------------------------------------------- |
| L1 `Equals<z.infer<S>, T>`                | shape drift                      | a new field on `GameEvent` → TS2741 at the builder |
| L1' `Equals<z.input<S>, unknown> = false` | annotating a schema into vacuity | annotating `effectSchema` → red                    |
| L2 runtime barrel enumeration             | a type with **no** schema        | removing `BEAT_TYPES` → named                      |
| L3 27-case terse→canonical corpus         | semantics `Equals` is blind to   | `gte`→`lte` → 7 cases fail                         |

Other findings worth keeping:

- **`.default()` does not fire on `null`,** and YAML `weather:` parses as null. `z.array().default([])`
  would leave the field null at runtime while every type assertion passed. Every default is
  `.nullish().transform(v => v ?? …)`.
- **`.brand()` is unusable** (Zod's symbol, not the engine's); `.readonly()` on a branded scalar
  yields `Readonly<EventId>`. `z.string().transform(engineCtor)` is the only idiom.
- **`z.intersection` DOES infer identity-equal** — my plan's stated reason for flattening
  `SkillCheck` was wrong. The real reason: `.strictObject` on either half rejects the other
  half's keys, so an intersection can never be sealed.
- All settled in `packages/content/__tests__/zod-idioms.test.ts`, which is the regression guard
  for the next Zod upgrade.

**Authoring form is 36% of canonical** (10.3KB/496 lines vs 28.3KB/1182) and **no event file
contains a text field at all** — keys are derived from ids, so rule 2.4 is true by construction.
Two escape hatches the fixtures forced: explicit `textVariants` (`out.onward_again` reads better
than `out.onward.v2`) and explicit `labelKey` (a choice with id `fix_it_yourself` keyed
`choice.fix`).

### M2A.2 — declaration registries. One commit.

`flags` `items` `npcs` `traits` `endings` + schemas + loader, all in `packages/content`.

- **Deviated from the plan: `ContentRegistries` was NOT widened.** ADR 0007 §4 says a missing
  flag is deliberately not `unknown-ref`; endings are the same. Widening would contradict that
  ADR and move `contentVersion` for no behavioural gain. ADR 0009 §4 already assigns the walk to
  `content-lint`, so the cross-reference checks live in the content package.
- **The liability rule is decidable now.** "Is this outcome bad?" is not statically checkable, so
  each item names the events where carrying it hurts and the schema refuses an empty list.
- **The reverse checks caught two of my own mistakes**: I copied `ration` and `light_sleeper`
  from the engine fixture's registry block without checking any event reads them. Neither does,
  and `ration` had a liability I had annotated as unbacked. Both removed rather than explained.

`pnpm sim:diff` reports no change for both milestones. 950 Vitest + 3 Jest.

### M2A.3 — check tags, modifier registry, pipeline. `docs/adr/0015`.

- **A correlated-randomness bug was live.** `modifier-source.ts` called `evaluatePredicate`
  with no `path`, so every `{chance}` gate in every modifier, in one event on one leg, shared
  one RNG address and returned one answer. Both paths are now content-addressed.
- **DR is computed once over the tail sum, and rounds half-up.** Per-entry `trunc(d×3/5)` makes
  four `+1`s and eight `+1`s both total `+3`; a test then caught that truncation still zeroes a
  single `+1`.
- **Clamp attributes by largest remainder** so chips sum to the total exactly (pillar 2).
- 18 tags: dropped `border` (a location — replaced by the `locationType` predicate kind, the
  28th), added `bribery`/`documents`/`search`/`language`.
- Registry lives INSIDE `ContentRegistries` so `contentVersion` covers it.
- **`sim:diff` no longer ignores the report header** — a `contentVersion` change was invisible.

### M2A.4 — three-tier money, first real migration. `docs/adr/0016`.

- `money` → `cash`, plus `bank`. `SAVE_VERSION` 2. **`MIGRATIONS` is no longer empty.**
- **The migration is not a field rename**: `key: 'money'` is persisted inside
  `pendingEvents[].requires`, so the predicate tree is rewritten recursively. A _flag_ named
  `money` is left alone; `history` is not rewritten at all.
- Closed a NaN hazard: `isRunStateShape` checked `resources` only as an object.
- Sim delta: two lines, neither a number.

### M2A.5 — container inventory. `docs/adr/0017`. **← second review gate**

- Four containers; `SAVE_VERSION` 3. Documents record their container; **visas deliberately do
  not** (a visa is a stamp in the passport).
- **Fixed the predicate-sums / applier-first-matches divergence**, which containers made
  reachable: the player paid less than the price they were shown, silently.
- `isRunStateShape`'s `inventory` array check moved in the same commit — otherwise every save
  becomes unloadable with the error blaming the migration.
- **`searchContainer` is deferred and named as a gap**: the `search` check tag has registry
  rows and no caller. The data (searchDC, concealability) exists and is inert until 2B.

1029 Vitest + 3 Jest. Sim delta for M2A.3/4/5 is `contentVersion` only — no behavioural number
has moved since M2A.0.

### M2A.6 — `pnpm content:lint`. 13 rules, wired into CI.

**It found three errors on its first run, all genuine.** Two `LOCAL_MODIFIER` (the bribe event
kept choice-local `unwashed`/`wanted` after M2A.3 declared them in the registry — the D1 decay
the rule exists to catch, introduced two milestones earlier) and
**`FLAG_READ_NEVER_WRITTEN: wanted`** — the finding the sim printed every run since Phase 1 and
that PROGRESS carried as an untested engine surface. Being detained now sets it; the sim line
went from `wanted <- gate can never open` to `(none)`.

Rules are scoped honestly: `CONTRADICTORY_REQUIRES_NUMERIC` names its own fragment because only
numeric intervals inside an `all` are decidable, and the orphan check documents that it is
static. An absent locale gives ONE finding, not a hundred. `--fix` will not touch i18n (a
placeholder is a user-visible string) or hoist a modifier (id/priority/sourceKind are not
derivable). **CLAUDE.md rules 1, 4 and 6 moved to live; DoD item 4 is no longer N/A.**

### M2A.7 — `pnpm content:stats`. Phase 2A complete.

Counts plus a 4-axis coverage pass (1,400 combinations). The rule it turns on: an empty
constraint means NO constraint, so empty expands to the full axis. The number worth reading is
**filler-only cells**, not empty ones — a cell covered by two universal fillers is a hole with a
rug over it, and it is the sim's 75%-filler finding seen from the other end.

Reports zero holes today, which is honest for nine loosely-constrained events — so three tests
construct narrow corpora and prove it _can_ find 1,399. **No region axis**: `EventContext` has
no region field, `geo/` is empty, and region-gating events is what §11 warns against.

---

## Superseded — Half-done as of session 5

Nothing is broken and nothing is stubbed to make a check pass. What follows is **live data with
no consumer** — shapes that parse, validate and persist, but that no code path reads yet. Each
one is a real gap, not a placeholder, and each has the file that closes it.

### 1. `searchContainer` — the largest one. Data live, no caller.

`packages/engine/src/state/container-state.ts` gives every container a `searchDC` (person 2 /
bag 4 / vehicle 6 / stash 9) and every item a `concealability`. `CHECK_TAGS` includes `search`
and `packages/content/modifiers.yaml` has four rows keyed to it. **No event performs a search**,
so all of it is inert — `pnpm content:lint` reports `UNUSED_TAG: search`, correctly.

ADR 0017 explains why this is not an effect op: an effect applier has no `Rng` by contract
(`packages/engine/src/effects/effect-context.ts:6-11`), and a search writes, so two searches in
one effect list would address identically. The design is settled — `Outcome.search: SearchSpec |
null`, resolved through the existing `runSkillCheck` on the existing `skillCheck` stream, so no
new RNG stream and no `RngCursors` change. It is **not built**. Files it would touch:
`packages/engine/src/content/game-event.ts`, `packages/engine/src/loop/resolve-choice.ts`,
`packages/content/schema/outcome.ts`.

### 2. The nine events are still fixtures, not a corpus.

`packages/content/events/**.yaml` is nine events re-expressed from the Phase 1 JSON. They exist
to exercise the tooling, and per ADR 0009 §5 they **must not become the seed corpus**. Two
consequences that read as balance problems but are content gaps:

- **No food anywhere in the pack.** Nothing reduces hunger; one effect grants energy. Health
  decline is therefore irreversible and every long run converges to 0 — M2A.0 widened _which
  leg it starts_ (distinct 1 → 9) but cannot widen the endpoint. ADR 0014.
- **Fillers are 75% of everything that fires**, which `content:stats` shows from the other end
  as filler-only coverage cells.

### 3. The 29 lint warnings, which are the 2B to-do list

| Warning                                 | Count | Closes when                                                           |
| --------------------------------------- | ----- | --------------------------------------------------------------------- |
| `MISSING_LOCALE` / `SAFETY_NOT_SCANNED` | 2     | `i18n/en/*.json` exists                                               |
| `MISSING_IMAGE_MANIFEST`                | 1     | `images/manifest.json` exists                                         |
| `THIN_TAG` / `UNUSED_TAG`               | 22    | the seed corpus gives every tag ≥3 events and ≥5 modifiers            |
| `LIABILITY_UNBACKED`                    | 2     | events actually read `cash_belt` / `spare_tyre`                       |
| `FLAG_WRITTEN_NEVER_READ`               | 3     | something gates on `bribe_on_record`, `detained`, `took_the_long_way` |

They are honest fixture gaps, all warnings, none suppressed. **They should go to zero as 2B
lands, not be silenced.** Reproduce with `pnpm content:lint`.

### 4. Three things that are pinned by tests but not decided (added session 5)

Not broken — each has a passing test asserting current behaviour. What is missing is a decision
that the behaviour is _right_. All three live in
`packages/engine/src/effects/__tests__/containers.test.ts`.

- **Losing a container DELETES its tickets but MARKS its passport.** `apply-container-effects.ts`
  filters tickets out of the array and sets `passport.present = false`. Defensible — a lost
  passport opens a recovery storyline and a lost ferry ticket leaves nothing to write against —
  but the asymmetry is unargued in the code, and an author reasoning about "your bag is stolen"
  has to know it. Pinned so a change is noticed; see open question 6.
- **`passport.container` still reads `'bag'` after `inventory.bag` is null.** A dangling name.
  Harmless today because every read guards on `present` first, and arguably useful — it records
  _where_ the passport was lost, which a recovery event would want.
- **The `readonly`-widening gap in the conformance harness** (ADR 0019). Accepted, not fixed;
  the reasoning and the rejected alternatives are in the ADR. Open question 5 is whether to
  revisit it.

---

## Superseded — the session-5 next step (shipped as M0)

**Implement `Outcome.search` — the search check — closing gap 1 above.**

_Carried over unchanged from session 4: session 5 was verification and added no features._

This is deliberately NOT "start the seed corpus". Authoring 12 events against an engine that
cannot resolve a search means writing around the hole and then rewriting; and it is the one
piece of 2A that shipped as data without a consumer. It is small, fully specified, and
`content:lint` already tells you when it is done (`UNUSED_TAG: search` disappears).

A fresh agent can start with no other context:

1. Read **`docs/adr/0017-container-inventory.md`, section "What is deferred, and why it is not
   a gap"** — it states the design and, more importantly, why a `searchContainer` effect op is
   forbidden.
2. Add `SearchSpec { container: ContainerKind, dc: number, tags: readonly CheckTag[] }` and
   `readonly search: SearchSpec | null` to `Outcome` in
   `packages/engine/src/content/game-event.ts`. `Outcome` already carries `onCheck`, which is
   the branching mechanism — a search reuses it.
3. Mirror it in the event schema (`packages/content/schema/event.ts` — there is no
   `outcome.ts`; `outcomeSchema` lives inside it). `z.strictObject`, `.nullish()`-defaulted per
   ADR 0009 §2. Then run `pnpm --filter @odyssey/content run typecheck`. **It will fail before
   you have written the schema, with `TS2741: Property 'search' is missing … but required in
type 'Outcome'` pointing at `buildOutcome`** — that is the guard working, not a problem to
   route around. Note per ADR 0019 that the error comes from the builder's return annotation,
   not from the `Equals` assertions, so `conformance.test.ts` is not where you will see it.
4. Resolve it in `packages/engine/src/loop/resolve-choice.ts` alongside the existing
   `runSkillCheck` call. Use the **`skillCheck` RNG stream** — do not add a stream, that is an
   `RngCursors` change and a save migration for nothing. The effective DC is the container's
   `searchDC` from `CONTAINER_SPECS` adjusted by the spec's `dc`; the searched item's
   `concealability` is a modifier input.
5. Give the fixture event `border.bribe_attempt` its `hide_the_cash` choice a real search (the
   authoring shape is already written out in the plan file, Part 1 §1).
6. `pnpm sim -- --runs=20000`, regenerate `docs/sim-baseline.md`, explain the delta. **This
   moves numbers** — it is the first thing since M2A.0 that will.

DoD: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm content:lint` (item 4 is real now), a
regression test, the sim delta, and an ADR if anything non-obvious comes up.

After that, Phase 2B proper — the seed corpus. `content:stats` and `content:lint` are the
instruments for writing it; author against `docs/engine-spec.md` Part II. The 12 seed events,
160 modifiers, complications, universal choices and quirks are all 2B.

---

## Open questions — the carried-forward list, in full

> Referenced by the current list above. Question 1 is CLOSED; 2-6 are live.

1. ~~**`CLAUDE.md` over its own ~400-line cap.**~~ **CLOSED 2026-08-09, after six sessions.**
   It had reached 502. Now **405**, and everything was MOVED rather than deleted:

   - §2's `_Enforcement:_` notes -> **`docs/enforcement.md`**, each rule keeping a one-line
     status. That was the proposal raised five sessions running; it is done.
   - §4's dependency caveats (moti, rive, the wildcard-peer trap, the Hermes plural risk) ->
     **`docs/stack-notes.md`**.
   - §1's status block, §3's layout, §5's planned commands and §9's type-ownership block
     compressed to pointers at the docs that already own them.

   The audit that came with it found **six stale claims** in a file whose whole job is to be
   true: Zod "not yet used", DoD item 6 saying the sim harness does not exist, `content-lint`
   at 13 rules (15), `adr/0001-0021` (0022), `src/route/ (planned — Phase 2B)` after 2B
   shipped, and §9 asserting complications and universal-choices did not exist. Every numeric
   claim left in the file was then checked against ground truth.

   **The lesson worth keeping: the cap is not about tidiness.** A file that grows past what
   anyone re-reads is a file whose claims stop being audited, and six of them had rotted.

2. **`CHECK_DIE_SIDES = 20` is still the Phase 1 placeholder**, and 2A made the question sharp
   rather than answering it. With the clamp at +6/−8 and skill bypassing it, one point of
   modifier is worth 5% on a d20 — so the entire registry moves a check by at most 30/40
   percentage points, and a single skill point is worth as much as a modifier. A 3d6 (or 2d10)
   would make the middle of the curve dense and modifiers matter more where checks are close.
   **This wants the seed corpus before deciding**, but flagging it now: changing it later
   invalidates every DC an author has written.

3. **Hermes is still unproven** (ADR 0012 §3). Every cross-engine determinism defence in the
   engine is preventive and verified on V8 only. The engine has never executed on the runtime
   it will ship on. **Proposal: a one-off harness run in the Expo dev client that replays the
   golden runs and compares digests.** Cheap, and it either confirms the defences or finds the
   problem while there are 9 events instead of 200.

4. **Is `docs/engine-spec.md` Part I still worth keeping?** Part II is written from the code and
   is authoritative. Part I is the pre-Phase-1 design document, and several of its statements
   are now simply wrong (`requires: { context: { locationTypes: [...] } }` at `:143` was
   unimplementable and is superseded by the `locationType` predicate kind). Options: delete it,
   or mark it `# Superseded` in place as a design record. I would delete.

5. **Should the conformance harness trade error quality for real identity?** (New — ADR 0019.)
   Dropping the `: GameEvent` return annotations and asserting
   `Equals<ReturnType<typeof buildEvent>, GameEvent>` would make all thirteen L1 assertions
   load-bearing and close the `readonly`-widening gap. It would also turn
   `Property 'mood' is missing in type … but required in type 'GameEvent'` into
   `Type 'false' is not assignable to type 'true'` at a line naming no field. **I decided no
   and wrote the reasoning into ADR 0019** — the missed direction is harmless, the dangerous
   direction is caught, and the message is worth more than the coverage. Flagging it because it
   is a guarantee you were told you had in a stronger form than you actually have, and that is
   your call to accept, not mine.

6. **Should losing a container mark tickets rather than delete them?** (New.) A lost passport
   becomes `present: false` so a recovery storyline can exist; a lost ticket is removed from the
   array outright. If tickets are ever meant to be recoverable — "the driver remembers you paid"
   — the state has to keep them. Cheap to change now while the corpus is nine events and no
   content depends on either behaviour; expensive after 2B. Both are pinned by tests either way.

---

## Shipped in session 3 (2026-08-08) — **PHASE 1 COMPLETE**, M0–M11

The engine plays a full run, replays it bit-for-bit, reports on itself, and migrates its own
saves. **[PR #2](https://github.com/corazon714/odyssey/pull/2) is open against `main`, all six
CI jobs green** — including `sim-smoke`, which had never run on a real runner until now.

Every claim below has the command that proves it. All were run at session end.

```bash
pnpm typecheck                      # exit 0 — 4 projects + root
pnpm lint                           # exit 0
pnpm test                           # 851 Vitest + 3 Jest
pnpm format:check                   # exit 0
node packages/engine/src/index.ts   # exit 0 — CI's rule-2.2 proof, run locally
pnpm sim -- --runs=20000            # 4.6 s against a 30 s budget
pnpm sim:diff -- --runs=2000        # "No change vs docs/sim-baseline.md"
pnpm --filter @odyssey/engine run coverage   # 88.51% statements
```

| Milestone | Delivers                                                              | Commit              |
| --------- | --------------------------------------------------------------------- | ------------------- |
| M0        | `.ts` module specifiers; purity guard widened to cross-engine hazards | `998cea1` `9aeed80` |
| M1        | Counter-based RNG, 8 named substreams                                 | `31b731a`           |
| M2        | `RunState`, `createRunState`, `stateDigest`                           | `9c875ee`           |
| M3        | 27 predicate kinds + the reason trace Phase 7 renders                 | `c29a544`           |
| M4        | 12 effect ops, pure applier, `ModifierSource` seam                    | `6db1333`           |
| M5        | Content model, `createContentPack`, JSON fixtures                     | `ff0f981`           |
| M6        | The walking skeleton — a run that runs                                | `b3cb1d7`           |
| M7        | Six scoring factors, seven-rung ladder, tension, complication seam    | `67fd25d`           |
| M8        | Consequence queue: caps, eviction, expiry, rebasing                   | `b8ccf70`           |
| M9        | Beat consumption: fill, slide, expire                                 | `651ccbd`           |
| M10       | Golden replay, engine-spec §6 report, `sim:diff`                      | `2330d07`           |
| M11       | Save migration ladder, shape guard, content reconciliation            | `f92d5a0`           |
| —         | Verification pass, engine-spec Part II, ADR 0012                      | `f9f7b5f`           |

**Bugs found by running the thing, that no unit test saw:** 5 of 9 events unreachable (M6),
a payoff scheduled 20× and fired 0× (M6), two sim policies producing byte-identical runs (M6),
a queue that never released fired promises (M8), beat slots re-fillable forever (M9).

---

## Half-done

**Nothing is broken or partial.** No `TODO(handoff)` markers, working tree clean, all CI green.

Three things are **deliberately inert** — built, tested, and called by nothing. That is by
design, but a fresh agent will find them and should not "fix" them:

| Path                                                             | State                          | Why                                                                                                                                                                                                         |
| ---------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/engine/src/queue/rebase-pending.ts`                    | Fully tested, **zero callers** | Re-routing is Phase 2. The queue's shape was chosen for it, so the test IS the deliverable (ADR 0011 §3). Wiring is one line when re-routing lands.                                                         |
| `packages/engine/src/migrate/migrations.ts`                      | **Empty array**                | `SAVE_VERSION` is 1; no save format has been superseded. Inventing a fake migration would put a lie in the ladder (ADR 0012). Machinery is proven against a synthetic list.                                 |
| `effects/modifier-source.ts` · `director/complication-source.ts` | Seams ship **empty**           | Phase 2 registries plug in with no call-site change. Each has a test appending a stub and asserting it reaches the output. **← the prediction in this cell was wrong; see the correction under session 5.** |

**Not started** (still `.gitkeep` only): `packages/content/{events,geo,i18n,images}`,
`packages/content/schema/`, `packages/tools/{content-lint,imagegen,i18n-check}`.

---

### What the sim's instruments found — open findings

Every one of these is a FIXTURE gap, not an engine fault — and none of them errored:

| Finding                                | Detail                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **`wanted` is read but never written** | Three gates reference it, nothing sets it. Those branches are unreachable.                                               |
| 3 flags written but never read         | `bribe_on_record`, `detained`, `took_the_long_way` — dead writes.                                                        |
| 2 choices never picked                 | `bribe_attempt/present_documents` (needs a passport the fixture never grants) and `/turn_back` (`hiddenUnless heat>=6`). |
| Repeat-event rate 62.4%                | Nine events, two of them universal fillers.                                                                              |
| health p50 = 0 by leg 15               | 69.9% of runs end in failure (`gave_up` 39.1%, `collapsed` 30.8%).                                                       |
| Beat fill rate 47.9%                   | Routes schedule three beat types the pack cannot fill.                                                                   |

They are recorded rather than tuned away: the fixture pack exists to exercise the engine, and
balancing against nine events would be fitting to a fixture. Revisit with the Phase 2 seed
corpus.

### ⚠ UNTESTED ENGINE SURFACE — carried into Phase 2 deliberately

Findings 1–3 above are not balance questions. They are **coverage gaps**, and the distinction
was missed when they were first recorded. Four engine mechanisms have **never executed in any
of the 2,000 simulated runs**, because the fixture cannot reach them:

| Mechanism                                   | Why unreachable in the fixture                                |
| ------------------------------------------- | ------------------------------------------------------------- |
| Skill-check modifier gating                 | `check.modifier.wanted` — the flag is never set by any effect |
| Outcome `requires` + `unlockEnding`         | `out.flagged_in_system` gates on `wanted`                     |
| The `passport` predicate (all three fields) | No fixture scenario grants a passport                         |
| **`hiddenUnless`**                          | `turn_back` needs `heat >= 6`; observed runs peak at 3        |

`hiddenUnless` is the sharpest: it has **exactly one instance in the whole pack**, and it is
dead — so engine-spec §2's "reward for state" mechanism has never run inside the loop. Unit
tests cover these paths in isolation; the golden runs and the sim corpus do not touch them.

**Decision (2026-08-08): accepted as a known limitation and carried to Phase 2.** Closing it is
content work — grant a passport on one route, add an effect that sets `wanted`, let heat reach
6 — and belongs with the seed corpus rather than with a fixture built for the engine. **When
that corpus lands, verify these four paths appear in the sim before treating the coverage as
complete.**

---

## Superseded — current state before M10

**The game runs, the director paces it, consequences survive, and beats are consumed.**
776 engine tests; 799 Vitest + 3 Jest total.

---

## Next step (ONE task, start here)

**Build `packages/content/schema/` — the Zod schemas and the terse→canonical transform.**

This is Phase 2's first milestone. It is first because everything else in Phase 2 — the seed
corpus, the four registries, i18n — needs a validated content pipeline, and because it is the
milestone that discharges the promise made in ADR 0009.

### Start here, in this order

```bash
pnpm install && pnpm typecheck && pnpm lint && pnpm test   # must be green before writing
```

Read, in order: `docs/adr/0009` (who owns the types), `docs/adr/0007` §1 (why predicates are
kind-tagged), `CLAUDE.md` §9 (already amended to match), and `docs/engine-spec.md` **Part II**
(what the engine actually accepts — Part I is the original plan and diverges in nine places).

### Deliver

1. **Declare two dependencies by hand** (`pnpm add` is DENIED by `.claude/settings.json`; edit
   the manifests then run `pnpm install`, which is an `ask` rule):
   - `pnpm-workspace.yaml` catalog: `yaml: ^2.9.0` — **it is already in `node_modules` as an
     undeclared phantom via Vite.** Using it without declaring it breaks the day Vite drops it.
   - `packages/content/package.json`: `@odyssey/engine: workspace:*` and `yaml: catalog:`
2. **Zod schemas** in `packages/content/schema/` mirroring the engine's types. The engine owns
   the types; the schema owns _content semantics_ — which YAML fields exist, which values are
   legal, what an omitted key defaults to.
3. **The terse→canonical transform.** Authors write engine-spec §2's
   `{ resource: money, gte: 30 }` and `{ not: { flag: bribed } }`; the engine consumes
   `{ kind: 'resource', key: 'money', cmp: { op: 'gte', value: 30 } }`. Use `z.lazy` for the
   recursive predicate and `.transform()` to normalise. Effects need NO transform — `op` is
   already a proper discriminant.
4. **`.default()` on every optional YAML key**, producing `| null` for scalars and `[]` for
   lists — the engine has no optional properties (ADR 0006 §1).
5. **The conformance test that discharges ADR 0009.** Bidirectional, so a schema narrower _or_
   wider than the type fails the build:
   ```ts
   type Equals<A, B> =
     (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
   const _eventsMatch: Equals<z.infer<typeof gameEventSchema>, GameEvent> = true;
   ```
   Twelve types on the surface: `GameEvent`, `Choice`, `Outcome`, `SkillCheck`, `CheckModifier`,
   `EventContext`, `EventPriority`, `BeatType`, `LocationType`, `TimeOfDay`, `Predicate`,
   `Effect`.
6. **`loadEvents()`** — readdir + parse YAML + validate → `readonly GameEvent[]`, feeding
   `createContentPack`.
7. **Three sample YAML events** proving the transform round-trips. **NOT the seed corpus** —
   that is a later milestone written against the content bible.

### Constraints that will bite

- `packages/content/tsconfig.json` includes only `schema/**` and `__tests__/**`. A new
  top-level dir is invisible to `tsc` **and** to type-aware ESLint until you add the glob.
- Relative imports need an explicit `.ts` extension (ADR 0005 §4).
- No default exports; inline type imports; no `any`; no `!` outside tests.
- Do **not** put Zod in `packages/engine` — `purity.test.ts` asserts its manifest, and ADR 0009
  §1 explains why the layering must not invert.

### Done when

`pnpm typecheck && pnpm lint && pnpm test` green, the conformance assertion compiles, the three
YAML events parse into `createContentPack`, and `pnpm sim:diff -- --runs=2000` still reports
**no change** — the schema layer must not move a single engine number.

---

## M11 shipped — save versioning and content reconciliation

`src/migrate/`. Engine tests 814 → 851. **No sim numbers moved.**

- **`MIGRATIONS` is empty, and that is correct** rather than an omission: `SAVE_VERSION` is 1,
  so no save format has ever been superseded. Inventing a fake schema change to exercise the
  machinery would put a lie in the ladder. It is proven against a SYNTHETIC list instead, which
  tests chaining, ordering and gap detection without pretending history happened.
- **The fixture-completeness meta-test** is what makes the ladder enforceable: it fails the
  moment someone bumps `SAVE_VERSION` without adding a fixture, in CI rather than on a device.
- **A gap in the ladder is a distinct error from a corrupt save** — one is a build defect, the
  other is a bad file, and they need different fixes.
- **`isRunStateShape` checks the rng cursors exhaustively** and everything else shallowly,
  because a missing cursor is silently catastrophic (every draw reads `undefined` → NaN) while
  a malformed history entry is merely wrong.
- **`reconcileContent` TOLERATES a `contentVersion` mismatch where `replayRun` REFUSES one.**
  Both are correct: content ships in every app update, so refusing would delete in-progress
  runs; but a tolerant replay would prove nothing about determinism.

---

## Superseded — M11 brief

The two version axes from ADR 0006 §Consequences, with opposite policies:

1. **`migrate/` — the save-schema axis.** An ordered list of pure
   `migrate_N_to_N+1(unknown) -> unknown` functions. **Never edit a shipped migration.** Every
   new `SAVE_VERSION` adds one function AND one checked-in fixture save.
2. **The meta-test that makes it work**: `it('has a fixture for every version below
SAVE_VERSION')`. It is the only thing that makes writing a migration without a fixture
   impossible, and it fails the moment someone bumps the constant and forgets.
3. **`isRunStateShape`** — a shallow hand-written guard, not Zod. Deep save validation belongs
   with the persistence layer in Phase 2; the engine needs enough to refuse a corrupt save.
   A future `version` returns a typed `save/version-too-new`, never a throw.
4. **`reconcileContent` — the content axis, which CANNOT migrate.** Tolerant read:
   - dangling `pendingEvents` dropped and each drop reported
   - `eventMemory` for removed events **kept** — dropping loses "seen" if the event returns
   - `history` retained verbatim (i18n keys; `i18n-check` catches the rest)
   - flags with unrecognised ids evaluate normally — flags are runtime data, not content
   - a predicate over a missing CONTENT id resolves false with `unknown-ref` (already true)

Note the asymmetry M10 made concrete: **replay refuses a `contentVersion` mismatch, while
reconciliation tolerates one.** Both are correct — a content update must not delete an
in-progress run, and a tolerant replay would prove nothing.

Diff the sim against `docs/sim-baseline.md`; M11 should not move a single number.

---

## M9 shipped — beat consumption

`src/director/beat-slots.ts` plus a beat-fill metric in the sim. Engine tests 733 → 776.

**Sim delta from the M8 baseline:**

```
Completion rate             29.9%   (was 30.0%)
Beat fill rate              47.8%   (1132 filled, 1236 missed)  ← NEW
Unresolved threads              0
Queue departures               18
20,000 runs                 4.8 s
```

- **`legIndex` never moves.** A slot is open over `[legIndex, legIndex + slackLegs]`, and
  sliding is a STATUS, not a mutation of the leg. Advancing the leg and decrementing slack
  reads more naturally right up until you want to report "scheduled for 12, fired at 14" — at
  which point the original is gone.
- **A filled slot cannot be re-filled**, which is the defect M9 closes: before slot consumption
  a beat stayed `pending` forever and could fire again on any later leg in range.
- **`createContentPack` now reports `unfillableBeatTypes`**, alongside `danglingRefs`. Same
  class of silent bug: the slot opens, nothing is eligible, it slides, it expires, and the only
  trace is a beat-miss rate that reads like a balance problem.

**Open finding — the 47.8% fill rate is a fixture gap, not an engine fault.** _[Corrected at Phase 3
M3.1: `ferry_boarding` is wrong here and this sentence is where the error started. No fixture route
schedules it. The nine-event fixture pack also DOES have a `finale` event, `arrival.final_stretch`.
Left in place as the origin of a claim that propagated into three later documents.]_ The fixture
routes schedule `departure`, `approach` and `ferry_boarding`; the nine-event pack has events for none
of them, so those slots can only expire. The sim now prints the unfillable types under the
number so it is self-explaining. Fixing it is content work — either events for those beats or
routes that do not schedule them — and belongs with the Phase 2 seed corpus, not with a fixture
built to exercise the engine.

---

## M8 shipped — the consequence queue

7 files under `src/queue/`. See `docs/adr/0011`. Engine tests 690 → 733.

**M8 found a real defect while being built:** nothing removed a pending entry when it fired.
The promise stayed queued for the rest of the run, and only `maxOccurrences` stopped the payoff
re-firing on every leg of its window — a filter doing the queue's job. Every kept promise would
also have surfaced in the journal as an unresolved thread. The sim now reports **18 queue
departures against 18 fires, and 0 unresolved threads**.

- **Eviction uses a TOTAL order** ending in an insertion index, so ties are impossible by
  construction. Tested by evicting from EVERY permutation of a tie-heavy set and asserting one
  answer — a stronger claim than "the comparator looks total".
- **Append-then-evict, not reject-when-full**, so a promise due next leg displaces one due
  twenty legs out instead of being turned away at the door.
- **Rebase COMPRESSES rather than drops.** Nothing calls it yet — re-routing is Phase 2 — but
  the queue's shape was chosen for it, and a shape chosen for an unimplemented capability is
  one nobody has checked. A property test sweeps leg counts 1–30 against deltas −10..+10.
- **The queue survives an ending**, feeding the journal ("Dmitri never found you") and the
  sim's bug detector.

The sim is otherwise unchanged from the M7 baseline: nine events schedule one payoff, so the
caps are never approached. Expected — they bound pathological runs, not fixture ones, and the
unit tests are what exercise them.

---

## M7 sim delta against the M6 baseline (still the balance baseline)

|                 | M6 (uniform) | M7 (scored)                                       |
| --------------- | ------------ | ------------------------------------------------- |
| Completion rate | 33.7%        | **30.5%** (30.5 / 30.9 / 31.5 across three seeds) |
| Uneventful legs | 0.0%         | 0.0%                                              |
| Fallback legs   | 0.0%         | 0.0%                                              |
| Payoff rate     | 100% (20/20) | 100% (18/18)                                      |
| Never-fired     | 0 of 9       | 0 of 9                                            |
| 20,000 runs     | 4.4 s        | 4.7 s (+7%)                                       |

The completion drop is **signal, not noise** — stable across seeds. Scoring penalises fillers
(`priorityBoost: 0.40`), so more consequential events fire and runs cost more. Still inside
engine-spec 6’s 30–50% band, at its lower edge.

**Open balance finding: fillers are still 75.7% of everything that fires.** They are the only
events with no context constraints, so they are eligible on nearly every leg while the rest
are gated — a 0.40 boost cannot outweigh that eligibility gap. This is a CONTENT observation,
not an engine defect: nine events, two of them universal, is not a distribution to balance
against. Revisit with the Phase 2 seed corpus.

| Event                  | Share |
| ---------------------- | ----- |
| filler.roadside_quiet  | 38.3% |
| filler.long_hours      | 37.4% |
| rest.pickpocket_victim | 11.3% |
| crisis.breakdown       | 4.3%  |
| transit.bus_ejection   | 3.2%  |
| arrival.final_stretch  | 2.5%  |
| border.document_check  | 2.4%  |
| border.bribe_attempt   | 0.3%  |
| border.guard_remembers | 0.1%  |

```
Completion rate             33.7%      (engine-spec 6 target band 30-50%)
Median legs / days          11 / 5
Uneventful legs              0.0%      (target <2%)
Fallback legs                0.0%      (target <2%)
Long-range payoff rate     100.0%      (20/20 scheduled)
Never-fired events              0      of 9
Wall clock                219 ms       (0.22 ms/run)
Extrapolated to 20,000    4.4 s        (target <30 s — 7x margin)
```

Every gate criterion met. **The performance target is not close** — 4.4 s against a 30 s
budget, before any of M7's optimisation levers (pack pre-indexing, `explain` off) are needed.

### What the gate caught — the point of building it

Two bugs that every unit test in M1–M5 passed straight through, both found in the first
1,000-run report:

1. **5 of 9 events were unreachable.** The fixture routes supplied no preparation choices, so
   transport defaulted to `foot` and money to 0 — silently making every vehicle-constrained
   and cost-gated event impossible. Fixed by giving each fixture route a `start` block, which
   is what the preparation screen will produce.
2. **`border.guard_remembers`: scheduled 20×, fired 0×** — the exact signature ADR 0001 names
   as the shape of a whole class of silent content bug. The payoff window `[9,17]` contained
   exactly ONE leg whose location could host it, and zero if the bribe fired at leg 17. Fixed
   by adding checkpoints inside the windows. Payoff rate went 0% → 100%.

A third, found by its own test rather than the report: **`greedy-safe` and `risk-taker` were
producing byte-identical runs** on every fixture seed, because `risk-taker`'s bonus only
applied where a skill check existed. Two policies that always agree bound nothing, so they
were rebuilt as maximin and maximax.

### One engine addition M6 forced

`RouteState.legLocations` — one `LocationType` per leg, caller-supplied like the rest of the
route. Without it `context.locationTypes` cannot be evaluated at all, which makes every border
and rest-stop event unfilterable. `validateRoute` now rejects a length mismatch, because a
short list would silently fall back to `roadside` for the tail of the route.

---

## Superseded — current state before M6

---

## Superseded — current state before M5

The engine can now read and write state deterministically. `src/rng/` (seeded RNG),
`src/state/` (`RunState`, `createRunState`, `stateDigest`), `src/predicate/` (27 kinds + reason
trace) and `src/effects/` (12 ops + applier) are done; 548 of the repo's 561 tests are engine
tests (558 Vitest + 3 Jest). Still missing: the content model, the director, the turn loop,
and all content.

**Both Phase 2 seams are in place and tested as seams:** `ModifierSource` (M4) and the
complication hook (M7, pending). Neither is decorative — each has a test that appends a stub
source and asserts it reaches the output.

The Phase 1 plan is approved, with review gates after **M0** (done) and **M6** (the walking
skeleton, where `pnpm sim -- --runs=1000` first runs end to end). Milestones: M0 prerequisites
· **M1 RNG** · M2 state · M3 predicate · M4 effects · M5 content model · M6 walking skeleton ·
M7 scoring · M8 queue · M9 beat consumption · M10 sim report + goldens · M11 versioning.

---

## Shipped this session (2026-08-08, session 2) — Phase 1 M0

M0's entire job was to settle the module-specifier question **before** ~115 engine files
depend on the answer, and to widen the determinism guard to cover cross-engine hazards.

### The module-specifier decision

`allowImportingTsExtensions: true` is now set in `tsconfig.base.json`, and engine sources
import each other with explicit `.ts` specifiers. This was forced, not chosen: CI runs
`node packages/engine/src/index.ts` to prove rule 2.2 executably, Node ESM requires an
explicit extension, and a `.js` specifier fails with `ERR_MODULE_NOT_FOUND` (verified
against `packages/tools/shared/__tests__/`, which only passes today because Vitest — not
Node — resolves it). The flag is legal because every project sets `noEmit`.

It lives in the shared base rather than in `packages/engine` because `@odyssey/engine`'s
`types` field points at raw `src/*.ts`, and TypeScript realpaths the workspace link — so
engine sources land in a **consumer's** program as ordinary project files that
`skipLibCheck` does not cover. `apps/mobile` extends `expo/tsconfig.base`, not this file,
and will need its own copy the first time the app imports the engine.

### The four gate checks, all green

| Check                                    | Command                                                     | Result                                        |
| ---------------------------------------- | ----------------------------------------------------------- | --------------------------------------------- |
| Bare-Node import by package name         | `node -e "import('@odyssey/engine')"` from `packages/tools` | **pass** — `OK: resolved. exports = []`       |
| Two-file engine module under bare Node   | `node packages/engine/src/index.ts` with a probe re-export  | **pass** — exit 0; `exports = ["M0_PROBE"]`   |
| Typecheck, all projects, probes in place | `pnpm typecheck`                                            | **pass** — 4 projects + root                  |
| Metro still starts                       | `expo start --port 8083`                                    | **pass** — `Waiting on http://localhost:8083` |

**The risk flagged in the plan is closed.** Node refuses type-stripping for files under
`node_modules`, and pnpm puts the link at `packages/tools/node_modules/@odyssey/engine`
(package-local, not hoisted). It works because ESM resolution realpaths by default, so the
junction resolves to `packages/engine` — outside `node_modules` — before stripping. The
relative-path fallback named in the plan is **not needed** and is withdrawn.

Both probe files were removed after the checks (`git clean -f`; `rm` is denied).

### `purity.test.ts` extended — cross-engine hazards

New `CROSS_ENGINE_PATTERNS` block bans `Math.pow/exp/log/sqrt/cbrt/hypot`, all trig, the
exponent operator, `localeCompare`, the `toLocale*` family and `Intl`. These are
deterministic on one machine but **implementation-approximated or locale-dependent**, so
two conforming engines may disagree on the last bit or on sort order — and a golden run is
only worth something if it reproduces on Linux, Windows and Hermes alike.

**Verified failing on a deliberate violation before being trusted**, per the standard the
other three layers were held to: injecting `Math.pow(2, 8)`, `2 ** 8` and `localeCompare`
into a real engine source file failed the suite with all three labels reported.

**Also fixed, unplanned:** the existing `Math['random']` pattern was **silently dead**.
`stripCommentsAndLiterals` blanks the quoted key before the regex runs, so
`Math['random']` had already become `Math['']` and could never match. Replaced with
`Math[`, `Date[`, `crypto[`, `performance[` — engine source has no legitimate reason to
index those dynamically, so the broader form is both correct and stricter. ESLint's AST
selector was catching this case, so nothing slipped through; the backstop was just not
backing anything up.

Vitest count 15 → 17.

### Dependency added

`packages/tools` now declares `@odyssey/engine: workspace:*`. Justification per CLAUDE.md
§8: the sim harness executes the engine headlessly and there is no other route to its
exports; `packages/tools` declared no workspace dependencies at all before this. **New
Architecture compatibility: N/A** — an internal workspace package of pure TypeScript with
zero runtime dependencies, which runs under Node and never reaches a device bundle.

---

## Shipped in session 1 (2026-08-08)

Everything here is verified. The command that proves each claim is next to it.

### Workspace and toolchain

pnpm 11.20.0 workspace, 5 projects (`apps/mobile`, `packages/{engine,content,tools}`, root).
All shared versions live in one `catalog:` block in `pnpm-workspace.yaml`, so packages
cannot drift.

```bash
pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm test:engine && pnpm format:check
```

All six exit 0. Tests: **15 Vitest** (3 projects) + **3 Jest** (apps/mobile).

**Every one of the 9 scripts in `package.json` has been executed**, not just the six above:

| Script         | Result                                           |
| -------------- | ------------------------------------------------ |
| `dev`          | Metro starts, `Waiting on http://localhost:8081` |
| `typecheck`    | exit 0 — 4 projects                              |
| `lint`         | exit 0                                           |
| `lint:fix`     | exit 0, **0 files changed**                      |
| `format`       | exit 0, **0 files changed**                      |
| `format:check` | exit 0                                           |
| `test`         | exit 0 — 15 Vitest + 3 Jest                      |
| `test:engine`  | exit 0 — 5 tests                                 |
| `prepare`      | exit 0, `core.hooksPath = .husky/_`              |

`format` and `lint:fix` changing zero files is the meaningful assertion — it means the
committed tree is already canonical, not merely that the commands exit 0.

### Versions pinned deliberately BEHIND npm latest

Read `docs/adr/0002` before "upgrading" any of these. Each was pinned because latest is
broken here, not out of caution.

| Package    | Pinned    | npm latest | Why                                                                                                |
| ---------- | --------- | ---------- | -------------------------------------------------------------------------------------------------- |
| typescript | `~6.0.3`  | 7.0.2      | TS 7 ships no stable compiler API; typescript-eslint peers `<6.1.0`                                |
| eslint     | `~9.39.5` | 10.8.0     | Expo's plugin tree caps at `^9`; ESLint 10 per-file config lookup silently shadows the root config |
| jest       | `^29.7.0` | 30.4.2     | jest-expo 57 + `@react-native/jest-preset` are on the Jest 29 family                               |

### Determinism guardrails — three independent layers

All three were verified **failing on a deliberate violation** before being trusted.

1. `eslint.config.mjs` — `no-restricted-properties` + `no-restricted-syntax` +
   `no-restricted-globals`. Catches `Math.random()`, `Math['random']`,
   `const { random } = Math`, `Date.now()`, `Date['now']`, `new Date()`, `Date()`.
   (`no-restricted-globals` alone _cannot_ ban `Math.random()` — see `docs/adr/0002`.)
2. `packages/engine/tsconfig.src.json` — `types: []`, no `DOM` in `lib`, so `document` and
   `process` do not typecheck in the engine.
3. `packages/engine/src/__tests__/purity.test.ts` — scans engine source and manifest for
   forbidden imports and nondeterministic APIs.

Plus `scripts/check-no-nested-eslint-config.mjs`, which fails `pnpm lint` if any
`eslint.config.*` appears outside the root — the failure mode that would silently disable
layer 1 for a whole subtree.

### CI

`.github/workflows/ci.yml`: `typecheck`, `lint`, `test`, `engine-under-plain-node`
(executes the engine entry under bare Node — `node packages/engine/src/index.ts`), and a
Windows `typecheck` + `test` job. Actions pinned to `checkout@v7`, `setup-node@v7`,
`pnpm/action-setup@v6`, with action-setup **before** setup-node (the cache footgun).

**CI is green on a real runner.** `dev` was pushed and
[PR #1](https://github.com/corazon714/odyssey/pull/1) opened; all 5 jobs passed on both the
`push` and `pull_request` runs (10 checks total). Run
[31242944764](https://github.com/corazon714/odyssey/actions/runs/31242944764).

| Job                       | Result       |
| ------------------------- | ------------ |
| `typecheck`               | pass (30s)   |
| `lint`                    | pass (37s)   |
| `test`                    | pass (29s)   |
| `engine-under-plain-node` | pass (38s)   |
| `typecheck-windows`       | pass (1m23s) |

Notably `typecheck-windows` and `engine-under-plain-node` both passed first time — the
Windows job proves no path-separator or CRLF assumptions leaked in, and the plain-Node job
is the executable proof of `CLAUDE.md` rule 2.2. `--frozen-lockfile` also held, so the
lockfile is not drifting.

### Claude Code extension layer (`.claude/`)

See `docs/adr/0003`. Four hooks, all proven by driving them with the documented stdin
contract and asserting exit codes:

| Hook                        | Event                      | Proven                                                                                                                                 |
| --------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `guard-protected-paths.mjs` | PreToolUse Write/Edit      | blocks `reports/`, `.env`, both generated-asset dirs; allows `.env.example` and engine source                                          |
| `guard-git-push.mjs`        | PreToolUse Bash/PowerShell | blocks `--force`, `--force-with-lease`, `origin main`, `HEAD:main`, and `git status && git push -f`                                    |
| `gate-commit.mjs`           | PreToolUse Bash/PowerShell | blocks a commit with a failing test, printing the real assertion error; passes when fixed; **fails closed** if its own plumbing breaks |
| `warn-new-dependency.mjs`   | PostToolUse Write/Edit     | exit 2 feedback naming each added dependency                                                                                           |

Timings: docs-only commit **113ms**, `packages/engine` commit **5.9s**, full monorepo
**11.9s** (which the scoping avoids). Bash guards **~162ms** per call.

Also `.claude/skills/handoff/SKILL.md` (`/handoff`) and
`.claude/agents/code-reviewer.md` (reviews a diff against `CLAUDE.md` §2).

### Fixed during verification: `expo-env.d.ts` was tracked and shouldn't be

Running `pnpm dev` for the first time exposed a real defect in the Phase 0 scaffold.
`expo start` **regenerates** `apps/mobile/expo-env.d.ts` (without a trailing newline) and
writes its own `apps/mobile/.gitignore` listing that file. Because the hand-written version
was committed, `pnpm format:check` failed for anyone who had ever started the dev server —
a check that passed in CI and failed on every developer machine.

Fix: untracked the file, committed Expo's generated `.gitignore`, and added the path to
`.prettierignore` (Prettier does **not** read `.gitignore`, verified). Confirmed first that
`apps/mobile` still typechecks with the file absent, which is the fresh-CI-checkout case.

### The permission layer fired live

While cleaning up a probe file, `rm` was **denied** by the `Bash(rm *)` deny rule in
`.claude/settings.json`. Removal went through `git clean -f <path>` (an `ask` rule) instead
of being routed around with a node one-liner. First live confirmation that the permission
layer works, as opposed to the hook scripts, which were proven by contract.

### CLAUDE.md audit

Every claim checked against the repo; aspirational sections marked `(planned)` (42
markers). Stack re-verified against Expo SDK 57.0.11 — see `docs/adr/0004`: **moti is
banned** (value-imports framer-motion 6, which peers React ≤18 and pulls in `@motionone/dom`,
the DOM engine §4 already bans). Use Reanimated 4's built-in CSS animations API.

---

## Half-done

**Nothing is half-done.** No file is in a broken or partial state, no `TODO(handoff)`
markers exist, and the working tree is clean apart from the commits made this session.

The honest gaps are _unverified_, not _broken_:

- ~~CI has never executed.~~ **Resolved** — all 5 jobs green on GitHub Actions, including
  the Windows and plain-Node jobs. See the CI section above.
- **The app has never run on a device or simulator.** `expo export` bundles cleanly on both
  platforms (android 1226 modules, ios 1097) and `pnpm dev` starts Metro on port 8081 — that
  is the real test of pnpm's hoisted `node_modules` against Metro resolution. But no
  `expo prebuild`, no Gradle/Xcode build, and nothing has ever rendered on a screen.
- **Hooks proven by contract, not by live firing.** They were driven with the exact stdin
  JSON Claude Code sends. Hooks load at session start, so they were not armed in the session
  that wrote them — verified by writing to `reports/` and watching it succeed.

---

## Next step (ONE task, start here)

**M7 — the director's scoring, and the full relaxation ladder.** _(after the M6 review)_

M6's director picks UNIFORMLY among eligible events and has a two-rung ladder. M7 makes it a
director.

1. **The six scoring factors** with the ranges recorded in the plan: `contextAffinity`
   [0.50, 2.00] · `tensionFit` [0.25, 1.50] · `novelty` [0.20, 1.00] · `recency` [0.05, 1.00]
   · `tagSaturation` [0.25, 1.00] · `priorityBoost` {0.40, 1, 1, 3.00}. **Multiplication order
   is part of the replay contract** — float multiplication is not associative, so reordering
   changes `Math.round`, which changes the pick. Pin it with `scoring-order.test.ts`.
2. **`pickWeight = clampInt(round(score), 1, 1_000_000)`** so an eligible event is ALWAYS
   pickable. That invariant is what separates scoring from filtering; it gets its own test.
3. **All rational arithmetic.** No `Math.pow`/`exp`; `purity.test.ts` enforces it.
4. **`tagSaturation` uses `max`, not a product** — a six-tag event in a busy window would
   otherwise collapse to near-zero and become a filter in disguise. Window derives from
   `history`, which already carries tags copied at fire time.
5. **The full seven-rung ladder**: beat gate → `exclusiveGroup` → soft context → cooldown +
   recency → `locationTypes` → filler pool → `uneventful`. `requires` and `maxOccurrences`
   never relax, at any rung.
6. **The complication hook** — the second Phase 2 seam. Post-selection, drawing from
   `encounterFlavor` so Phase 2 can consume randomness without shifting `eventPick`. Test it
   as a seam, like `ModifierSource`.
7. **`tension`** — `nextTension(state, pack)`, with the "breathe after two high-tension
   events" rule from engine-spec 4.

Re-run the sim after each factor lands; the numbers above are the baseline to diff against.

---

## M6 brief (delivered) — the walking skeleton

The minimum that proves the loop end to end. Deliberately NOT the full director: scoring,
the relaxation ladder, beats and the queue's caps all come after, because their bugs are
invisible until something can run a thousand runs.

1. **`director/`, minimal** — hard filters (`requires`, `maxOccurrences`, context, cooldown,
   `exclusiveGroup`) plus **uniform** `weightedPick`. No scoring factors, no beat gate, no
   ladder beyond falling through to `{ kind: 'uneventful' }`. `selectEvent` returns a
   discriminated union and never throws.
2. **`loop/`** — `advanceLeg(state, pack)`, `resolveChoice(state, pack, choiceId)`,
   `worldTick`, `runSkillCheck` (through `collectModifiers` and
   `PHASE_1_MODIFIER_SOURCES` — never reading `check.modifiers` directly), `pickOutcome`,
   `checkRunEnd`. Every illegal transition returns a typed `EngineError`, never a throw.
3. **`packages/tools/sim/`** — `runOne`, `runMany`, `parse-args`, `cli` printing five counts.
   Policies: `random`, `greedy-safe`, `greedy-fast`, `risk-taker`, `adversarial-worst-case`.
   Reads the fixture pack and routes by path via `findWorkspaceRoot`.
4. **Add `sim` to root `package.json`** and a `pnpm sim -- --runs=50` smoke job to CI.

**Gate criteria:** `pnpm sim -- --runs=1000` completes 1,000 full runs; report shows a
non-zero completion rate, empty-pool fallbacks under 2%, and no never-fired event among the
nine. Measure 1,000 runs and extrapolate against the **20,000-runs-under-30-seconds** target
before optimising anything — if the extrapolation misses, that is a finding to report at the
gate, not a slip to absorb.

Wire `PredicateContext` to the pack's real `ContentRefs` here — `ALL_REFS_KNOWN` was a
placeholder, and `unknown-ref` should start firing on genuinely missing content.

---

## M5 shipped — the content model

7 files under `src/content/`, the fixture pack and routes as JSON, and a hand-written fixture
loader. Engine tests 548 → 591. `docs/adr/0009` records the decisions, and **`CLAUDE.md` §9 is
amended** (DoD item 8).

- **The type-ownership conflict is resolved.** §9 implied engine types are `z.infer`red from
  the Zod schemas; that would make the engine a consumer of `packages/content` and give it a
  Zod dependency. Now: the engine owns the types, the schema owns content _semantics_, and
  Phase 2 holds them identical with a bidirectional compile-time assertion.
- **Sorted once, at construction.** Twenty shuffled orderings produce an identical pack and an
  identical `contentVersion` — with a guard-the-guard asserting the fixture is _not_ already
  in sorted order, or that test would prove nothing.
- **`danglingRefs` walks every predicate and effect.** ADR 0001 accepts that content bugs are
  silent; this is the first instrument that sees them. `content-lint` subsumes it in Phase 2.
- **Fixtures are JSON data in the engine**, not `.ts` and not `packages/content/events/`.
  `packages/content` is still untouched, so Phase 1 needs no `yaml` dependency.
- **Nine events, chosen for coverage not realism:** two fillers (the ladder's rung-6 floor),
  beats for three beat types, a schedule/payoff pair, and one event that can legitimately fail
  to fire so the never-fired line has something real to report.

---

## M5 brief (delivered) — the content model

M4 shipped (below). M5 is the last piece before the walking skeleton, and it is where the
type-ownership decision from the plan review becomes code.

Deliver:

1. **Engine-owned TypeScript types** in `src/content/`: `GameEvent`, `Choice`, `Outcome`,
   `SkillCheck` (extend M4's `SkillCheckSpec`), `EventContext`, `EventPriority`,
   `LocationType`. `BeatType` and `TimeOfDay` already exist. **Hand-written, not `z.infer`** —
   see the CLAUDE.md §9 amendment below.
2. **`createContentPack(events)`** — sorts **once, at construction**, into canonical id order
   using `<`/`>` on strings, and builds lookup indices. Sorting per leg is both wasteful and
   an invitation to "optimise" the sort away later. `ContentPack` is not `RunState`, so it may
   legally hold `Map`s.
3. **`contentVersion(events)`** — a stable hash over the sorted pack, reusing `digestOf`.
4. **`ContentRefs` implementation** so `PredicateContext` can stop using `ALL_REFS_KNOWN`.
5. **The fixture pack**: `src/__tests__/__fixtures__/mini-pack.json` — 9 events as JSON DATA,
   not `.ts` (rule 2.6 honoured rather than bent). Plus `routes.json` carrying `legCount` and
   `beatSchedule`, which the sim reads by path via `findWorkspaceRoot`.
6. **Amend `CLAUDE.md` §9** (DoD item 8). It currently says the Zod schemas are the single
   source of truth, implying engine types are inferred from them. That cannot hold: `z.infer`
   types are owned by whichever package declares the schema, so the engine would become a
   consumer of `packages/content` and would need a Zod dependency. The amendment: the schema
   is authoritative over _content semantics_, and Phase 2 holds schema and type identical with
   a **bidirectional** compile-time assertion (mutual-extends, so narrower _or_ wider fails).

`packages/content` is still NOT touched — no schemas, no YAML, no seed events.
`shuffled-pack-invariance` is the test that matters: an identical run digest from a shuffled
event array, proven end to end rather than by inspecting a sort.

---

## M4 shipped — the Effect DSL and applier

10 files under `src/effects/`, plus `src/text-params.ts`. Engine tests 487 → 548.
`docs/adr/0008` records the decisions.

- **12 ops** (the spec's 11 plus `clearFlag`). Exhaustiveness verified by injecting a
  `teleport` op: two errors, one at the dispatcher's `never` guard and one at `EffectOp`,
  because `EFFECT_OPS` and the union cross-check each other.
- **`AppliedEffect` records what happened, not what was asked.** Spending 40 when you hold 12
  logs `applied: -12` plus a `ClampEvent`. `applied.length === effects.length` is an
  invariant, so an effect can never be silently dropped.
- **Structural sharing, with identity as the no-op signal.** A resource change leaves `flags`,
  `route`, `history` as the _same objects_; a no-op returns the identical state.
- **Purity is enforced by deep-freezing** the input and applying all 12 ops — module code is
  strict, so an in-place write throws. The freeze is itself guarded by a test.
- **Compound ops carry a nested tagged `field` union**, not a bag of nullables, because
  `{ vehicleId: string | null }` cannot distinguish "leave alone" from "set to none".
- **`ModifierSource` seam is live.** `runSkillCheck` (M6) will never read `check.modifiers`
  directly. Phase 1 passes one source; Phase 2 appends the registry and quirk sources with no
  call-site change.

---

## M4 brief (delivered) — the Effect DSL and its applier

M3 shipped (below). Effects are the other half of the same contract: predicates read state,
effects write it, and CLAUDE.md 2.7 says every mutation goes through one.

Deliver:

1. **The 11 ops from engine-spec §2**: `resource` · `flag` · `relationship` · `advanceTime` ·
   `scheduleEvent` · `unlockEnding` · `item` · `skill` · `transport` · `document` · `route`.
   `op` is already a proper discriminant, so no terse→canonical normalisation is needed —
   unlike predicates.
2. **`applyEffects(state, effects, ctx) -> { state, applied }`**, pure, with **structural
   sharing**: untouched branches keep object identity. A full clone per effect is ~30 legs ×
   many effects of needless allocation in a 20k-run sim.
3. **`AppliedEffect` records what actually happened**, not what was asked for — including
   **clamp reporting** (reuse `ClampEvent` from M2) and a `noop` case. `{ requested: -40,
applied: -12, clampedAt: 'floor' }` is what makes "money floors at 0 after leg 15" visible
   to the sim rather than absorbed by a silent `Math.max`.
4. **`ModifierSource` seam** (`effects/modifier-source.ts`) — ships **empty, not absent**.
   `runSkillCheck` (M6) never reads `check.modifiers` directly; it collects from an ordered
   list of sources. Phase 1 passes one (`choiceModifierSource`, filtering by each modifier's
   `when` predicate); Phase 2 appends the registry and quirk sources **with no call-site
   change**. A test must prove an empty source list is inert and a stub source's output
   reaches the result.
5. **`scheduleEvent` appends naively.** Caps, per-eventId limits, deterministic eviction and
   rebasing all land in M8 — do not build them here.

Tests that matter: one per op; `frozen-input-purity` (deep-freeze the input, apply all 11,
assert no throw and an unchanged digest); `structural-sharing` (untouched branches keep
identity); `applied-length-invariant` (`applied.length === effects.length`, so a silently
dropped effect is impossible).

---

## M3 shipped — the predicate DSL and the reason trace

10 files under `src/predicate/`, plus `state/flag-access.ts`. Engine tests 350 → 487.
`docs/adr/0007` records the decisions. Worth knowing:

- **27 predicate kinds**, canonical `kind`-tagged. **Exhaustiveness verified, not asserted**:
  injecting a `moonPhase` kind failed with `TS2345 … not assignable to parameter of type
'never'` at the evaluator's guard, then was reverted.
- **`ReasonNode` / `ReasonLine` are frozen** (ADR 0007 §2). Two user-facing consumers depend
  on the shape — the result screen and Phase 7's MO2 chips — and they are built in different
  phases. Changing either type needs an ADR.
- **`all`/`any` do not short-circuit**, and the trace is built eagerly. Short-circuiting would
  show one reason where three applied, which is the opposite of design pillar 2.
- **`chance` consumes no cursor.** `chance-gate.test.ts` asserts all eight cursors stay at
  zero across 50 evaluations, and that two gates in one predicate get independent answers.
- **A missing content id is `unknown-ref`; a missing flag is not.** Content ids are a bug the
  sim must count; flags are runtime data with no registry to be missing from.
- **Flag TTL is applied at read time**, and `isSet` does not mean truthy — a flag set to
  `false` or `0` is still set.

---

## M3 brief (delivered) — the `requires` DSL and its evaluator

M2 shipped (below), so state exists to evaluate predicates against. `predicate/predicate.ts`
currently holds a two-member placeholder union; M3 expands it. Growing a union is additive,
so nothing written against it needs rework.

Deliver:

1. **~20 kind-tagged node types**: `all` · `any` · `not` · `always` · `never` · `flag` ·
   `resource` · `skill` · `trait` · `item` · `document` · `visa` · `relationship` ·
   `eventMemory` · `transport` · `weather` · `timeOfDay` · `leg` · `tension` · `chance` ·
   plus `unknown-ref` as an evaluation _result_, not an authored node.
2. **`evaluatePredicate(p, ctx): { value, trace }`.** The trace is not debug output — Phase 7
   (MOTION MO2) renders it as the dice modifier chips, and design pillar 2 requires the
   player be able to reconstruct why. **`ReasonNode` and `ReasonLine` are contract-frozen
   from M3; changing either needs an ADR.** Shape:

   ```ts
   type ReasonNode = {
     readonly kind: PredicateKind | 'unknown-ref';
     readonly value: boolean;
     readonly labelKey: string; // i18n key, never prose
     readonly params: Readonly<Record<string, string | number | boolean>>;
     readonly children: readonly ReasonNode[]; // EMPTY_REASONS for leaves
   };
   ```

3. **`describeReason(node): readonly ReasonLine[]`** — flattens to
   `{ labelKey, params, polarity: 'pro' | 'con' }`, the chip list the result screen renders.
4. **`{ chance: p }` draws from `chanceGate` and advances NO cursor.** It is addressed by
   `deriveKey(keys.chanceGate, '<eventId>:<legIndex>:<nodePath>')`. Drawing from `eventPick`
   would make the draw _count_ depend on pool size, so adding one event would shift every
   later draw. See ADR 0005 §2. This also makes re-evaluation within a leg idempotent, which
   the director needs to explain itself.
5. **A missing content id resolves to `false` with a distinct `{ kind: 'unknown-ref' }`
   reason node**, so the sim can count them instead of them vanishing into a generic false.
   A missing _flag_ is not this case — an unset flag is ordinary runtime data.

Tests that matter: every kind exercised; `reason-trace-consistency` (`reason.value` matches
the evaluator at every node, recursively); `i18n-keys-only` (rule 2.4, mechanised);
exhaustiveness (adding a kind must fail to compile at every site that must handle it).

---

## M2 shipped — RunState, the serialisable core

23 files under `src/state/`, `src/ids/`, `src/errors/`, plus placeholder `src/content/` and
`src/predicate/`. Engine tests 224 → 350. `docs/adr/0006` records the six decisions; the ones
that will bite if forgotten:

- **No optional properties in engine state — `| null` instead.** `exactOptionalPropertyTypes`
  makes `{ ...state, x: maybeUndefined }` an error wherever `x?: T`, which is exactly what a
  structural-sharing effect applier does every leg; and `undefined` does not survive
  `JSON.stringify` while `null` does. Authored content types keep `?`.
- **Clamps are recorded, not silent.** `clampResources`/`clampSkills` return the clamp events
  so the sim can count them. A silent `Math.min` hides a balance finding.
- **`stateDigest` canonicalises first.** `JSON.stringify` emits string keys in insertion
  order, so two `toEqual` states can serialise differently depending on the order their flags
  were set. 128 bits (4 murmur passes), because 32 collides by birthday inside a 20k-run sim.
- **`RunState.presentation` was added** — not in engine-spec §1. Without it `resolveChoice`
  needs the caller to pass the event id back, putting engine state in the app layer.
- **The route is validated, not generated**, and `legIndex`/`progressKm` are normalised so a
  reused `RunInit` cannot start a run halfway along.

`json-serializable.test.ts` is the load-bearing one: it round-trips a _fully populated_ state
— every memory mechanism, every branded id — and compares digests, because `toEqual` alone
would not notice a `Map` collapsing to `{}` on both sides.

---

## M2 brief (delivered) — `RunState`, `RunInit` and `createRunState`

M1 shipped (see below), so randomness is settled and every later subsystem can draw from it.

Deliver, per `docs/engine-spec.md` §1 and the Phase 1 plan:

1. `RunState` as a fully JSON-serialisable type — **no optional properties: use `| null`**.
   `exactOptionalPropertyTypes` makes `{ ...state, x: maybeUndefined }` an error wherever
   `x?: T`, which is what a structural-sharing effect applier does constantly; and
   `undefined` does not survive `JSON.stringify` while `null` does. Authored content types
   keep `?`, because YAML omission is natural there.
2. `RunInit` — what the app supplies to start a run. **It carries the route**, including
   `nodes`, `edges`, `legCount`, `totalKm` and `beatSchedule`: route generation, `legCountFor`
   and beat-schedule generation are all out of Phase 1. The engine validates what it is
   given and returns a typed error if the route is incoherent.
3. `createRunState(init)`, resource/skill clamping with **clamp events recorded, not
   silently applied** (a clamp is a balance signal the sim must count), and clock arithmetic.
4. `stateDigest(state)` — a stable hash with **explicitly sorted keys**, because `Object.keys`
   hoists integer-like keys ahead of string keys.
5. `state/__tests__/json-serializable.test.ts` — round-trip a fresh state and a state after
   30 simulated legs; digests must match. This is the only place engine-spec §1's
   no-`Map`/`Set`/`Date` rule can actually be enforced.

`ids/` (branded `EventId`, `FlagId`, …) lands here rather than in M1, where nothing used it.

Constraints that will bite if ignored:

- `packages/engine` may not import React/RN/Expo, and `tsconfig.src.json` sets `types: []`
  with no `DOM` in `lib` — so no `process`, no `Buffer`, no `crypto` global. Pure TS only.
- **No `enum`, `namespace`, or parameter properties**: CI runs the engine under Node's
  strip-only type stripping, which rejects all three. Use `const` objects + union types.
- Relative imports need an explicit `.ts` extension.
- No transcendental math, no `**`, no `localeCompare`/`Intl` — `purity.test.ts` enforces it.
- Files stay readable end-to-end under ~200 lines (`CLAUDE.md` §6); split otherwise.
- One exported concept per file. No default exports.

Start with:

```bash
pnpm typecheck && pnpm lint && pnpm test
```

---

## M1 shipped — the seeded RNG

19 files under `packages/engine/src/rng/`, 224 engine tests (was 5). `docs/adr/0005` records
the reasoning; the summary is that a draw is a **pure function of `(streamKey, counter)`**,
so there is no generator state to serialise and stream isolation holds by construction
rather than by luck.

All five acceptance criteria met:

| #   | Criterion                                     | Where it is proven                                                                              |
| --- | --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | Same seed → same sequence, across processes   | `rng.test.ts` — including _resumes exactly where a drained Rng stopped_, which is replay itself |
| 2   | Named substreams, `hash(seed + ':' + stream)` | `stream-key.test.ts`; **eight** streams — `chanceGate` added, see ADR 0005 §2                   |
| 3   | Plain `Record<RngStream, number>` cursor      | `rng-cursors.test.ts` — JSON round-trip, no aliasing of the caller's record                     |
| 4   | **Draws on one stream never shift another**   | `stream-isolation.test.ts` — all 56 ordered pairs                                               |
| 5   | `weightedPick` stable for a fixed seed        | `weighted-pick.test.ts` — plus proportions within a few percent of declared weights             |

Two things worth knowing beyond the checklist.

**The isolation test has a negative control.** `it('would expose the additive-offset
generator that was rejected')` builds the rejected `splitmix(streamKey + cursor · GAMMA)`
inline and demonstrates two of its streams being the _same sequence, shifted by one_ — while
that generator still passes the non-interference test trivially. Without this case, an
implementation with that exact flaw would show green.

**The murmur3 vectors are external.** `murmur3.test.ts` checks six published MurmurHash3
x86_32 vectors covering all four tail lengths. They passed first run, which is mutual
confirmation from two independent directions: an implementation written from the algorithm,
and vectors from outside the repo. This is why `utf8Bytes` is hand-rolled — the vectors are
defined over UTF-8, and hashing UTF-16 code units would have left the test comparing the
implementation to itself. `drawWord` (the unrolled hot path) is separately asserted equal to
`murmur3Bytes` over the counter's little-endian bytes across thousands of inputs.

**Open balance parameter:** `CHECK_DIE_SIDES = 20` in `roll-result.ts` is a placeholder.
engine-spec §2 shows `dc: 5` and ±2..3 modifiers but never states the die, and how a skill
enters the total needs simulation to settle. It is deliberately the only place the die
appears. `roll()` knows nothing about skills — M6 passes a skill in as a labelled modifier.

---

## Open questions for the human

1. ~~**PRNG algorithm.**~~ **Resolved** — MurmurHash3 x86_32, counter-based, `Math.imul`
   only, no BigInt. Reasoning and rejected alternatives under "Next step" above; ADR 0005
   is an M1 deliverable.
2. ~~Push and CI.~~ ~~Merge to `main` first?~~ **Both resolved** — PR #1 merged
   2026-08-08T06:00:18Z; `origin/main` is `6ac8a9a`, and `dev` has zero commits not in it.
   Note the **local `main` branch is stale** at `fdd93aa Initial commit`, 13 behind
   `origin/main`, which will mislead any `git diff main`.
3. **Rive vs Lottie.** `docs/adr/0004` defaults to Lottie because it is in Expo SDK 57's
   `bundledNativeModules` and Rive is not — Rive additionally forces a hand-pinned
   `react-native-nitro-modules@0.35.10` if MMKV is also used. Confirm Lottie as the default,
   or say Rive is worth the pin. **Still open; not needed before Phase 3.**

---

## ⚠ Open questions for the human — SESSION 3

**These block or shape Phase 2. Answering 1 and 2 before content lands is much cheaper than
answering them after.**

1. **`worldTick`'s drift constants are structurally wrong — fix before or after content?**
   At 20,000 runs health's p10/p50/p90 collapse to `0/1/1` together, so the dominant failure
   mode is independent of player choice (ADR 0012 §2). **The trap:** real content will apply
   resource effects on top of a decay curve already killing ~60% of runs alone, and the obvious
   fix — weakening the drift — silently changes which system controls pacing. Fixing it _first_
   means one baseline regeneration; fixing it _after_ means re-tuning content too.
   _My recommendation: fix first, as a small dedicated milestone with its own sim delta._

2. **`CHECK_DIE_SIDES = 20` needs a real decision, and it is coupled to the check formula.**
   engine-spec §2 shows `dc: 5` with ±2–3 modifiers. On a d20 each modifier is worth 5% while
   the skill (0–10) swamps them entirely. Currently `total = die + skill + modifiers` vs `dc`.
   Skill checks are picked 0.3–1.5% of the time, so nothing has tested it. **What die, and
   how should skill enter?** This is a design call, not an engineering one.

3. **Merge PR #2 to `main` before Phase 2, or keep stacking on `dev`?**
   All six CI jobs are green. Phase 2 is comparable in size to Phase 1; stacking it on an
   unmerged `dev` makes both unreviewable — the same argument that applied to PR #1.
   ⚠ **Local `main` is stale** at `fdd93aa Initial commit`, now ~30 commits behind
   `origin/main`, which will mislead any `git diff main`.

4. **`CLAUDE.md` is now 463 lines** against its own "~400 lines" cap — third time asked, and
   the gap grew this session because the enforcement notes got longer as rules became live.
   Move the per-rule `_Enforcement:_` notes to `docs/enforcement.md` and keep one-word markers
   in §2, or drop the cap? _It is a constitution; 463 lines is past what anyone re-reads._

5. **Hermes verification — who does it, and when?** Determinism is proven on V8 only. Every
   cross-engine defence (no transcendentals, no `localeCompare`, integer `weightedPick`,
   `Math.imul` over BigInt) is preventive rather than demonstrated (ADR 0012 §3). It needs a
   device or emulator running the golden runs, which is app-layer work.

---

## Open items carried into M1

**1. ~~`.claude/settings.json` deny rule~~ — RESOLVED, applied by hand by the human.**

The old rule `Write(~/.claude/**)` / `Edit(~/.claude/**)` was over-broad: it blocked Claude
Code's own plan-mode harness path (`~/.claude/plans/`). It is now replaced by seven narrow
rules covering credentials and the two settings files:

```json
"Read(~/.claude/.credentials.json)",
"Write(~/.claude/.credentials.json)",
"Edit(~/.claude/.credentials.json)",
"Write(~/.claude/settings.json)",
"Edit(~/.claude/settings.json)",
"Write(~/.claude/settings.local.json)",
"Edit(~/.claude/settings.local.json)"
```

Scope: the files whose modification actually changes what the agent may do, leaving
`~/.claude/plans/`, `~/.claude/projects/` and everything else writable.

**This had to be a human edit, and that is the system working, not a limitation.** The
permission classifier blocks the agent from editing the file that governs its own write
access — in the tightening direction as well as the loosening one. Anything that changes
this file is a human action by construction.

**Rules load at session start, so the narrowed set arms next session, not this one.**

Two notes for whoever touches it next. Prettier covers `.claude/settings.json` (it is not
in `.prettierignore`), so hand-pasted rules at the wrong indent fail `pnpm format:check`
and therefore the CI lint job — run `pnpm exec prettier --write .claude/settings.json`
after editing. And there is still no explicit `allow` entry for `~/.claude/plans/**`; with
the broad deny gone it merely prompts rather than being blocked, which is fine, but add an
allow rule if the prompting becomes noise.

**2. `CLAUDE.md` §9 must be amended at M5.** §9 says the Zod schemas are the single source
of truth, implying engine types are inferred from them. That cannot hold: `z.infer` types
are owned by whichever package declares the schema, so the engine would become a consumer
of `packages/content` and would need a Zod dependency. Phase 1 hand-writes the canonical
types in `packages/engine/src/content/`; Phase 2's schemas are held identical to them by a
**bidirectional** compile-time assertion (mutual-extends, so a schema narrower _or_ wider
than the type fails the build). §9 should say the schema is authoritative over _content
semantics_, not that the types are inferred. The twelve types on that conformance surface:
`GameEvent`, `Choice`, `Outcome`, `SkillCheck`, `CheckModifier`, `EventContext`,
`EventPriority`, `BeatType`, `LocationType`, `TimeOfDay`, `Predicate`, `Effect`.

**3. Hermes is unproven.** Determinism is currently demonstrated only on V8 (Linux +
Windows in CI). A Hermes golden-run job is a named Phase 2 gap, not an oversight.
