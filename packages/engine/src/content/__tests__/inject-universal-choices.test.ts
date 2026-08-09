import { describe, expect, it } from 'vitest';
import { choiceId, eventId, type ChoiceId } from '../../ids/content-ids.ts';
import { ANY_CONTEXT, type Choice, type GameEvent } from '../game-event.ts';
import { injectUniversalChoices } from '../inject-universal-choices.ts';
import {
  createUniversalChoiceRegistry,
  MAX_UNIVERSAL_PER_EVENT,
  UNIVERSAL_CHOICE_PREFIX,
  type UniversalChoice,
} from '../universal-choice.ts';

function choice(id: string): Choice {
  return {
    id: choiceId(id),
    labelKey: `x.${id}`,
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
        textKey: `x.${id}.out`,
        textVariants: [],
        effects: [],
      },
    ],
  };
}

function event(id: string, tags: readonly string[], choiceCount = 2): GameEvent {
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
    choices: Array.from({ length: choiceCount }, (_, i) => choice(`authored_${String(i)}`)),
  };
}

function row(
  id: string,
  appliesTo: readonly string[],
  priority: number,
  family: string | null = null,
  choiceIdOverride?: string,
): UniversalChoice {
  return {
    id,
    appliesTo,
    family,
    priority,
    choice: { ...choice(choiceIdOverride ?? `${UNIVERSAL_CHOICE_PREFIX}${id}`) },
  };
}

const injectedIds = (events: readonly GameEvent[]): readonly ChoiceId[] =>
  (events[0]?.choices ?? [])
    .map((c) => c.id)
    .filter((id) => String(id).startsWith(UNIVERSAL_CHOICE_PREFIX));

describe('injectUniversalChoices', () => {
  it('is the identity on an empty registry, down to object reference', () => {
    // M-B ships an empty registry and its whole proof is that no golden run moved. Returning
    // a rebuilt-but-equal array would still be correct, but this is the stronger claim and
    // the cheap one to make.
    const events = [event('border.x', ['authority'])];
    const result = injectUniversalChoices(events, createUniversalChoiceRegistry([]));

    expect(result.events).toBe(events);
    expect(result.shadowed).toEqual([]);
  });

  it('appends a matching row AFTER the authored choices', () => {
    const events = [event('border.x', ['authority'])];
    const registry = createUniversalChoiceRegistry([row('walk_away', ['authority'], 10)]);

    const result = injectUniversalChoices(events, registry);
    const ids = (result.events[0]?.choices ?? []).map((c) => String(c.id));

    // Order is load-bearing: the sim's tie-break and the eventual UI both read it, and the
    // hand-authored choices are the ones written for THIS situation.
    expect(ids).toEqual(['authored_0', 'authored_1', 'u:walk_away']);
  });

  it('matches on the synthetic cat: tag as well as a bare tag', () => {
    const events = [event('border.x', ['authority'])];
    const registry = createUniversalChoiceRegistry([row('bribe', ['cat:border'], 10)]);

    expect(injectedIds(injectUniversalChoices(events, registry).events)).toEqual(['u:bribe']);
  });

  it('injects nothing when no tag matches', () => {
    const events = [event('border.x', ['authority'])];
    const registry = createUniversalChoiceRegistry([row('swim', ['cat:river', 'nautical'], 10)]);

    const result = injectUniversalChoices(events, registry);
    expect(injectedIds(result.events)).toEqual([]);
    expect(result.events[0]).toBe(events[0]);
  });

  it('orders by descending priority, then by id ascending', () => {
    const events = [event('border.x', ['authority'], 5)];
    const registry = createUniversalChoiceRegistry([
      row('zulu', ['authority'], 50),
      row('alpha', ['authority'], 50),
      row('yankee', ['authority'], 99),
    ]);

    // Priority first; `alpha` beats `zulu` on the id tiebreak, never on locale collation.
    expect(injectedIds(injectUniversalChoices(events, registry).events)).toEqual([
      'u:yankee',
      'u:alpha',
      'u:zulu',
    ]);
  });

  it('caps at MAX_UNIVERSAL_PER_EVENT', () => {
    const events = [event('border.x', ['authority'], 10)];
    const registry = createUniversalChoiceRegistry(
      Array.from({ length: 8 }, (_, i) => row(`r${String(i)}`, ['authority'], 10 - i)),
    );

    expect(injectedIds(injectUniversalChoices(events, registry).events)).toHaveLength(
      MAX_UNIVERSAL_PER_EVENT,
    );
  });

  it('never injects more than the event authored itself', () => {
    // "Never more than half the choices shown" reduces to `i <= a`. With one authored choice,
    // one injected is the ceiling — two would make the registry the majority of the screen.
    const events = [event('border.x', ['authority'], 1)];
    const registry = createUniversalChoiceRegistry([
      row('a', ['authority'], 30),
      row('b', ['authority'], 20),
      row('c', ['authority'], 10),
    ]);

    const ids = injectedIds(injectUniversalChoices(events, registry).events);
    expect(ids).toEqual(['u:a']);
  });

  it('takes at most one row per family', () => {
    const events = [event('border.x', ['authority'], 5)];
    const registry = createUniversalChoiceRegistry([
      row('run', ['authority'], 30, 'retreat'),
      row('walk_away', ['authority'], 20, 'retreat'),
      row('threaten', ['authority'], 10, 'force'),
    ]);

    // `walk_away` loses to `run` on priority within `retreat`; `threaten` is a different
    // family and still lands, so the cap is per-family rather than global.
    expect(injectedIds(injectUniversalChoices(events, registry).events)).toEqual([
      'u:run',
      'u:threaten',
    ]);
  });

  it('drops a colliding row rather than shadowing the authored choice', () => {
    // The failure this prevents is silent, not loud: `resolveChoice` uses `.find`, so a
    // shadowing injection would be displayed, picked, and resolve the AUTHORED outcomes.
    const events = [event('border.x', ['authority'])];
    const registry = createUniversalChoiceRegistry([
      row('clash', ['authority'], 10, null, 'authored_0'),
    ]);

    const result = injectUniversalChoices(events, registry);

    expect((result.events[0]?.choices ?? []).map((c) => String(c.id))).toEqual([
      'authored_0',
      'authored_1',
    ]);
    expect(result.shadowed).toEqual([
      { event: eventId('border.x'), choiceId: choiceId('authored_0'), row: 'clash' },
    ]);
  });

  it('leaves an event with no choices of its own alone', () => {
    // Injecting into an empty list would make the registry the entire event.
    const events = [event('border.x', ['authority'], 0)];
    const registry = createUniversalChoiceRegistry([row('walk_away', ['authority'], 10)]);

    expect(injectUniversalChoices(events, registry).events[0]?.choices).toEqual([]);
  });

  it('is independent of the order rows were declared in', () => {
    const events = [event('border.x', ['authority'], 5)];
    const a = createUniversalChoiceRegistry([
      row('alpha', ['authority'], 10),
      row('bravo', ['authority'], 20),
    ]);
    const b = createUniversalChoiceRegistry([
      row('bravo', ['authority'], 20),
      row('alpha', ['authority'], 10),
    ]);

    expect(injectedIds(injectUniversalChoices(events, a).events)).toEqual(
      injectedIds(injectUniversalChoices(events, b).events),
    );
  });
});
