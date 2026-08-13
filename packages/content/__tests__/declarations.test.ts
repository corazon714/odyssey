import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { collectFlagUsage, collectRefs } from '@odyssey/engine';
import { REGISTRY_FILES } from '../schema/declarations.ts';
import { declaredIds, loadDeclarations, loadModifiers } from '../loader/load-declarations.ts';
import { formatIssue } from '../loader/locate.ts';
import { loadEvents } from '../loader/load-events.ts';
import { loadUniversalChoices } from '../loader/load-universal-choices.ts';
import { loadComplications } from '../loader/load-complications.ts';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const loaded = loadDeclarations(PACKAGE_ROOT);
const events = loadEvents(join(PACKAGE_ROOT, 'events'), PACKAGE_ROOT);
/**
 * THE REGISTRY COUNTS AS A CONSUMER. Corrected 2026-08-09.
 *
 * These walks used to read events alone, which made two shipped assertions bind in opposite
 * directions: `modifier-registry.test.ts` requires every npc/item/flag a modifier's `when`
 * names to be DECLARED, while "every declared id is actually used" only counted event
 * references. Between them, a modifier could not name an id unless an event named it too — so
 * `modifiers.yaml` could never grow ahead of the corpus, which is the order the linter's own
 * STARVED_CHECK rule demands.
 *
 * `content:lint` never had the bug: `rules-references.ts` already passes `bundle.modifiers` to
 * both `collectFlagUsage` and `collectRefs`. This is the test catching up with the tool, not a
 * relaxation — a flag a modifier reads is read, and the anti-pattern these guard against is a
 * declaration NOTHING consumes.
 *
 * **THE SAME OMISSION, TWO REGISTRIES OVER, corrected 2026-08-13 — and this time the tool had
 * it too.** `universal-choices.yaml` and `complications.yaml` both carry `requires` predicates
 * and effect lists, so both read and write flags, and neither was walked here or in
 * `rules-references.ts`. It had never fired because every flag either registry touches is also
 * touched by an event — a property of a 13-event corpus, not of the rule. The first flag that
 * lives only in a universal row reads as declared-but-unused here, and the mirror case (a flag
 * a MODIFIER reads and a universal row writes) is `FLAG_READ_NEVER_WRITTEN`, which is an
 * ERROR: correct content would have failed CI.
 */
const modifiers = loadModifiers(PACKAGE_ROOT).modifiers;
const universalChoices = loadUniversalChoices(PACKAGE_ROOT).universalChoices;
const complications = loadComplications(PACKAGE_ROOT).complications;

describe('declaration registries', () => {
  it('all five load without an issue', () => {
    expect(loaded.issues.map((i) => `${formatIssue(i)} ${i.message}`)).toEqual([]);
  });

  it('has entries in every registry', () => {
    // Anti-vacuous guard: every cross-reference assertion below passes trivially on empty
    // registries, which is exactly the state this milestone starts from.
    for (const [key, entries] of Object.entries(loaded.declarations)) {
      expect(entries.length, `${key} is empty`).toBeGreaterThan(0);
    }
    expect(Object.keys(loaded.declarations).length).toBe(Object.keys(REGISTRY_FILES).length);
  });

  it('every id is unique within its registry', () => {
    for (const [key, entries] of Object.entries(loaded.declarations)) {
      const ids = entries.map((e) => e.id);
      expect(new Set(ids).size, `${key} has duplicate ids`).toBe(ids.length);
    }
  });
});

/**
 * THE CROSS-REFERENCE CHECKS.
 *
 * These are the reason the registries exist, and they are done HERE rather than in the engine
 * on purpose. ADR 0007 §4 draws the line: a missing npc/item/trait/event is `unknown-ref`
 * because the evaluator consults `ContentRefs` for it, but a missing FLAG is not — flags are
 * runtime data with no registry to be missing from. Endings are the same: `unlockEnding`
 * writes an id and nothing ever looks it up.
 *
 * So widening the engine's `ContentRegistries` to cover flags and endings would contradict
 * ADR 0007 §4 and move `contentVersion` for no behavioural gain. ADR 0009 §4 already says
 * `content-lint` subsumes this walk in Phase 2 — this is that, arriving early enough to keep
 * the fixture honest. `content:lint` (M2A.6) reports these with file:line:col; these tests
 * are the same checks with the assertions in a place CI already runs.
 */
