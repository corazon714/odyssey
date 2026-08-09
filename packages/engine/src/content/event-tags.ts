import { type GameEvent } from './game-event.ts';

/**
 * An event's tags plus its category as `cat:<category>`.
 *
 * Lives in `content/` rather than `director/`, where it was first written, because it is a
 * fact about a `GameEvent` and it now has two consumers on opposite sides of the engine:
 * `tagSaturation` scores with it, and `injectUniversalChoices` matches with it at pack
 * construction. Leaving it in the director would have made `content/` depend on `director/`
 * to build a pack, which inverts the layering — the director consumes content, not the
 * reverse.
 *
 * The synthetic `cat:` tag is what lets one mechanism cover both axes: a universal choice can
 * say `appliesTo: [cat:border]` without the registry needing a separate category field, and
 * tag saturation counts "too much border lately" without a second counter.
 */
export function tagsOf(event: GameEvent): readonly string[] {
  return [...event.tags, `cat:${event.category}`];
}
