import { type SkillCheck } from '../content/game-event.ts';
import { type SearchSpec } from '../content/search-spec.ts';
import { type InventoryState } from '../state/container-state.ts';

/**
 * Turn a search into the check that resolves it.
 *
 * The whole point of this file is that it returns a plain `SkillCheck`, so a search goes down
 * the SAME path as every other roll: `runSkillCheck`, the six-step modifier pipeline, the
 * `skillCheck` stream, the chips. A parallel resolver would have needed its own copy of all
 * of that and would have been the place the two drifted.
 *
 * THE CONTAINER'S `searchDC` IS READ FROM STATE, NOT FROM `CONTAINER_SPECS`. ADR 0017 put the
 * numbers in state precisely "so a future bigger vehicle or a reinforced bag is a preparation
 * choice rather than an engine change" — reading the frozen defaults here would quietly undo
 * that, and a reinforced bag would conceal exactly as well as a paper one.
 *
 * A container the player does not have contributes NOTHING rather than being an error. There
 * is no bag to turn out, so there is nothing in the bag to find; the roll still happens
 * because the author asked for it, and it is `requires`/`hiddenUnless` on the choice that is
 * supposed to stop a search of a container you never packed from being offered at all.
 */
export function searchCheck(spec: SearchSpec, inventory: InventoryState): SkillCheck {
  const container = inventory[spec.container];

  return {
    skill: spec.skill,
    dc: spec.dc,
    tags: spec.tags,
    // Enters as a choice-local modifier rather than an adjustment to `dc`, so it is clamped,
    // diminished and RENDERED alongside everything else. A silent DC change is a number the
    // player cannot reconstruct, which is the thing design pillar 2 exists to prevent.
    modifiers:
      container === null
        ? []
        : [
            {
              labelKey: `check.modifier.container.${spec.container}`,
              delta: container.searchDC,
              when: null,
            },
          ],
    // A search is done TO you: you can see it happening but not how hard they intend to look.
    visibility: 'partial',
  };
}
