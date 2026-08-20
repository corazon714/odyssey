import { describe, expect, it } from 'vitest';
import { createRunInit } from '../../state/run-init.ts';
import { createRunState } from '../../state/create-run-state.ts';
import { makeRoute } from '../../state/__tests__/support/make-route.ts';
import { type LocationType } from '../../content/location-type.ts';
import { endingId } from '../../ids/content-ids.ts';
import { type RunState } from '../../state/run-state.ts';
import {
  MOOD_IDS,
  MOOD_OVERLAYS,
  moodFromState,
  moodOverlaysFromState,
  type MoodId,
} from '../mood.ts';

/**
 * The mood derivation.
 *
 * What is pinned here is the ORDER and the reasoning behind it, not the thresholds — `heat >= 7`
 * and `health <= 3` are balance and will move. Every test below names the design argument it is
 * protecting, because a priority order with no stated reason is one a later session will reshuffle
 * to fix a screen.
 */

function baseState(): RunState {
  const created = createRunState(createRunInit('mood', 'test', makeRoute()));
  if (!created.ok) throw new Error(`fixture route rejected: ${created.error.code}`);
  return created.state;
}

/** A state with the given overrides, resources merged rather than replaced. */
function withState(over: {
  resources?: Partial<RunState['resources']>;
  location?: LocationType;
  weather?: string;
  hour?: number;
  status?: RunState['status'];
  endings?: readonly string[];
}): RunState {
  const base = baseState();
  const legLocations: LocationType[] = base.route.legLocations.map((l, i) =>
    i === base.route.legIndex && over.location !== undefined ? over.location : l,
  );
  return {
    ...base,
    resources: { ...base.resources, ...over.resources },
    route: { ...base.route, legLocations },
    weather: over.weather ?? base.weather,
    clock: { ...base.clock, hour: over.hour ?? base.clock.hour },
    status: over.status ?? base.status,
    unlockedEndings: (over.endings ?? []).map((e) => endingId(e)),
  };
}

/** Noon, clear, healthy, solvent, on an ordinary road — the state that must read `default`. */
const CALM = {
  hour: 12,
  weather: 'clear',
  location: 'roadside' as LocationType,
  resources: { cash: 100, health: 10, morale: 8, hunger: 0, heat: 0 },
};

