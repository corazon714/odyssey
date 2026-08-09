import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDocument } from 'yaml';
import {
  createUniversalChoiceRegistry,
  EMPTY_UNIVERSAL_CHOICE_REGISTRY,
  type UniversalChoiceRegistry,
} from '@odyssey/engine';
import { z } from 'zod';
import { universalChoiceSchema } from '../schema/universal-choice.ts';
import { issueAt, type ContentIssue } from './locate.ts';

/**
 * Read `universal-choices.yaml` into a validated, id-sorted registry.
 *
 * Mirrors `loadModifiers` deliberately, down to the failure modes: a MISSING file is an issue
 * rather than an empty result, because "the injection registry vanished" and "there is nothing
 * to inject" look identical downstream and only one of them is a bug. An EMPTY file is fine
 * and returns an empty registry — that is the state M-B ships in, and it is what makes
 * "the golden runs did not move" the milestone's proof.
 *
 * Sorted at construction so iteration order — and therefore, after the priority sort, the
 * tiebreak between equal-priority rows — never depends on file order.
 */
const universalChoiceListSchema = z
  .array(universalChoiceSchema)
  .nullish()
  .transform((v) => v ?? []);

export function loadUniversalChoices(dir: string): {
  readonly universalChoices: UniversalChoiceRegistry;
  readonly issues: readonly ContentIssue[];
} {
  const file = 'universal-choices.yaml';
  const full = join(dir, file);

  if (!existsSync(full)) {
    return {
      universalChoices: EMPTY_UNIVERSAL_CHOICE_REGISTRY,
      issues: [
        {
          file,
          line: 1,
          column: 1,
          message:
            'missing universal-choice registry: an absent file and an empty one are different findings',
          path: [],
        },
      ],
    };
  }

  const source = readFileSync(full, 'utf8');
  const doc = parseDocument(source, { prettyErrors: false });
  if (doc.errors.length > 0) {
    return {
      universalChoices: EMPTY_UNIVERSAL_CHOICE_REGISTRY,
      issues: doc.errors.map((e) => issueAt(file, source, e.pos[0], e.message, [])),
    };
  }

  const parsed = universalChoiceListSchema.safeParse(doc.toJS() as unknown);
  if (!parsed.success) {
    return {
      universalChoices: EMPTY_UNIVERSAL_CHOICE_REGISTRY,
      issues: parsed.error.issues.map((i) => issueAt(file, source, doc, i.message, i.path)),
    };
  }

  const issues: ContentIssue[] = [];
  const seen = new Set<string>();
  parsed.data.forEach((row, index) => {
    if (seen.has(row.id)) {
      issues.push(
        issueAt(file, source, doc, `duplicate universal choice id \`${row.id}\``, [index, 'id']),
      );
    }
    seen.add(row.id);
  });

  return { universalChoices: createUniversalChoiceRegistry(parsed.data), issues };
}
