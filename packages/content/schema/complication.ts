import {
  choiceId as toChoiceId,
  COMPLICATION_CHOICE_PREFIX,
  type Choice,
  type RegistryComplication,
} from '@odyssey/engine';
import { z } from 'zod';
import { complicationIdSchema, ID_PATTERN, intSchema, list, nullable } from './common.ts';
import { effectSchema } from './effect.ts';
import {
  buildCheck,
  buildOutcome,
  outcomeSchema,
  searchSchema,
  skillCheckSchema,
} from './event.ts';
import { predicateSchema } from './predicate.ts';

/**
 * `complications.yaml`, and its transform to `RegistryComplication`.
 *
 * A complication layers onto an already-selected event: one extra sentence, a shift in
 * difficulty, and sometimes a different set of things to do. Twelve events crossed with
 * twenty-five complications are three hundred situations for the price of authoring
 * twenty-five rows (08-DIVERSITY-SYSTEMS D2).
 *
 * `textKey` derives as `complication.<id>.text` and is a SEPARATE SENTENCE appended to the
 * event body, never interpolated into it. Interpolation would require the clause to agree
 * grammatically with a sentence written in four languages — gender, case and word order all
 * differ — and the translator of the body cannot see what will be spliced into it. Appending
 * a whole sentence is the only form that survives translation without coupling two keys.
 *
 * `checkDelta`, not `dcDelta`: it enters the modifier pipeline as a synthetic row, so it is
 * clamped and rendered as a chip. Sign follows the roll — harder is NEGATIVE.
 */
const APPLIES_TO = z
  .array(z.string().regex(/^(?:cat:)?[a-z][a-z0-9_]*$/, 'a tag, optionally prefixed `cat:`'))
  .min(1, 'a row that applies to nothing can never attach');

const addsChoiceSchema = z.strictObject({
  id: z.string().regex(ID_PATTERN, 'choice ids are snake_case'),
  requires: nullable(predicateSchema),
  hiddenUnless: nullable(predicateSchema),
  costs: list(effectSchema),
  check: nullable(skillCheckSchema),
  search: nullable(searchSchema),
  outcomes: z.array(outcomeSchema).min(1),
});

const rawComplicationSchema = z.strictObject({
  id: complicationIdSchema,
  appliesTo: APPLIES_TO,
  requires: nullable(predicateSchema),
  weight: intSchema.positive(),
  /** Negative makes the situation harder. Zero is rejected: a no-op is a comment. */
  checkDelta: intSchema.refine((n) => n !== 0, 'a zero checkDelta is a comment, not a modifier'),
  addsChoice: nullable(addsChoiceSchema),
  removesChoice: nullable(z.string().regex(ID_PATTERN, 'choice ids are snake_case')),
});

type RawComplication = z.infer<typeof rawComplicationSchema>;

function buildComplication(raw: RawComplication): RegistryComplication {
  const keyBase = `complication.${String(raw.id)}`;

  const addsChoice: Choice | null =
    raw.addsChoice === null
      ? null
      : {
          // Prefixed so it cannot collide with a choice the event authored, or with one a
          // universal-choice row injected.
          id: toChoiceId(`${COMPLICATION_CHOICE_PREFIX}${raw.addsChoice.id}`),
          labelKey: `${keyBase}.choice.${raw.addsChoice.id}`,
          requires: raw.addsChoice.requires ?? { kind: 'always' },
          hiddenUnless: raw.addsChoice.hiddenUnless,
          costs: raw.addsChoice.costs,
          skillCheck: raw.addsChoice.check === null ? null : buildCheck(raw.addsChoice.check),
          search: raw.addsChoice.search,
          outcomes: raw.addsChoice.outcomes.map((outcome) =>
            buildOutcome(`${keyBase}.choice.${raw.addsChoice?.id ?? ''}`, outcome),
          ),
        };

  return {
    id: raw.id,
    appliesTo: raw.appliesTo,
    requires: raw.requires ?? { kind: 'always' },
    weight: raw.weight,
    textKey: `${keyBase}.text`,
    checkDelta: raw.checkDelta,
    addsChoice,
    removesChoice: raw.removesChoice === null ? null : toChoiceId(raw.removesChoice),
  };
}

export const complicationSchema = rawComplicationSchema
  .superRefine((raw, ctx) => {
    if (raw.addsChoice !== null) {
      const inner = raw.addsChoice;
      if (inner.check !== null && inner.search !== null) {
        ctx.addIssue({
          code: 'custom',
          message: `\`${String(raw.id)}\` adds a choice with both \`check\` and \`search\`; a choice rolls one thing`,
        });
      }
      if (
        inner.check === null &&
        inner.search === null &&
        inner.outcomes.some((o) => o.onCheck !== null)
      ) {
        ctx.addIssue({
          code: 'custom',
          message: `\`${String(raw.id)}\` adds a choice with no roll, so \`onCheck\` can never match`,
        });
      }
      const ids = inner.outcomes.map((o) => o.id);
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({
          code: 'custom',
          message: `\`${String(raw.id)}\` has duplicate outcome ids, so their text keys collide`,
        });
      }
    }

    // A complication that only shifts a number is a modifier wearing a sentence. The registry
    // it belongs in is `modifiers.yaml`, which applies by check tag and costs nothing per
    // event. A row here should change what the player DOES.
    if (raw.addsChoice === null && raw.removesChoice === null) {
      ctx.addIssue({
        code: 'custom',
        message: `\`${String(raw.id)}\` neither adds nor removes a choice — a numbers-only complication belongs in modifiers.yaml`,
      });
    }
  })
  .transform(buildComplication);