describe('the priority order, and the argument behind each rung', () => {
  it('reads `default` when nothing is happening — the anti-vacuous baseline', () => {
    // Without this, every assertion below could pass on a function that always returned its own
    // first branch.
    expect(moodFromState(withState(CALM))).toBe('default');
  });

  it('`wanted` beats `injured`, and that is the case worth arguing', () => {
    // heat is an EXTERNAL, escalating threat with a scene attached; low health is a condition the
    // resource meter already shows continuously. If injured won, a hurt player at heat 9 would
    // lose the siren at exactly the moment it carries the most information — and gain nothing.
    const hurtAndHunted = withState({
      ...CALM,
      resources: { ...CALM.resources, heat: 9, health: 1 },
    });
    expect(moodFromState(hurtAndHunted)).toBe('wanted');

    // ...and `injured` still wins once the heat is off, or the rung would be unreachable.
    const justHurt = withState({ ...CALM, resources: { ...CALM.resources, health: 1 } });
    expect(moodFromState(justHurt)).toBe('injured');
  });

  it('`wanted` beats a border crossing, `border_tension` beats everything below it', () => {
    const huntedAtBorder = withState({
      ...CALM,
      location: 'border_crossing',
      resources: { ...CALM.resources, heat: 8 },
    });
    expect(moodFromState(huntedAtBorder)).toBe('wanted');

    for (const location of ['border_crossing', 'checkpoint'] as const) {
      const brokeAtCrossing = withState({
        ...CALM,
        location,
        resources: { cash: 0, bank: 0, morale: 0, health: 1, hunger: 10, heat: 0 },
      });
      expect(moodFromState(brokeAtCrossing)).toBe('border_tension');
    }
  });

  it('`desperate` needs BOTH no money and a failing meter', () => {
    // Broke alone is between jobs, not desperate. The mood has to mean something.
    const brokeButFine = withState({
      ...CALM,
      resources: { cash: 0, bank: 0, health: 10, morale: 8, hunger: 0, heat: 0 },
    });
    expect(moodFromState(brokeButFine)).toBe('default');

    // Failing but solvent is likewise not desperate — you can still buy your way out.
    const hungryButPaid = withState({
      ...CALM,
      resources: { ...CALM.resources, cash: 500, hunger: 9 },
    });
    expect(moodFromState(hungryButPaid)).toBe('default');

    // Either meter, with no money, does it.
    for (const failing of [{ hunger: 7 }, { morale: 2 }]) {
      const state = withState({
        ...CALM,
        resources: { cash: 0, bank: 0, health: 10, morale: 8, hunger: 0, heat: 0, ...failing },
      });
      expect(moodFromState(state)).toBe('desperate');
    }

    // BANK counts as money. A player with a full account is not desperate, whatever the meters
    // say — the three-tier money model (ADR 0016) exists precisely so cash is not the only test.
    const banked = withState({
      ...CALM,
      resources: { cash: 0, bank: 400, health: 10, morale: 0, hunger: 10, heat: 0 },
    });
    expect(moodFromState(banked)).not.toBe('desperate');
  });

  it('`storm` is rain and wind — NOT world-tick.ts HARSH_WEATHER, which includes heat', () => {
    // HARSH_WEATHER is a drain-economy constant the balance sweep may move; a heat wave costs
    // hours and is not a storm. Keying a palette off it is the coupling wear-state.ts documents.
    expect(moodFromState(withState({ ...CALM, weather: 'rain' }))).toBe('storm');
    expect(moodFromState(withState({ ...CALM, weather: 'wind' }))).toBe('storm');
    expect(moodFromState(withState({ ...CALM, weather: 'heat' }))).toBe('default');
    // `fog` is a real WEATHERS member with nowhere to go in this vocabulary. A recorded gap.
    expect(moodFromState(withState({ ...CALM, weather: 'fog' }))).toBe('default');
  });

  it('`urban` derives from city and town, because there is no `urban` LocationType', () => {
    expect(moodFromState(withState({ ...CALM, location: 'city' }))).toBe('urban');
    expect(moodFromState(withState({ ...CALM, location: 'town' }))).toBe('urban');
    // A village is not urban, and neither is anywhere you merely stop.
    expect(moodFromState(withState({ ...CALM, location: 'village' }))).toBe('default');
    expect(moodFromState(withState({ ...CALM, location: 'rest_stop' }))).toBe('default');
    expect(moodFromState(withState({ ...CALM, location: 'wilderness' }))).toBe('wilderness');
  });

  it('`night` loses to everything above it but is never simply lost', () => {
    expect(moodFromState(withState({ ...CALM, hour: 2 }))).toBe('night');

    // Outranked by a crossing...
    const nightCrossing = withState({ ...CALM, hour: 2, location: 'border_crossing' });
    expect(moodFromState(nightCrossing)).toBe('border_tension');
    // ...and STILL returned as an overlay, which is the whole reason overlays exist.
    expect(moodOverlaysFromState(nightCrossing)).toContain('night');
  });
});

