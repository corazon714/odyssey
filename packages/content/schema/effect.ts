import { BEAT_SLOT_STATUSES, type Effect } from '@odyssey/engine';
import { z } from 'zod';
import {
  endingIdSchema,
  eventIdSchema,
  flagIdSchema,
  intSchema,
  itemIdSchema,
  list,
  npcIdSchema,
  nullable,
  regionIdSchema,
  resourceKeySchema,
  skillKeySchema,
  transportModeSchema,
} from './common.ts';
import { predicateSchema } from './predicate.ts';

/**
 * The effect DSL. Unlike predicates there is NO terse form and no normalisation.
 *
 * ADR 0007 §1's whole argument for transforming predicates is that key-as-discriminant
 * cannot narrow in TypeScript. `op` is already a proper discriminant, so effects need
 * nothing — and adding a second terse syntax here would reintroduce exactly the problem the
 * ADR removed, for a shape that is already only one key longer. What effects get instead is
 * aggressive defaulting: `{ op: flag, id: x }` is a permanent flag set to true.
 *
 * `z.discriminatedUnion` rather than `z.union`: it reports "unknown op" against the one
 * candidate branch instead of dumping every branch's failure, which is the difference between
 * a usable linter message and a wall of noise.
 */

const transportChangeSchema = z
  .discriminatedUnion('field', [
    z.strictObject({
      field: z.literal('mode'),
      mode: transportModeSchema,
      vehicleId: nullable(z.string()),
    }),
    z.strictObject({ field: z.literal('condition'), delta: intSchema }),
    z.strictObject({ field: z.literal('fuel'), delta: intSchema }),
    z.strictObject({ field: z.literal('legal'), legal: z.boolean() }),
  ])
  .readonly();

const documentChangeSchema = z
  .discriminatedUnion('field', [
    z.strictObject({ field: z.literal('grantPassport'), valid: z.boolean() }),
    // Distinct from never having had one: `present: false` is what opens recovery events,
    // while `passport: null` means the run never issued one at all.
    z.strictObject({ field: z.literal('losePassport') }),
    z.strictObject({ field: z.literal('passportFlagged'), flagged: z.boolean() }),
    z.strictObject({
      field: z.literal('visa'),
      region: regionIdSchema,
      valid: z.boolean(),
      expiresDay: nullable(intSchema),
    }),
    z.strictObject({ field: z.literal('useTicket'), ticketId: z.string() }),
  ])
  .readonly();

const routeChangeSchema = z
  .discriminatedUnion('field', [
    z.strictObject({ field: z.literal('progressKm'), delta: intSchema }),
    z.strictObject({
      field: z.literal('beatStatus'),
      legIndex: intSchema.nonnegative(),
      status: z.enum(BEAT_SLOT_STATUSES),
    }),
  ])
  .readonly();

/** Text interpolation params. Primitives only — they are hashed and JSON round-tripped. */
const textParamsSchema = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
  .readonly();

const flagValueSchema = z.union([z.boolean(), z.number(), z.string()]);

export const effectSchema = z
  .discriminatedUnion('op', [
    z.strictObject({ op: z.literal('resource'), key: resourceKeySchema, delta: intSchema }),
    z.strictObject({ op: z.literal('skill'), key: skillKeySchema, delta: intSchema }),

    // The common case is a permanent boolean flag, so that is what omitting both keys means.
    z.strictObject({
      op: z.literal('flag'),
      id: flagIdSchema,
      value: flagValueSchema.nullish().transform((v) => v ?? true),
      ttlLegs: nullable(intSchema.positive()),
    }),
    z.strictObject({ op: z.literal('clearFlag'), id: flagIdSchema }),

    z.strictObject({
      op: z.literal('relationship'),
      npc: npcIdSchema,
      trustDelta: intSchema,
      // Defaults FALSE, not true. Marking an NPC met is a memory write other events gate on,
      // so it should be a thing the author said, not a side effect of adjusting trust. The
      // linter flags trust changes on an NPC no event ever meets.
      meet: z
        .boolean()
        .nullish()
        .transform((v) => v ?? false),
      addTags: list(z.string()),
    }),

    z.strictObject({ op: z.literal('advanceTime'), hours: intSchema.positive() }),

    z.strictObject({
      op: z.literal('scheduleEvent'),
      eventId: eventIdSchema,
      // Leg offsets from now, inclusive. The director may decline it — this is the single
      // sanctioned soft pointer (CLAUDE.md rule 2.1), never a required next step.
      inLegs: z.tuple([intSchema.nonnegative(), intSchema.nonnegative()]).readonly(),
      requires: nullable(predicateSchema),
      payload: nullable(textParamsSchema),
    }),

    z.strictObject({ op: z.literal('unlockEnding'), id: endingIdSchema }),

    z.strictObject({
      op: z.literal('item'),
      id: itemIdSchema,
      countDelta: intSchema,
      // null PRESERVES the existing condition rather than clearing it — see applyItem.
      condition: nullable(intSchema),
    }),

    z.strictObject({ op: z.literal('transport'), change: transportChangeSchema }),
    z.strictObject({ op: z.literal('document'), change: documentChangeSchema }),
    z.strictObject({ op: z.literal('route'), change: routeChangeSchema }),
  ])
  .readonly();

/** Compile error if the schema and the engine's union stop agreeing. ADR 0009. */
export type EffectSchemaOutput = z.infer<typeof effectSchema>;
export type EffectSchemaMatchesEngine = EffectSchemaOutput extends Effect ? true : never;
