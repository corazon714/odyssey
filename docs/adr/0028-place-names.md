# 0028 — Place names: a data field for real proper nouns, keys for everything else

- **Status:** Accepted
- **Date:** 2026-08-09
- **Amends:** `CLAUDE.md` rule 2.4
- **Relates to:** ADR 0009 (type ownership), ADR 0024 (geography data)

## Context

Rule 2.4 says: _"No user-visible string literals in code or content data. Only i18n keys."_ It is
true by construction today — an event file has no text field to type prose into, and
`I18N_KEY_PATTERN` (`schema/common.ts:106-110`) rejects anything that is not a key, with the message
_"must be an i18n key, not user-visible text"_.

Phase 3 introduces ~1,200 real city names. There is **no precedent for a proper noun anywhere in the
repo**, and the design goes out of its way to make them impossible: `routes.json:9-10` uses
`origin`/`waypoint_a`/`destination` with a header citing rule 11; `location-type.ts:1-10` says
keeping the list to _types_ means _"there is nowhere to put a nationality"_; `declarations.ts:99-103`
requires NPC **archetypes** for the same reason.

The one existing exemption is `declarations.ts:23-25` — `description` is developer documentation and
rule 2.4 does not apply _because nothing renders it_. A city name on a map screen is rendered, so
that exemption does not reach.

## Decision 1 — a `name` field on geo node records, and nothing else

`GeoNode` records in `packages/content/geo/nodes.gen.json` carry `name`. This is a **narrow,
enumerated exemption to rule 2.4**, and rule 2.4's text is amended in the same commit as this ADR so
the constitution and the code do not disagree.

**The scope is a rule, not a judgement call:** the exemption covers **proper nouns of real places
only** — node names, and region labels if they are ever added. It does not extend to node `type`,
`services`, `terrain`, seasonality, or anything else an author might later be tempted to put in a
data file. Those are prose or vocabulary and they take keys.

That boundary is checkable rather than remembered, in three ways:

- `name` is a field on exactly one Zod schema, `geoNodeSchema`. `GEO_NAME_FIELD_MISPLACED` is a lint
  **error** on a `name` key appearing in any other content file.
- `type`, `terrain`, `services` and `seasonality` are closed vocabularies (`z.enum(...)`). There is
  no free-text field to abuse.
- `GEO_NAMED_BORDER` (error) forbids a non-null `name` on a `border_crossing` node — those are typed,
  never named (ADR 0024 Decision 4).

## Decision 2 — `name` holds the Latin-script endonym, falling back to `asciiname`

`name` is the local form where the country's primary language uses Latin script — Wien, Praha,
Kraków, København, München, Lisboa, Napoli, İstanbul — and GeoNames `asciiname` otherwise — Beijing,
Moskva, Cairo. Three reasons, in order of how much they cost to get wrong:

1. **Glyph coverage.** True endonyms need CJK, Arabic, Thai, Devanagari, Cyrillic and Greek in the
   map font. React Native font fallback is inconsistent across Android OEMs, and a missing glyph
   renders as tofu — a rendering failure with no fallback, in the one field that has no i18n key by
   design.
2. **Bidi.** Arabic and Hebrew labels in an SVG map need bidi-aware layout the map layer will not
   have.
3. **Derivability.** GeoNames `name` is _not_ reliably the endonym — Vienna's is "Vienna". Getting
   true endonyms means joining `alternateNames` on the country's primary language, which is ambiguous
   for Belgium, Switzerland, Canada and India and would need a hand-curated language-per-country
   table. **That is a per-country data file, which is the shape CLAUDE.md §11 warns against.**

The Latin-script rule captures nearly all of the road-sign texture the design wants, because the
European corridor — where the exonym gap is actually felt — is Latin script throughout.

## Decision 3 — there is no `nameKey` field; overrides live per locale

