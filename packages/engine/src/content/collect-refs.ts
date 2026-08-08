import { type Effect } from '../effects/effect.ts';
import { type Predicate } from '../predicate/predicate.ts';
import { type GameEvent } from './game-event.ts';

/**
 * Walk every predicate and effect in a pack and collect the content ids it references.
 *
 * ADR 0001 names the cost this pays for: in a Quality-Based Narrative, content bugs are
 * SILENT. An event whose `requires` names an npc that no longer exists simply never fires,
 * and nothing errors. This walk is the first instrument that can see that class of bug —
 * `packages/tools/content-lint` will subsume and extend it in Phase 2.
 *
 * Deliberately NOT exhaustive-switched over every kind: the goal is to find id-bearing nodes,
 * and a kind that carries no id needs no branch. The `default` therefore recurses into
 * children rather than failing, so adding a predicate kind cannot silently drop references
 * from an existing one.
 */
export type ContentRefKind = 'event' | 'npc' | 'item' | 'trait';

export type ContentRef = {
  readonly kind: ContentRefKind;
  readonly id: string;
  /** The event the reference was found in — what a linter report needs to be actionable. */
  readonly inEvent: string;
};

export function collectRefs(events: readonly GameEvent[]): readonly ContentRef[] {
  const refs: ContentRef[] = [];

  for (const event of events) {
    const push = (kind: ContentRefKind, id: string): void => {
      refs.push({ kind, id, inEvent: event.id });
    };

    walkPredicate(event.requires, push);

    for (const choice of event.choices) {
      walkPredicate(choice.requires, push);
      if (choice.hiddenUnless !== null) walkPredicate(choice.hiddenUnless, push);
      for (const cost of choice.costs) walkEffect(cost, push);

      if (choice.skillCheck !== null) {
        for (const modifier of choice.skillCheck.modifiers) {
          if (modifier.when !== null) walkPredicate(modifier.when, push);
        }
      }

      for (const outcome of choice.outcomes) {
        walkPredicate(outcome.requires, push);
        for (const effect of outcome.effects) walkEffect(effect, push);
      }
    }
  }

  return refs;
}

type Push = (kind: ContentRefKind, id: string) => void;

function walkPredicate(predicate: Predicate, push: Push): void {
  switch (predicate.kind) {
    case 'all':
    case 'any':
      for (const child of predicate.of) walkPredicate(child, push);
      return;
    case 'not':
      walkPredicate(predicate.of, push);
      return;
    case 'trait':
      push('trait', predicate.id);
      return;
    case 'item':
      push('item', predicate.id);
      return;
    case 'relationship':
    case 'npcMet':
      push('npc', predicate.npc);
      return;
    case 'eventMemory':
      push('event', predicate.event);
      return;
    default:
      return;
  }
}

function walkEffect(effect: Effect, push: Push): void {
  switch (effect.op) {
    case 'relationship':
      push('npc', effect.npc);
      return;
    case 'item':
      push('item', effect.id);
      return;
    case 'scheduleEvent':
      push('event', effect.eventId);
      // The scheduled entry carries its own gate, which can reference more content.
      if (effect.requires !== null) walkPredicate(effect.requires, push);
      return;
    default:
      return;
  }
}
