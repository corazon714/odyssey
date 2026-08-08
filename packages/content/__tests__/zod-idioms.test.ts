import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { eventId, flagId, type EventId, type Predicate } from '@odyssey/engine';

/**
 * WHICH ZOD IDIOMS SATISFY ADR 0009's CONFORMANCE ASSERTION — verified by the compiler.
 *
 * ADR 0009 requires `Equals<z.infer<typeof schema>, EngineType>` to hold for twelve types,
 * and `Equals` is TypeScript's identity relation: it discriminates `readonly`, optionality,
 * and nominal brands. Most obvious Zod idioms fail it, and they fail SILENTLY in the sense
 * that the error is a bare "Type 'true' is not assignable to type 'false'" a hundred lines
 * from the cause.
 *
 * So the idiom choices are settled here, once, against the real compiler, before eleven
 * schemas are written on top of them. Every `export const` below is a type-level assertion:
 * this file failing to TYPECHECK is the failure mode, not a failing runtime expectation.
 * The runtime tests underneath prove the same schemas actually parse.
 *
 * Re-run this after any Zod upgrade. It is the regression guard for the whole schema layer.
 */

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ═══ 1. Branded ids ══════════════════════════════════════════════════════════════════════
// The engine's `Brand<T,B> = T & { readonly [BRAND]: B }` keys on a module-private
// `declare const unique symbol`. No other package can name that key, so the ONLY way to
// produce an identity-equal branded id is to call the engine's own constructor.

const brandedOk = z.string().transform(eventId);
export const _brand1: Equals<z.infer<typeof brandedOk>, EventId> = true;

export const brandedNullable = z.string().transform(eventId).nullable();
export const _brand2: Equals<z.infer<typeof brandedNullable>, EventId | null> = true;

export const brandedArray = z.array(z.string().transform(eventId)).readonly();
export const _brand3: Equals<z.infer<typeof brandedArray>, readonly EventId[]> = true;

// FAILS: `.brand()` keys on Zod's own symbol, not the engine's. First thing anyone reaches
// for, and the resulting type is structurally different.
export const zodBrand = z.string().brand<'EventId'>();
export const _brand4: Equals<z.infer<typeof zodBrand>, EventId> = false;

// FAILS: Zod's `MakeReadonly` falls through to `Readonly<EventId>` for a branded scalar,
// because `string & {…}` is not one of its `BuiltIn` cases. `.readonly()` is for arrays and
// objects only — on a scalar it silently produces a type that is not the engine's.
export const brandedReadonly = z.string().transform(eventId).readonly();
export const _brand5: Equals<z.infer<typeof brandedReadonly>, EventId> = false;

// ═══ 2. Recursion — and the vacuity trap it sets ═════════════════════════════════════════
// `Predicate` is recursive and must be `.transform()`ed from a terse authoring shape. The
// obvious way to make that compile is `const s: z.ZodType<Predicate> = z.lazy(…)`.
//
// THAT ANNOTATION MAKES THE ADR 0009 ASSERTION A TAUTOLOGY. `z.infer` of an annotated schema
// IS the annotation, so `Equals<z.infer<typeof s>, Predicate>` passes even if the schema
// parses nothing. Because `Equals` is deep, it would also poison GameEvent, Choice and
// Outcome, which all reach Predicate — five of the twelve assertions, including the four
// that matter most.
//
// The fix: annotate ONLY the recursive back-reference and leave the union itself inferred.

type TersePredicate =
  | { readonly always: true }
  | { readonly flag: string }
  | { readonly not: TersePredicate }
  | { readonly all: readonly TersePredicate[] };

/** The one annotation. It breaks the inference cycle without hiding the union's own shape. */
const recurse: z.ZodType<Predicate, TersePredicate> = z.lazy(() => tersePredicate);

const tersePredicate = z.union([
  z.strictObject({ always: z.literal(true) }).transform((): Predicate => ({ kind: 'always' })),
  z
    .strictObject({ flag: z.string() })
    .transform((v): Predicate => ({ kind: 'flag', id: flagId(v.flag), cmp: { op: 'isSet' } })),
  z.strictObject({ not: recurse }).transform((v): Predicate => ({ kind: 'not', of: v.not })),
  z
    .strictObject({ all: z.array(recurse) })
    .transform((v): Predicate => ({ kind: 'all', of: v.all })),
]);

export const _rec1: Equals<z.infer<typeof tersePredicate>, Predicate> = true;

