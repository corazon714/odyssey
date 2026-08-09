import { type ItemId } from '../ids/content-ids.ts';
import { type CheckTag } from '../modifiers/check-tag.ts';
import { type ContainerKind } from '../state/container-state.ts';
import { type SkillKey } from '../state/skills.ts';

/**
 * Someone turns out a container and you try to keep something out of their hands.
 *
 * A SEARCH IS A SKILL CHECK, NOT AN EFFECT OP, and that is settled rather than stylistic.
 * `effects/effect-context.ts` makes the absence of an `Rng` an explicit contract — "applying
 * an effect is fully determined by (state, effect)" — and a search rolls. Smuggling a
 * cursorless address into the applier only moves the problem, because a search WRITES: two
 * searches in one effect list would address identically unless disambiguated by array
 * position, which is the ADR 0005 §2 hazard where inserting an effect shifts every later
 * address. See `docs/adr/0017`, "What is deferred, and why it is not a gap".
 *
 * So it resolves through the existing `runSkillCheck` on the existing `skillCheck` stream —
 * no new stream, no `RngCursors` key, no save migration. What that buys, and the reason it is
 * worth more than a bespoke path: **every `search`-tagged row in the modifier registry applies
 * to it automatically**, with conflicts, non-stacking collapse, diminishing returns and both
 * clamps, and it renders as chips for design pillar 2 for free.
 *
 * WHICH WAY THE ROLL POINTS. The player rolls, and **success means it stayed hidden**. This is
 * forced, not chosen: `runSkillCheck` is documented as `d20 + skill + clamp(modifiers)` from
 * the player's side, and every `search`-tagged row already in `modifiers.yaml` is signed that
 * way — `cash_concealed` is +2, `wanted_by_authorities` is −3. A searcher-rolls framing would
 * make all four of them apply backwards. So an outcome gated `onCheck: failure` is the one
 * where they find it.
 *
 * (The Phase 2A plan file's example YAML comments this the other way round. It predates the
 * registry it now contradicts; the registry is shipped and wins.)
 */
export type SearchSpec = {
  /** Which container gets turned out. Its `searchDC` becomes a bonus to keeping things in it. */
  readonly container: ContainerKind;
  /**
   * How thorough the search is — the DC the player rolls against. This is the AUTHORED half:
   * a bored pat-down and a full strip of the vehicle differ here, not in the container.
   */
  readonly dc: number;
  /**
   * What they are looking for. null = a general sweep with no particular target.
   *
   * Recorded rather than consumed, for now: an item's `concealability` is declared in
   * `packages/content/items.yaml` and the engine cannot reach it — `ContentRegistries.items`
   * is a bare `ItemId[]`. Widening that is a `ContentRegistries` change, so it lands with the
   * registry-shape commit and this field starts contributing then. Until it does, the
   * container carries the whole concealment bonus. The field is here now because the outcome's
   * effects and `content:lint` both need to know what was being hunted.
   */
  readonly item: ItemId | null;
  /** Whose competence keeps it hidden. `stealth` unless the author says otherwise. */
  readonly skill: SkillKey;
  readonly tags: readonly CheckTag[];
};
