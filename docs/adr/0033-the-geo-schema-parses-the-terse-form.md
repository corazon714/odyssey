# 0033 — The geo schema parses the terse on-disk form, and declares the headers it cannot drop

- **Status:** Accepted, implemented 2026-08-12
- **Date:** 2026-08-12
- **Changes:** `packages/content/schema/geo.ts`, `packages/content/loader/load-geo.ts`,
  `packages/tools/content-lint/rules-geo.ts`, `packages/content/geo/overlay.yaml`, CLAUDE.md §3
- **Relates to:** ADR 0009 (schema ownership), ADR 0024 (geo sources and node identity),
  ADR 0028 (place names)

## Context

M3.6's brief was "write a loader and some lint rules". It came with one warning: every schema in
this repo is `strictObject`, and the three geo files carry metadata keys (`_format`, `digest`,
`count`, `nodesDigest`, `_comment`, `_tolledComment`) that a file-level schema would reject.

That warning was right and incomplete. **The record schemas could never have parsed a committed
artifact either**, and nobody had noticed because nothing had ever tried.

`geoNodeSchema` was written at M3.2 as a `strictObject` over canonical keys — `name`, `type`,
`terrain`, `elevationM`, `population`, `services`, `closedMonths`. `write-artifacts.ts` emits

```json
{"id":"n.city.g2267057","n":"Lisbon","y":38.72509,"x":-9.1498,"t":"city","tr":"urban","e":68,…}
```

Every key but `id` is different, and `y`/`x` had no field in the schema at all. Edges were the
same story (`a`/`b`/`d`/`m`/`td`/`sc`/`sz`/`tl`/`ab`/`uv`). The schema typechecked, satisfied its
conformance assertions, and was wrong about the only file it existed to read.

It survived because `conformance.test.ts` pins the schema's OUTPUT against the engine's `GeoNode`
and `GeoEdge`, which is a real check and a completely different one. Nothing pinned the input.

## Decision 1 — the schema's input IS the terse form

`geoNodeSchema` and `geoEdgeSchema` now parse the terse keys and transform to canonical, which is
the terse->canonical shape `predicate.ts` already uses.

The alternative was a canonical schema plus a separate mapping step. It was rejected because it
makes the record shape **two declarations**, and they drift silently: a `strictObject` over
canonical keys still accepts whatever the mapper handed it, so adding a field to the writer and
the mapper without touching the schema produces no error anywhere.

**Nothing links the writer to the schema at compile time.** They are in different packages and the
writer builds strings. `packages/content/__tests__/geo.test.ts` parses the committed artifacts
through the schemas, and that round trip is the only thing that can catch a disagreement. It is
also why that test must not be "simplified" into a synthetic fixture — a hand-built record would
pass whatever shape the schema happened to have, which is exactly how this got shipped.

## Decision 2 — the metadata headers are declared, not deleted

The obvious way to make a `strictObject` file schema pass was to delete the headers. It was
refused. Those blocks are the only record of what the abbreviations mean, where the data came
from, and which licence it carries — and the last of those is a legal claim, not a nicety.

So: `_format` is declared as `list(z.string())` — documentation for humans, and an artifact
written without one should still LOAD. `digest`, `nodesDigest` and `count` are **required**,
because they are integrity claims and an absent claim is not a satisfied one.

The overlay took the other route. Its `_comment` and `_tolledComment` arrays became real `#`
comments when it moved to `overlay.yaml`, which is what YAML is for and what the M3.6 brief
predicted. The move is byte-verified: `--stage=all --real --check` is byte-identical afterwards.

`count` is checked in the loader rather than as a Zod refinement, so the message can name both
numbers. A refinement can only say the object is wrong.

## Decision 3 — `lat`/`lng` live on the record, never on `GeoNode`

The engine bans `Math.sqrt`, `hypot` and `atan2` outright (`purity.test.ts:71`), so the only
engine use for a coordinate — a great-circle or Euclidean A\* heuristic — is unavailable by
construction. A coordinate on `GeoNode` would be a field with no legal consumer, which is a trap
rather than an affordance. Distances arrive precomputed as integer kilometres from
`packages/tools/geo-build`, where the purity test does not reach.

