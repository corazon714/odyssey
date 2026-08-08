import { describe, expect, it } from 'vitest';
import { createContentPack, type ContentPack } from '../../content/content-pack.ts';
import { choiceId, type ChoiceId } from '../../ids/content-ids.ts';
import { createRunState } from '../../state/create-run-state.ts';
import { createResources } from '../../state/resources.ts';
import { createRunInit } from '../../state/run-init.ts';
import { type RunState } from '../../state/run-state.ts';
import { createTransport } from '../../state/transport-state.ts';
import { stateDigest } from '../../state/state-digest.ts';
import { loadFixtureRouteEntries, loadMiniPack } from '../../__tests__/support/load-fixtures.ts';
import { advanceLeg } from '../advance-leg.ts';
import { checkRunEnd } from '../check-run-end.ts';
import { resolveChoice } from '../resolve-choice.ts';

const { events, registries } = loadMiniPack();
const PACK: ContentPack = createContentPack(events, registries);
const SCENARIO = loadFixtureRouteEntries()[1]; // fixture.illicit — the longest, with borders

function start(seed = 'loop-seed'): RunState {
  if (SCENARIO === undefined) throw new Error('fixture routes missing');
  const result = createRunState({
    ...createRunInit(seed, PACK.version, SCENARIO.route),
    transport: { ...createTransport('truck'), vehicleId: 'v', legal: false },
    resources: { ...createResources(), cash: SCENARIO.start.cash },
    startHour: SCENARIO.start.startHour,
    weather: SCENARIO.start.weather,
  });
  if (!result.ok) throw new Error(`fixture route rejected: ${result.error.code}`);
  return result.state;
}

/** Drive a run to its ending, always taking the first selectable choice. */
function playOut(seed: string): { state: RunState; turns: number } {
  let state = start(seed);
  let turns = 0;

  while (state.status !== 'ended' && turns < 300) {
    turns += 1;
    const advanced = advanceLeg(state, PACK);
    if (!advanced.ok) throw new Error(`advanceLeg failed: ${advanced.error.code}`);
    state = advanced.state;

    if (advanced.selection?.kind !== 'event') continue;

    const first = advanced.selection.event.choices[0];
    if (first === undefined) throw new Error('event with no choices');
    const resolved = resolveChoice(state, PACK, first.id);
    if (!resolved.ok) throw new Error(`resolveChoice failed: ${resolved.error.code}`);
    state = resolved.state;
  }

  return { state, turns };
}

describe('advanceLeg', () => {
  it('starts a preparing run at leg 0 without skipping it', () => {
    const advanced = advanceLeg(start(), PACK);
    if (!advanced.ok) throw new Error('expected ok');

    expect(advanced.state.status).toBe('travelling');
    expect(advanced.state.route.legIndex).toBe(0);
  });

  it('steps forward on later calls', () => {
    let state = start();
    for (const expected of [0, 1, 2]) {
      const advanced = advanceLeg(state, PACK);
      if (!advanced.ok) throw new Error('expected ok');
      expect(advanced.state.route.legIndex).toBe(expected);
      // Clear the presentation the way resolveChoice would, so the next call is legal.
      state = { ...advanced.state, presentation: { kind: 'none' } };
    }
  });

  it('refuses to skip a presented event', () => {
    // Discarding it would let the UI walk past a consequence — the class of bug rule 2.7
    // exists to prevent.
    const first = advanceLeg(start(), PACK);
    if (!first.ok) throw new Error('expected ok');
    if (first.state.presentation.kind !== 'event') return;

    const second = advanceLeg(first.state, PACK);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.code).toBe('loop/wrong-status');
  });

  it('returns a typed error rather than throwing on an ended run', () => {
    const { state } = playOut('ended-run');
    const advanced = advanceLeg(state, PACK);
    expect(advanced.ok).toBe(false);
    if (advanced.ok) return;
    expect(advanced.error.code).toBe('loop/wrong-status');
  });

  it('advances the clock on every leg, including uneventful ones', () => {
    const before = start();
    const advanced = advanceLeg(before, PACK);
    if (!advanced.ok) throw new Error('expected ok');
    expect(
      advanced.state.clock.hour !== before.clock.hour ||
        advanced.state.clock.day > before.clock.day,
    ).toBe(true);
  });
});

