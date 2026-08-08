import {
  choiceId as toChoiceId,
  type Choice,
  type EventContext,
  type GameEvent,
  type Outcome,
  type SkillCheck,
} from '@odyssey/engine';
import { z } from 'zod';
import {
  beatTypeSchema,
  checkTagSchema,
  checkVisibilitySchema,
  eventIdSchema,
  eventPrioritySchema,
  i18nKeySchema,
  ID_PATTERN,
  intSchema,
  list,
  locationTypeSchema,
  nullable,
  routeProfileSchema,
  skillKeySchema,
  timeOfDaySchema,
  transportModeSchema,
} from './common.ts';
import { effectSchema } from './effect.ts';
import { predicateSchema } from './predicate.ts';

/**
 * The authored event file, and its transform to `GameEvent`.
 *
 * THERE ARE NO TEXT FIELDS IN AN EVENT FILE. Not one `titleKey`, `labelKey` or `textKey`:
 * they are DERIVED from ids by `buildEvent` below. That is what makes CLAUDE.md rule 2.4
 * ("no user-visible string literals, only i18n keys") true by construction rather than by
 * review — there is nowhere in the file to type prose, because there are no string fields to
 * type it into. Explicit keys remain accepted as an escape hatch, and the linter warns when
 * one is used where the derived key would have done, so the corpus stays uniform.
 *
 * HOW CONFORMANCE IS ENFORCED HERE, which differs from `predicate.ts`. Derived keys need the
 * parent's id, and a nested Zod transform cannot see its parent — so the tree is validated
 * first and assembled second, by plain functions annotated `: GameEvent` / `: Choice` /
 * `: Outcome`. TypeScript checks an annotated object literal exhaustively in both directions
 * (missing property AND excess property), so those annotations are the real guarantee; the
 * `Equals` assertions in the tests then hold by construction. Change `GameEvent` and the
 * builder stops compiling, which is the outcome ADR 0009 asked for.
 */

const CHOICE_ID = z.string().regex(ID_PATTERN, 'choice ids are snake_case').transform(toChoiceId);

const contextSchema = z
  .strictObject({
    locationTypes: list(locationTypeSchema),
    timeOfDay: list(timeOfDaySchema),
    transportModes: list(transportModeSchema),
    weather: list(z.string()),
    routeProfiles: list(routeProfileSchema),
  })
  .nullish()
  .transform(
    (v): EventContext =>
      v ?? {
        locationTypes: [],
        timeOfDay: [],
        transportModes: [],
        weather: [],
        routeProfiles: [],
      },
  );

const checkModifierSchema = z.strictObject({
  labelKey: i18nKeySchema,
  delta: intSchema,
  when: nullable(predicateSchema),
  /**
   * Authoring-only, stripped by the transform. A modifier written onto a choice instead of
   * into `modifiers.yaml` is the anti-pattern that caps this game's replayability, so the
   * author has to say why in the file. `content:lint`'s LOCAL_MODIFIER rule reads it from the
   * raw document and errors when it is missing or when the modifier duplicates a registry row.
   */
  why: z.string().nullish(),
});

const skillCheckSchema = z.strictObject({
  skill: skillKeySchema,
  dc: intSchema,
  /**
   * REQUIRED, with no default and a minimum of one.
   *
   * It is the only thing the modifier registry can key on, and the failure mode of forgetting
   * it is silent: the check still rolls, it just draws no registry modifiers at all. Making
   * the schema reject the file is the only point at which that is cheap to catch. Per the
   * pairing rule in `modifiers/check-tag.ts`, tag the broad tag AND the flavour.
   */
  tags: z.array(checkTagSchema).min(1, 'a check with no tags draws no registry modifiers'),
  visibility: checkVisibilitySchema.nullish().transform((v) => v ?? 'partial'),
  modifiers: list(checkModifierSchema),
});

const outcomeSchema = z.strictObject({
  id: z.string().regex(ID_PATTERN, 'outcome ids are snake_case'),
  weight: intSchema.positive(),
  onCheck: nullable(z.enum(['success', 'failure'])),
  requires: nullable(predicateSchema),
  /**
   * "You have been here before" alternates. `variants: 2` derives `<base>.v1` and `<base>.v2`
   * and is the ergonomic default. `textVariants` names them instead, for when the alternate
   * deserves a readable key of its own (`out.onward_again` beats `out.onward.v2` in a
   * translator's file). Giving both is an error rather than a precedence puzzle.
   */
  variants: intSchema
    .nonnegative()
    .nullish()
    .transform((v) => v ?? 0),
  textVariants: list(i18nKeySchema),
  textKey: z.string().nullish(),
  effects: list(effectSchema),
});

const choiceSchema = z.strictObject({
  id: CHOICE_ID,
  requires: nullable(predicateSchema),
  hiddenUnless: nullable(predicateSchema),
  labelKey: z.string().nullish(),
  costs: list(effectSchema),
  check: nullable(skillCheckSchema),
  outcomes: z.array(outcomeSchema).min(1),
});

