import { type ModifierSourceKind } from './registry-modifier.ts';
import { type ResolvedModifier } from './resolved-modifier.ts';

/**
 * The hard ceiling on how many chips a result screen is ever asked to show.
 *
 * Seven is 08-DIVERSITY-SYSTEMS D1's upper bound and pillar 5's "readable in 15 seconds"
 * expressed as a list length. It is enforced HERE, by construction, rather than reached by
 * tuning: `collapseChips` cannot return more than this many chips for any input, so the sim's
 * over-band count is 0 for structural reasons and stays 0 when the registry grows.
 */
export const MAX_MODIFIER_CHIPS = 7;

/**
 * How many `sourceKind` chips survive when the ceiling bites. `MAX - 1` leaves exactly one
 * slot for the overflow chip, and that arithmetic is what makes a "and 1 other" chip
 * unreachable — see `overflowChip`.
 */
const KEEP_CHIPS = MAX_MODIFIER_CHIPS - 1;

/**
 * The overflow chip's label. A NOUN PHRASE, like every `check.kind.*` key, because the count
 * and the delta are composed by the renderer from `count` and `delta` rather than interpolated
 * into the string — "Everything else ×5, −3". That keeps the key free of a plural form, which
 * also keeps it clear of the open Hermes `Intl.PluralRules` risk in `docs/stack-notes.md`.
 */
export const CHIP_OVERFLOW_LABEL_KEY = 'check.overflow';

/**
 * One chip as the result screen draws it: a group of resolved modifiers, summed.
 *
 * `count === 1` is the common case and means nothing was folded — the chip keeps the row's own
 * `check.modifier.<id>` label, so a lone condition still reads "Badly hurt −2" rather than
 * "Condition −2". Only a group of two or more takes the generic `check.kind.<sourceKind>` key
 * and renders as "Condition ×3 −4".
 */
export type ModifierChip = {
  /**
   * `check.modifier.<id>` when `count === 1`, `check.kind.<sourceKind>` for a fold, and
   * `CHIP_OVERFLOW_LABEL_KEY` on the overflow chip.
   */
  readonly labelKey: string;
  /**
   * The kind this chip stands for, or `null` on the ONE overflow chip — which stands for two
   * or more kinds at once and therefore has no single kind to name.
   *
   * `sourceKind === null` IS the discriminant: it narrows in TypeScript, it is true on exactly
   * the chip whose `labelKey` is `CHIP_OVERFLOW_LABEL_KEY`, and a redundant `overflow: boolean`
   * beside it would be a second source of truth for the same fact.
   */
  readonly sourceKind: ModifierSourceKind | null;
  /** Sum of the members' `delta`. Post-diminish, post-clamp — what reached the roll. */
  readonly delta: number;
  /** Sum of the members' `rawDelta`, so a folded chip can still say "(was −6)". */
  readonly rawDelta: number;
  /** How many resolved ROWS folded in — not how many kinds. 1 means the chip is a single row. */
  readonly count: number;
  /** True when ANY member was diminished. */
  readonly diminished: boolean;
  /** True when ANY member was capped. */
  readonly capped: boolean;
  /** Member ids in resolution order — the drill-down list, and the audit trail. */
  readonly memberIds: readonly string[];
};