But dropping them in the loader was worse: the file is the map renderer's source (M3.11's
`world.simplified.json` is the basemap, these are the pins), and a field the loader silently
discarded is a field nobody finds later. They sit on `GeoNodeRecord` beside `name`, which is
already split off for the same reason — ADR 0028 keeps `packages/engine/src/route/` ignorant of
place names, and this keeps it ignorant of geometry.

`conformance.test.ts:99` asserts `z.infer<typeof geoNodeSchema>['node']` equals `engine.GeoNode`,
so the split is compiler-enforced: anything added to the record cannot leak onto the engine type
without turning that assertion red.

## Decision 4 — an absent geo directory is silence; a half-present one is not

`loadGeo` returns `{ geo: null, issues: [] }` when no geo file exists — the `readLocale`
precedent, not `loadComplications`. A missing-file `ContentIssue` becomes an `error('SCHEMA', …)`
in `load-content.ts` and would fail `lint.test.ts`'s zero-errors assertion for every milestone
before the data landed. The registries could take the opposite stance only because they shipped
empty files on day one; geo has no such file to ship.

"Two of the three files exist" is a different finding and does report: it means a build wrote one
artifact and died, or someone deleted a file by hand. Both produce a graph that is wrong rather
than absent.

`loadGeoOverlay` is a separate export because `geo-build` **writes** the two artifacts `loadGeo`
would insist on parsing. Making the build tool depend on its own outputs would make a first build
impossible and a rebuild-after-corruption impossible the same way.

## Decision 5 — the §11 rules scan raw bytes, and that is not laziness

`GEO_PLACE_BEHAVIOUR`, `GEO_NAME_FIELD_MISPLACED` and `GEO_OSM_SOURCE` read raw source and run
whether or not the bundle parsed. Every geo schema is a `strictObject`, so **a file carrying `cc`
today fails to load and `bundle.geo` is null** — a parsed-data §11 check would be silent exactly
when it matters. What these guard is the day someone adds a country code to the writer AND the
schema together, at which point the file parses perfectly and only the text objects.

The scan is over KEYS, never values. `overlay.yaml`'s justifications name real countries — "Free
in Germany, then the A36 charges from Mulhouse" — and must keep doing so: describing where a road
is priced is not a judgement about anybody who lives there. A value scan would turn every honest
justification into a §11 violation, and there is a test pinning that direction.

## Decision 6 — `GEO_UNDECLARED_BRIDGE` is a warning with a budget

Measured on the 263-node slice: **35 bridges, of which 13 strand 10 or more nodes.** A per-edge
error would be 35 findings nobody reads, and `connectivity.ts` already argued this: on a k-nearest
graph with water rejection, every fjord, peninsula and desert spur contributes a CHAIN of bridges,
so the count is an order of magnitude larger than the count of things a human would call a
lifeline.

So the rule warns once, when the number of undeclared branches stranding 10+ nodes exceeds 13. The
budget is the measured value, which means **growth is the signal** — a new lifeline is a new way
for every route to be forced through one edge.

**M3.11 scales the slice to ~1,200 nodes and this number will move.** Raising it then is a
decision to take with the new measurement in hand: if it grows faster than the node count, the
selector is producing a stringier graph, and that is worth knowing rather than waving through.

## Consequences

- `content:lint` is 19 rule entries emitting ten `GEO_*` ids. CLAUDE.md §2.4 and §11 described
  three of them in the present tense before this milestone; they are now true.
- Every geo lint message names a cause a human can act on — an `overlay.yaml` row, a bbox, or
  `pnpm geo:build`. The two `.gen.json` files are generated, so pointing at a line in them is
  useless: it cannot be edited, and the next build would overwrite the fix.
- `packages/content` exports `./geo/*`. The brief said `"./geo"`; a bare subpath would need an
  index module inside a directory that must stay pure data, and the pattern resolves today.
- **Deferred by decision, not oversight:** `GEO_EDGE_TOO_LONG` and the node-count band rule.
  Both fail on the current slice by construction, `densify-corridors.ts` is not built, and
  waypoint density is a function of the final node set — calibrating against 263 nodes means
  redoing it at 1,200. M3.11.
