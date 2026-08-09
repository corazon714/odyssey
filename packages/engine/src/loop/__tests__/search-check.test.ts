import { describe, expect, it } from 'vitest';
import { createContentPack, type ContentPack } from '../../content/content-pack.ts';
import { type SearchSpec } from '../../content/search-spec.ts';
import { choiceId, eventId, itemId } from '../../ids/content-ids.ts';
import { createModifierRegistry } from '../../modifiers/registry-modifier.ts';
import { CONTAINER_SPECS, createContainer } from '../../state/container-state.ts';
import { createRunState } from '../../state/create-run-state.ts';
import { createResources } from '../../state/resources.ts';
import { createRunInit } from '../../state/run-init.ts';
import { type RunState } from '../../state/run-state.ts';
import { createTransport } from '../../state/transport-state.ts';
import { loadFixtureRouteEntries, loadMiniPack } from '../../__tests__/support/load-fixtures.ts';
import { resolveChoice } from '../resolve-choice.ts';
import { searchCheck } from '../search-check.ts';

const { events, registries } = loadMiniPack();
const PACK: ContentPack = createContentPack(events, registries);
const SCENARIO = loadFixtureRouteEntries()[1];

const SPEC: SearchSpec = {
  container: 'bag',
  dc: 12,
  item: itemId('cash_belt'),
  skill: 'stealth',
  tags: ['stealth', 'search'],
};

function base(): RunState {
  if (SCENARIO === undefined) throw new Error('fixture routes missing');
  const created = createRunState({
    ...createRunInit('search-seed', PACK.version, SCENARIO.route),
    transport: { ...createTransport('truck'), vehicleId: 'v', legal: false },
    resources: { ...createResources(), cash: SCENARIO.start.cash },
  });
  if (!created.ok) throw new Error(`route rejected: ${created.error.code}`);
  return created.state;
}

describe('searchCheck — a search is a skill check', () => {
  it('passes the authored dc, skill and tags straight through', () => {
    const check = searchCheck(SPEC, base().inventory);

    expect(check.dc).toBe(12);
    expect(check.skill).toBe('stealth');
    expect(check.tags).toEqual(['stealth', 'search']);
    // Done TO you: visible that it is happening, not how hard they mean to look.
    expect(check.visibility).toBe('partial');
  });

  it('a container you do not have contributes nothing rather than erroring', () => {
    // A fixture run carries only `person`. There is no bag to turn out, so there is nothing
    // in the bag to find — but the roll the author asked for still happens.
    const state = base();
    expect(state.inventory.bag).toBeNull();

    expect(searchCheck(SPEC, state.inventory).modifiers).toEqual([]);
  });

  it('the container bonus is a MODIFIER, not a change to the dc', () => {
    // A silent dc adjustment is a number the player cannot reconstruct. Routing it through
    // the modifier list is what gets it clamped, diminished and rendered as a chip alongside
    // everything else — design pillar 2.
    const state = base();
    const withBag: RunState = {
      ...state,
      inventory: { ...state.inventory, bag: createContainer('bag') },
    };

    const check = searchCheck(SPEC, withBag.inventory);

    expect(check.dc).toBe(12);
    expect(check.modifiers).toEqual([
      { labelKey: 'check.modifier.container.bag', delta: CONTAINER_SPECS.bag.searchDC, when: null },
    ]);
  });

  it('reads searchDC from STATE, so a reinforced bag conceals better than a default one', () => {
    // THE REGRESSION THIS FILE EXISTS FOR. ADR 0017 put the container numbers in state
    // "so a future bigger vehicle or a reinforced bag is a preparation choice rather than an
    // engine change". Reading the frozen CONTAINER_SPECS here would compile, pass every other
    // test in this file, and quietly make that sentence false.
    const state = base();
    const reinforced: RunState = {
      ...state,
      inventory: { ...state.inventory, bag: { ...createContainer('bag'), searchDC: 11 } },
    };

    const delta = searchCheck(SPEC, reinforced.inventory).modifiers[0]?.delta;

    expect(delta).toBe(11);
    expect(delta).not.toBe(CONTAINER_SPECS.bag.searchDC);
  });
});

describe('a search resolves through the loop', () => {
  /**
   * Put `border.bribe_attempt` on screen directly.
   *
   * The director is not under test here and reaching a border crossing depends on its
   * scoring, so driving `advanceLeg` until one turned up would make this test's coverage a
   * function of seed luck. `Presentation` is the engine's own contract for "this event is
   * awaiting a choice"; constructing it is how you test the half after selection.
   */
  function presenting(seed: string, cash: number): RunState {
    const state = base();
    return {
      ...state,
      seed,
      status: 'travelling',
      resources: { ...state.resources, cash },
      presentation: {
        kind: 'event',
        eventId: eventId('border.bribe_attempt'),
        presentedAtLeg: state.route.legIndex,
        rung: 0,
        complicationId: null,
      },
    };
  }

  it('rolls, and its result selects an outcome through onCheck', () => {
    // Several seeds so both sides of the roll are seen — the branch is the point.
    const sides = new Set<string>();

    for (const seed of ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']) {
      const result = resolveChoice(presenting(seed, 200), PACK, choiceId('hide_the_cash'));
      if (!result.ok) throw new Error(`resolveChoice failed: ${result.error.code}`);

      // The search produced a roll, and it is the roll `onCheck` branched on.
      expect(result.check).not.toBeNull();
      expect(result.check?.dc).toBe(12);
      expect(result.outcome).not.toBeNull();

      // Success means it stayed hidden. That direction is forced by the sign convention in
      // modifiers.yaml — `cash_concealed` is +2, `wanted_by_authorities` is −3, both from the
      // player's side. See content/search-spec.ts.
      const key = String(result.outcome?.textKey);
      expect(key.endsWith('.found')).toBe(!(result.check?.success ?? false));
      sides.add(key.endsWith('.found') ? 'found' : 'concealed');
    }

    // Anti-vacuous: a search that always landed the same way would pass every line above.
    expect([...sides].sort()).toEqual(['concealed', 'found']);
  });

  it('a search-tagged registry row reaches the roll', () => {
    // The mechanism, proven against a registry built here rather than against the fixture's.
    //
    // THE FIXTURE PACK SHIPS AN EMPTY MODIFIER REGISTRY — `mini-pack.json` has
    // `registries.modifiers: []`, and `sim/load-pack.ts` reads that same file. So the ten rows
    // in `packages/content/modifiers.yaml` have never applied in a golden run or a sim run;
    // M2A.3 moved `contentVersion` because the KEY appeared, not because the rows did. That is
    // a content-wiring gap, not an engine one, and asserting against `PACK.modifiers` here
    // would silently test nothing.
    expect(PACK.modifiers).toEqual([]);

    const withRegistry = createContentPack(events, {
      ...registries,
      modifiers: createModifierRegistry([
        {
          id: 'test_pat_down',
          appliesTo: ['search'],
          when: { kind: 'always' },
          delta: 3,
          labelKey: 'check.modifier.test_pat_down',
          sourceKind: 'context',
          conflictsWith: [],
          priority: 10,
          stacks: true,
        },
      ]),
    });

    const result = resolveChoice(presenting('reg', 200), withRegistry, choiceId('hide_the_cash'));
    if (!result.ok) throw new Error(`resolveChoice failed: ${result.error.code}`);

    expect(result.resolution?.modifiers.map((m) => m.id)).toContain('test_pat_down');
  });
});
