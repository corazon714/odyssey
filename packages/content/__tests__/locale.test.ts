import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CHIP_OVERFLOW_LABEL_KEY,
  CONTAINER_KINDS,
  MODIFIER_SOURCE_KINDS,
  SKILL_KEYS,
  type Choice,
  type GameEvent,
  type RegistryComplication,
} from '@odyssey/engine';
import { loadComplications } from '../loader/load-complications.ts';
import { loadModifiers } from '../loader/load-declarations.ts';
import { loadEvents } from '../loader/load-events.ts';
import { loadUniversalChoices } from '../loader/load-universal-choices.ts';

/**
 * The English locale, and the keys `content:lint` does NOT check.
 *
 * `i18nCoverage` walks event-derived keys — title, body, choice labels, outcome text and
 * variants — plus the universal-choice registry. It does not walk MODIFIER chip labels, and it
 * never will without a redesign, because a modifier is not reachable from an event: it applies
 * by tag intersection at roll time.
 *
 * That gap is not cosmetic. `check.modifier.<id>` is what the result screen renders so the
 * player can reconstruct the total (design pillar 2, legible randomness). A missing one does
 * not fail a build — it ships the raw key to the screen. This file is the check.
 */

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALE_DIR = join(PACKAGE_ROOT, 'i18n', 'en');

const files = readdirSync(LOCALE_DIR).filter((name) => name.endsWith('.json'));

/** Flattened the same way `content-lint`'s `readLocale` flattens it, so this tests what ships. */
function loadLocale(): { locale: Map<string, string>; duplicates: string[] } {
  const locale = new Map<string, string>();
  const duplicates: string[] = [];
  for (const file of files) {
    const parsed = JSON.parse(readFileSync(join(LOCALE_DIR, file), 'utf8')) as Record<
      string,
      unknown
    >;
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== 'string') continue;
      // `_`-prefixed entries are per-file notes to translators, not keys. JSON has no comment
      // syntax, so this is the convention; several files carry `_comment` and the duplicate
      // check below would otherwise flag the convention itself.
      if (key.startsWith('_')) continue;
      if (locale.has(key)) duplicates.push(key);
      locale.set(key, value);
    }
  }
  return { locale, duplicates };
}

const { locale, duplicates } = loadLocale();
const events = loadEvents(join(PACKAGE_ROOT, 'events'), PACKAGE_ROOT).events;
const modifiers = loadModifiers(PACKAGE_ROOT).modifiers;
const complications = loadComplications(PACKAGE_ROOT).complications;
const universalChoices = loadUniversalChoices(PACKAGE_ROOT).universalChoices;

function choiceKeys(choice: Choice): readonly string[] {
  return [
    choice.labelKey,
    ...choice.outcomes.flatMap((outcome) => [outcome.textKey, ...outcome.textVariants]),
  ];
}

function eventKeys(event: GameEvent): readonly string[] {
  return [event.titleKey, event.bodyKey, ...event.choices.flatMap(choiceKeys)];
}

function complicationKeys(row: RegistryComplication): readonly string[] {
  return [row.textKey, ...(row.addsChoice === null ? [] : choiceKeys(row.addsChoice))];
}

/** Everything the shipped content can ask the locale for, from every source. */
const requiredKeys = (): readonly string[] => [
  ...events.flatMap(eventKeys),
  ...modifiers.map((row) => row.labelKey),
  ...complications.flatMap(complicationKeys),
  ...universalChoices.flatMap((row) => choiceKeys(row.choice)),
  ...SKILL_KEYS.map((skill) => `check.modifier.skill.${skill}`),
  ...CONTAINER_KINDS.map((kind) => `check.modifier.container.${kind}`),
  ...MODIFIER_SOURCE_KINDS.map((kind) => `check.kind.${kind}`),
  CHIP_OVERFLOW_LABEL_KEY,
];

