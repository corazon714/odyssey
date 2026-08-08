import { type FlagValue, type NumberCmp, type Predicate } from '@odyssey/engine';
import { z } from 'zod';
import {
  eventIdSchema,
  flagIdSchema,
  intSchema,
  itemIdSchema,
  languageIdSchema,
  locationTypeSchema,
  npcIdSchema,
  numberOpSchema,
  regionIdSchema,
  resourceKeySchema,
  routeProfileSchema,
  runStatusSchema,
  skillKeySchema,
  timeOfDaySchema,
  traitIdSchema,
  transportModeSchema,
} from './common.ts';

/**
 * The terse authoring syntax for `requires`, and its transform to the engine's canonical
 * kind-tagged union.
 *
 * Authors write `{ resource: cash, gte: 30 }` and `{ not: { flag: bribed } }`; the engine
 * consumes `{ kind: 'resource', key: 'cash', cmp: { op: 'gte', value: 30 } }`. ADR 0007 §1
 * chose that split deliberately: key-as-discriminant is pleasant YAML and an unusable
 * TypeScript type, because narrowing it needs `in` checks, which defeat switch exhaustiveness.
 *
 * WHY THE RECURSION IS SHAPED LIKE THIS. Zod 4.4.3 cannot infer a recursive transforming
 * schema — it reports TS7022 and asks for an annotation. But `const s: z.ZodType<Predicate>`
 * makes ADR 0009's conformance assertion a TAUTOLOGY, since `z.infer` of an annotated schema
 * IS the annotation; it would pass on a schema that parses nothing, and because `Equals` is
 * deep it would poison GameEvent, Choice and Outcome too. So exactly ONE annotation exists —
 * `recurse` — and every kind's own shape stays inferred and therefore genuinely checked.
 * Measured in `__tests__/zod-idioms.test.ts`.
 *
 * The canonical output is a SAVE-FORMAT SURFACE: it is persisted inside
 * `pendingEvents[].requires` and hashed into `contentVersion`. Changing what this emits
 * changes saves and breaks golden runs, so it is versioned like state, not like a convenience.
 */

/** The terse shape, hand-written. Only the recursive positions need it. */
export type TersePredicate =
  | { readonly always: true }
  | { readonly never: true }
  | { readonly all: readonly TersePredicate[] }
  | { readonly any: readonly TersePredicate[] }
  | { readonly not: TersePredicate }
  | ({ readonly resource: string } & TerseCmp)
  | ({ readonly skill: string } & TerseCmp)
  | { readonly language: string }
  | { readonly trait: string }
  | ({ readonly item: string } & TerseCmp)
  | {
      readonly passport: {
        readonly present?: boolean | null | undefined;
        readonly valid?: boolean | null | undefined;
        readonly flagged?: boolean | null | undefined;
      };
    }
  | { readonly visa: string; readonly valid?: boolean | null | undefined }
  | {
      readonly flag: string;
      readonly is?: FlagValue | null | undefined;
      readonly not?: FlagValue | null | undefined;
    }
  | { readonly noFlag: string }
  | ({ readonly relationship: string } & TerseCmp)
  | { readonly npcMet: string; readonly met?: boolean | null | undefined }
  | ({
      readonly eventSeen: string;
      readonly field?: 'count' | 'lastLeg' | null | undefined;
    } & TerseCmp)
  | { readonly transportMode: readonly string[] }
  | ({ readonly transportStat: 'condition' | 'fuel' } & TerseCmp)
  | { readonly vehicleLegal: boolean }
  | { readonly weather: readonly string[] }
  | { readonly timeOfDay: readonly string[] }
  | { readonly locationType: readonly string[] }
  | { readonly routeProfile: readonly string[] }
  | { readonly status: readonly string[] }
  | ({ readonly leg: true } & TerseCmp)
  | ({ readonly day: true } & TerseCmp)
  | ({ readonly tension: true } & TerseCmp)
  | { readonly chance: number };

/**
 * Note `| undefined` on every field, not just `?`. Under `exactOptionalPropertyTypes` those
 * are different types, and `.nullish()` produces both — a key may be absent OR written as a
 * bare `key:`, which YAML parses as null.
 */
type TerseCmp = {
  readonly eq?: number | null | undefined;
  readonly neq?: number | null | undefined;
  readonly gt?: number | null | undefined;
  readonly gte?: number | null | undefined;
  readonly lt?: number | null | undefined;
  readonly lte?: number | null | undefined;
};

