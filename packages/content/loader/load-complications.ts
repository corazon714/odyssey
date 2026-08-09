import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDocument } from 'yaml';
import {
  createComplicationRegistry,
  EMPTY_COMPLICATION_REGISTRY,
  type ComplicationRegistry,
} from '@odyssey/engine';
import { z } from 'zod';
import { complicationSchema } from '../schema/complication.ts';
import { issueAt, type ContentIssue } from './locate.ts';

/**
 * Read `complications.yaml` into a validated, id-sorted registry.
 *
 * Mirrors `loadModifiers` and `loadUniversalChoices`, including the distinction that matters:
 * a MISSING file is an issue, an EMPTY one is a legitimate empty registry. "The registry
 * vanished" and "there is nothing to attach" look identical downstream and only one is a bug.
 */
const complicationListSchema = z
  .array(complicationSchema)
  .nullish()
  .transform((v) => v ?? []);

export function loadComplications(dir: string): {
  readonly complications: ComplicationRegistry;
  readonly issues: readonly ContentIssue[];
} {
  const file = 'complications.yaml';
  const full = join(dir, file);

  if (!existsSync(full)) {
    return {
      complications: EMPTY_COMPLICATION_REGISTRY,
      issues: [
        {
          file,
          line: 1,
          column: 1,
          message:
            'missing complication registry: an absent file and an empty one are different findings',
          path: [],
        },
      ],
    };
  }

  const source = readFileSync(full, 'utf8');
  const doc = parseDocument(source, { prettyErrors: false });
  if (doc.errors.length > 0) {
    return {
      complications: EMPTY_COMPLICATION_REGISTRY,
      issues: doc.errors.map((e) => issueAt(file, source, e.pos[0], e.message, [])),
    };
  }

  const parsed = complicationListSchema.safeParse(doc.toJS() as unknown);
  if (!parsed.success) {
    return {
      complications: EMPTY_COMPLICATION_REGISTRY,
      issues: parsed.error.issues.map((i) => issueAt(file, source, doc, i.message, i.path)),
    };
  }

  const issues: ContentIssue[] = [];
  const seen = new Set<string>();
  parsed.data.forEach((row, index) => {
    const id = String(row.id);
    if (seen.has(id)) {
      issues.push(issueAt(file, source, doc, `duplicate complication id \`${id}\``, [index, 'id']));
    }
    seen.add(id);
  });

  return { complications: createComplicationRegistry(parsed.data), issues };
}
