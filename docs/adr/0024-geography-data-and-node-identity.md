# 0024 — Geography data: sources, node identity, and the rules that keep it §11-safe

- **Status:** Accepted
- **Date:** 2026-08-09
- **Amends:** `CLAUDE.md` §11 (two additions), rule 2.4 (a second narrow exemption)
- **Relates to:** ADR 0009 (type ownership), ADR 0018 (what the linter can decide), ADR 0022 (the corpus split)
- **Full licence record:** `docs/geo-data-licensing.md`

## Context

Phase 3 puts real geography in the repo: ~1,200 nodes and ~3,000 edges under
`packages/content/geo/`, built by a new tool in `packages/tools/geo-build/`. Before a single node
is written, four things have to be settled, because each one is expensive to change afterwards and
cheap to get right now: where the data comes from, what a node is called, where the data lives in
the architecture, and what it is forbidden to record.

## Decision 1 — the source stack, and the credits screen is a shipping blocker

Natural Earth (public domain) + GeoNames `cities15000` (CC BY 4.0) + NGA Pub 150/151 (US Government
public domain). **Every edge is synthesised**, not extracted. OpenStreetMap, Overture's
transportation theme, OpenFlights and GRIP are disqualified — the argument, with clause numbers and
quoted text, is `docs/geo-data-licensing.md` §2, and the short form is that ODbL §4.6 reaches
through a Produced Work and would oblige us to publish our route graph free of charge.

Two consequences that are not obvious and must not be lost:

- **CC BY 4.0 binds on distribution, and the screen that would satisfy it does not exist.**
  `apps/mobile` has zero workspace dependencies and a 24-line placeholder route. Geo data is
  committed **pending** a credits screen. **Shipping a build to any app store is blocked until one
  exists and renders the §4 block verbatim.** Naming that blocker is Phase 3's deliverable; building
  the screen is not.
- **The attribution block renders in English regardless of app locale.** A translated licence notice
  is a modified licence notice. Only the heading is translated. That is a **second narrow exemption
  to CLAUDE.md rule 2.4**, alongside the place-name exemption in ADR 0028, and both are bounded by
  being enumerated here rather than by being remembered.

## Decision 2 — node ids derive from a stable source key, never from a selection ordinal

This is the precondition for everything hand-authored in the phase, and it blocks starting.

```
settlement       n.city.g<geonameid>                       n.city.g3173435
port             n.port.g<geonameid> | n.port.wpi<index>
border crossing  n.border.<hash8 of its two adjacent settlement ids, sorted>
waypoint         n.way.<hash8 of parent edge id>_<ordinal along the edge>
edge             e.<fromHash8>__<toHash8>
```

The `g` / `wpi` prefixes exist because `ID_PATTERN` (`packages/content/schema/common.ts:64`)
requires every dot-separated segment to start with a letter — `n.border.017` is rejected.

**Why it matters more here than anywhere else in the repo.** CLAUDE.md §6 says ids are permanent,
but `nodeId()` and `edgeId()` (`ids/content-ids.ts:33-34`) are bare casts with no registry and no
validation, and `RouteState.nodes` is baked into `RunState` and hashed into every golden digest.
With ordinal ids, one score-weight tweak or one widened bounding box silently re-points every
`overlay.yaml` ferry row, every corpus route and every saved run at a **different real place**, and
nothing in the repo catches it.

Three properties were checked on paper before accepting: an id from `geonameid` survives a
score-weight change; a border id hashed from its two adjacent settlement ids survives a bbox
widening; a waypoint id derived from its parent edge survives a densification-threshold change.
**That is what makes M3.11 — scaling 180 nodes to 1,200 — a data commit rather than a re-author.**

## Decision 3 — geography is a build-time input, not a `ContentRegistries` member

`content-pack.ts:46-71` states the membership criterion: a thing belongs inside `ContentRegistries`
**if and only if it can change how an existing run plays**. A `RouteState` is materialised at run
construction and lives in `RunState`, so a geography edit cannot reach an in-flight or replayed run.

