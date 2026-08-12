# Geographic data: sources, licences, and the attribution we must ship

> **Not legal advice.** This is an engineering record of what was checked, when, and against which
> primary source. Every operative claim below links the licence text it came from. Claims that could
> **not** be confirmed from a primary source are marked **[UNVERIFIED]** and are not relied on.
>
> Written at Phase 3 M3.0, 2026-08-09. The decision it records is binding on
> `packages/content/geo/` and `packages/tools/geo-build/`.

---

## 1. The decision, and what it excludes

Odyssey needs ~1,200 place nodes, ~3,000 edges between them, and a simplified world outline for
rendering, shipped inside a **closed-source commercial** mobile game.

| Source                                        | Licence                                                                   | Status              | What we take                                                                                             | What we owe                              |
| --------------------------------------------- | ------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **Natural Earth**                             | Public domain                                                             | ✅ accepted         | country polygons, land boundary lines, ports, railroads, geography regions, 50m land                     | nothing (attribution voluntary)          |
| **GeoNames `cities15000`** + `alternateNames` | CC BY 4.0                                                                 | ✅ accepted         | `geonameid`, `asciiname`, lat, lng, `population`, `dem`, `feature code`, language-tagged alternate names | **attribution, binding on distribution** |
| **NGA Pub 150 / Pub 151**                     | US Gov work, 17 U.S.C. §105                                               | ✅ accepted         | port locations; inter-port distances, **for calibration only**                                           | non-endorsement line                     |
| **OpenStreetMap**                             | ODbL 1.0                                                                  | ❌ **disqualified** | —                                                                                                        | see §2                                   |
| **Overture Maps** transportation theme        | ODbL 1.0                                                                  | ❌ disqualified     | —                                                                                                        | OSM-derived by construction              |
| **OpenFlights**                               | ODbL 1.0                                                                  | ❌ disqualified     | —                                                                                                        | same share-alike trap                    |
| **GRIP** global roads                         | contradictory (CC-0 / CC BY 4.0 / ODbL, depending on which page you read) | ❌ disqualified     | —                                                                                                        | see §2.4                                 |
| **Every edge in this game**                   | ours                                                                      | derived             | **nothing** — edges are synthesised geometrically from node coordinates and Natural Earth polygons       | —                                        |

**That last row is the load-bearing one.** No road, rail or ferry network is extracted from any
licensed database. Corridor topology is generated from node geometry and hand-curated in
`packages/content/geo/overlay.yaml`; distances are great-circle × a per-terrain circuity factor
calibrated against a checked-in sample (§6). This is what keeps the whole dataset out of ODbL's
reach, and it is the sentence to read first.

---

## 2. Why OpenStreetMap is disqualified

Not a licence-compatibility quibble — a direct conflict with shipping a closed product.

### 2.1 The shipped graph would be a Derivative Database, not a Produced Work

ODbL 1.0 §1 defines a **Derivative Database** as "a database based upon the Database, and includes
any translation, adaptation, arrangement, modification, or any other alteration of the Database or
of a Substantial part of the Contents", and a **Produced Work** as "a work (such as an image,
audiovisual material, text, or sounds) resulting from using the whole or a Substantial part of the
Contents".

The OSMF **Produced Work Guideline** gives the test in one line: _if the published result is
intended for the extraction of the original data, it is a database and not a Produced Work._ An
edge table consumed by a route engine and trivially readable out of the app bundle is a database.

### 2.2 §4.6 reaches through the Produced Work anyway

Even granting that the _game_ is a Produced Work — §4.5(b) says building one "does not create a
Derivative Database for purposes of Section 4.4" — §4.6 is explicit that if you publicly use "a
Derivative Database **or a Produced Work from a Derivative Database**", you must offer recipients a
machine-readable copy of the entire derived database, "free of charge if distributed over the
internet". The OSMF's own Produced Work Guideline restates this.

**Net effect:** the game code stays closed, and the curated route graph — the most labour-intensive
content asset in the project — becomes an open dataset anyone may take, hosted by us, for free.

### 2.3 Mixing sources in one table is what triggers it

The **Collective Database Guideline** keeps data collective only when, within a region, "the data
used for a particular data type is either all OSM or all non-OSM" and the datasets "do not
reference each other". A `nodes` table carrying GeoNames `population` _and_ an OSM-derived
`border_crossing` flag on the same record is one feature type with mixed provenance — a Derivative
Database, and the whole table falls under §4.4.

