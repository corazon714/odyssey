import { type ModifierSourceKind } from './registry-modifier.ts';
import { type ResolvedModifier } from './resolved-modifier.ts';

/**
 * One chip as the result screen draws it: a group of resolved modifiers that share a
 * `sourceKind`, summed.
 *
 * `count === 1` is the common case and means nothing was folded — the chip keeps the row's own
 * `check.modifier.<id>` label, so a lone condition still reads "Badly hurt −2" rather than
 * "Condition −2". Only a group of two or more takes the generic `check.kind.<sourceKind>` key
 * and renders as "Condition ×3 −4".
 */
export type ModifierChip = {
  /** `check.modifier.<id>` when `count === 1`, `check.kind.<sourceKind>` otherwise. */
  readonly labelKey: string;
  readonly sourceKind: ModifierSourceKind;
  /** Sum of the members' `delta`. Post-diminish, post-clamp — what reached the roll. */
  readonly delta: number;
  /** Sum of the members' `rawDelta`, so a folded chip can still say "(was −6)". */
  readonly rawDelta: number;
  /** How many resolved rows folded in. 1 means the chip is a single row. */
  readonly count: number;
  /** True when ANY member was diminished. */
  readonly diminished: boolean;
  /** True when ANY member was capped. */
  readonly capped: boolean;
  /** Member ids in resolution order — the drill-down list, and the audit trail. */
  readonly memberIds: readonly string[];
};

/**
 * Collapse the resolved rows into presentation chips, grouped by `sourceKind`.
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
 * ## What this does NOT do, measured
 *
 * It does not land the 3–7 band on its own. Over 25,994 corpus checks: mean 7.17 → 6.74, over
 * band 36.4% → 27.6%, worst 14 → 11. The bound is 12 (one chip per `sourceKind`), NOT 7, and
 * the residual is checks that draw one row from each of eight-to-eleven DIFFERENT kinds — 94.6%
 * of groups have exactly one member, so there is little left to fold. See `docs/adr/0037` for
 * the two candidate follow-ups and why neither is in this change.
 */
export function collapseChips(modifiers: readonly ResolvedModifier[]): readonly ModifierChip[] {
  type Group = {
    sourceKind: ModifierSourceKind;
    firstLabelKey: string;
    delta: number;
    rawDelta: number;
    diminished: boolean;
    capped: boolean;
    memberIds: string[];
  };

  const groups = new Map<ModifierSourceKind, Group>();

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

  const chips = [...groups.values()].map((group): ModifierChip => {
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
  });

  // Magnitude first so the biggest reason reads first, then `sourceKind` — which is a TOTAL
  // order here because there is exactly one chip per kind, so nothing can tie. Same discipline
  // as `byMagnitudeThenId`: a comparator that can tie is one whose result depends on input
  // order.
  chips.sort((a, b) => {
    const magA = a.delta < 0 ? -a.delta : a.delta;
    const magB = b.delta < 0 ? -b.delta : b.delta;
    if (magA !== magB) return magB - magA;
    return a.sourceKind < b.sourceKind ? -1 : 1;
  });

  return chips;
}