/**
 * THE ANTI-VACUITY GUARD, and the reason `_rec1` above is worth anything.
 *
 * An annotated `z.ZodType<Out>` defaults its INPUT to `unknown`. So asserting the input is
 * *not* `unknown` detects the annotation directly — no need to hand-mirror the terse type,
 * which is brittle because the readonly boundary differs between annotated and inferred arms.
 * Every real schema in this package carries this assertion alongside its output one.
 */
export const _rec2: Equals<z.input<typeof tersePredicate>, unknown> = false;

/** Guards the guard: the fully-annotated form IS vacuous, and this proves the check sees it. */
export const annotatedWhole: z.ZodType<Predicate> = z.lazy(() => tersePredicate);
export const _rec3: Equals<z.infer<typeof annotatedWhole>, Predicate> = true; // passes vacuously
export const _rec4: Equals<z.input<typeof annotatedWhole>, unknown> = true; // ...and is caught

/** Guards the guard again: a schema producing the WRONG output must fail `_rec1`'s form. */
export const wrongOutput = z.union([
  z.strictObject({ always: z.literal(true) }).transform(() => ({ kind: 'always' }) as const),
  z.strictObject({ flag: z.string() }).transform((v) => ({ oops: v.flag })),
]);
export const _rec5: Equals<z.infer<typeof wrongOutput>, Predicate> = false;

// ═══ 3. Intersections ════════════════════════════════════════════════════════════════════
// `z.intersection` DOES infer an identity-equal intersection — so `SkillCheck` could have
// stayed `SkillCheckSpec & { visibility }`. It is flattened in the engine anyway, for a
// reason `Equals` cannot express: `.strictObject` on either half of an intersection rejects
// the other half's keys, so an intersection can never be made strict, and unknown-key typos
// would parse clean. See `_strict1`.
export const intersected = z.intersection(
  z.strictObject({ a: z.number() }).readonly(),
  z.strictObject({ b: z.string() }).readonly(),
);
export const _inter1: Equals<
  z.infer<typeof intersected>,
  Readonly<{ a: number }> & Readonly<{ b: string }>
> = true;
/** An intersection is NOT identity-equal to its flattening — so the two are not swappable. */
export const _inter2: Equals<
  z.infer<typeof intersected>,
  { readonly a: number; readonly b: string }
> = false;

// ═══ 4. Optionality — `| null`, never `?` (ADR 0009 §2) ══════════════════════════════════
// `.optional()` under `exactOptionalPropertyTypes` yields `k?: T | undefined`, which is not
// identical to the engine's `k: T | null`. Every omitted YAML key becomes `| null` or `[]`.
export const nullableField = z.strictObject({
  k: z
    .string()
    .nullish()
    .transform((v) => v ?? null),
});
export const _opt1: Equals<z.infer<typeof nullableField>, { k: string | null }> = true;

export const optionalField = z.strictObject({ k: z.string().optional() });
export const _opt2: Equals<z.infer<typeof optionalField>, { k: string | null }> = false;

describe('Zod idioms — runtime behaviour behind the type assertions', () => {
  it('parses the terse predicate recursively into canonical form', () => {
    expect(tersePredicate.parse({ not: { flag: 'wanted' } })).toEqual({
      kind: 'not',
      of: { kind: 'flag', id: 'wanted', cmp: { op: 'isSet' } },
    });
    expect(tersePredicate.parse({ all: [{ always: true }, { flag: 'bribed' }] })).toEqual({
      kind: 'all',
      of: [{ kind: 'always' }, { kind: 'flag', id: 'bribed', cmp: { op: 'isSet' } }],
    });
  });

  it('rejects an unknown key rather than silently dropping it', () => {
    // The reason every schema in this package is `strictObject`: a typo'd `visibilty:` would
    // otherwise parse clean, produce a defaulted value, and satisfy every type assertion.
    expect(() => tersePredicate.parse({ flag: 'wanted', typo: 1 })).toThrow();
  });

  it('`.default()` does NOT fire on an explicit null', () => {
    // YAML `weather:` with no value parses as null, not undefined. `.default([])` would not
    // fire, the field would be null at runtime, and ADR 0009 §2's "empty means no constraint"
    // would break — while every type assertion still passed. Hence `.nullish().transform`.
    expect(z.array(z.string()).default([]).parse(undefined)).toEqual([]);
    expect(() => z.array(z.string()).default([]).parse(null)).toThrow();
    expect(
      z
        .array(z.string())
        .nullish()
        .transform((v) => v ?? [])
        .parse(null),
    ).toEqual([]);
  });

  it('produces branded ids the engine accepts', () => {
    const parsed = brandedOk.parse('border.bribe_attempt');
    expect(parsed).toBe('border.bribe_attempt');
    expect(typeof parsed).toBe('string');
  });
});