> **This is the schema rule that protects the position:** never write an OSM-derived value into any
> file in this repo. `packages/content/geo/` starts empty, so this is cheap to hold now and
> expensive to unwind later. It is enforced, as far as a rule can be, by `GEO_OSM_SOURCE` (§7).

### 2.4 The routes that look like escapes, and are not

- **"We only ship derived numbers."** The **Substantial Guideline** puts insubstantial at "less than
  100 Features", or more only if "non-systematic and clearly based on your own qualitative
  criteria", and adds: _"we regard repeated small extractions as one big extraction"_. Deriving
  ~3,000 intercity distances by systematically routing the global network is Substantial on
  quantity, systematicity and geography at once. The **Trivial Transformations Guideline** further
  confirms that "calculating travelling distances" keeps the result OSM-derived, and its exemption
  is conditioned on "no other source of data is involved" — which fails the moment GeoNames nodes
  are joined to OSM edges.
- **The Geocoding Guideline.** Permits storing results alongside proprietary data, but only for
  results containing "names, addresses, and/or latitude/longitude" that are "not a systematic
  attempt to aggregate all or substantially all Primary Features of a given type" over a city-sized
  or larger area. A 3,000-edge connectivity graph is precisely the excluded case. We do not need it
  for coordinates in any event — GeoNames supplies those under CC BY.
- **GRIP.** globio.info calls it CC-0; the World Bank catalog calls it CC BY 4.0; other mirrors call
  it ODbL — and globio states GRIP4 "is based on many different sources (including OpenStreetMap)".
  A CC-0 grant cannot be made over OSM-derived content. Three mutually exclusive licence claims for
  one dataset is disqualifying on its own, before the laundering problem.
- **Overture** is the proof by example: a Meta/Microsoft/Amazon/TomTom consortium ships its
  transportation theme under **ODbL** while its other themes are CDLA-Permissive, precisely because
  transportation is OSM-derived.

**If OSM is ever reconsidered**, the attribution obligation is "© OpenStreetMap contributors" _plus_
a clear statement that the data is available under the Open Database License — and §4.6's
machine-readable offer. Do not adopt it without revisiting this whole document.

---

## 3. Accepted sources, in detail

Exact bytes are pinned in `packages/content/geo/sources.lock.json` (URL, SHA-256, licence,
retrieval date, build-host Node major). That file is the authority on _which_ revision was used;
this section is the authority on _why it is allowed_.

### 3.1 Natural Earth — public domain

- **Licence page:** <https://www.naturalearthdata.com/about/terms-of-use/>
- Operative text: _"All versions of Natural Earth raster + vector map data found on this website are
  in the public domain."_ · _"No permission is needed to use Natural Earth. Crediting the authors is
  unnecessary."_ Commercial use is explicitly invited.
- **No attribution is required.** We ship it anyway as a courtesy (§4).
- ⚠ The site **footer** reads "© … All rights reserved." That is WordPress theme boilerplate and
  contradicts the Terms of Use page, which is the operative statement. **Archive the terms page
  alongside the lock file** when sources are fetched at M3.4.

| Layer                                | Used for                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------- |
| `ne_10m_admin_0_countries`           | polygon adjacency → border detection; point-in-polygon at build time        |
| `ne_10m_admin_0_boundary_lines_land` | the boundary geometry a candidate edge is intersected against               |
| `ne_10m_ports`                       | port node candidates                                                        |
| `ne_10m_railroads`                   | a **proximity predicate** only — whether an edge may carry the `train` mode |
| `ne_10m_geography_regions_polys`     | terrain classification for nodes and waypoints                              |
| `ne_50m_land`                        | water rejection for candidate edges, and the render outline (§5)            |

### 3.2 GeoNames — CC BY 4.0

- **Licence statement**, identical on three GeoNames-owned surfaces: <https://www.geonames.org/>,
  <https://www.geonames.org/about.html>, and
  <https://download.geonames.org/export/dump/readme.txt> — _"This work is licensed under a Creative
  Commons Attribution 4.0 License"_.
- **Commercial use:** <https://www.geonames.org/export/> — _"commercial usage is allowed"_, and
  _"You should give credit to GeoNames … with a link or another reference to GeoNames."_
- **[UNVERIFIED]** the date GeoNames moved from CC BY 3.0 to 4.0. No primary announcement was found.
  What is certain is that **4.0 is what GeoNames publishes today** on all three of its own surfaces.
  Any third-party page still citing 3.0 is stale.

