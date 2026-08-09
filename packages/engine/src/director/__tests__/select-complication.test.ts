import { describe, expect, it } from 'vitest';
import { createContentPack } from '../../content/content-pack.ts';
import { ANY_CONTEXT, type GameEvent } from '../../content/game-event.ts';
import { presentedChoices } from '../../content/presented-choices.ts';
import {
  createComplicationRegistry,
  type RegistryComplication,
} from '../../content/registry-complication.ts';
import { choiceId, complicationId, eventId } from '../../ids/content-ids.ts';
import { ALL_REFS_KNOWN, createPredicateContext } from '../../predicate/predicate-context.ts';
import { createRunState } from '../../state/create-run-state.ts';
import { createRunInit } from '../../state/run-init.ts';
import { loadFixtureRouteEntries, loadMiniPack } from '../../__tests__/support/load-fixtures.ts';
import { ATTACH_PERCENT, selectComplication } from '../select-complication.ts';

const { events, registries } = loadMiniPack();
const ROUTE = loadFixtureRouteEntries()[0];

function ctxFor() {
  if (ROUTE === undefined) throw new Error('fixture routes missing');
  const created = createRunState(createRunInit('c-seed', 'v', ROUTE.route));
  if (!created.ok) throw new Error(`route rejected: ${created.error.code}`);
  return createPredicateContext(created.state, ALL_REFS_KNOWN, 'test:0');
}

function event(id: string, tags: readonly string[]): GameEvent {
  return {
    id: eventId(id),
    version: 1,
    category: id.split('.')[0] ?? 'misc',
    tags,
    priority: 'normal',
    beatType: null,
    weight: 100,
    tensionBand: null,
    context: ANY_CONTEXT,
    cooldownLegs: 0,
    maxOccurrences: null,
    exclusiveGroup: null,
    requires: { kind: 'always' },
    image: null,
    titleKey: `events.${id}.title`,
    bodyKey: `events.${id}.body`,
    choices: [
      {
        id: choiceId('go'),
        labelKey: 'x.go',
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
            textKey: 'x.go.out',
            textVariants: [],
            effects: [],
          },
        ],
      },
    ],
  };
}

function complication(
  id: string,
  appliesTo: readonly string[],
  weight = 1,
  requires: RegistryComplication['requires'] = { kind: 'always' },
): RegistryComplication {
  return {
    id: complicationId(id),
    appliesTo,
    requires,
    weight,
    textKey: `complication.${id}.text`,
    checkDelta: -2,
    addsChoice: null,
    removesChoice: null,
  };
}

const EVENT = event('border.x', ['authority']);

