/**
 * What KIND of test a skill check is, which is what the modifier registry keys on.
 *
 * A tag is not a skill and not a location. `negotiation` is the stat you roll; `border_crossing`
 * is where you are; a TAG is the nature of the contest — and it is the only one of the three
 * that a registry row can usefully match on, because a modifier like "you don't speak the
 * language" applies to every social contest regardless of skill or place.
 *
 * THE PAIRING RULE. A check tags the BROAD tag and its specific flavour: a bribe is
 * `[social, bribery, authority, crime]`, not just `bribery`. That is what makes `appliesTo`
 * intersection pay — "dishevelled" lands on all four social flavours, "silver tongue" only on
 * `deception`. `content:lint`'s MISSING_CHECK_TAGS enforces it; without the rule the registry
 * fragments into per-flavour duplicates, which is the problem it exists to solve.
 *
 * DEVIATIONS from the vocabulary in the Phase 2A brief, each with its reason:
 *
 *   DROPPED `border` — a location, not a kind of test. `EventContext.locationTypes` already
 *   carries `border_crossing`, and a modifier that wants to say "at a border" now says
 *   `when: { locationType: [border_crossing] }` using the predicate kind added alongside this
 *   file. Strictly more general: it serves ports, checkpoints and wilderness too.
 *
 *   ADDED `bribery` — the money spec needs "large cash raises suspicion" and "cash below a
 *   threshold locks out bribes" as registry rows. `haggle` is commerce; bribery is money plus
 *   authority plus criminal exposure, and a modifier for one must not fire on the other.
 *
 *   ADDED `documents` — passport, visa and ticket form a subsystem with a predicate kind, an
 *   effect op and a container link, and no tag. Being inspected is not `authority` alone.
 *
 *   ADDED `search` — required by the container model. `stealth` is hiding yourself and
 *   `perception` is noticing something; being searched is a distinct contest where a
 *   container's searchDC and an item's concealability apply, and those modifiers would
 *   otherwise have nowhere to land.
 *
 *   ADDED `language` — `Skills.languages` exists in state and NOTHING reads it. One
 *   `no_shared_language` row replaces the same modifier hand-copied into every social event,
 *   which is the D1 problem in miniature.
 *
 * `luck` is the thinnest of these: no skill backs it, so it can only ever collect flat charm
 * and superstition modifiers. Kept, flagged, and worth removing in Phase 2B if the registry
 * leaves it empty.
 */
export const CHECK_TAGS = [
  // ── social family. Tag the broad one AND the flavour. ──────────────────────────────────
  'social',
  'haggle',
  'deception',
  'intimidate',
  'authority',
  'bribery',
  'language',

  // ── getting away with something ────────────────────────────────────────────────────────
  'stealth',
  'crime',
  'search',
  'documents',

  // ── body and craft ─────────────────────────────────────────────────────────────────────
  'physical',
  'endurance',
  'mechanics',
  'medical',

  // ── road sense ─────────────────────────────────────────────────────────────────────────
  'navigate',
  'perception',
  'luck',
] as const;

export type CheckTag = (typeof CHECK_TAGS)[number];

/**
 * The tag a skill implies, used by `content:lint`'s MISSING_CHECK_TAGS rule.
 *
 * A `negotiation` check that does not tag `social` is starved of every social modifier in the
 * registry, and the author will not notice because the check still rolls. The mapping is not
 * enforced by the engine — a check may legitimately tag more than its skill implies, and
 * `endurance` on a `physical` check is fine — but its ABSENCE is always a mistake.
 */
export const SKILL_IMPLIES_TAG = {
  negotiation: 'social',
  stealth: 'stealth',
  mechanics: 'mechanics',
  streetwise: 'crime',
  endurance: 'endurance',
} as const satisfies Record<string, CheckTag>;
