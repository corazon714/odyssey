import { MODIFIER_SOURCE_KINDS, type RegistryModifier } from '@odyssey/engine';
import { z } from 'zod';
import { ID_PATTERN, checkTagSchema, i18nKeySchema, intSchema, list } from './common.ts';
import { predicateSchema } from './predicate.ts';

/**
 * One row of `modifiers.yaml` — the global check-modifier registry.
 *
 * THE D1 PROBLEM. Modifiers declared per choice do not scale to 800 choices: the same
 * "you look like you slept in a ditch" penalty gets hand-copied into every social event,
 * drifts in value between copies, and adding a new one means editing hundreds of files.
 * Declared once here, a row applies to every check whose tags it matches.
 *
 * `labelKey` is derived from the id, like everything else in this package — there is no way
 * to type prose into a modifier either.
 */
export const modifierSchema = z
  .strictObject({
    id: z.string().regex(ID_PATTERN, 'modifier ids are snake_case'),
    /** The check tags this applies to. Empty would apply to nothing, so at least one. */
    appliesTo: z.array(checkTagSchema).min(1),
    when: predicateSchema,
    delta: intSchema.refine((n) => n !== 0, 'a zero modifier is a comment, not a modifier'),
    sourceKind: z.enum(MODIFIER_SOURCE_KINDS),
    conflictsWith: list(z.string().regex(ID_PATTERN)),
    /** Higher wins a conflict. Ties break on id, so the outcome never depends on file order. */
    priority: intSchema.nonnegative(),
    /** When false, only the strongest modifier of this `sourceKind` survives. */
    stacks: z
      .boolean()
      .nullish()
      .transform((v) => v ?? false),
    labelKey: i18nKeySchema.nullish(),
  })
  .transform((raw): RegistryModifier => ({
    id: raw.id,
    appliesTo: raw.appliesTo,
    when: raw.when,
    delta: raw.delta,
    labelKey: raw.labelKey ?? `check.modifier.${raw.id}`,
    sourceKind: raw.sourceKind,
    conflictsWith: raw.conflictsWith,
    priority: raw.priority,
    stacks: raw.stacks,
  }));

export const modifierRegistrySchema = z.array(modifierSchema);
