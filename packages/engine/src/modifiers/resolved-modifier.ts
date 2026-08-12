import { type ModifierChip } from './collapse-chips.ts';
import { type ModifierSourceKind } from './registry-modifier.ts';

/**
 * One presentation-ready modifier chip.
 *
 * This type IS the dice-animation contract for Phase 7B, so it carries what a chip has to
 * show rather than only what the roll needs. `delta` is the contribution that actually
 * reached the total; `rawDelta` is what the modifier declared. When they differ the player is
 * shown why — "+1 (was +2, diminished)" — because design pillar 2 requires that the number be
 * reconstructable, and a modifier that silently shrank is not.
 */
export type ResolvedModifier = {
  readonly id: string;
  readonly labelKey: string;
  /** Post-diminish, post-clamp. This is what was added to the roll. */
  readonly delta: number;
  /** As declared by the registry row or the choice. */
  readonly rawDelta: number;
  readonly sourceKind: ModifierSourceKind;
  /** Beyond the diminishing-returns threshold for its sign. */
  readonly diminished: boolean;
  /** Trimmed because the total hit the bonus ceiling or penalty floor. */
  readonly capped: boolean;
};

/** A modifier that lost a conflict or a non-stacking collapse, kept so the log can say why. */
export type SuppressedModifier = {
  readonly id: string;
  readonly labelKey: string;
  readonly rawDelta: number;
  readonly reason: 'conflict' | 'non-stacking';
  /** The id that beat it. */
  readonly lostTo: string;
};

export type ModifierResolution = {
  /**
   * Every row that reached the total, ordered by |delta| descending then id. THE AUDIT TRAIL,
   * and what `runSkillCheck` builds the roll from — not the render list. A check can legitimately
   * match a dozen rows, which is a diversity win and a pillar-2 problem at the same time.
   */
  readonly modifiers: readonly ResolvedModifier[];
  /**
   * THE RENDER LIST: `modifiers` grouped by `sourceKind`, summed. Sums to `total` exactly, by
   * property test. Never feeds a roll. See `collapse-chips.ts` for why the grouping key is
   * `sourceKind` and `docs/adr/0037` for what it does and does not fix.
   */
  readonly chips: readonly ModifierChip[];
  /** Sum of `delta`. Always equals the sum of the chips — asserted, see resolve-modifiers. */
  readonly total: number;
  readonly suppressed: readonly SuppressedModifier[];
};

export const EMPTY_RESOLUTION: ModifierResolution = Object.freeze({
  modifiers: [],
  chips: [],
  total: 0,
  suppressed: [],
});
