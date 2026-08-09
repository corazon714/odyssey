import { type ChoiceId, type EventId } from '../ids/content-ids.ts';
import { tagsOf } from './event-tags.ts';
import { type Choice, type GameEvent } from './game-event.ts';
import {
  MAX_UNIVERSAL_PER_EVENT,
  type UniversalChoice,
  type UniversalChoiceRegistry,
} from './universal-choice.ts';

/**
 * Splice registry choices into every event whose tags match. Pure, and run ONCE at pack
 * construction.
 *
 * WHY AT PACK BUILD RATHER THAN AT SELECTION. The presented list and the list `resolveChoice`
 * looks a choice up in must be the same array, or the screen can offer something the engine
 * refuses. Today they already are — both reach `GameEvent.choices` through `pack.byId`. Doing
 * the splice here keeps that true by construction, needs no `RunState`, adds no field to a
 * save, and moves `contentVersion` correctly because the registry lives inside
 * `ContentRegistries`. Injecting at selection time would have meant persisting the injected
 * list in `Presentation` or recomputing it identically later — the same problem the
 * complication design had to solve, taken on for no gain.
 *
 * What that costs: matching can only read the EVENT, not the run. That is fine, and arguably
 * right — `appliesTo` asks "does this kind of situation admit this option", which is a
 * property of the event. Whether the player can take it right now is the row's own `requires`,
 * evaluated at resolve time exactly as a hand-authored choice's is.
 */
export type ShadowedInjection = {
  readonly event: EventId;
  readonly choiceId: ChoiceId;
  /** The registry row that lost. Named so the report says which file to edit. */
  readonly row: string;
};

export type InjectionResult = {
  readonly events: readonly GameEvent[];
  readonly shadowed: readonly ShadowedInjection[];
};

const NO_SHADOWED: readonly ShadowedInjection[] = Object.freeze([]);

export function injectUniversalChoices(
  events: readonly GameEvent[],
  registry: UniversalChoiceRegistry,
): InjectionResult {
  // Identity when there is nothing to inject, so an empty registry cannot perturb the pack —
  // not even by rebuilding the event objects. M-B ships empty and its whole proof is that the
  // golden runs do not move.
  if (registry.length === 0) return { events, shadowed: NO_SHADOWED };

  const shadowed: ShadowedInjection[] = [];

  const out = events.map((event) => {
    // `i <= a` — see MAX_UNIVERSAL_PER_EVENT. An event with no choices of its own gets none:
    // injecting into an empty list would make the registry the entire event.
    const limit = Math.min(MAX_UNIVERSAL_PER_EVENT, event.choices.length);
    if (limit === 0) return event;

    const tags = new Set(tagsOf(event));
    const authored = new Set(event.choices.map((choice) => String(choice.id)));
    const families = new Set<string>();
    const injected: Choice[] = [];

    for (const row of matching(registry, tags)) {
      if (injected.length >= limit) break;
      if (row.family !== null && families.has(row.family)) continue;

      // A collision DROPS the injected row rather than shadowing the authored one. `.find`
      // returns the first match, so shadowing would display the injected choice, let the
      // player pick it, and resolve the AUTHORED choice's outcomes — silently. It should be
      // unreachable, because `UNIVERSAL_CHOICE_PREFIX` uses a character `ID_PATTERN` forbids;
      // it is collected rather than ignored so that "unreachable" stays checkable.
      if (authored.has(String(row.choice.id))) {
        shadowed.push({ event: event.id, choiceId: row.choice.id, row: row.id });
        continue;
      }

      if (row.family !== null) families.add(row.family);
      injected.push(row.choice);
    }

    if (injected.length === 0) return event;
    // Appended, never interleaved: hand-authored choices come first because they are the ones
    // written for THIS situation, and because the sim's `best()` tie-break and the eventual UI
    // both read array order.
    return { ...event, choices: [...event.choices, ...injected] };
  });

  return { events: out, shadowed };
}

/**
 * Rows whose `appliesTo` intersects the event's tags, most important first.
 *
 * Ordered by `(-priority, id ascending)` with `<` on strings — never `localeCompare`, which is
 * locale-dependent and would make injection differ between machines (ADR 0005 §3). Sorted
 * explicitly on both keys rather than leaning on the registry's id order plus a stable sort,
 * so the tiebreak is stated rather than inherited.
 */
function matching(
  registry: UniversalChoiceRegistry,
  tags: ReadonlySet<string>,
): readonly UniversalChoice[] {
  return registry
    .filter((row) => row.appliesTo.some((tag) => tags.has(tag)))
    .sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}
