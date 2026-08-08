import {
  BEAT_TYPES,
  CHECK_VISIBILITIES,
  EVENT_PRIORITIES,
  LOCATION_TYPES,
  NUMBER_OPS,
  RESOURCE_KEYS,
  ROUTE_PROFILES,
  RUN_STATUSES,
  SKILL_KEYS,
  TIMES_OF_DAY,
  TRANSPORT_MODES,
  endingId,
  eventId,
  flagId,
  itemId,
  languageId,
  npcId,
  regionId,
  traitId,
} from '@odyssey/engine';
import { z } from 'zod';

/**
 * The primitives every other schema in this package is built from.
 *
 * Three rules run through all of them, each settled against the compiler in
 * `__tests__/zod-idioms.test.ts` rather than assumed:
 *
 *   1. IDS COME FROM THE ENGINE'S CONSTRUCTORS. `Brand<T,B>` keys on a module-private
 *      `unique symbol`, so `z.string().transform(eventId)` is the only idiom that produces an
 *      identity-equal branded id. Never `.brand()`, and never `.readonly()` on one.
 *   2. OMITTED MEANS `null` OR `[]`, NEVER `undefined` (ADR 0009 §2). Use the `nullable`/
 *      `list` helpers below, not `.optional()` or a bare `.default()` — see the warning on
 *      `nullable`.
 *   3. EVERY OBJECT IS SEALED. `z.strictObject`, always. A misspelled key that Zod silently
 *      strips produces a defaulted value and still satisfies every type assertion, which is
 *      the one class of content bug the schema layer exists to make impossible.
 */

/** Vocabularies, derived from the engine's own arrays so a new member cannot be missed. */
export const resourceKeySchema = z.enum(RESOURCE_KEYS);
export const skillKeySchema = z.enum(SKILL_KEYS);
export const numberOpSchema = z.enum(NUMBER_OPS);
export const transportModeSchema = z.enum(TRANSPORT_MODES);
export const routeProfileSchema = z.enum(ROUTE_PROFILES);
export const runStatusSchema = z.enum(RUN_STATUSES);
export const timeOfDaySchema = z.enum(TIMES_OF_DAY);
export const locationTypeSchema = z.enum(LOCATION_TYPES);
export const beatTypeSchema = z.enum(BEAT_TYPES);
export const eventPrioritySchema = z.enum(EVENT_PRIORITIES);
export const checkVisibilitySchema = z.enum(CHECK_VISIBILITIES);

/**
 * Ids are `snake_case`, optionally namespaced by category with dots — `border.bribe_attempt`,
 * `bribed_this_border` (CLAUDE.md §6). Enforced here rather than only in the linter so a
 * malformed id cannot reach a `ContentPack` at all.
 */
export const ID_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;

const rawId = z.string().regex(ID_PATTERN, 'ids are snake_case, dot-namespaced by category');

export const eventIdSchema = rawId.transform(eventId);
export const flagIdSchema = rawId.transform(flagId);
export const npcIdSchema = rawId.transform(npcId);
export const itemIdSchema = rawId.transform(itemId);
export const traitIdSchema = rawId.transform(traitId);
export const endingIdSchema = rawId.transform(endingId);
export const regionIdSchema = rawId.transform(regionId);
export const languageIdSchema = rawId.transform(languageId);

/**
 * An omitted or explicitly-null key becomes `null`.
 *
 * NOT `.default(null)`. Zod's `.default()` fires on `undefined` only, and YAML parses a bare
 * `key:` as **null**, not undefined — so `.default()` would leave the field null at runtime
 * while `z.infer` still reported the right type and every conformance assertion passed. That
 * is a silent runtime bug the type system cannot see; `.nullish()` catches both spellings.
 */
export function nullable<T extends z.ZodType>(inner: T) {
  // Return type deliberately INFERRED, not annotated. An explicit `z.ZodType<…>` here would
  // collapse `z.input` to `unknown` for every field built with it, which is precisely the
  // vacuity the conformance harness checks for.
  return inner.nullish().transform((value): z.infer<T> | null => value ?? null);
}

/** An omitted or explicitly-null list becomes `[]`. Empty means NO CONSTRAINT (ADR 0009 §2). */
export function list<T extends z.ZodType>(inner: T) {
  return z
    .array(inner)
    .readonly()
    .nullish()
    .transform((value): readonly z.infer<T>[] => value ?? []);
}

/** A whole number. Weights, deltas, DCs and leg counts are all integers — no float content. */
export const intSchema = z.number().int();

/** i18n key: dotted lowercase segments, never prose (CLAUDE.md rule 2.4). */
export const I18N_KEY_PATTERN = /^[a-z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_-]+)+$/;

export const i18nKeySchema = z
  .string()
  .regex(I18N_KEY_PATTERN, 'must be an i18n key, not user-visible text');
