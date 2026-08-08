import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDocument } from 'yaml';
import { z } from 'zod';
import {
  EMPTY_MODIFIER_REGISTRY,
  createModifierRegistry,
  type ModifierRegistry,
} from '@odyssey/engine';
import { modifierRegistrySchema } from '../schema/modifier.ts';
import {
  REGISTRY_FILES,
  type EndingDeclaration,
  type FlagDeclaration,
  type ItemDeclaration,
  type NpcDeclaration,
  type RegistryFile,
  type TraitDeclaration,
} from '../schema/declarations.ts';
import { issueAt, type ContentIssue } from './locate.ts';

/**
 * Reads the five declaration registries.
 *
 * Same contract as `loadEvents`: issues are RETURNED with `file:line:col`, never thrown. A
 * missing registry file is an ISSUE rather than an empty result — the difference matters,
 * because an empty registry silently makes every reference undeclared, which would bury the
 * real cause under a hundred downstream errors.
 */

export type Declarations = {
  readonly flags: readonly FlagDeclaration[];
  readonly items: readonly ItemDeclaration[];
  readonly npcs: readonly NpcDeclaration[];
  readonly traits: readonly TraitDeclaration[];
  readonly endings: readonly EndingDeclaration[];
};

export type LoadDeclarationsResult = {
  readonly declarations: Declarations;
  readonly issues: readonly ContentIssue[];
};

const EMPTY: Declarations = Object.freeze({
  flags: [],
  items: [],
  npcs: [],
  traits: [],
  endings: [],
});

/** `flags.yaml` -> the `Declarations` key it fills. */
const KEY_FOR: Readonly<Record<RegistryFile, keyof Declarations>> = {
  'flags.yaml': 'flags',
  'items.yaml': 'items',
  'npcs.yaml': 'npcs',
  'traits.yaml': 'traits',
  'endings.yaml': 'endings',
};

/**
 * `dir` holds the five files. Paths in issues are reported as the bare filename, because the
 * registries live at the package root by contract — unlike events, which are nested.
 */
export function loadDeclarations(dir: string): LoadDeclarationsResult {
  const out: Record<keyof Declarations, unknown[]> = {
    flags: [],
    items: [],
    npcs: [],
    traits: [],
    endings: [],
  };
  const issues: ContentIssue[] = [];

  for (const [file, entrySchema] of Object.entries(REGISTRY_FILES)) {
    const key = KEY_FOR[file as RegistryFile];
    const full = join(dir, file);

    if (!existsSync(full)) {
      issues.push({
        file,
        line: 1,
        column: 1,
        message: `missing registry: every reference would read as undeclared without it`,
        path: [],
      });
      continue;
    }

    const source = readFileSync(full, 'utf8');
    const doc = parseDocument(source, { prettyErrors: false });
    if (doc.errors.length > 0) {
      for (const error of doc.errors) {
        issues.push(issueAt(file, source, error.pos[0], error.message, []));
      }
      continue;
    }

    const parsed = z.array(entrySchema).safeParse(doc.toJS() as unknown);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        issues.push(issueAt(file, source, doc, issue.message, issue.path));
      }
      continue;
    }

    // Duplicate ids are caught HERE rather than downstream: two entries for one id means one
    // silently wins, and which one depends on file order.
    const seen = new Set<string>();
    parsed.data.forEach((entry, index) => {
      if (seen.has(entry.id)) {
        issues.push(issueAt(file, source, doc, `duplicate id \`${entry.id}\``, [index, 'id']));
      }
      seen.add(entry.id);
    });

    out[key] = parsed.data;
  }

  if (issues.length > 0) return { declarations: EMPTY, issues };

  return {
    declarations: {
      flags: out.flags as readonly FlagDeclaration[],
      items: out.items as readonly ItemDeclaration[],
      npcs: out.npcs as readonly NpcDeclaration[],
      traits: out.traits as readonly TraitDeclaration[],
      endings: out.endings as readonly EndingDeclaration[],
    },
    issues,
  };
}

/**
 * `modifiers.yaml` — the global check-modifier registry.
 *
 * Loaded separately from the five declaration registries because its rows are not
 * declarations: they parse to `RegistryModifier`, which the ENGINE consumes, rather than to a
 * description the linter reads. Sorted by `createModifierRegistry`, which is also what makes
 * iteration order — and therefore chip order and conflict tiebreaks — independent of file
 * order.
 */
export function loadModifiers(dir: string): {
  readonly modifiers: ModifierRegistry;
  readonly issues: readonly ContentIssue[];
} {
  const file = 'modifiers.yaml';
  const full = join(dir, file);

  if (!existsSync(full)) {
    return {
      modifiers: EMPTY_MODIFIER_REGISTRY,
      issues: [
        {
          file,
          line: 1,
          column: 1,
          message: 'missing modifier registry: every check would resolve with no modifiers',
          path: [],
        },
      ],
    };
  }

  const source = readFileSync(full, 'utf8');
  const doc = parseDocument(source, { prettyErrors: false });
  if (doc.errors.length > 0) {
    return {
      modifiers: EMPTY_MODIFIER_REGISTRY,
      issues: doc.errors.map((e) => issueAt(file, source, e.pos[0], e.message, [])),
    };
  }

  const parsed = modifierRegistrySchema.safeParse(doc.toJS() as unknown);
  if (!parsed.success) {
    return {
      modifiers: EMPTY_MODIFIER_REGISTRY,
      issues: parsed.error.issues.map((i) => issueAt(file, source, doc, i.message, i.path)),
    };
  }

  const issues: ContentIssue[] = [];
  const seen = new Set<string>();
  parsed.data.forEach((row, index) => {
    if (seen.has(row.id)) {
      issues.push(issueAt(file, source, doc, `duplicate modifier id \`${row.id}\``, [index, 'id']));
    }
    seen.add(row.id);
  });

  // A conflict naming a row that does not exist is silently inert — the row it was meant to
  // suppress just applies. Exactly the class of bug ADR 0001 says content has no other
  // instrument for.
  parsed.data.forEach((row, index) => {
    row.conflictsWith.forEach((other, position) => {
      if (!seen.has(other) && !parsed.data.some((r) => r.id === other)) {
        issues.push(
          issueAt(file, source, doc, `\`${row.id}\` conflicts with unknown \`${other}\``, [
            index,
            'conflictsWith',
            position,
          ]),
        );
      }
    });
  });

  return { modifiers: createModifierRegistry(parsed.data), issues };
}

/** Just the ids, which is what `createContentPack` wants. */
export function declaredIds(declarations: Declarations): {
  readonly flags: readonly string[];
  readonly items: readonly string[];
  readonly npcs: readonly string[];
  readonly traits: readonly string[];
  readonly endings: readonly string[];
} {
  return {
    flags: declarations.flags.map((d) => d.id),
    items: declarations.items.map((d) => d.id),
    npcs: declarations.npcs.map((d) => d.id),
    traits: declarations.traits.map((d) => d.id),
    endings: declarations.endings.map((d) => d.id),
  };
}
