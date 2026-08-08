import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { type z } from 'zod';
import * as engine from '@odyssey/engine';
import {
  type BeatType,
  type CheckVisibility,
  type EventPriority,
  type Effect,
  type GameEvent,
  type LocationType,
  type Predicate,
  type TimeOfDay,
} from '@odyssey/engine';
import * as schema from '../schema/index.ts';

/**
 * ADR 0009'S CONFORMANCE SURFACE, ENFORCED.
 *
 * ADR 0009 requires the Zod schemas and the engine's hand-written types to be held identical
 * by a compile-time assertion rather than by convention. This file is that assertion, in
 * three layers, because the one the ADR describes is not sufficient on its own:
 *
 *   L1  `Equals<z.infer<S>, T>` per type. Identity, so it catches `readonly`, `?` vs `| null`
 *       and nominal brands, none of which `extends` would.
 *   L1' `Equals<z.input<S>, unknown> = false`. An annotated `z.ZodType<Out>` defaults its
 *       INPUT to `unknown`, and that annotation makes L1 a tautology. This is what stops
 *       someone silencing a recursion error and taking five assertions offline with it. See
 *       `zod-idioms.test.ts` for the measurement.
 *   L2  Completeness. L1 cannot catch a type that has NO schema — it is silently conformant.
 *       So the engine's vocabularies are enumerated at RUNTIME off the barrel and each is
 *       required to have a schema whose options match. Modelled on M11's fixture-completeness
 *       meta-test, which is the pattern this repo already trusts.
 */

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ── L1 — the twelve types ────────────────────────────────────────────────────────────────
// Six are scalar vocabularies, checked as enum member types.
export const _beatType: Equals<z.infer<typeof schema.beatTypeSchema>, BeatType> = true;
export const _locationType: Equals<z.infer<typeof schema.locationTypeSchema>, LocationType> = true;
export const _timeOfDay: Equals<z.infer<typeof schema.timeOfDaySchema>, TimeOfDay> = true;
export const _priority: Equals<z.infer<typeof schema.eventPrioritySchema>, EventPriority> = true;
export const _visibility: Equals<
  z.infer<typeof schema.checkVisibilitySchema>,
  CheckVisibility
> = true;

export const _predicate: Equals<z.infer<typeof schema.predicateSchema>, Predicate> = true;
export const _effect: Equals<z.infer<typeof schema.effectSchema>, Effect> = true;
export const _event: Equals<z.infer<typeof schema.gameEventSchema>, GameEvent> = true;

// GameEvent's own type is the carrier for Choice, Outcome, SkillCheck, CheckModifier and
// EventContext — the remaining five of the twelve. Asserting them separately against the
// event schema's output proves the nesting is right, not just the leaves.
type ParsedEvent = z.infer<typeof schema.gameEventSchema>;
export const _choice: Equals<ParsedEvent['choices'][number], engine.Choice> = true;
export const _outcome: Equals<ParsedEvent['choices'][number]['outcomes'][number], engine.Outcome> =
  true;
export const _check: Equals<
  NonNullable<ParsedEvent['choices'][number]['skillCheck']>,
  engine.SkillCheck
> = true;
export const _modifier: Equals<
  NonNullable<ParsedEvent['choices'][number]['skillCheck']>['modifiers'][number],
  engine.CheckModifier
> = true;
export const _context: Equals<ParsedEvent['context'], engine.EventContext> = true;

// ── L1' — anti-vacuity ───────────────────────────────────────────────────────────────────
export const _predicateReal: Equals<z.input<typeof schema.predicateSchema>, unknown> = false;
export const _effectReal: Equals<z.input<typeof schema.effectSchema>, unknown> = false;
export const _eventReal: Equals<z.input<typeof schema.gameEventSchema>, unknown> = false;

// ── L2 — completeness, enumerated at runtime ─────────────────────────────────────────────
const SCHEMA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'schema');

/** Engine vocabulary export -> the schema that must mirror it. */
const VOCABULARIES: Readonly<Record<string, z.ZodType>> = {
  BEAT_TYPES: schema.beatTypeSchema,
  CHECK_TAGS: schema.checkTagSchema,
  CONTAINER_KINDS: schema.containerKindSchema,
  CHECK_VISIBILITIES: schema.checkVisibilitySchema,
  EVENT_PRIORITIES: schema.eventPrioritySchema,
  LOCATION_TYPES: schema.locationTypeSchema,
  NUMBER_OPS: schema.numberOpSchema,
  RESOURCE_KEYS: schema.resourceKeySchema,
  ROUTE_PROFILES: schema.routeProfileSchema,
  RUN_STATUSES: schema.runStatusSchema,
  SKILL_KEYS: schema.skillKeySchema,
  TIMES_OF_DAY: schema.timeOfDaySchema,
  TRANSPORT_MODES: schema.transportModeSchema,
};