Putting geo in the pack would therefore stale all nine golden runs and both sim baselines on every
geography edit, and make `reconcileContent` report `changed: true` for an edit that provably cannot
affect the player. `GeoGraph` is a parameter to `generateRoutes` exactly as `ContentPack` is a
parameter to `advanceLeg` — built outside, never loaded inside. The engine never reads a file.

## Decision 4 — what a geo file may not record

CLAUDE.md §11 already forbids a per-country danger index. Three rules extend it to data the linter
can actually check:

- **No `countryCode` in any shipped file, on any node type.** There is no game consumer (the
  predicate DSL has no country kind, `regionId` is abstract, §11 forbids per-country difficulty),
  and point-in-polygon makes a political assignment for every disputed territory and ships it as
  fact. `cc` is used at build time to detect that an edge crosses a boundary, then discarded.
- **No `unofficialCrossing` flag.** A per-edge "there is an unofficial crossing here" boolean on an
  edge joining two real named places is a per-place danger index at _finer_ granularity than the
  per-country one §11 names, and `rules-safety.ts` scans the locale rather than data files, so it
  would be structurally invisible. **The replacement is strictly stronger and costs nothing:** store
  `adminBoundary` (a geometric fact — the segment crosses an admin polygon boundary) and derive
  `viaCrossingNode` from whether an endpoint is a `border_crossing` node. Four profiles mask out
  `adminBoundary && !viaCrossingNode`; `illicit` permits it. **The graph records where a boundary is
  and where a controlled crossing is. It records nothing about what happens at either.**
- **Border-crossing nodes are typed, never named.** `name: null`, enforced by `GEO_NAMED_BORDER`.
  The UI composes "a border crossing, 40 km past Bergamo" from the type key and the previous node.

**`services` is derived, not authored**, from `(type, populationBand)` — GeoNames carries no services
data, and an undocumented derivation is unreviewable for §11. Published here so it is reviewable:

| Population band          | fuel | lodging | medical | market | transit | repair |
| ------------------------ | :--: | :-----: | :-----: | :----: | :-----: | :----: |
| `metro`, `large` (≥500k) |  ✓   |    ✓    |    ✓    |   ✓    |    ✓    |   ✓    |
| `medium` (100k–500k)     |  ✓   |    ✓    |    ✓    |   ✓    |    —    |   ✓    |
| `small` (25k–100k)       |  ✓   |    ✓    |    —    |   ✓    |    —    |   ✓    |
| `hamlet` (<25k)          |  ✓   |    —    |    —    |   ✓    |    —    |   —    |
| `none`                   |  —   |    —    |    —    |   —    |    —    |   —    |

| Type override     | effect                  |
| ----------------- | ----------------------- |
| `port`            | add `transit`, `repair` |
| `rest_stop`       | `fuel`, `lodging` only  |
| `border_crossing` | `fuel` only             |
| `roadside`        | none                    |
| `wilderness`      | none                    |

Every input is settlement size or physical type. Nothing reads a place.

**`eventDensity` is cut entirely.** It has no consumer, it is a fourth difficulty encoding alongside
`terrainDifficulty`, the director multipliers and tension with no stated relationship between them,
and it is the only one that is per-place. Per-mode `hours` and `cost` are cut for the same
no-consumer reason — they are computed by the cost functions at generation time.

## Decision 5 — zero new dependencies, by policy rather than by luck

**This repo never parses a source geographic format at build time. Sources are converted once, out
of tree, and the derived artifact is committed. `packages/tools/geo-build` transforms committed
artifacts into committed artifacts.**

That is affordable because GeoNames is tab-separated (`split('\t')`), Natural Earth publishes
GeoJSON so no shapefile reader is needed, haversine is eight lines and RDP simplification is
twenty-five. `.claude/settings.json` denies `pnpm add` outright, so a dependency here is a
deliberate human action, not a drift.

## Decision 6 — determinism, and the rule the obvious seven miss

