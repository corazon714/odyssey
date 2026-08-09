import { describe, expect, it } from 'vitest';
import { createRunState } from '../../state/create-run-state.ts';
import { createRunInit } from '../../state/run-init.ts';
import { validateRoute } from '../../state/validate-route.ts';
import { loadFixtureRoutes, loadMiniPack } from '../../__tests__/support/load-fixtures.ts';
import {
  contentVersion,
  createContentPack,
  EMPTY_REGISTRIES,
  type ContentPack,
} from '../content-pack.ts';
import {
  createModifierRegistry,
  type RegistryModifier,
} from '../../modifiers/registry-modifier.ts';
import { choiceId, complicationId } from '../../ids/content-ids.ts';
import { createComplicationRegistry, type RegistryComplication } from '../registry-complication.ts';
import {
  createUniversalChoiceRegistry,
  UNIVERSAL_CHOICE_PREFIX,
  type UniversalChoice,
} from '../universal-choice.ts';
import { EVENT_PRIORITIES } from '../event-priority.ts';

const { events, registries } = loadMiniPack();

/** Deterministic shuffle — no Math.random, and reproducible when a case fails. */
function shuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let state = seed;
  for (let i = out.length - 1; i > 0; i -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    const a = out[i];
    const b = out[j];
    if (a !== undefined && b !== undefined) {
      out[i] = b;
      out[j] = a;
    }
  }
  return out;
}

describe('createContentPack', () => {
  it('sorts events into canonical id order', () => {
    const pack = createContentPack(events, registries);
    const ids = pack.events.map((e) => e.id);
    expect(ids).toEqual([...ids].sort());
  });

  it('produces an identical pack from any input order', () => {
    // The replay hazard this exists for: content arrives from a filesystem glob whose order
    // differs between operating systems, and CI runs Linux AND Windows.
    const baseline = createContentPack(events, registries);

    for (let seed = 1; seed <= 20; seed += 1) {
      const shuffled = createContentPack(shuffle(events, seed), registries);
      expect(shuffled.events.map((e) => e.id)).toEqual(baseline.events.map((e) => e.id));
      expect(shuffled.version).toBe(baseline.version);
    }
  });

  it('would detect an unsorted pack', () => {
    // Guards the guard: if the fixture happened to be authored in sorted order, the test
    // above would pass without the sort doing anything.
    const authored = events.map((e) => e.id);
    expect(authored).not.toEqual([...authored].sort());
  });

  it('indexes by id', () => {
    const pack = createContentPack(events, registries);
    expect(pack.byId.size).toBe(events.length);
    expect(pack.byId.get('border.bribe_attempt' as never)?.priority).toBe('beat');
  });

  it('indexes by priority and exposes the filler pool', () => {
    const pack = createContentPack(events, registries);
    for (const [priority, bucket] of pack.byPriority) {
      expect(EVENT_PRIORITIES).toContain(priority);
      for (const event of bucket) expect(event.priority).toBe(priority);
    }
    // The relaxation ladder's rung-6 floor needs at least two.
    expect(pack.fillers.length).toBeGreaterThanOrEqual(2);
  });

  it('indexes beats by beatType, and only beats', () => {
    const pack = createContentPack(events, registries);
    for (const [beatType, bucket] of pack.byBeatType) {
      for (const event of bucket) {
        expect(event.priority).toBe('beat');
        expect(event.beatType).toBe(beatType);
      }
    }
    expect([...pack.byBeatType.keys()].sort()).toEqual([
      'border_crossing',
      'finale',
      'midpoint_crisis',
    ]);
  });

  it('reports duplicate ids rather than silently dropping one', () => {
    const first = events[0];
    if (first === undefined) throw new Error('fixture is empty');
    expect(createContentPack([...events, first], registries).duplicateIds).toEqual([first.id]);
  });
});

describe('content references', () => {
  it('finds no dangling references in the fixture pack', () => {
    // In a QBN engine a dangling reference is SILENT — the event simply never fires
    // (ADR 0001). This is the instrument that makes it loud.
    const pack = createContentPack(events, registries);
    expect(pack.danglingRefs).toEqual([]);
  });

  it('reports every dangling reference with the event it came from', () => {
    const pack = createContentPack(events, EMPTY_REGISTRIES);
    expect(pack.danglingRefs.length).toBeGreaterThan(0);

    for (const ref of pack.danglingRefs) {
      expect(['event', 'npc', 'item', 'trait']).toContain(ref.kind);
      expect(ref.inEvent).not.toBe('');
    }
    // The bribe event names border_guard in both a predicate and an effect.
    expect(pack.danglingRefs.some((r) => r.kind === 'npc' && r.id === 'border_guard')).toBe(true);
  });

  it('resolves refs for the pack it was built from', () => {
    const pack = createContentPack(events, registries);
    expect(pack.refs.hasEvent('border.bribe_attempt' as never)).toBe(true);
    expect(pack.refs.hasEvent('does.not.exist' as never)).toBe(false);
    expect(pack.refs.hasNpc('border_guard' as never)).toBe(true);
    expect(pack.refs.hasTrait('smooth_talker' as never)).toBe(true);
    expect(pack.refs.hasItem('unicorn' as never)).toBe(false);
  });

  it('follows a scheduleEvent target', () => {
    // The one sanctioned soft pointer still has to point somewhere.
    const pack = createContentPack(events, registries);
    expect(pack.byId.has('border.guard_remembers' as never)).toBe(true);
  });
});

