import { describe, expect, it } from 'vitest';
import { languageId, traitId } from '../../ids/content-ids.ts';
import { RNG_STREAMS } from '../../rng/rng-stream.ts';
import { createRunState, SAVE_VERSION } from '../create-run-state.ts';
import { createRunInit } from '../run-init.ts';
import { createResources } from '../resources.ts';
import { createSkills } from '../skills.ts';
import { makeRoute } from './support/make-route.ts';

const init = (): ReturnType<typeof createRunInit> =>
  createRunInit('start-seed', 'content-v1', makeRoute());

describe('createRunState', () => {
  it('builds a run at the start of its route', () => {
    const result = createRunState(init());
    if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);

    expect(result.state.version).toBe(SAVE_VERSION);
    expect(result.state.seed).toBe('start-seed');
    expect(result.state.contentVersion).toBe('content-v1');
    expect(result.state.status).toBe('preparing');
    expect(result.state.route.legIndex).toBe(0);
    expect(result.state.route.progressKm).toBe(0);
    expect(result.state.presentation.kind).toBe('none');
  });

  it('normalises route traversal rather than trusting the caller', () => {
    // A reused RunInit must not start a run halfway along its own route.
    const result = createRunState({
      ...init(),
      route: makeRoute({ legIndex: 7, progressKm: 400 }),
    });
    if (!result.ok) throw new Error('expected ok');

    expect(result.state.route.legIndex).toBe(0);
    expect(result.state.route.progressKm).toBe(0);
    expect(result.state.route.totalKm).toBe(900);
  });

  it('starts every rng cursor at zero', () => {
    const result = createRunState(init());
    if (!result.ok) throw new Error('expected ok');
    for (const stream of RNG_STREAMS) expect(result.state.rngCursors[stream]).toBe(0);
  });

  it('starts memory empty', () => {
    const result = createRunState(init());
    if (!result.ok) throw new Error('expected ok');

    expect(result.state.flags).toEqual({});
    expect(result.state.relationships).toEqual({});
    expect(result.state.eventMemory).toEqual({});
    expect(result.state.pendingEvents).toEqual([]);
    expect(result.state.history).toEqual([]);
    expect(result.state.unlockedEndings).toEqual([]);
  });

  it('applies supplied preparation choices', () => {
    const result = createRunState({
      ...init(),
      resources: { ...createResources(), cash: 250 },
      traits: [traitId('smooth_talker')],
      languages: [languageId('ru')],
      startHour: 20,
      startWeekday: 4,
      weather: 'fog',
    });
    if (!result.ok) throw new Error('expected ok');

    expect(result.state.resources.cash).toBe(250);
    expect(result.state.traits).toEqual([traitId('smooth_talker')]);
    expect(result.state.skills.languages).toEqual([languageId('ru')]);
    expect(result.state.clock).toEqual({ day: 0, hour: 20, weekday: 4 });
    expect(result.state.weather).toBe('fog');
  });
});

describe('createRunState clamping', () => {
  it('clamps out-of-range resources and REPORTS each clamp', () => {
    const result = createRunState({
      ...init(),
      resources: { ...createResources(), cash: -50, energy: 99, reputation: -20 },
    });
    if (!result.ok) throw new Error('expected ok');

    expect(result.state.resources.cash).toBe(0);
    expect(result.state.resources.energy).toBe(10);
    expect(result.state.resources.reputation).toBe(-5);

    // The report is the point: a silent Math.min would hide a preparation screen that
    // over-allocates, and the sim could never count it.
    expect(result.clamps.map((c) => `${c.key}:${c.bound}`)).toEqual([
      'cash:min',
      'energy:max',
      'reputation:min',
    ]);
    expect(result.clamps[0]).toEqual({
      key: 'cash',
      requested: -50,
      applied: 0,
      bound: 'min',
      limit: 0,
    });
  });

  it('clamps skills too', () => {
    const result = createRunState({
      ...init(),
      skills: { ...createSkills(), negotiation: 40, stealth: -3 },
    });
    if (!result.ok) throw new Error('expected ok');

    expect(result.state.skills.negotiation).toBe(10);
    expect(result.state.skills.stealth).toBe(0);
    expect(result.clamps).toHaveLength(2);
  });

  it('reports no clamps for in-range input', () => {
    const result = createRunState(init());
    if (!result.ok) throw new Error('expected ok');
    expect(result.clamps).toEqual([]);
  });

  it('leaves money unbounded above', () => {
    const result = createRunState({
      ...init(),
      resources: { ...createResources(), cash: 5_000_000 },
    });
    if (!result.ok) throw new Error('expected ok');
    expect(result.state.resources.cash).toBe(5_000_000);
    expect(result.clamps).toEqual([]);
  });
});

describe('createRunState route validation', () => {
  it('returns a typed error rather than throwing on an empty route', () => {
    const result = createRunState({ ...init(), route: makeRoute({ nodes: [], edges: [] }) });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('route/empty');
    expect(result.error.messageKey).toBe('engine.error.route/empty');
  });

  it('rejects an edge count that does not match the nodes', () => {
    const result = createRunState({ ...init(), route: makeRoute({ edges: [] }) });
    if (result.ok) throw new Error('expected failure');
    expect(result.error.code).toBe('route/leg-count-mismatch');
  });

  it('rejects a beat scheduled past the last leg', () => {
    // Otherwise the slot can never fill, and every sim report shows a "beat missed" line
    // for what is actually a content bug.
    const result = createRunState({
      ...init(),
      route: makeRoute({
        legCount: 4,
        beatSchedule: [{ legIndex: 9, type: 'finale', slackLegs: 0, status: 'pending' }],
      }),
    });
    if (result.ok) throw new Error('expected failure');
    expect(result.error.code).toBe('route/beat-out-of-range');
    expect(result.error.params).toEqual({ beatType: 'finale', legIndex: 9, legCount: 4 });
  });

  it('rejects two beats claiming the same leg', () => {
    const result = createRunState({
      ...init(),
      route: makeRoute({
        beatSchedule: [
          { legIndex: 3, type: 'departure', slackLegs: 0, status: 'pending' },
          { legIndex: 3, type: 'finale', slackLegs: 0, status: 'pending' },
        ],
      }),
    });
    if (result.ok) throw new Error('expected failure');
    expect(result.error.code).toBe('route/duplicate-beat-leg');
  });

  it('never throws for any malformed route in the table', () => {
    const routes = [
      makeRoute({ nodes: [], edges: [] }),
      makeRoute({ edges: [] }),
      makeRoute({ legCount: 0 }),
      makeRoute({
        beatSchedule: [{ legIndex: -1, type: 'finale', slackLegs: 0, status: 'pending' }],
      }),
      makeRoute({
        legCount: 3,
        beatSchedule: [{ legIndex: 3, type: 'finale', slackLegs: 0, status: 'pending' }],
      }),
    ];

    for (const route of routes) {
      expect(() => createRunState({ ...init(), route })).not.toThrow();
      expect(createRunState({ ...init(), route }).ok).toBe(false);
    }
  });
});