describe('`triumphant` is gated on status, and on ONE ending', () => {
  it('does NOT fire mid-run, even with the ending already unlocked', () => {
    // THE HAZARD THIS GATE EXISTS FOR. Content unlocks arrival variants DURING the run —
    // check-run-end.ts filters `unlockedEndings` for them at the moment of arrival — so
    // `ending.arrival_triumphant` can sit in the list for twenty legs before the run ends.
    // Without the status gate the world would turn triumphant in the middle of the journey.
    const stillTravelling = withState({
      ...CALM,
      status: 'travelling',
      endings: ['ending.arrival_triumphant'],
    });
    expect(stillTravelling.status).toBe('travelling');
    expect(moodFromState(stillTravelling)).toBe('default');
  });

  it('fires when the run has ended on that ending', () => {
    const won = withState({ ...CALM, status: 'ended', endings: ['ending.arrival_triumphant'] });
    expect(moodFromState(won)).toBe('triumphant');
  });

  it('a HOLLOW arrival is not triumphant — it falls through to the state it arrived in', () => {
    // endings.yaml: "Arrived, but spent. The journey cost more than the destination was worth."
    // Rendering that triumphant would have the presentation congratulate the player for something
    // the content just told them was sad. Falling through to `desperate` is the right screen and
    // is emergent rather than special-cased.
    const hollow = withState({
      status: 'ended',
      endings: ['ending.arrival_hollow'],
      hour: 12,
      weather: 'clear',
      location: 'roadside',
      resources: { cash: 0, bank: 0, health: 6, morale: 1, hunger: 3, heat: 0 },
    });
    expect(moodFromState(hollow)).toBe('desperate');
  });

  it('a failure ending is not triumphant either', () => {
    const lost = withState({
      ...CALM,
      status: 'ended',
      endings: ['ending.failure_gave_up'],
      resources: { ...CALM.resources, health: 2 },
    });
    expect(moodFromState(lost)).toBe('injured');
  });
});

describe('overlays layer on top of whatever won the slot', () => {
  it('returns both when both conditions hold, in MOOD_OVERLAYS order', () => {
    // Stable order so the result can be used as a key. Not the order the conditions were tested.
    const stormyNight = withState({ ...CALM, hour: 23, weather: 'rain' });
    expect(moodOverlaysFromState(stormyNight)).toEqual(['night', 'storm']);
  });

  it('returns nothing on a clear day', () => {
    expect(moodOverlaysFromState(withState(CALM))).toEqual([]);
  });

  it('fires even when the mood is something entirely unrelated', () => {
    const huntedInAStorm = withState({
      ...CALM,
      hour: 3,
      weather: 'wind',
      resources: { ...CALM.resources, heat: 9 },
    });
    expect(moodFromState(huntedInAStorm)).toBe('wanted');
    expect(moodOverlaysFromState(huntedInAStorm)).toEqual(['night', 'storm']);
  });

  it('every overlay is also a mood — the documented double-application hazard', () => {
    // If this ever stops holding, the note in MOOD_OVERLAYS about double-darkening is stale and
    // `useMood()` needs revisiting rather than the comment being deleted.
    for (const overlay of MOOD_OVERLAYS) {
      expect(MOOD_IDS).toContain(overlay);
    }
  });
});

describe('the vocabulary is honest', () => {
  it('EVERY mood is reachable — no dead member', () => {
    // The anti-vacuity check that matters: a mood nothing can produce is a palette nobody will
    // ever see, and it would sit in the theme file looking maintained.
    const reachable: Record<MoodId, RunState> = {
      default: withState(CALM),
      night: withState({ ...CALM, hour: 2 }),
      wanted: withState({ ...CALM, resources: { ...CALM.resources, heat: 9 } }),
      desperate: withState({
        ...CALM,
        resources: { cash: 0, bank: 0, health: 10, morale: 0, hunger: 0, heat: 0 },
      }),
      injured: withState({ ...CALM, resources: { ...CALM.resources, health: 1 } }),
      wilderness: withState({ ...CALM, location: 'wilderness' }),
      urban: withState({ ...CALM, location: 'city' }),
      border_tension: withState({ ...CALM, location: 'border_crossing' }),
      storm: withState({ ...CALM, weather: 'rain' }),
      triumphant: withState({
        ...CALM,
        status: 'ended',
        endings: ['ending.arrival_triumphant'],
      }),
    };

    for (const mood of MOOD_IDS) {
      expect(moodFromState(reachable[mood]), `${mood} is unreachable`).toBe(mood);
    }
    expect(Object.keys(reachable).sort()).toEqual([...MOOD_IDS].sort());
  });

  it('is pure — the same state always gives the same answer', () => {
    // `moodFromState` reads no clock, no RNG and no content pack, which is what lets the sim fold
    // it over a whole corpus and report occupancy.
    const state = withState({ ...CALM, hour: 22, weather: 'rain', location: 'city' });
    expect(moodFromState(state)).toBe(moodFromState(state));
    expect(moodOverlaysFromState(state)).toEqual(moodOverlaysFromState(state));
  });
});