/**
 * Comparison operators, spread across sibling keys in the terse form and collapsed into one
 * `{ op, value }` here. Exactly one must be present: `{ gte: 3, lte: 1 }` is not a range, it
 * is an author who meant `all`, and silently keeping the first would hide that.
 */
const cmpKeys = { eq: true, neq: true, gt: true, gte: true, lt: true, lte: true } as const;

const cmpFields = {
  eq: intSchema.nullish(),
  neq: intSchema.nullish(),
  gt: intSchema.nullish(),
  gte: intSchema.nullish(),
  lt: intSchema.nullish(),
  lte: intSchema.nullish(),
};

function toCmp(raw: Record<string, unknown>, ctx: z.RefinementCtx): NumberCmp {
  const present = Object.keys(cmpKeys).filter((key) => raw[key] !== undefined && raw[key] !== null);
  if (present.length !== 1) {
    ctx.addIssue({
      code: 'custom',
      message:
        present.length === 0
          ? 'needs exactly one comparison (eq, neq, gt, gte, lt, lte)'
          : `has ${String(present.length)} comparisons (${present.join(', ')}); use one, or wrap in \`all\``,
    });
    return { op: 'eq', value: 0 };
  }
  const op = numberOpSchema.parse(present[0]);
  return { op, value: raw[op] as number };
}

/** THE ONE ANNOTATION. See the header: everything else stays inferred so it stays checked. */
const recurse: z.ZodType<Predicate, TersePredicate> = z.lazy(() => predicateSchema);

const flagValueSchema = z.union([z.boolean(), z.number(), z.string()]);

