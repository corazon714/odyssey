import { describe, expect, it } from 'vitest';
import { type z } from 'zod';
import {
  PREDICATE_KINDS,
  eventId,
  flagId,
  itemId,
  languageId,
  npcId,
  regionId,
  traitId,
  type Predicate,
  type PredicateKind,
} from '@odyssey/engine';
import { predicateSchema, type TersePredicate } from '../schema/predicate.ts';

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** ADR 0009's conformance assertion, on the type that most needed it. */
export const _out: Equals<z.infer<typeof predicateSchema>, Predicate> = true;

/**
 * ...and the guard that makes the line above worth anything. Zod cannot infer a recursive
 * transforming schema, and the annotation that fixes that (`z.ZodType<Predicate>`) would make
 * `_out` a tautology. An annotated schema's INPUT collapses to `unknown`, so this detects it.
 */
export const _notAnnotated: Equals<z.input<typeof predicateSchema>, unknown> = false;

/**
 * Terse authoring form -> canonical engine form, one case per predicate kind.
 *
 * The set of kinds this produces is asserted equal to `PREDICATE_KINDS` below, so the corpus
 * is exhaustive BY CONSTRUCTION rather than by a count someone has to remember to bump. That
 * matters more than it sounds: `Equals` compares shape and cannot see a transform that emits
 * `lte` where the author wrote `gte`, so this table is the only thing checking meaning.
 */
const CASES: readonly { readonly terse: TersePredicate; readonly canonical: Predicate }[] = [
  { terse: { always: true }, canonical: { kind: 'always' } },
  { terse: { never: true }, canonical: { kind: 'never' } },
  {
    terse: { all: [{ always: true }, { never: true }] },
    canonical: { kind: 'all', of: [{ kind: 'always' }, { kind: 'never' }] },
  },
  {
    terse: { any: [{ always: true }] },
    canonical: { kind: 'any', of: [{ kind: 'always' }] },
  },
  { terse: { not: { always: true } }, canonical: { kind: 'not', of: { kind: 'always' } } },
  {
    terse: { resource: 'money', gte: 30 },
    canonical: { kind: 'resource', key: 'money', cmp: { op: 'gte', value: 30 } },
  },
  {
    terse: { skill: 'negotiation', lt: 4 },
    canonical: { kind: 'skill', key: 'negotiation', cmp: { op: 'lt', value: 4 } },
  },
  { terse: { language: 'ru' }, canonical: { kind: 'language', id: languageId('ru') } },
  {
    terse: { trait: 'smooth_talker' },
    canonical: { kind: 'trait', id: traitId('smooth_talker') },
  },
  {
    terse: { item: 'ration', gte: 1 },
    canonical: { kind: 'item', id: itemId('ration'), cmp: { op: 'gte', value: 1 } },
  },
  {
    terse: { passport: { present: true, valid: true } },
    canonical: { kind: 'passport', present: true, valid: true, flagged: null },
  },
  {
    terse: { visa: 'schengen' },
    canonical: { kind: 'visa', region: regionId('schengen'), valid: true },
  },
  {
    terse: { flag: 'wanted' },
    canonical: { kind: 'flag', id: flagId('wanted'), cmp: { op: 'isSet' } },
  },
  {
    terse: { relationship: 'dmitri', gte: 0 },
    canonical: { kind: 'relationship', npc: npcId('dmitri'), cmp: { op: 'gte', value: 0 } },
  },
  {
    terse: { npcMet: 'border_guard' },
    canonical: { kind: 'npcMet', npc: npcId('border_guard'), met: true },
  },
  {
    terse: { eventSeen: 'border.bribe_attempt', gte: 1 },
    canonical: {
      kind: 'eventMemory',
      event: eventId('border.bribe_attempt'),
      field: 'count',
      cmp: { op: 'gte', value: 1 },
    },
  },
  {
    terse: { transportMode: ['bus', 'train'] },
    canonical: { kind: 'transportMode', anyOf: ['bus', 'train'] },
  },
  {
    terse: { transportStat: 'fuel', lte: 2 },
    canonical: { kind: 'transportStat', key: 'fuel', cmp: { op: 'lte', value: 2 } },
  },
  { terse: { vehicleLegal: false }, canonical: { kind: 'vehicleLegal', legal: false } },
  { terse: { weather: ['rain'] }, canonical: { kind: 'weather', anyOf: ['rain'] } },
  { terse: { timeOfDay: ['night'] }, canonical: { kind: 'timeOfDay', anyOf: ['night'] } },
  {
    terse: { routeProfile: ['illicit'] },
    canonical: { kind: 'routeProfile', anyOf: ['illicit'] },
  },
  { terse: { status: ['travelling'] }, canonical: { kind: 'status', anyOf: ['travelling'] } },
  { terse: { leg: true, gte: 5 }, canonical: { kind: 'leg', cmp: { op: 'gte', value: 5 } } },
  { terse: { day: true, eq: 3 }, canonical: { kind: 'day', cmp: { op: 'eq', value: 3 } } },
  {
    terse: { tension: true, gt: 0 },
    canonical: { kind: 'tension', cmp: { op: 'gt', value: 0 } },
  },
  { terse: { chance: 30 }, canonical: { kind: 'chance', percent: 30 } },
];