describe('selectComplication', () => {
  it('returns null on an empty registry', () => {
    expect(
      selectComplication(EVENT, 'seed', 0, createComplicationRegistry([]), ctxFor()),
    ).toBeNull();
  });

  it('returns null when no tag matches', () => {
    const registry = createComplicationRegistry([complication('storm', ['cat:river'])]);
    expect(selectComplication(EVENT, 'seed', 0, registry, ctxFor())).toBeNull();
  });

  it('returns null when every candidate fails its own requires', () => {
    const registry = createComplicationRegistry([
      complication('never', ['authority'], 1, { kind: 'never' }),
    ]);
    expect(selectComplication(EVENT, 'seed', 0, registry, ctxFor())).toBeNull();
  });

  it('matches on the synthetic cat: tag', () => {
    const registry = createComplicationRegistry([complication('queue', ['cat:border'])]);
    // Not every leg attaches, so sweep until one does rather than asserting on leg 0.
    const legs = Array.from({ length: 40 }, (_, i) => i);
    const found = legs.some(
      (leg) => selectComplication(EVENT, 'seed', leg, registry, ctxFor()) !== null,
    );
    expect(found).toBe(true);
  });

  it('is deterministic for the same (event, leg, seed)', () => {
    const registry = createComplicationRegistry([
      complication('a', ['authority']),
      complication('b', ['authority']),
    ]);

    for (const leg of [0, 3, 11]) {
      const first = selectComplication(EVENT, 'seed', leg, registry, ctxFor());
      const second = selectComplication(EVENT, 'seed', leg, registry, ctxFor());
      expect(second?.id ?? null).toBe(first?.id ?? null);
    }
  });

  it('attaches at roughly ATTACH_PERCENT across many legs', () => {
    // The rate is a tunable, so this is a band rather than a value. 400 samples keeps it
    // stable without making the test a statistics exercise.
    const registry = createComplicationRegistry([complication('queue', ['authority'])]);
    const legs = Array.from({ length: 400 }, (_, i) => i);
    const attached = legs.filter(
      (leg) => selectComplication(EVENT, 'seed', leg, registry, ctxFor()) !== null,
    ).length;

    const rate = (attached / legs.length) * 100;
    expect(rate).toBeGreaterThan(ATTACH_PERCENT - 12);
    expect(rate).toBeLessThan(ATTACH_PERCENT + 12);
  });

  it('ADDING A ROW DOES NOT CHANGE ANOTHER EVENT-LEG PAIR', () => {
    // The property content-addressing exists for. A cursor-advancing draw would make the
    // number of draws depend on how many rows were evaluated, so inserting one row would
    // reshuffle every complication after it — and the corpus grows by twenty-five in M-E.
    const before = createComplicationRegistry([complication('a', ['authority'])]);
    const after = createComplicationRegistry([
      complication('a', ['authority']),
      complication('zzz_unrelated', ['cat:river']),
    ]);

    for (const leg of Array.from({ length: 30 }, (_, i) => i)) {
      expect(selectComplication(EVENT, 'seed', leg, after, ctxFor())?.id ?? null).toBe(
        selectComplication(EVENT, 'seed', leg, before, ctxFor())?.id ?? null,
      );
    }
  });

  it('consumes no RNG cursor at all', () => {
    // It takes no `Rng`, so this is structural rather than statistical — but the whole point
    // is that `encounterFlavor` stays at 0 forever, and a future refactor that reached for a
    // cursor would still typecheck. This is what would catch it.
    const pack = createContentPack(events, registries);
    const registry = createComplicationRegistry([complication('queue', ['authority'])]);
    if (ROUTE === undefined) throw new Error('fixture routes missing');
    const created = createRunState(createRunInit('c-seed', pack.version, ROUTE.route));
    if (!created.ok) throw new Error('route rejected');

    selectComplication(EVENT, created.state.seed, 0, registry, ctxFor());

    expect(created.state.rngCursors.encounterFlavor).toBe(0);
  });
});

describe('presentedChoices', () => {
  const added = {
    id: choiceId('c:shelter'),
    labelKey: 'complication.rain.choice.shelter',
    requires: { kind: 'always' as const },
    hiddenUnless: null,
    costs: [],
    skillCheck: null,
    search: null,
    outcomes: [
      {
        weight: 1,
        onCheck: null,
        requires: { kind: 'always' as const },
        textKey: 'complication.rain.choice.shelter.out.waited',
        textVariants: [],
        effects: [],
      },
    ],
  };

  it('is the identity with no complication, down to object reference', () => {
    expect(presentedChoices(EVENT, null)).toBe(EVENT.choices);
  });

  it('appends an added choice after the existing ones', () => {
    const row: RegistryComplication = { ...complication('rain', ['authority']), addsChoice: added };
    expect(presentedChoices(EVENT, row).map((c) => String(c.id))).toEqual(['go', 'c:shelter']);
  });

  it('removes a named choice', () => {
    const two = { ...EVENT, choices: [...EVENT.choices, { ...added, id: choiceId('wait') }] };
    const row: RegistryComplication = {
      ...complication('shift', ['authority']),
      removesChoice: choiceId('wait'),
    };
    expect(presentedChoices(two, row).map((c) => String(c.id))).toEqual(['go']);
  });

  it('DECLINES a removal that would empty the list', () => {
    // A content mistake must not become a stuck run: resolveChoice would reject every id the
    // caller could pass, and the leg would be unresolvable.
    const row: RegistryComplication = {
      ...complication('shift', ['authority']),
      removesChoice: choiceId('go'),
    };
    expect(presentedChoices(EVENT, row).map((c) => String(c.id))).toEqual(['go']);
  });

  it('applies a removal and an addition together', () => {
    const two = { ...EVENT, choices: [...EVENT.choices, { ...added, id: choiceId('wait') }] };
    const row: RegistryComplication = {
      ...complication('both', ['authority']),
      removesChoice: choiceId('wait'),
      addsChoice: added,
    };
    expect(presentedChoices(two, row).map((c) => String(c.id))).toEqual(['go', 'c:shelter']);
  });
});
