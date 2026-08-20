import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ALL_REFS_KNOWN,
  CHECK_TAGS,
  MODIFIER_SOURCE_KINDS,
  createPredicateContext,
  createRunInit,
  createRunState,
  resolveModifiers,
  type CheckTag,
} from '@odyssey/engine';
import { loadDeclarations, loadModifiers } from '../loader/load-declarations.ts';
import { loadEvents } from '../loader/load-events.ts';
import { formatIssue } from '../loader/locate.ts';
import { modifierSchema } from '../schema/modifier.ts';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const loaded = loadModifiers(PACKAGE_ROOT);

describe('modifiers.yaml', () => {
  it('loads without an issue', () => {
    expect(loaded.issues.map((i) => `${formatIssue(i)} ${i.message}`)).toEqual([]);
  });

  it('has rows to check', () => {
    expect(loaded.modifiers.length).toBeGreaterThan(0);
  });

  it('is sorted by id, so chip order never depends on file order', () => {
    const ids = loaded.modifiers.map((m) => m.id);
    expect(ids).toEqual([...ids].sort());
  });

  it('derives every labelKey from the id', () => {
    // Same rule as events: there is nowhere to type prose into a modifier either.
    for (const row of loaded.modifiers) {
      expect(row.labelKey).toBe(`check.modifier.${row.id}`);
    }
  });

  it('references only declared content', () => {
    // A modifier naming a deleted npc is silently inert — its `when` just never passes.
    const { declarations } = loadDeclarations(PACKAGE_ROOT);
    // Compared as plain strings: the walk reads untyped predicate nodes, and re-branding
    // each id just to compare it would prove nothing the string comparison does not.
    const declaredNpcs = new Set<string>(declarations.npcs.map((n) => n.id));
    const declaredItems = new Set<string>(declarations.items.map((i) => i.id));
    const declaredFlags = new Set<string>(declarations.flags.map((f) => f.id));

    const seen: string[] = [];
    const walk = (p: unknown): void => {
      if (typeof p !== 'object' || p === null) return;
      const node = p as Record<string, unknown>;
      if (node['kind'] === 'relationship' && !declaredNpcs.has(String(node['npc'])))
        seen.push(`npc ${String(node['npc'])}`);
      if (node['kind'] === 'item' && !declaredItems.has(String(node['id'])))
        seen.push(`item ${String(node['id'])}`);
      if (node['kind'] === 'flag' && !declaredFlags.has(String(node['id'])))
        seen.push(`flag ${String(node['id'])}`);
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(walk);
        else walk(value);
      }
    };
    for (const row of loaded.modifiers) walk(row.when);
    expect(seen.sort()).toEqual([]);
  });
});

describe('registry coverage against the events that exist', () => {
  const events = loadEvents(join(PACKAGE_ROOT, 'events'), PACKAGE_ROOT);

  it('every tag a check uses is a real CHECK_TAG', () => {
    // Belt and braces: the schema enforces this, but a widened vocabulary with a stale
    // fixture would slip past a schema-only check.
    for (const event of events.events) {
      for (const choice of event.choices) {
        for (const tag of choice.skillCheck?.tags ?? []) {
          expect(CHECK_TAGS as readonly string[]).toContain(tag);
        }
      }
    }
  });

  it('no check is starved — every check draws at least one registry modifier', () => {
    // MISSING_CHECK_TAGS in embryo. A check whose tags match nothing in the registry rolls
    // fine and silently ignores the whole system, which is the failure the tag requirement
    // exists to prevent.
    for (const event of events.events) {
      for (const choice of event.choices) {
        const check = choice.skillCheck;
        if (check === null || check === undefined) continue;
        const reachable = loaded.modifiers.filter((row) =>
          row.appliesTo.some((tag) => check.tags.includes(tag)),
        );
        expect(
          reachable.length,
          `${event.id}/${choice.id} draws no registry modifiers`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('every sourceKind in the registry is a real one', () => {
    for (const row of loaded.modifiers) {
      expect(MODIFIER_SOURCE_KINDS as readonly string[]).toContain(row.sourceKind);
    }
  });
});

describe('the registry actually resolves against real state', () => {
  it('produces chips whose deltas sum to the reported total', () => {
    // End to end: YAML -> schema -> registry -> pipeline. The unit tests cover the pipeline's
    // arithmetic; this proves the loaded rows are shaped such that it can run at all.
    const routes = loadEvents(join(PACKAGE_ROOT, 'events'), PACKAGE_ROOT);
    expect(routes.issues).toEqual([]);

    const created = createRunState(
      createRunInit('registry-test', 'v', {
        id: 'r',
        profile: 'fastest',
        nodes: ['a', 'b'],
        // validateRoute requires edges === nodes - 1: a route with a gap would silently
        // fall back to `roadside`, which is a content bug wearing a balance problem's clothes.
        edges: ['a_b'],
        legIndex: 0,
        legCount: 2,
        progressKm: 0,
        totalKm: 100,
        beatSchedule: [],
        legLocations: ['border_crossing', 'roadside'],
        legKm: [50, 50],
        montageLegs: [],
      } as never),
    );
    if (!created.ok) throw new Error(`route rejected: ${created.error.code}`);

    const ctx = createPredicateContext(created.state, ALL_REFS_KNOWN, 'test:0');
    const tags: readonly CheckTag[] = ['social', 'bribery', 'authority', 'crime'];
    const result = resolveModifiers({ tags }, loaded.modifiers, [], ctx);

    const summed = result.modifiers.reduce((acc, m) => acc + m.delta, 0);
    expect(summed).toBe(result.total);
    // `official_scrutiny` gates on locationType, which is the 28th predicate kind added for
    // exactly this — a modifier that needs to know where you are without location being a tag.
    expect(result.modifiers.map((m) => m.id)).toContain('official_scrutiny');
  });
});

describe('what the modifier schema refuses', () => {
  const base = {
    id: 'x',
    appliesTo: ['social'],
    when: { always: true },
    delta: -1,
    sourceKind: 'condition',
    priority: 1,
  };

  it('refuses a zero delta', () => {
    expect(modifierSchema.safeParse({ ...base, delta: 0 }).success).toBe(false);
  });

  it('refuses an empty appliesTo, which would match nothing', () => {
    expect(modifierSchema.safeParse({ ...base, appliesTo: [] }).success).toBe(false);
  });

  it('refuses an unknown tag and an unknown sourceKind', () => {
    expect(modifierSchema.safeParse({ ...base, appliesTo: ['vibes'] }).success).toBe(false);
    expect(modifierSchema.safeParse({ ...base, sourceKind: 'mood' }).success).toBe(false);
  });

  it('refuses an unknown key', () => {
    expect(modifierSchema.safeParse({ ...base, alwaysApplies: true }).success).toBe(false);
  });
});