describe('terse -> canonical predicate transform', () => {
  it('covers every predicate kind', () => {
    // Exhaustive by construction. A 28th kind added to the engine fails HERE, naming itself,
    // rather than shipping with no schema and no author able to write it.
    const covered = new Set<PredicateKind>(CASES.map((c) => c.canonical.kind));
    expect([...PREDICATE_KINDS].filter((kind) => !covered.has(kind))).toEqual([]);
  });

  it.each(CASES.map((c) => [c.canonical.kind, c] as const))('%s', (_kind, testCase) => {
    expect(predicateSchema.parse(testCase.terse)).toEqual(testCase.canonical);
  });

  it('recurses through all/any/not', () => {
    expect(
      predicateSchema.parse({
        all: [{ resource: 'money', gte: 30 }, { not: { flag: 'bribed_this_border' } }],
      }),
    ).toEqual({
      kind: 'all',
      of: [
        { kind: 'resource', key: 'money', cmp: { op: 'gte', value: 30 } },
        {
          kind: 'not',
          of: { kind: 'flag', id: 'bribed_this_border', cmp: { op: 'isSet' } },
        },
      ],
    });
  });
});

describe('what the transform refuses', () => {
  it('rejects an unknown key instead of silently dropping it', () => {
    // A misspelling that Zod strips would produce a defaulted predicate and still satisfy
    // every type assertion above. This is the reason every object here is strict.
    expect(() => predicateSchema.parse({ resource: 'money', gtee: 30 })).toThrow();
  });

  it('rejects a comparison with no operator, and one with two', () => {
    expect(() => predicateSchema.parse({ resource: 'money' })).toThrow(/exactly one comparison/);
    // `{ gte: 30, lte: 10 }` is not a range — it is an author who meant `all`. Keeping the
    // first silently would hide a contradiction the linter is separately trying to catch.
    expect(() => predicateSchema.parse({ resource: 'money', gte: 30, lte: 10 })).toThrow(
      /2 comparisons/,
    );
  });

  it('rejects an unknown resource key and a malformed id', () => {
    expect(() => predicateSchema.parse({ resource: 'gumption', gte: 1 })).toThrow();
    expect(() => predicateSchema.parse({ flag: 'Wanted-Level' })).toThrow();
  });

  it('rejects an empty anyOf, which would match nothing', () => {
    // The trap ADR 0009 §2 names: `[]` means NO CONSTRAINT on EventContext but matches
    // NOTHING in a predicate. Making it unwritable removes the ambiguity.
    expect(() => predicateSchema.parse({ transportMode: [] })).toThrow();
  });

  it('does NOT clamp chance, because out-of-range is defined behaviour', () => {
    // The evaluator treats <=0 as false and >=100 as true without consulting the RNG, and
    // chance-gate.test.ts asserts it. Rejecting here would change what content is loadable.
    expect(predicateSchema.parse({ chance: -5 })).toEqual({ kind: 'chance', percent: -5 });
    expect(predicateSchema.parse({ chance: 150 })).toEqual({ kind: 'chance', percent: 150 });
  });
});

describe('flag comparison forms', () => {
  it('distinguishes set, not-set, equality and numeric comparison', () => {
    expect(predicateSchema.parse({ flag: 'wanted' })).toEqual({
      kind: 'flag',
      id: 'wanted',
      cmp: { op: 'isSet' },
    });
    expect(predicateSchema.parse({ noFlag: 'wanted' })).toEqual({
      kind: 'flag',
      id: 'wanted',
      cmp: { op: 'notSet' },
    });
    expect(predicateSchema.parse({ flag: 'debt', is: 3 })).toEqual({
      kind: 'flag',
      id: 'debt',
      cmp: { op: 'eq', value: 3 },
    });
    // Distinct from `is: 3`: `eq` is `===` on a FlagValue and refuses coercion, while
    // `number` requires the stored value to actually be a number (ADR 0007 §5).
    expect(predicateSchema.parse({ flag: 'debt', gte: 3 })).toEqual({
      kind: 'flag',
      id: 'debt',
      cmp: { op: 'number', cmp: { op: 'gte', value: 3 } },
    });
  });

  it('refuses two comparison forms at once', () => {
    expect(() => predicateSchema.parse({ flag: 'debt', is: 3, gte: 1 })).toThrow(/only one of/);
  });
});