Seven rules make the build reproducible: no randomness; no clock reads except the recorded retrieval
date; quantise every float before serialisation; a custom serialiser with explicit field order,
never raw `JSON.stringify`; a documented total sort; LF, trailing newline, no BOM; and `--check`
byte-compares a regeneration.

**Rule 8, the epsilon rule.** Those seven quantise the _output_. Every _decision_ boundary — the
Gabriel in-circle test, the Poisson-disk `dist < r`, the 25 km water sampling, the 40 km crossing
merge, the 2-hop prune, the radius bisection — is a `<` on `atan2`/`sin` output. One ULP flips a
comparison, changes the selected set, and rewrites both files. So: any pair falling inside a
documented band (`|a − b| < 1e-6 × scale`) is resolved by the integer tie-break key rather than by
the float, and **`--stage=audit` prints the count of epsilon resolutions**. Until that count is zero
and stable across Node majors, `geo:check` is a non-blocking, path-filtered CI job rather than a gate.

Selection order key, total so no ties survive:
`(−score, −population, round(lat×1e5), round(lng×1e5), geonameid zero-padded to 10)`, compared with
`<`/`>` and never `localeCompare`. The **file** is then re-sorted by node id, so on-disk order is
independent of selection order and a score-weight change produces a reviewable diff rather than a
reshuffle.

## Decision 7 — bulk in JSON, the overlay in YAML, endpoints by id

| File                               | Kind                                                         |
| ---------------------------------- | ------------------------------------------------------------ |
| `overlay.yaml`                     | hand-authored, the **only** file a human edits               |
| `nodes.gen.json`, `edges.gen.json` | generated, one record per line                               |
| `world.simplified.json`            | generated from NE 50m, LOD-tiered, < 400 KB                  |
| `corpus-routes.json`               | generated, reviewed as a diff                                |
| `sources.lock.json`                | URL, SHA-256, licence, retrieval date, build-host Node major |

`JSON.parse` on 400 KB is single-digit milliseconds and this parses at app start; `yaml.parse` is
two orders worse. The loader convention holds regardless: `loadGeo(dir)` takes a directory and
returns issues rather than throwing.

**Endpoints are stored as ids, not array indices.** The ~50 bytes per edge that indices would save
defeats the only endpoint check available — an out-of-range index is detectable, a
wrong-but-in-range index is not, and nothing would bind `edges.gen.json` to the `nodes.gen.json` it
was generated against. An id is self-checking. A `nodesDigest` header with `GEO_NODES_DIGEST_STALE`
closes the rest.

**The cost, stated so nobody rediscovers it:** `loader/locate.ts` needs a YAML `Document`, so every
finding in a `.gen.json` lands at `:1:1`. The mitigation is a hard requirement on rule authors —
**a geo lint message names the overlay row that caused it, not the symptom**. `overlay.yaml forced
corridor 'sinai' produced a 612 km edge (empty D_max 450)`, never `edges.gen.json:1:1 edge too long`.
A finding at `:1:1` that names the cause beats a precise line number that names nothing.

## Consequences

- `packages/content/geo/` stops being a `.gitkeep`. `structure.test.ts:15` already required it.
- `packages/content/package.json` gains a third subpath export, `"./geo"`. That makes the commit a
  `ROOT_TRIGGERS` commit under `gate-commit.mjs:37-45`, so it pays the full-monorepo DoD.
- `.prettierignore` gains `packages/content/geo/*.gen.json` and `corpus-routes.json` — one record per
  line is load-bearing, and `lint-staged` runs `prettier --write` on `*.json`, which would make
  `geo:check`'s byte comparison permanently red. The precedent is `docs/sim-baseline*.md`.
- `content-stats` gains nothing. `stats.test.ts:175-187` asserts there is no region axis and its
  written reason ("geo/ is empty") goes stale here; the comment is rewritten, the assertions stand.
- `GEO_NAMED_BORDER` and `GEO_PLACE_BEHAVIOUR` are **errors** while `rules-safety.ts`'s §11 rules are
  warnings. The asymmetry is deliberate: those two are structural — "a node typed `border_crossing`
  has a non-null `name`" admits no false positive — while a regex over prose does.