describe('the en locale', () => {
  it('has files and a corpus to cover', () => {
    // Anti-vacuous: every assertion below passes on an empty locale over an empty corpus.
    expect(files.length).toBeGreaterThan(0);
    expect(events.length).toBeGreaterThan(0);
    expect(modifiers.length).toBeGreaterThan(0);
    expect(complications.length).toBeGreaterThan(0);
    expect(universalChoices.length).toBeGreaterThan(0);
  });

  it('defines no key twice across files', () => {
    // The files are merged into one map, so a duplicate is a silent overwrite whose winner
    // depends on readdir order — which differs between operating systems.
    expect(duplicates).toEqual([]);
  });

  it('resolves every key an event derives', () => {
    const missing = events.flatMap((event) => eventKeys(event).filter((key) => !locale.has(key)));
    expect(missing).toEqual([]);
  });

  it('RESOLVES EVERY MODIFIER CHIP — the gap content:lint has', () => {
    const missing = modifiers.map((row) => row.labelKey).filter((key) => !locale.has(key));
    expect(missing).toEqual([]);
  });

  it('RESOLVES EVERY COMPLICATION KEY — the other gap content:lint has', () => {
    // Same shape of hole as the modifier chips, and the same reason: `i18nCoverage` walks keys
    // reachable from an event, and a complication is attached by the DIRECTOR at selection
    // time. A missing `complication.<id>.text` is a blank sentence appended to the body.
    const missing = complications.flatMap(complicationKeys).filter((key) => !locale.has(key));
    expect(missing).toEqual([]);
  });

  it('resolves the skill and container chips runSkillCheck synthesises', () => {
    // Neither is authored anywhere: `runSkillCheck` mints `check.modifier.skill.<key>` for the
    // unclamped skill chip, and `searchCheck` mints `check.modifier.container.<kind>`. Nothing
    // else in the corpus mentions them, so nothing else would catch their absence.
    const synthesised = [
      ...SKILL_KEYS.map((skill) => `check.modifier.skill.${skill}`),
      ...CONTAINER_KINDS.map((kind) => `check.modifier.container.${kind}`),
    ];
    expect(synthesised.filter((key) => !locale.has(key))).toEqual([]);
  });

  it('resolves the collapsed-chip label for EVERY sourceKind', () => {
    // `collapseChips` mints `check.kind.<sourceKind>` whenever two or more rows of one kind fold
    // into a single chip, and nothing in the corpus mentions those keys either — the vocabulary
    // is a closed enum in the engine, not something an author writes. A missing one ships a raw
    // key to the result screen exactly where the collapse was supposed to make it legible.
    const kindKeys = MODIFIER_SOURCE_KINDS.map((kind) => `check.kind.${kind}`);
    expect(kindKeys.filter((key) => !locale.has(key))).toEqual([]);
    // Anti-vacuous: an empty vocabulary would pass the line above.
    expect(kindKeys.length).toBe(12);
  });

  it('resolves the overflow chip the seven-chip bound mints', () => {
    // Same hole again, one level up: `collapseChips` folds everything past the sixth kind into
    // one chip labelled `check.overflow`, and no author writes that key either. The key is read
    // from the engine rather than spelled here so the two cannot drift apart.
    expect(locale.has(CHIP_OVERFLOW_LABEL_KEY)).toBe(true);
    expect(CHIP_OVERFLOW_LABEL_KEY).toBe('check.overflow');
  });

  it('resolves every key the shipped content can ask for, from any source', () => {
    expect(requiredKeys().filter((key) => !locale.has(key))).toEqual([]);
  });

  it('carries no key the corpus does not use', () => {
    // The other direction, and the reason the declaration registries have it too: a locale that
    // only grows becomes a place strings hide. Ignores the `_` prefix used for file comments.
    const used = new Set(requiredKeys());
    const orphaned = [...locale.keys()].filter((key) => !key.startsWith('_') && !used.has(key));
    expect(orphaned).toEqual([]);
  });

  it('keeps every body and choice label inside the pillar-5 budget', () => {
    // content:lint warns on these; asserting them here means a regression fails CI rather than
    // adding a line to a report.
    const words = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;
    const overlong: string[] = [];

    for (const event of events) {
      const body = locale.get(event.bodyKey);
      if (body !== undefined && words(body) > 60) {
        overlong.push(`${event.bodyKey} is ${String(words(body))} words`);
      }
      for (const choice of event.choices) {
        const label = locale.get(choice.labelKey);
        if (label !== undefined && words(label) > 8) {
          overlong.push(`${choice.labelKey} is ${String(words(label))} words`);
        }
      }
    }

    expect(overlong).toEqual([]);
  });
});