export const predicateSchema = z.union([
  z.strictObject({ always: z.literal(true) }).transform((): Predicate => ({ kind: 'always' })),
  z.strictObject({ never: z.literal(true) }).transform((): Predicate => ({ kind: 'never' })),
  z
    .strictObject({ all: z.array(recurse) })
    .transform((v): Predicate => ({ kind: 'all', of: v.all })),
  z
    .strictObject({ any: z.array(recurse) })
    .transform((v): Predicate => ({ kind: 'any', of: v.any })),
  z.strictObject({ not: recurse }).transform((v): Predicate => ({ kind: 'not', of: v.not })),

  z
    .strictObject({ resource: resourceKeySchema, ...cmpFields })
    .transform((v, ctx): Predicate => ({ kind: 'resource', key: v.resource, cmp: toCmp(v, ctx) })),
  z
    .strictObject({ skill: skillKeySchema, ...cmpFields })
    .transform((v, ctx): Predicate => ({ kind: 'skill', key: v.skill, cmp: toCmp(v, ctx) })),
  z
    .strictObject({ language: languageIdSchema })
    .transform((v): Predicate => ({ kind: 'language', id: v.language })),
  z
    .strictObject({ trait: traitIdSchema })
    .transform((v): Predicate => ({ kind: 'trait', id: v.trait })),
  z
    .strictObject({ item: itemIdSchema, ...cmpFields })
    .transform((v, ctx): Predicate => ({ kind: 'item', id: v.item, cmp: toCmp(v, ctx) })),

  // All three passport fields are tri-state: `null` means "don't care", NOT false. The engine
  // has no optional properties, so an omitted sub-key must materialise as an explicit null.
  z
    .strictObject({
      passport: z.strictObject({
        present: z.boolean().nullish(),
        valid: z.boolean().nullish(),
        flagged: z.boolean().nullish(),
      }),
    })
    .transform((v): Predicate => ({
      kind: 'passport',
      present: v.passport.present ?? null,
      valid: v.passport.valid ?? null,
      flagged: v.passport.flagged ?? null,
    })),
  z
    .strictObject({ visa: regionIdSchema, valid: z.boolean().nullish() })
    .transform((v): Predicate => ({ kind: 'visa', region: v.visa, valid: v.valid ?? true })),

  // `{ flag: x }` is "set"; `{ noFlag: x }` is "not set"; `{ flag: x, is: v }` compares. A
  // bare `not: { flag: x }` also works and is not the same node — `isSet` is not truthiness,
  // so a flag set to `false` IS set (ADR 0007 §5).
  z
    .strictObject({
      flag: flagIdSchema,
      is: flagValueSchema.nullish(),
      not: flagValueSchema.nullish(),
      ...cmpFields,
    })
    .transform((v, ctx): Predicate => ({ kind: 'flag', id: v.flag, cmp: toFlagCmp(v, ctx) })),
  z
    .strictObject({ noFlag: flagIdSchema })
    .transform((v): Predicate => ({ kind: 'flag', id: v.noFlag, cmp: { op: 'notSet' } })),

  z.strictObject({ relationship: npcIdSchema, ...cmpFields }).transform((v, ctx): Predicate => ({
    kind: 'relationship',
    npc: v.relationship,
    cmp: toCmp(v, ctx),
  })),
  z
    .strictObject({ npcMet: npcIdSchema, met: z.boolean().nullish() })
    .transform((v): Predicate => ({ kind: 'npcMet', npc: v.npcMet, met: v.met ?? true })),
  z
    .strictObject({
      eventSeen: eventIdSchema,
      field: z.enum(['count', 'lastLeg']).nullish(),
      ...cmpFields,
    })
    .transform((v, ctx): Predicate => ({
      kind: 'eventMemory',
      event: v.eventSeen,
      field: v.field ?? 'count',
      cmp: toCmp(v, ctx),
    })),

  // `anyOf: []` matches NOTHING here — the opposite of EventContext's empty-means-anything.
  // `.min(1)` makes the difference impossible to trip over by accident (ADR 0009 §2).
  z
    .strictObject({ transportMode: z.array(transportModeSchema).min(1).readonly() })
    .transform((v): Predicate => ({ kind: 'transportMode', anyOf: v.transportMode })),
  z
    .strictObject({ transportStat: z.enum(['condition', 'fuel']), ...cmpFields })
    .transform((v, ctx): Predicate => ({
      kind: 'transportStat',
      key: v.transportStat,
      cmp: toCmp(v, ctx),
    })),
  z
    .strictObject({ vehicleLegal: z.boolean() })
    .transform((v): Predicate => ({ kind: 'vehicleLegal', legal: v.vehicleLegal })),

  z
    .strictObject({ weather: z.array(z.string()).min(1).readonly() })
    .transform((v): Predicate => ({ kind: 'weather', anyOf: v.weather })),
  z
    .strictObject({ timeOfDay: z.array(timeOfDaySchema).min(1).readonly() })
    .transform((v): Predicate => ({ kind: 'timeOfDay', anyOf: v.timeOfDay })),
  z
    .strictObject({ locationType: z.array(locationTypeSchema).min(1).readonly() })
    .transform((v): Predicate => ({ kind: 'locationType', anyOf: v.locationType })),
  z
    .strictObject({ routeProfile: z.array(routeProfileSchema).min(1).readonly() })
    .transform((v): Predicate => ({ kind: 'routeProfile', anyOf: v.routeProfile })),
  z
    .strictObject({ status: z.array(runStatusSchema).min(1).readonly() })
    .transform((v): Predicate => ({ kind: 'status', anyOf: v.status })),

  z
    .strictObject({ leg: z.literal(true), ...cmpFields })
    .transform((v, ctx): Predicate => ({ kind: 'leg', cmp: toCmp(v, ctx) })),
  z
    .strictObject({ day: z.literal(true), ...cmpFields })
    .transform((v, ctx): Predicate => ({ kind: 'day', cmp: toCmp(v, ctx) })),
  z
    .strictObject({ tension: z.literal(true), ...cmpFields })
    .transform((v, ctx): Predicate => ({ kind: 'tension', cmp: toCmp(v, ctx) })),

  // Deliberately NOT clamped to 0-100. Out-of-range is defined behaviour in the evaluator
  // (<=0 is false, >=100 is true, neither consults the RNG) and is asserted by
  // chance-gate.test.ts. Rejecting here would change what content is loadable; the linter
  // warns instead.
  z
    .strictObject({ chance: z.number() })
    .transform((v): Predicate => ({ kind: 'chance', percent: v.chance })),
]);

function toFlagCmp(
  raw: {
    readonly is?: FlagValue | null | undefined;
    readonly not?: FlagValue | null | undefined;
  } & Record<string, unknown>,
  ctx: z.RefinementCtx,
): Extract<Predicate, { kind: 'flag' }>['cmp'] {
  const hasCmp = Object.keys(cmpKeys).some((key) => raw[key] !== undefined && raw[key] !== null);
  const has = [raw.is != null, raw.not != null, hasCmp].filter(Boolean).length;

  if (has === 0) return { op: 'isSet' };
  if (has > 1) {
    ctx.addIssue({ code: 'custom', message: 'use only one of `is`, `not`, or a comparison' });
    return { op: 'isSet' };
  }
  if (raw.is != null) return { op: 'eq', value: raw.is };
  if (raw.not != null) return { op: 'neq', value: raw.not };
  // A numeric comparison against a flag's value: distinct from `is: 3`, which is `===` on a
  // FlagValue and refuses coercion, while this requires the stored value to be a number.
  return { op: 'number', cmp: toCmp(raw, ctx) };
}
