import { type Choice, type GameEvent } from './game-event.ts';
import { type RegistryComplication } from './registry-complication.ts';

/**
 * The choices actually on offer: the pack's array with the complication's edits applied.
 *
 * ONE FUNCTION FOR BOTH PATHS, and that is the whole reason it exists as a function rather
 * than two inline expressions. The app renders `selection.event.choices`; `resolveChoice`
 * looks a choice up by id on the next call. If a complication edited one list and not the
 * other, the screen would offer a choice the engine refuses, or hide one it accepts — the
 * class of bug CLAUDE.md 2.7 exists to prevent, reintroduced by a feature meant to add
 * texture. Both now call this.
 *
 * The universal-choice splice does NOT happen here: it is baked into `GameEvent.choices` at
 * pack construction, so it is already in the array this receives. The two layers compose in
 * the order they were decided — authored, then universal, then the complication's edit.
 */
export function presentedChoices(
  event: GameEvent,
  complication: RegistryComplication | null,
): readonly Choice[] {
  if (complication === null) return event.choices;

  const removed =
    complication.removesChoice === null
      ? event.choices
      : event.choices.filter((choice) => choice.id !== complication.removesChoice);

  // A `removesChoice` that would empty the list is DECLINED, not applied. `resolveChoice`
  // would otherwise reject every id the caller could possibly pass and the leg would become
  // unresolvable — a content mistake turning into a stuck run. Better to under-apply a
  // complication than to strand a player mid-journey.
  const base = removed.length === 0 ? event.choices : removed;

  return complication.addsChoice === null ? base : [...base, complication.addsChoice];
}