describe('resolveChoice', () => {
  it('rejects a choice the presented event does not have', () => {
    const advanced = advanceLeg(start(), PACK);
    if (!advanced.ok || advanced.selection?.kind !== 'event') return;

    const result = resolveChoice(advanced.state, PACK, choiceId('not_a_real_choice'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('loop/unknown-choice');
  });

  it('rejects a resolve with nothing presented', () => {
    const state = { ...start(), status: 'travelling' as const };
    const result = resolveChoice(state, PACK, choiceId('x'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('loop/no-presented-event');
  });

  it('records history and event memory', () => {
    const advanced = advanceLeg(start(), PACK);
    if (!advanced.ok || advanced.selection?.kind !== 'event') return;
    const event = advanced.selection.event;
    const choice = event.choices[0];
    if (choice === undefined) return;

    const result = resolveChoice(advanced.state, PACK, choice.id);
    if (!result.ok) throw new Error('expected ok');

    expect(result.state.history).toHaveLength(1);
    expect(result.state.history[0]?.eventId).toBe(event.id);
    // Tags are copied at fire time so the run's own history stays the source of truth for
    // M7's tag-saturation penalty, even after a content update.
    expect(result.state.history[0]?.tags).toEqual(event.tags);
    expect(result.state.eventMemory[event.id]?.count).toBe(1);
    expect(result.state.presentation.kind).toBe('none');
  });

  it('never throws for any choice id in the error table', () => {
    const ids: ChoiceId[] = [choiceId(''), choiceId('..'), choiceId('offer_bribe')];
    const advanced = advanceLeg(start(), PACK);
    if (!advanced.ok) throw new Error('expected ok');

    for (const id of ids) {
      expect(() => resolveChoice(advanced.state, PACK, id)).not.toThrow();
    }
  });
});

describe('the loop end to end', () => {
  it('drives a run to an ending', () => {
    const { state, turns } = playOut('end-to-end');
    expect(state.status).toBe('ended');
    expect(turns).toBeLessThan(300);
    expect(state.unlockedEndings.length).toBeGreaterThan(0);
  });

  it('is deterministic — the same seed replays to the same digest', () => {
    // The whole point of the engine. Two independent play-outs of one seed must agree
    // exactly, including history.
    expect(stateDigest(playOut('replay-me').state)).toBe(stateDigest(playOut('replay-me').state));
  });

  it('produces a different run from a different seed', () => {
    expect(stateDigest(playOut('seed-a').state)).not.toBe(stateDigest(playOut('seed-b').state));
  });

  it('keeps state JSON-serialisable all the way to the ending', () => {
    const { state } = playOut('serialise-to-end');
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('always attributes an ending', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const { state } = playOut(`attribute-${seed}`);
      expect(state.unlockedEndings.length, `seed ${seed}`).toBeGreaterThan(0);
    }
  });
});

describe('checkRunEnd', () => {
  it('prefers arrival over failure', () => {
    // Reaching the destination on your last point of health is an ARRIVAL — the more
    // interesting story, and design pillar 1 prefers it.
    const state = start();
    const arrived: RunState = {
      ...state,
      route: { ...state.route, legIndex: state.route.legCount },
      resources: { ...state.resources, health: 0 },
    };
    const verdict = checkRunEnd(arrived);
    expect(verdict.ended).toBe(true);
    if (!verdict.ended) return;
    expect(verdict.reasonKey).toBe('loop.end.arrived');
  });

  it('ends on collapse and on giving up', () => {
    const state = start();
    expect(checkRunEnd({ ...state, resources: { ...state.resources, health: 0 } }).ended).toBe(
      true,
    );
    expect(checkRunEnd({ ...state, resources: { ...state.resources, morale: 0 } }).ended).toBe(
      true,
    );
  });

  it('does not end a healthy run mid-route', () => {
    expect(checkRunEnd(start()).ended).toBe(false);
  });
});