/**
 * Engine arrays that are deliberately NOT content vocabularies, with the reason. Anything
 * exported by the barrel that is neither here nor in VOCABULARIES fails the sweep — which is
 * how a NEW vocabulary shipping without a schema becomes a red test rather than silence.
 */
const NOT_CONTENT: Readonly<Record<string, string>> = {
  ALL_RNG_STREAMS: 'runtime randomness, never authored',
  RNG_STREAMS: 'runtime randomness, never authored',
  BEAT_SLOT_STATUSES: 'route state, set by the director; reachable only via a route effect',
  EFFECT_OPS: 'checked structurally by the effect discriminated union, not as an enum',
  MODIFIER_SOURCE_KINDS: 'checked by the modifiers.yaml schema in modifier-registry.test.ts',
  PREDICATE_KINDS: 'checked by predicate-schema.test.ts, which round-trips every kind',
  ENGINE_ERROR_CODES: 'engine output, never authored',
  PENDING_DROP_REASONS: 'engine output, never authored',
  RELAXATION_RUNGS: 'director configuration, not content',
  SCORING_FACTORS: 'director configuration, not content',
  MIGRATIONS: 'save-schema ladder, not content',
  PHASE_1_MODIFIER_SOURCES: 'engine wiring, not content',
  PHASE_1_COMPLICATION_SOURCES: 'engine wiring, not content',
  DRAIN_ORDER:
    'engine ordering policy, not an authored vocabulary — same members as CONTAINER_KINDS',
  EMPTY_COMPLICATIONS: 'empty constant',
  EMPTY_MODIFIER_REGISTRY: 'empty constant',
  EMPTY_REASONS: 'empty constant',
  NO_CLAMPS: 'empty constant',
  NO_DROPS: 'empty constant',
};

describe('L2 — every engine vocabulary has a schema', () => {
  const exported = Object.entries(engine).filter(([, value]) => Array.isArray(value));

  it('has vocabularies to check', () => {
    // Anti-vacuous guard, the same one purity.test.ts carries.
    expect(exported.length).toBeGreaterThan(10);
  });

  it('classifies every array the barrel exports', () => {
    const unclassified = exported
      .map(([name]) => name)
      .filter((name) => !(name in VOCABULARIES) && !(name in NOT_CONTENT));
    expect(
      unclassified,
      'add these to VOCABULARIES with a schema, or to NOT_CONTENT with a reason',
    ).toEqual([]);
  });

  it.each(Object.keys(VOCABULARIES))('%s matches its schema exactly', (name) => {
    const members = (engine as unknown as Record<string, readonly string[]>)[name];
    const schemaFor = VOCABULARIES[name];
    expect(members).toBeDefined();
    expect(schemaFor).toBeDefined();
    if (members === undefined || schemaFor === undefined) return;

    // Every member parses...
    for (const member of members) expect(schemaFor.parse(member)).toBe(member);
    // ...and nothing else does, so the schema cannot be quietly wider than the vocabulary.
    expect(() => schemaFor.parse('__not_a_member__')).toThrow();
  });
});

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

describe('L1 hygiene — no schema may be annotated into vacuity', () => {
  it('no schema file declares a z.ZodType annotation outside the sanctioned recursion', () => {
    // `predicate.ts` needs exactly one (`recurse`) because Zod cannot infer a recursive
    // transforming schema. Every other occurrence would silently turn an `Equals` assertion
    // into a tautology, so the count is pinned rather than the pattern banned outright.
    const files = readdirSync(SCHEMA_DIR).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(3);

    const found = files.flatMap((file) => {
      // Comments MUST be stripped first: the doc comments here explain the annotation they
      // are warning about, so an unstripped scan counts the explanation as a violation. The
      // engine's purity.test.ts carries the same helper after the mirror-image bug — a
      // pattern that was silently dead because literals were blanked before it ran.
      const source = stripComments(readFileSync(join(SCHEMA_DIR, file), 'utf8'));
      const matches = source.match(/:\s*z\.ZodType[<\s]/g) ?? [];
      return matches.map(() => file);
    });
    expect(found).toEqual(['predicate.ts']);
  });

  it('the comment stripper does not blank out real code', () => {
    // Guards the guard. A stripper that ate everything would make the sweep above pass
    // vacuously for any file.
    expect(stripComments('const a: z.ZodType<X> = 1; // : z.ZodType<Y>')).toContain('z.ZodType<X>');
    expect(stripComments('/* : z.ZodType<Y> */ const b = 2;')).not.toContain('ZodType');
  });
});
