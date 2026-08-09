import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createContentPack, type ContentRegistries, type GameEvent } from '@odyssey/engine';
import { findEventFiles, formatIssue, loadEvents } from '../loader/load-events.ts';

/**
 * THE PROOF THAT THE TERSE SYNTAX IS LOSSLESS.
 *
 * The nine YAML files under `events/` are the Phase 1 fixture pack re-expressed in the
 * authoring syntax. The canonical JSON they must produce is checked in at
 * `packages/engine/src/__tests__/__fixtures__/mini-pack.json` and is what the engine, the
 * golden runs and the sim baseline are all built on — so this is not a self-consistency
 * check. If the transform loses or invents a single field, the digests move and
 * `pnpm sim:diff` says so.
 *
 * These files are FIXTURES, not the seed corpus (ADR 0009 §5). They exist to exercise the
 * loader; the twelve seed events are Phase 2B, written against the content bible.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
/**
 * `__fixtures__/events/`, NOT `events/`. Moved at Phase 2B M-D.
 *
 * These nine files are the Phase 1 fixture pack re-expressed in the authoring syntax, and they
 * exist to prove the transform is lossless against `mini-pack.json` — which the golden runs and
 * the sim are built on. `events/` is now the SEED CORPUS, a different thing with a different
 * job (ADR 0009 §5: the fixtures must not become the corpus).
 *
 * Consequence worth knowing: `content:lint` reads `events/` only, so these nine are UNLINTED.
 * That is acceptable because they are frozen data whose only contract is reproducing the JSON
 * byte-for-byte, and this file is what checks it. Do not "fix" the gap by moving them back.
 */
const EVENTS_DIR = join(HERE, '..', '__fixtures__', 'events');
const PACKAGE_ROOT = join(HERE, '..');
const FIXTURE = join(
  HERE,
  '..',
  '..',
  'engine',
  'src',
  '__tests__',
  '__fixtures__',
  'mini-pack.json',
);

const canonical = JSON.parse(readFileSync(FIXTURE, 'utf8')) as {
  readonly registries: ContentRegistries;
  readonly events: readonly GameEvent[];
};

const loaded = loadEvents(EVENTS_DIR, PACKAGE_ROOT);

describe('terse YAML -> canonical GameEvent', () => {
  it('loads every file without an issue', () => {
    expect(loaded.issues.map((i) => `${formatIssue(i)} ${i.message}`)).toEqual([]);
  });

  it('has files to load', () => {
    // Anti-vacuous guard: an empty directory passes every assertion below.
    expect(findEventFiles(EVENTS_DIR).length).toBe(canonical.events.length);
    expect(loaded.events.length).toBe(canonical.events.length);
  });

  it.each(canonical.events.map((e) => [e.id, e] as const))(
    '%s round-trips byte-for-byte',
    (id, expected) => {
      const actual = loaded.events.find((e) => e.id === id);
      expect(actual, `no YAML produced ${id}`).toBeDefined();
      expect(actual).toEqual(expected);
    },
  );

  it('produces an identical contentVersion, so golden runs and the sim are unmoved', () => {
    // The sharpest single assertion in this file. contentVersion is a digest over the sorted
    // pack; if the transform changed ANY field of ANY event — including one no test above
    // happens to inspect — this differs.
    const fromYaml = createContentPack(loaded.events, canonical.registries);
    const fromJson = createContentPack(canonical.events, canonical.registries);
    expect(fromYaml.version).toBe(fromJson.version);
  });

  it('reports no dangling refs or unfillable beats it did not already have', () => {
    const fromYaml = createContentPack(loaded.events, canonical.registries);
    const fromJson = createContentPack(canonical.events, canonical.registries);
    expect(fromYaml.danglingRefs).toEqual(fromJson.danglingRefs);
    expect(fromYaml.duplicateIds).toEqual(fromJson.duplicateIds);
    expect(fromYaml.unfillableBeatTypes).toEqual(fromJson.unfillableBeatTypes);
  });
});

describe('what the authoring syntax bought', () => {
  it('is substantially shorter than the canonical form', () => {
    // The ergonomic claim, measured rather than asserted. Not a strict requirement — it is
    // here so that a change making authoring markedly more verbose is visible in review.
    const yamlBytes = findEventFiles(EVENTS_DIR)
      .map((f) => readFileSync(f, 'utf8').length)
      .reduce((a, b) => a + b, 0);
    const jsonBytes = JSON.stringify(canonical.events, null, 2).length;
    expect(yamlBytes).toBeLessThan(jsonBytes / 2);
  });

  it('contains no user-visible prose, only derived keys (rule 2.4)', () => {
    // Mechanised: an event file has no text fields at all, so the only way prose could enter
    // is an explicit *Key override. Those are allowed but must still be i18n keys.
    for (const file of findEventFiles(EVENTS_DIR)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/^\s*(titleKey|bodyKey|labelKey|textKey):\s*(.+)$/gm)) {
        expect(match[2], `${file}: ${match[0]}`).toMatch(/^[a-z][a-zA-Z0-9_.-]*$/);
      }
    }
  });
});