The lookup is `geo.node.<id>.name` in the active locale, falling back to the data `name`. No node
field, no `nameKey`, no per-node boolean.

**The consequence that makes this the right shape: `i18n/en/` gains no geo keys at all**, because
`name` is already the form English should render. So `locale.test.ts:137-143`'s no-orphan assertion
and `requiredKeys()` (`:79-86`) are untouched by this phase. A `nameKey` field would have required
extending `requiredKeys()` to enumerate the graph, and a full-keys approach would have added ~1,200
keys to `en` alone.

**Completeness is a per-locale rule, because one rule cannot govern two different problems.** Russian
is a _script change_: every node needs an entry or the map is mixed-script. German and Turkish are
_spelling changes_: most nodes are already correct. So a locale manifest flags
`requiresTransliteration`, and:

| locale kind            | rule                                                                          | severity                           |
| ---------------------- | ----------------------------------------------------------------------------- | ---------------------------------- |
| flagged (`ru`)         | every node must have `geo.node.<id>.name`                                     | `GEO_LOCALE_INCOMPLETE`, **error** |
| unflagged (`de`, `tr`) | a derived preferred alternate name that differs from `name` should be shipped | **warning**                        |

This is a deliberate refinement of the "must resolve in all four locales or it is an error" rule it
replaces: that version would force ~1,200 German entries identical to the data field, which is the
kind of busywork that gets a check disabled.

## Decision 4 — the exonym set is generated by a stated criterion, then reviewed

Not a to-do. A node gets an override in locale L **iff `alternateNames` has an entry tagged L that is
`isPreferredName` or `isShortName`, not colloquial and not historic, and differs from `name`.** That
is mechanical, derived from a licensed source, and reproducible.

Expected magnitude: `en` ≈ 0, `de` ≈ 60, `tr` ≈ 80, `ru` ≈ 1,200 (script). The generated set gets one
human review pass before it ships — see the open question below.

## Decision 5 — the DEMONYM carve-out is refused, and the premise it rested on is wrong

The proposal was to make `rules-safety.ts`'s demonym scan skip geo keys, on the grounds that 1,200
city names would produce 1,200 false positives and _"false positives everyone learns to ignore are
how a safety check dies"_. The second half is right. The first half is false.

`SAFETY_GROUP_BEHAVIOUR` (`rules-safety.ts:32-38`) requires a demonym **and** a behaviour token
within 40 characters in the same value, and `contentSafety` scans `bundle.locale` only (`:56-60`). A
value that is just a place name — "Tehran", "Milano" — matches the demonym half and nothing else, so
it produces **zero findings**. Weakening the rule for `geo.` keys would buy a blind spot for nothing.

Instead, coverage is **extended**:

- a regression test proving a bare place name does not warn, and that the same string next to a
  behaviour word still does (guards the guard);
- **`GEO_NAME_SAFETY`** (warning) runs the existing `PATTERNS` over `nodes.gen.json` name values —
  which reaches the ~1,200 names the locale scanner structurally cannot see, since they are not
  locale entries at all.

## Consequences

- CLAUDE.md rule 2.4 gains one sentence naming this exemption and ADR 0024's attribution-block
  exemption, so the two are enumerated in the constitution rather than remembered.
- `packages/engine/src/route/`'s `GeoNode` type carries **no `name`**. The name lives in the data
  file; the engine never sees it, and `RoutePreview.notableNodes` is `readonly NodeId[]`. That is
  what makes the whole route module independent of this ADR — if this decision is reversed, no
  engine code changes.
- `rules-safety.ts` stays fully armed on every locale value, including any geo overrides.
- **Open, and it needs a human:** who reviews ~1,200 proper nouns, and against what? `GEO_NAME_SAFETY`
  catches the mechanical cases. Some place names are genuinely politically contested and no regex
  will find them. A single review pass is the current plan; whether that is sufficient, and what the
  escalation path is when a name is disputed after ship, is not decided here.
