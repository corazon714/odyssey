import { type Choice } from './game-event.ts';

/**
 * One row of `universal-choices.yaml`: a choice injected into any event whose tags match.
 *
 * THE PROBLEM THIS SOLVES (08-DIVERSITY-SYSTEMS D2). "Run", "bribe them", "walk away" belong
 * in dozens of events. Hand-authored into each, they drift apart, and adding a new one means
 * editing every file that should have offered it. Declared once here, a row reaches every
 * matching event — the same argument the modifier registry makes for `RegistryModifier`, one
 * level up.
 *
 * THE HARD DESIGN RULE, which is not expressible in this type and so is stated here and
 * enforced by review plus `content:lint`: **a universal choice must never be strictly the best
 * option.** If it is, every hand-authored choice in every matching event becomes pointless and
 * the corpus collapses to fifteen buttons. Every row carries a real cost — heat, morale, cash,
 * time, a flag, or a burned relationship — paid whether or not it works.
 */
export type UniversalChoice = {
  /**
   * The row's own id, distinct from `choice.id`. The choice's id is minted from it with a
   * prefix an author cannot forge (`:` is outside `ID_PATTERN`), because `ChoiceId` is unique
   * only WITHIN an event and `resolveChoice` looks a choice up with `.find`. A collision
   * would not error: the injected choice would be displayed, the player would pick it, and
   * the AUTHORED choice's outcomes would fire. Worse than a crash.
   */
  readonly id: string;
  /**
   * Matched against `tagsOf(event)` — event tags plus `cat:<category>`. Empty matches nothing.
   */
  readonly appliesTo: readonly string[];
  /**
   * At most one row per family per event.
   *
   * This is what `maxPerEvent` was reaching for and could not express: a per-row per-event cap
   * is degenerate, because ids are unique so a row already appears at most once. A family cap
   * is the useful one — it stops three ways of running away being offered together — and it is
   * the idiom the codebase already uses twice, as `exclusiveGroup` on events and as
   * `sourceKind` in the non-stacking collapse.
   */
  readonly family: string | null;
  /** Higher is offered first. Ties break on id ascending, so order never depends on file order. */
  readonly priority: number;
  /**
   * The choice itself, whole.
   *
   * Embedded rather than flattened into this row so the splice is `[...authored, row.choice]`
   * and every field a hand-authored choice has — `requires`, `hiddenUnless`, `costs`,
   * `skillCheck`, `search`, `outcomes` — works identically on an injected one, by being
   * literally the same type. A flattened copy would be a second definition of `Choice` that
   * drifts the first time one of them gains a field.
   */
  readonly choice: Choice;
};

/** Sorted by id at construction, for the reason `createModifierRegistry` sorts. */
export type UniversalChoiceRegistry = readonly UniversalChoice[];

export const EMPTY_UNIVERSAL_CHOICE_REGISTRY: UniversalChoiceRegistry = Object.freeze([]);

export function createUniversalChoiceRegistry(
  rows: readonly UniversalChoice[],
): UniversalChoiceRegistry {
  return Object.freeze([...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
}

/**
 * The prefix that makes an injected choice id unforgeable.
 *
 * `:` is outside `ID_PATTERN` (`/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/`), so no author can
 * write a choice id that collides with an injected one. A `u.` prefix would NOT have closed
 * this — dots are legal, precisely so ids can be namespaced by category.
 */
export const UNIVERSAL_CHOICE_PREFIX = 'u:';

/**
 * At most this many injected per event, and never more than the event authored itself.
 *
 * "Never more than half the choices shown" reduces to `i <= a`: with `a` authored and `i`
 * injected, `i <= (a + i) / 2` is exactly `i <= a`. So the cap is static and state-free, which
 * it has to be — the splice happens at pack construction, where there is no `RunState` to
 * consult. It is a statement about authoring density rather than about one player's situation,
 * and that is the right thing for it to be.
 */
export const MAX_UNIVERSAL_PER_EVENT = 3;