/**
 * Collapse the resolved rows into presentation chips: grouped by `sourceKind`, then bounded at
 * `MAX_MODIFIER_CHIPS` by folding the tail into one overflow chip.
 *
 * ## Why this exists
 *
 * M3.11 measured the corpus and found 38.5% of checks pulling more than seven chips, worst 13.
 * Design pillar 2 says the player must be able to reconstruct WHY a roll went the way it did,
 * and a thirteen-row list is not a reconstruction — it is a receipt. The number of rows the
 * registry can legitimately match is not the problem; the number of things the SCREEN asks the
 * player to hold at once is.
 *
 * ## Why `sourceKind` is the grouping key
 *
 * It is the only field on a registry row that is already an authored answer to "what KIND of
 * thing is this modifier" — a closed 12-value vocabulary the content schema enforces, and the
 * same key the non-stacking collapse in step 4 of the pipeline already groups by. Grouping the
 * presentation by the axis the mechanics already group by means a player who learns "conditions
 * do not stack" is reading the same bucket on the result screen that the rule operates on.
 * Every alternative was worse:
 *
 *  - **`check tag`** — a row can declare several `appliesTo` tags, so the group would not be a
 *    partition and a row would have to be arbitrarily assigned to one of its tags or counted
 *    twice. Counted twice breaks the sum; assigned arbitrarily is unexplainable.
 *  - **sign (`bonuses` / `penalties`)** — bounded at two chips, and destroys the "why" the
 *    pillar is about. "+6 / −8" is exactly the unreconstructable number this exists to fix.
 *  - **`sourceKind` × sign** — keeps a mixed-sign group honest, but measured WORSE than
 *    `sourceKind` alone (30.8% over band versus 27.6%) because it splits the very groups that
 *    were doing the collapsing. Mixed-sign groups are 3,073 of 175,288 — under 2%.
 *  - **magnitude buckets** — "three big penalties, four small ones" groups by the number, which
 *    is the thing already on the chip, and says nothing about cause.
 *
 * ## Why grouping alone was not enough, and what the bound adds
 *
 * Grouping by kind bounds the list at 12, not at 7, and 94.6% of corpus groups have exactly one
 * member — checks pull one row from each of eight-to-eleven DIFFERENT kinds, so there is almost
 * nothing to fold. Measured: mean 7.3 → 6.9, over band 38.5% → 30.6%, worst 13 → 11. The
 * residual is a BREADTH problem and `sourceKind` is the axis with the least depth to collapse.
 *
 * So the tail is folded instead of grouped harder. Six kind chips survive and everything else
 * becomes one chip carrying the summed delta and the row count. `MAX_MODIFIER_CHIPS` then holds
 * for every input by construction rather than by tuning a registry, which is the whole appeal:
 * the number cannot drift back out of band when `modifiers.yaml` grows.
 *
 * ## Which six survive, and why the comparator is a total order
 *
 * `byExplanatoryWeight`, in three keys:
 *
 *  1. **|delta| descending.** The chips that moved the number the most are the ones that explain
 *     the roll. A player reconstructing a −7 wants the −4 before the −1.
 *  2. **row count descending.** Equal magnitudes are common (a ±1 registry row is the modal
 *     row), and at equal magnitude the chip standing for three rows accounts for more of the
 *     world than the chip standing for one. Without this key the survivor at a tie would be
 *     picked by spelling, which explains nothing.
 *  3. **`sourceKind` ascending.** The bottom, and the reason this is a TOTAL order: there is
 *     exactly one group per kind, so key 3 can never tie. Same rule as `leg-plan.ts`'s
 *     `dullness` comparator — it reads only its two arguments, no index, no rank, no global —
 *     so the chip list is a function of the world and not of `Map` insertion order or of the
 *     order `resolveModifiers` happened to emit rows in.
 *
 * The overflow chip is PINNED LAST rather than re-sorted by its own magnitude. Its delta is a
 * sum across unrelated kinds, so it is not comparable with the single-cause chips above it —
 * "everything else, together, −5" is a footnote to the list, not the top line of it. Re-sorting
 * would also let a big footnote displace the specific reason a player is looking for.
 *
 * ## The arithmetic is untouched, by construction
 *
 * This runs AFTER conflict resolution, the non-stacking collapse, diminishing returns and the
 * clamp, over the finished `ResolvedModifier[]`, and it only sums integers that are already
 * final. `runSkillCheck` still builds its `RollModifier[]` from `resolution.modifiers`, never
 * from these chips, so no roll can move even if this function were wrong. `resolution.modifiers`
 * stays the full audit trail; this is the render list. `collapse-chips.test.ts` asserts the
 * delta-preservation and roll-neutrality as properties over generated resolutions rather than
 * over one example.
 *
 * ## What this does NOT do
 *
 * It does not suppress a chip that sums to zero, including a zero-summing overflow chip — 5.2%
 * of rows contribute exactly 0 after the clamp, so an overflow standing for three rows can
 * legitimately read "±0". Dropping it would break the partition property, which exists to catch
 * exactly one failure mode: a row that reached no chip. See `docs/adr/0037`.
 */
export function collapseChips(modifiers: readonly ResolvedModifier[]): readonly ModifierChip[] {
  const groups = groupBySourceKind(modifiers);
  groups.sort(byExplanatoryWeight);

  if (groups.length <= MAX_MODIFIER_CHIPS) return groups.map(chipOfGroup);

  return [
    ...groups.slice(0, KEEP_CHIPS).map(chipOfGroup),
    overflowChip(groups.slice(KEEP_CHIPS), modifiers),
  ];
}

