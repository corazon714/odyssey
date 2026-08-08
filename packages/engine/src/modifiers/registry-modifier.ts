import { type Predicate } from '../predicate/predicate.ts';
import { type CheckTag } from './check-tag.ts';

/**
 * One row of `modifiers.yaml`.
 *
 * THE PROBLEM THIS SOLVES (08-DIVERSITY-SYSTEMS D1). Modifiers declared per choice do not
 * scale to 800 choices: the same "you look like you slept in a ditch" penalty gets hand-copied
 * into every social event, drifts in value between them, and adding a new one means editing
 * hundreds of files. Declared once here, a row applies to every check whose tags it matches.
 *
 * Choice-local modifiers still exist and are still applied — as EXCEPTIONS. `content:lint`'s
 * LOCAL_MODIFIER rule flags one that belongs in the registry, which is why the authoring
 * schema makes a local modifier carry a `why`.
 */
export type ModifierSourceKind =
  | 'skill'
  | 'trait'
  | 'item'
  | 'condition'
  | 'flag'
  | 'relationship'
  | 'context'
  | 'transport'
  | 'document'
  | 'region'
  | 'companion'
  | 'momentum';

export const MODIFIER_SOURCE_KINDS = [
  'skill',
  'trait',
  'item',
  'condition',
  'flag',
  'relationship',
  'context',
  'transport',
  'document',
  'region',
  'companion',
  'momentum',
] as const satisfies readonly ModifierSourceKind[];

export type RegistryModifier = {
  /**
   * Required, and load-bearing beyond identification: it is the RNG address for any `chance`
   * gate inside `when`. Content-addressed rather than positional, because a positional
   * address would shift every later row's gate when a row is inserted — the exact hazard
   * ADR 0005 §2 exists to prevent.
   */
  readonly id: string;
  /** Applies when this intersects the check's tags. Empty would apply to nothing. */
  readonly appliesTo: readonly CheckTag[];
  readonly when: Predicate;
  readonly delta: number;
  readonly labelKey: string;
  readonly sourceKind: ModifierSourceKind;
  /** Ids this beats or loses to; resolved by `priority`, higher wins. */
  readonly conflictsWith: readonly string[];
  readonly priority: number;
  /** When false, only the strongest modifier of this `sourceKind` survives. */
  readonly stacks: boolean;
};

/**
 * The registry, sorted by id at construction.
 *
 * Sorted for the same reason `createContentPack` sorts events: iteration order reaches the
 * output's chip order and the conflict tiebreak, so leaving it as file order would make
 * balance depend on how someone spelled a filename.
 */
export type ModifierRegistry = readonly RegistryModifier[];

export const EMPTY_MODIFIER_REGISTRY: ModifierRegistry = Object.freeze([]);

export function createModifierRegistry(rows: readonly RegistryModifier[]): ModifierRegistry {
  return Object.freeze([...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
}