describe('contentVersion', () => {
  it('is order-independent', () => {
    expect(contentVersion(shuffle(events, 7), registries)).toBe(contentVersion(events, registries));
  });

  it('changes when any authored field changes', () => {
    const first = events[0];
    if (first === undefined) throw new Error('fixture is empty');
    const nudged = [{ ...first, weight: first.weight + 1 }, ...events.slice(1)];
    expect(contentVersion(nudged, registries)).not.toBe(contentVersion(events, registries));
  });

  it('changes when the registries change', () => {
    expect(contentVersion(events, EMPTY_REGISTRIES)).not.toBe(contentVersion(events, registries));
  });

  it('is 32 lowercase hex characters', () => {
    expect(contentVersion(events, registries)).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('fixture routes', () => {
  it('every fixture route is valid', () => {
    for (const route of loadFixtureRoutes()) {
      expect(validateRoute(route), `route ${route.id}`).toBeNull();
    }
  });

  it('every fixture route can start a run', () => {
    for (const route of loadFixtureRoutes()) {
      const result = createRunState(createRunInit('fixture', 'v1', route));
      expect(result.ok, `route ${route.id}`).toBe(true);
    }
  });

  it('covers the beat types the pack can fill', () => {
    const pack = createContentPack(events, registries);
    const scheduled = new Set(
      loadFixtureRoutes().flatMap((r) => r.beatSchedule.map((s) => s.type)),
    );
    for (const beatType of pack.byBeatType.keys()) {
      expect(scheduled, `no fixture route schedules ${beatType}`).toContain(beatType);
    }
  });
});

describe('contentVersion covers the modifier registry (M2A.3)', () => {
  const row = (delta: number): RegistryModifier => ({
    id: 'dishevelled',
    appliesTo: ['social'],
    when: { kind: 'always' },
    delta,
    labelKey: 'check.modifier.dishevelled',
    sourceKind: 'condition',
    conflictsWith: [],
    priority: 10,
    stacks: false,
  });

  const packWith = (delta: number): ContentPack =>
    createContentPack([], { ...EMPTY_REGISTRIES, modifiers: createModifierRegistry([row(delta)]) });

  it('moves when a single modifier delta changes by 1', () => {
    // THE test that makes putting the registry inside ContentRegistries load-bearing rather
    // than tidy. Hung off ContentPack as a sibling field it would not be hashed, so
    // pack.version would not move when modifiers.yaml changed — replayRun's contentVersion
    // refusal would never fire and every golden run would silently replay against different
    // modifier maths with a green suite.
    expect(packWith(-2).version).not.toBe(packWith(-1).version);
  });

  it('is stable for an identical registry', () => {
    expect(packWith(-2).version).toBe(packWith(-2).version);
  });

  it('is independent of the order rows were declared in', () => {
    const a = createModifierRegistry([row(-2), { ...row(-1), id: 'exhausted' }]);
    const b = createModifierRegistry([{ ...row(-1), id: 'exhausted' }, row(-2)]);
    expect(createContentPack([], { ...EMPTY_REGISTRIES, modifiers: a }).version).toBe(
      createContentPack([], { ...EMPTY_REGISTRIES, modifiers: b }).version,
    );
  });
});

describe('contentVersion covers the two Phase 2B registries (M-A)', () => {
  // Same argument as the modifier block above, and it has to be re-made per registry rather
  // than assumed: what makes the hash cover a registry is that the registry is INSIDE
  // `ContentRegistries`, and nothing about adding a second one guarantees the third is too.
  // Both ship empty in M-A, so without these two tests the placement is untested until the
  // milestone that fills them — which is the milestone that would have to debug it.

  const complication = (checkDelta: number): RegistryComplication => ({
    id: complicationId('queue_is_enormous'),
    appliesTo: ['cat:border'],
    requires: { kind: 'always' },
    weight: 1,
    textKey: 'complication.queue_is_enormous.text',
    checkDelta,
    addsChoice: null,
    removesChoice: null,
  });

  const universal = (labelKey: string): UniversalChoice => ({
    id: 'walk_away',
    appliesTo: ['cat:border'],
    family: 'retreat',
    priority: 10,
    choice: {
      id: choiceId(`${UNIVERSAL_CHOICE_PREFIX}walk_away`),
      labelKey,
      requires: { kind: 'always' },
      hiddenUnless: null,
      costs: [],
      skillCheck: null,
      search: null,
      outcomes: [
        {
          weight: 1,
          onCheck: null,
          requires: { kind: 'always' },
          textKey: 'universal.walk_away.out.left',
          textVariants: [],
          effects: [],
        },
      ],
    },
  });

  it('moves when a single complication checkDelta changes by 1', () => {
    const packWith = (delta: number): ContentPack =>
      createContentPack([], {
        ...EMPTY_REGISTRIES,
        complications: createComplicationRegistry([complication(delta)]),
      });

    expect(packWith(-3).version).not.toBe(packWith(-2).version);
  });

  it('moves when a single universal choice changes', () => {
    const packWith = (labelKey: string): ContentPack =>
      createContentPack([], {
        ...EMPTY_REGISTRIES,
        universalChoices: createUniversalChoiceRegistry([universal(labelKey)]),
      });

    expect(packWith('universal.walk_away.label').version).not.toBe(
      packWith('universal.walk_away.other').version,
    );
  });

  it('an empty registry hashes the same as the one M-A shipped', () => {
    // The anti-vacuity guard for the two above: if `createContentPack` silently dropped the
    // new keys, both `not.toBe` assertions would still pass for the wrong reason while this
    // one caught it — an empty registry and a populated one would agree.
    const empty = createContentPack([], EMPTY_REGISTRIES).version;
    const populated = createContentPack([], {
      ...EMPTY_REGISTRIES,
      complications: createComplicationRegistry([complication(-3)]),
    }).version;

    expect(empty).not.toBe(populated);
  });
});