/** One `sourceKind`'s rows, summed. The working shape; a `ModifierChip` is what ships. */
type KindGroup = {
  sourceKind: ModifierSourceKind;
  firstLabelKey: string;
  delta: number;
  rawDelta: number;
  diminished: boolean;
  capped: boolean;
  memberIds: string[];
};

function groupBySourceKind(modifiers: readonly ResolvedModifier[]): KindGroup[] {
  const groups = new Map<ModifierSourceKind, KindGroup>();

  for (const modifier of modifiers) {
    const existing = groups.get(modifier.sourceKind);
    if (existing === undefined) {
      groups.set(modifier.sourceKind, {
        sourceKind: modifier.sourceKind,
        firstLabelKey: modifier.labelKey,
        delta: modifier.delta,
        rawDelta: modifier.rawDelta,
        diminished: modifier.diminished,
        capped: modifier.capped,
        memberIds: [modifier.id],
      });
      continue;
    }
    existing.delta += modifier.delta;
    existing.rawDelta += modifier.rawDelta;
    existing.diminished = existing.diminished || modifier.diminished;
    existing.capped = existing.capped || modifier.capped;
    existing.memberIds.push(modifier.id);
  }

  return [...groups.values()];
}

/** See the "which six survive" section above. Bottoms out on a key that cannot tie. */
function byExplanatoryWeight(a: KindGroup, b: KindGroup): number {
  const magA = a.delta < 0 ? -a.delta : a.delta;
  const magB = b.delta < 0 ? -b.delta : b.delta;
  if (magA !== magB) return magB - magA;
  if (a.memberIds.length !== b.memberIds.length) return b.memberIds.length - a.memberIds.length;
  return a.sourceKind < b.sourceKind ? -1 : 1;
}

function chipOfGroup(group: KindGroup): ModifierChip {
  const count = group.memberIds.length;
  return {
    // A lone row keeps its specific label: folding one modifier into its kind would DELETE
    // information for no gain, and "Condition −2" reads as a system message where
    // "Badly hurt −2" reads as the story.
    labelKey: count === 1 ? group.firstLabelKey : `check.kind.${group.sourceKind}`,
    sourceKind: group.sourceKind,
    delta: group.delta,
    rawDelta: group.rawDelta,
    count,
    diminished: group.diminished,
    capped: group.capped,
    memberIds: group.memberIds,
  };
}

/**
 * Fold the tail groups into one chip.
 *
 * **"And 1 other" cannot happen**, and that is arithmetic rather than a guard someone has to
 * remember. The fold only runs when `groups.length > MAX_MODIFIER_CHIPS`, and `KEEP_CHIPS` is
 * `MAX_MODIFIER_CHIPS − 1`, so the tail is always at least two GROUPS and therefore at least
 * two ROWS. That matters because folding a single row into "and 1 other" would delete its
 * label for no reduction in list length — the same argument ADR 0037 used for keeping a
 * single-member group's own label. If the constants ever move so that a one-group tail is
 * possible, the rule to restore is "emit that group's own chip instead", not "fold it anyway";
 * `collapse-chips.test.ts` asserts the tail is never one row so the change cannot pass silently.
 *
 * `memberIds` is rebuilt by filtering `modifiers` rather than by concatenating the tail groups,
 * so the drill-down list stays in RESOLUTION order (|delta| then id) instead of in group order.
 */
function overflowChip(
  tail: readonly KindGroup[],
  modifiers: readonly ResolvedModifier[],
): ModifierChip {
  const folded = new Set<string>();
  let delta = 0;
  let rawDelta = 0;
  let diminished = false;
  let capped = false;

  for (const group of tail) {
    delta += group.delta;
    rawDelta += group.rawDelta;
    diminished = diminished || group.diminished;
    capped = capped || group.capped;
    for (const id of group.memberIds) folded.add(id);
  }

  const memberIds = modifiers.filter((m) => folded.has(m.id)).map((m) => m.id);

  return {
    labelKey: CHIP_OVERFLOW_LABEL_KEY,
    sourceKind: null,
    delta,
    rawDelta,
    count: memberIds.length,
    diminished,
    capped,
    memberIds,
  };
}
