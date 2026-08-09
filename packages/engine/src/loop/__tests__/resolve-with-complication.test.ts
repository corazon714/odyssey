import { describe, expect, it } from 'vitest';
import { createContentPack, type ContentPack } from '../../content/content-pack.ts';
import {
  createComplicationRegistry,
  type RegistryComplication,
} from '../../content/registry-complication.ts';
import { choiceId, complicationId, eventId } from '../../ids/content-ids.ts';
import { createResources } from '../../state/resources.ts';
import { createRunState } from '../../state/create-run-state.ts';
import { createRunInit } from '../../state/run-init.ts';
import { type RunState } from '../../state/run-state.ts';
import { createTransport } from '../../state/transport-state.ts';
import { loadFixtureRouteEntries, loadMiniPack } from '../../__tests__/support/load-fixtures.ts';
import { resolveChoice } from '../resolve-choice.ts';

const { events, registries } = loadMiniPack();
const SCENARIO = loadFixtureRouteEntries()[1];

const ROW: RegistryComplication = {
  id: complicationId('second_officer_watching'),
  appliesTo: ['cat:border'],
  requires: { kind: 'always' },
  weight: 1,
  textKey: 'complication.second_officer_watching.text',
  checkDelta: -3,
  addsChoice: null,
  removesChoice: null,
};

function packWith(row: RegistryComplication | null): ContentPack {
  return createContentPack(events, {
    ...registries,
    complications: createComplicationRegistry(row === null ? [] : [row]),
  });
}

function presenting(pack: ContentPack, attached: string | null): RunState {
  if (SCENARIO === undefined) throw new Error('fixture routes missing');
  const created = createRunState({
    ...createRunInit('complication-seed', pack.version, SCENARIO.route),
    transport: { ...createTransport('truck'), vehicleId: 'v', legal: false },
    resources: { ...createResources(), cash: 300 },
  });
  if (!created.ok) throw new Error(`route rejected: ${created.error.code}`);

  return {
    ...created.state,
    status: 'travelling',
    presentation: {
      kind: 'event',
      eventId: eventId('border.bribe_attempt'),
      presentedAtLeg: created.state.route.legIndex,
      rung: 0,
      complicationId: attached === null ? null : complicationId(attached),
    },
  };
}

describe('resolveChoice sees the complication the director attached', () => {
  it('renders checkDelta as a CHIP, not as a silent dc change', () => {
    // Design pillar 2: the total has to be reconstructable from what is on screen. Folding
    // the delta into `dc` would move the outcome with nothing to point at.
    const pack = packWith(ROW);
    const result = resolveChoice(
      presenting(pack, 'second_officer_watching'),
      pack,
      choiceId('offer_bribe'),
    );
    if (!result.ok) throw new Error(`failed: ${result.error.code}`);

    const chip = result.resolution?.modifiers.find(
      (m) => m.id === 'complication.second_officer_watching',
    );
    expect(chip).toBeDefined();
    expect(chip?.rawDelta).toBe(-3);
    // The authored dc is untouched — the delta rides in the modifier total.
    expect(result.check?.dc).toBe(12);
  });

  it('applies nothing when no complication is attached', () => {
    const pack = packWith(ROW);
    const result = resolveChoice(presenting(pack, null), pack, choiceId('offer_bribe'));
    if (!result.ok) throw new Error(`failed: ${result.error.code}`);

    expect(result.resolution?.modifiers.map((m) => m.id)).not.toContain(
      'complication.second_officer_watching',
    );
  });

  it('DEGRADES to no-complication when the persisted id no longer resolves', () => {
    // The reload case, and the reason the id is persisted rather than the row. A player who
    // closes the app mid-event and reopens after a content update may name a complication this
    // build no longer ships — `reconcileContent` tolerates a contentVersion mismatch by policy,
    // so this has to be survivable rather than an error.
    const pack = packWith(null);
    const result = resolveChoice(
      presenting(pack, 'second_officer_watching'),
      pack,
      choiceId('offer_bribe'),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.resolution?.modifiers.map((m) => m.id)).not.toContain(
      'complication.second_officer_watching',
    );
  });

  it('accepts a choice the complication added', () => {
    const withChoice: RegistryComplication = {
      ...ROW,
      id: complicationId('the_engine_is_still_running'),
      addsChoice: {
        id: choiceId('c:just_drive_off'),
        labelKey: 'complication.the_engine_is_still_running.choice.just_drive_off',
        requires: { kind: 'always' },
        hiddenUnless: null,
        costs: [{ op: 'resource', key: 'heat', delta: 2 }],
        skillCheck: null,
        search: null,
        outcomes: [
          {
            weight: 1,
            onCheck: null,
            requires: { kind: 'always' },
            textKey: 'complication.the_engine_is_still_running.choice.just_drive_off.out.gone',
            textVariants: [],
            effects: [],
          },
        ],
      },
    };

    const pack = packWith(withChoice);
    const state = presenting(pack, 'the_engine_is_still_running');
    const result = resolveChoice(state, pack, choiceId('c:just_drive_off'));

    if (!result.ok) throw new Error(`failed: ${result.error.code}`);
    // The cost was paid, so the choice genuinely resolved rather than being ignored.
    expect(result.state.resources.heat).toBe(state.resources.heat + 2);
  });

  it('refuses a choice the complication removed', () => {
    // The engine is the authority on legality, not the screen (CLAUDE.md 2.7). If the two
    // lists diverged, this is the assertion that would catch it.
    const removing: RegistryComplication = {
      ...ROW,
      id: complicationId('shift_change'),
      removesChoice: choiceId('offer_bribe'),
    };

    const pack = packWith(removing);
    const result = resolveChoice(presenting(pack, 'shift_change'), pack, choiceId('offer_bribe'));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('loop/unknown-choice');
  });
});