CC BY 4.0 §3(a)(1) requires retaining creator identification, a notice referring to the licence, a
notice referring to the disclaimer of warranties, a URI to the material, **and an indication that
the material was modified**. §3(a)(2) allows satisfying this "in any reasonable manner based on the
medium" — for a mobile game, an in-app credits screen.

We _are_ modifying: filtering ~25,800 rows to ~1,200, banding population, quantising coordinates,
re-encoding. The "modified" line in §4 is not optional.

| File                 | Columns consumed                                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cities15000.zip`    | `geonameid`, `name`, `asciiname`, `latitude`, `longitude`, `feature code`, `country code` (**build-time only**), `population`, `dem`                                            |
| `alternateNames.zip` | `geonameid`, `isolanguage`, `alternate name`, `isPreferredName`, `isShortName`, `isColloquial`, `isHistoric` — for the Latin-script endonym and the exonym overrides (ADR 0028) |

**`dem`, not `elevation`.** Both exist; `elevation` is frequently null while `dem` (the ~90 m/~900 m
digital elevation model average) is populated consistently.

**`country code` never reaches a shipped file.** It is used to detect that an edge crosses an
administrative boundary and is then discarded — see ADR 0024 and CLAUDE.md §11.

### 3.3 NGA Pub 150 (World Port Index) and Pub 151 (Distances Between Ports)

- Works of the United States Government, **not subject to copyright** under 17 U.S.C. §105. Pub 150
  carries the notice _"NO COPYRIGHT CLAIMED UNDER TITLE 17 U.S.C."_
- **[UNVERIFIED]** direct fetch: `msi.nga.mil` returned HTTP 403 to an automated request during
  research. The public-domain status is corroborated from the publications' own copyright notices
  via secondary sources. **Re-verify by hand before M3.4 writes the lock file.**
- **[UNVERIFIED]** Pub 151's machine-extractability. It is published as a PDF. If table extraction
  proves impractical, sea-leg calibration falls back to a hand-entered sample and this document
  records that instead.
- No attribution is required. A non-endorsement line is conventional for US Government data and is
  included in §4.

---

## 4. The attribution block we must ship

**Rendered in English regardless of app locale. Only the heading is translated.** A translated
licence notice is a modified licence notice. This is a deliberate, narrow exemption to CLAUDE.md
rule 2.4 and it is recorded in ADR 0024 alongside the place-name exemption.

> **Map and place data**
>
> Place names, coordinates, population and elevation are based on data from **GeoNames**
> (https://www.geonames.org), used under the **Creative Commons Attribution 4.0 International**
> licence (https://creativecommons.org/licenses/by/4.0/). The data has been filtered, thinned and
> reformatted for this game.
>
> Country outlines, coastlines, boundary lines, ports and railway lines are from **Natural Earth**
> (https://www.naturalearthdata.com), which places its map data in the **public domain**.
>
> Port locations and inter-port distances are derived from the **World Port Index (Pub. 150)** and
> **Distances Between Ports (Pub. 151)**, published by the **U.S. National Geospatial-Intelligence
> Agency**. These are works of the United States Government and are in the public domain. The NGA
> does not endorse this product.
>
> Routes, edges, travel times and costs in this game are generated and are not derived from any road
> database. They are fiction.

### Where it must appear

| #   | Location                                                                             | Binding?                                                  |
| --- | ------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| 1   | this file                                                                            | repo policy                                               |
| 2   | `packages/content/geo/sources.lock.json` — `license`, `attribution`, `url` per entry | repo policy; `GEO_OSM_SOURCE` reads it                    |
| 3   | **in-app credits screen**, reachable from the title screen and Settings              | **legally binding** — CC BY 4.0 obliges on _distribution_ |
| 4   | journal / end-of-run export, if it ever embeds a map image                           | required if it ships                                      |
| 5   | app-store third-party-notices field                                                  | conventional                                              |
| 6   | repo README                                                                          | conventional                                              |

> ### ⚠ Blocker on store distribution
>
> **Row 3 does not exist.** `apps/mobile` has zero workspace dependencies and a 24-line placeholder
> route; there is no credits screen and no settings screen. Geo data is committed to this repo
> **pending** one.
>
> **Shipping a build to any app store is blocked until the credits screen exists and renders the
> block above.** Naming that blocker is Phase 3's deliverable; building the screen is not. See
> ADR 0024.

---

## 5. Render geometry

`world.simplified.json` is derived from **`ne_50m_land`**, RDP-simplified, LOD-tiered, budgeted
under 400 KB. Public domain, so no obligation attaches.

**50m and not 110m, deliberately.** Nodes are selected against the 10m coastline. Drawn against a
110m outline, coastal cities render tens of kilometres out to sea — the most visible defect this
dataset could ship.

---

## 6. Calibration, and how wrong it is

Edges are great-circle distance × a circuity factor **per terrain class**. A single global constant
is roughly right on plains and badly wrong in mountains, so the factor is calibrated, not chosen.

- **Fixture:** `packages/tools/geo-build/__fixtures__/road-distances.json` — 35 hand-looked-up real
  city-pair road distances spanning plain / hill / mountain / desert / coast. Checked in, with the
  source and date of each lookup.
- **Sea legs** calibrate separately against NGA Pub 151.
- `--stage=audit` prints the residual distribution (mean, p50, p90) per terrain class.

| Terrain class | Factor | Residual mean | Residual p90 | Measured             |
| ------------- | ------ | ------------- | ------------ | -------------------- |
| plain         | —      | —             | —            | **not yet measured** |
| hill          | —      | —             | —            | **not yet measured** |
| mountain      | —      | —             | —            | **not yet measured** |
| desert        | —      | —             | —            | **not yet measured** |
| coast         | —      | —             | —            | **not yet measured** |
| sea (Pub 151) | —      | —             | —            | **not yet measured** |

> **This table is filled at M3.5 from a real run and not before.** It is the largest single
> unverifiable in the phase, and leg-count scaling is downstream of these distances, so the achieved
> accuracy is recorded as a number rather than assumed. The widely-cited 1.2–1.3 intercity circuity
> figure is a transport-geography rule of thumb and is **[UNVERIFIED]** here — it is a starting point
> for the bisection, not a result.

---

## 7. The OSM firewall

`GEO_OSM_SOURCE` (a `content:lint` **error**) enforces:

- **host allowlist** on every `sources.lock.json[].url`: `naturalearthdata.com`, `geonames.org`, the
  NGA host. Anything else fails.
- **keyword scan** — `openstreetmap|overture|openflights|grip|geofabrik|odbl` — over _every string
  value_ in the lock file, not selected fields. (Scoping it to `source`/`provenance` keys was the
  first draft's hole: a `geofabrik.de` URL under a `url` key with `license: public-domain` passed.)
- `license` ∈ `{public-domain, cc-by-4.0, us-gov-public-domain}`.
- any object key matching `/^osm/i` or `/_osm(_|$)/i`, or any string value matching
  `/(^|[^a-z])osm[:_-]/i`, in `nodes.*`, `edges.*` or `overlay.yaml`.

**No regex can detect an OSM-derived _value_.** A latitude copied out of an OSM node looks like any
other latitude. The real controls are the fetch allowlist, the SHA-256 pin, and review. The rule
catches carelessness, not intent — and this paragraph exists so nobody mistakes it for more.

---

## 8. Build-host pin

`sources.lock.json` records the Node major used to generate the artifacts.

`packages/tools/geo-build/geodesy.ts` is the only module in the repo that uses `Math.sin`,
`Math.atan2` and friends — legal there because `packages/engine/src/__tests__/purity.test.ts` walks
`packages/engine/src` only. **Legal is not stable.** ECMAScript marks those functions
implementation-approximated, so a Node upgrade can shift a last-bit result, flip a `<` at a
selection boundary, and rewrite both artifacts. `geo:build --check` is a byte comparison and would
report that as a diff on a PR that touched nothing.

The mitigation is the epsilon rule (ADR 0024): decisions falling inside a documented band are
resolved by an integer tie-break key, and `--stage=audit` prints the count of epsilon resolutions.
Until that count is zero and stable across Node majors, `geo:check` runs as a non-blocking,
path-filtered CI job.

---

## 9. Re-verification checklist

Run this before upgrading any source, adding a source, or shipping a store build:

1. Re-read each licence page in §3 and diff against the quoted text. Archive a copy.
2. Confirm `sources.lock.json` SHA-256 values still match what the URLs serve.
3. Confirm the Natural Earth Terms of Use page still says public domain (the footer still won't).
4. Confirm GeoNames still publishes CC BY 4.0 and still permits commercial use.
5. Re-run `pnpm content:lint` and confirm `GEO_OSM_SOURCE` is silent.
6. Confirm the credits screen renders §4 verbatim, in English, and is reachable.
7. Re-run `pnpm geo:build -- --check` on the pinned Node major.
8. If any edge attribute has gained a new derivation, add it to §1's "fields not taken from any
   source" claim or correct that claim.
