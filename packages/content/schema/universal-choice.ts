import {
  choiceId as toChoiceId,
  UNIVERSAL_CHOICE_PREFIX,
  type Choice,
  type UniversalChoice,
} from '@odyssey/engine';
import { z } from 'zod';
import { ID_PATTERN, intSchema, list, nullable } from './common.ts';
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
 * `universal-choices.yaml`, and its transform to `UniversalChoice`.
 *
 * The choice half REUSES `event.ts`'s `skillCheckSchema`, `searchSchema` and `outcomeSchema`
 * rather than restating them. A second definition of what a choice may contain is a second
 * thing to keep in step, and it would have drifted the first time either gained a field —
 * which `search` demonstrated by being added one milestone ago.
 *
 * There are no text fields here either, for the same reason there are none in an event file.
 * Keys derive from the ROW: `universal.<id>.label` and `universal.<id>.out.<outcomeId>`.
 * Deriving them from the event a row lands in would mint one key per event x per row, and
 * `MISSING_I18N_KEY` is an error, so an author would owe thirty-six translations for three
 * strings.
 *
 * `appliesTo` is matched against `tagsOf(event)` — the event's tags plus `cat:<category>` —
 * so it accepts `cat:border` as well as a bare tag. It is a free-form string list rather than
 * an enum because `GameEvent.tags` is itself open; `content:lint` is what catches a term no
 * event carries.
 */
const APPLIES_TO = z
  .array(z.string().regex(/^(?:cat:)?[a-z][a-z0-9_]*$/, 'a tag, optionally prefixed `cat:`'))
  .min(1, 'a row that applies to nothing can never be injected');

const rawUniversalChoiceSchema = z.strictObject({
  id: z.string().regex(ID_PATTERN, 'universal choice ids are snake_case'),
  appliesTo: APPLIES_TO,
  /** At most one row per family per event. Null opts out of the cap. */
  family: nullable(z.string().regex(ID_PATTERN, 'family is snake_case')),
  priority: intSchema.nonnegative(),
  requires: nullable(predicateSchema),
  hiddenUnless: nullable(predicateSchema),
  costs: list(effectSchema),
  check: nullable(skillCheckSchema),
  search: nullable(searchSchema),
  outcomes: z.array(outcomeSchema).min(1),
});

type RawUniversalChoice = z.infer<typeof rawUniversalChoiceSchema>;

function buildUniversalChoice(raw: RawUniversalChoice): UniversalChoice {
  const keyBase = `universal.${raw.id}`;

  const choice: Choice = {
    // Minted with a prefix `ID_PATTERN` forbids, so no authored choice can collide with it.
    // `createContentPack` still reports a collision rather than trusting this — see
    // `ContentPack.shadowedInjections`.
    id: toChoiceId(`${UNIVERSAL_CHOICE_PREFIX}${raw.id}`),
    labelKey: `${keyBase}.label`,
    requires: raw.requires ?? { kind: 'always' },
    hiddenUnless: raw.hiddenUnless,
    costs: raw.costs,
    skillCheck: raw.check === null ? null : buildCheck(raw.check),
    search: raw.search,
    outcomes: raw.outcomes.map((outcome) => buildOutcome(keyBase, outcome)),
  };

  return {
    id: raw.id,
    appliesTo: raw.appliesTo,
    family: raw.family,
    priority: raw.priority,
    choice,
  };
}

export const universalChoiceSchema = rawUniversalChoiceSchema
  .superRefine((raw, ctx) => {
    // The same two rules `gameEventSchema` enforces on a choice, restated because a universal
    // choice is parsed on its own and never passes through `gameEventSchema`.
    if (raw.check !== null && raw.search !== null) {
      ctx.addIssue({
        code: 'custom',
        message: `\`${raw.id}\` has both \`check\` and \`search\`; a choice rolls one thing`,
      });
    }
    if (raw.check === null && raw.search === null && raw.outcomes.some((o) => o.onCheck !== null)) {
      ctx.addIssue({
        code: 'custom',
        message: `\`${raw.id}\` has no \`check\` or \`search\`, so \`onCheck\` can never match`,
      });
    }

    const ids = raw.outcomes.map((o) => o.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: 'custom',
        message: `\`${raw.id}\` has duplicate outcome ids, so their text keys collide`,
      });
    }

    // THE DESIGN RULE, as far as a schema can take it. A universal choice that costs nothing
    // and risks nothing is strictly better than doing the thing the event actually asked, so
    // every hand-authored choice in every matching event becomes pointless. The full rule is
    // not decidable here — `content:lint` compares it against what it injects beside — but
    // "carries no cost at all" is, and it is the form the rule is most often broken in.
    const costsSomething =
      raw.costs.length > 0 ||
      raw.check !== null ||
      raw.search !== null ||
      raw.outcomes.some((o) => o.effects.length > 0);
    if (!costsSomething) {
      ctx.addIssue({
        code: 'custom',
        message: `\`${raw.id}\` has no costs, no roll and no effects — a universal choice must never be strictly the best option`,
      });
    }
  })
  .transform(buildUniversalChoice);