describe('references resolve against the declarations', () => {
  const declared = declaredIds(loaded.declarations);
  const usage = collectFlagUsage(events.events, modifiers, universalChoices, complications);
  const refs = collectRefs(events.events, modifiers);

  it('loaded the events it is checking', () => {
    expect(events.issues).toEqual([]);
    expect(events.events.length).toBeGreaterThan(0);
  });

  it('every flag an event touches is declared', () => {
    const touched = new Set([...usage.written, ...usage.read]);
    const undeclared = [...touched].filter((id) => !declared.flags.includes(id)).sort();
    expect(undeclared).toEqual([]);
  });

  it('every declared flag is actually used', () => {
    // The other direction. A registry that only grows is how you get to 400 unmanageable
    // flags — engine-spec §3's named anti-pattern.
    const touched = new Set([...usage.written, ...usage.read]);
    expect(declared.flags.filter((id) => !touched.has(id)).sort()).toEqual([]);
  });

  it('every npc, item and trait an event references is declared', () => {
    const undeclared = refs
      .filter((ref) => {
        if (ref.kind === 'npc') return !declared.npcs.includes(ref.id);
        if (ref.kind === 'item') return !declared.items.includes(ref.id);
        if (ref.kind === 'trait') return !declared.traits.includes(ref.id);
        return false;
      })
      .map((ref) => `${ref.kind} \`${ref.id}\` in ${ref.inEvent}`)
      .sort();
    expect(undeclared).toEqual([]);
  });

  it('every declared npc, item and trait is actually referenced', () => {
    // Same argument as the flag check, and it applies to every registry: a list that only
    // ever grows stops being a tool for finding things and becomes a place they hide. An
    // item nothing reads cannot have a real liability either, so it would smuggle a false
    // declaration past the rule that exists to prevent exactly that.
    const used = {
      npc: new Set(refs.filter((r) => r.kind === 'npc').map((r) => r.id)),
      item: new Set(refs.filter((r) => r.kind === 'item').map((r) => r.id)),
      trait: new Set(refs.filter((r) => r.kind === 'trait').map((r) => r.id)),
    };
    expect(declared.npcs.filter((id) => !used.npc.has(id)).sort()).toEqual([]);
    expect(declared.items.filter((id) => !used.item.has(id)).sort()).toEqual([]);
    expect(declared.traits.filter((id) => !used.trait.has(id)).sort()).toEqual([]);
  });

  it('every ending an event unlocks is declared', () => {
    const unlocked = new Set<string>();
    for (const event of events.events) {
      for (const choice of event.choices) {
        for (const outcome of choice.outcomes) {
          for (const effect of outcome.effects) {
            if (effect.op === 'unlockEnding') unlocked.add(effect.id);
          }
        }
      }
    }
    expect([...unlocked].filter((id) => !declared.endings.includes(id)).sort()).toEqual([]);
  });

  it('declares the endings the ENGINE produces, not just the content ones', () => {
    // loop/check-run-end.ts unlocks these directly. An undeclared engine ending is a
    // missing-translation bug waiting to happen: the journal renders it and i18n needs a key.
    for (const id of [
      'ending.arrival',
      'ending.arrival_quiet',
      'ending.failure_collapsed',
      'ending.failure_gave_up',
    ]) {
      expect(declared.endings, `${id} is unlocked by the engine but undeclared`).toContain(id);
    }
  });
});

describe('what the declaration schemas refuse', () => {
  it('refuses an item with no liability', () => {
    // "An item that is purely good is not an item, it is a number." Undecidable to check
    // semantically, so the author declares it and the linter verifies the reference.
    const bad = {
      id: 'lucky_charm',
      description: 'A charm that is only ever good, which is the problem.',
      category: 'trinket',
      size: 1,
      concealability: 1,
      legality: 'legal',
      value: 1,
      liability: [],
    };
    expect(REGISTRY_FILES['items.yaml'].safeParse(bad).success).toBe(false);
  });

  it('refuses a flag with no lifetime and one with a bogus lifetime', () => {
    const base = { id: 'x', description: 'A flag with a long enough description.', category: 'a' };
    expect(REGISTRY_FILES['flags.yaml'].safeParse(base).success).toBe(false);
    expect(REGISTRY_FILES['flags.yaml'].safeParse({ ...base, lifetime: 'forever' }).success).toBe(
      false,
    );
    expect(REGISTRY_FILES['flags.yaml'].safeParse({ ...base, lifetime: 'permanent' }).success).toBe(
      true,
    );
  });

  it('refuses a one-word description', () => {
    // The point of requiring one is that adding a flag should cost a sentence of thought.
    expect(
      REGISTRY_FILES['traits.yaml'].safeParse({ id: 'x', description: 'thing', category: 'a' })
        .success,
    ).toBe(false);
  });

  it('refuses an unknown key', () => {
    expect(
      REGISTRY_FILES['npcs.yaml'].safeParse({
        id: 'x',
        description: 'A long enough description here.',
        category: 'a',
        archetype: 'official',
        nationality: 'somewhere',
      }).success,
    ).toBe(false);
  });
});