const rawEventSchema = z.strictObject({
  id: eventIdSchema,
  version: intSchema
    .positive()
    .nullish()
    .transform((v) => v ?? 1),
  category: z.string().regex(ID_PATTERN, 'category is snake_case'),
  tags: list(z.string()),
  priority: eventPrioritySchema.nullish().transform((v) => v ?? 'normal'),
  beatType: nullable(beatTypeSchema),
  weight: intSchema
    .positive()
    .nullish()
    .transform((v) => v ?? 100),
  tensionBand: nullable(z.tuple([z.number(), z.number()]).readonly()),
  context: contextSchema,
  cooldownLegs: intSchema
    .nonnegative()
    .nullish()
    .transform((v) => v ?? 0),
  maxOccurrences: nullable(intSchema.positive()),
  exclusiveGroup: nullable(z.string().regex(ID_PATTERN)),
  requires: nullable(predicateSchema),
  image: nullable(z.string()),
  titleKey: z.string().nullish(),
  bodyKey: z.string().nullish(),
  choices: z.array(choiceSchema).min(1),
});

type RawEvent = z.infer<typeof rawEventSchema>;
type RawChoice = RawEvent['choices'][number];
type RawOutcome = RawChoice['outcomes'][number];

function buildOutcome(eventKey: string, raw: RawOutcome): Outcome {
  const base = `events.${eventKey}.out.${raw.id}`;
  return {
    weight: raw.weight,
    onCheck: raw.onCheck,
    requires: raw.requires ?? { kind: 'always' },
    textKey: raw.textKey ?? base,
    textVariants:
      raw.textVariants.length > 0
        ? raw.textVariants
        : Array.from({ length: raw.variants }, (_, i) => `${base}.v${String(i + 1)}`),
    effects: raw.effects,
  };
}

function buildCheck(raw: NonNullable<RawChoice['check']>): SkillCheck {
  return {
    skill: raw.skill,
    dc: raw.dc,
    tags: raw.tags,
    visibility: raw.visibility,
    // `why` is authoring metadata for the linter; it must not reach the engine's type.
    modifiers: raw.modifiers.map((m) => ({ labelKey: m.labelKey, delta: m.delta, when: m.when })),
  };
}

function buildChoice(eventKey: string, raw: RawChoice): Choice {
  return {
    id: raw.id,
    labelKey: raw.labelKey ?? `events.${eventKey}.choice.${raw.id}`,
    requires: raw.requires ?? { kind: 'always' },
    hiddenUnless: raw.hiddenUnless,
    costs: raw.costs,
    skillCheck: raw.check === null ? null : buildCheck(raw.check),
    outcomes: raw.outcomes.map((outcome) => buildOutcome(eventKey, outcome)),
  };
}

function buildEvent(raw: RawEvent): GameEvent {
  const key = raw.id;
  return {
    id: raw.id,
    version: raw.version,
    category: raw.category,
    tags: raw.tags,
    priority: raw.priority,
    beatType: raw.beatType,
    weight: raw.weight,
    tensionBand: raw.tensionBand,
    context: raw.context,
    cooldownLegs: raw.cooldownLegs,
    maxOccurrences: raw.maxOccurrences,
    exclusiveGroup: raw.exclusiveGroup,
    requires: raw.requires ?? { kind: 'always' },
    image: raw.image,
    titleKey: raw.titleKey ?? `events.${key}.title`,
    bodyKey: raw.bodyKey ?? `events.${key}.body`,
    choices: raw.choices.map((choice) => buildChoice(key, choice)),
  };
}

export const gameEventSchema = rawEventSchema
  .superRefine((raw, ctx) => {
    // A beat event with no beatType can never fill a slot: the director indexes beats by
    // type, so it would be eligible for nothing and silently never fire. That is the exact
    // class of bug ADR 0001 says content has no other instrument for.
    if (raw.priority === 'beat' && raw.beatType === null) {
      ctx.addIssue({ code: 'custom', message: '`priority: beat` requires a `beatType`' });
    }
    if (raw.tensionBand !== null && raw.tensionBand[0] > raw.tensionBand[1]) {
      ctx.addIssue({ code: 'custom', message: 'tensionBand is [low, high]' });
    }
    for (const choice of raw.choices) {
      const ids = choice.outcomes.map((o) => o.id);
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({
          code: 'custom',
          message: `choice \`${choice.id}\` has duplicate outcome ids, so their text keys collide`,
        });
      }
      // An outcome gated on a check result inside a choice with no check can never fire.
      if (choice.check === null && choice.outcomes.some((o) => o.onCheck !== null)) {
        ctx.addIssue({
          code: 'custom',
          message: `choice \`${choice.id}\` has no \`check\`, so \`onCheck\` can never match`,
        });
      }
      for (const outcome of choice.outcomes) {
        if (outcome.variants > 0 && outcome.textVariants.length > 0) {
          ctx.addIssue({
            code: 'custom',
            message: `outcome \`${outcome.id}\` sets both \`variants\` and \`textVariants\`; use one`,
          });
        }
      }
    }
  })
  .transform(buildEvent);
