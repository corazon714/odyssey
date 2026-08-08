import { describe, expect, it } from 'vitest';
import { createContentPack } from '../../content/content-pack.ts';
import { type GameEvent } from '../../content/game-event.ts';
import { eventId } from '../../ids/content-ids.ts';
import { createPredicateContext } from '../../predicate/predicate-context.ts';
import { createRng } from '../../rng/rng.ts';
import { createRngCursors } from '../../rng/rng-cursors.ts';
import { createRunState } from '../../state/create-run-state.ts';
import { createResources } from '../../state/resources.ts';
import { createRunInit } from '../../state/run-init.ts';
import { type RunState } from '../../state/run-state.ts';
import { makeRoute } from '../../state/__tests__/support/make-route.ts';
import { loadMiniPack } from '../../__tests__/support/load-fixtures.ts';
import {
  collectComplications,
  PHASE_1_COMPLICATION_SOURCES,
  type ComplicationSource,
} from '../complication-source.ts';
import { filterEvent } from '../hard-filters.ts';
import { FILLER_RUNG, RELAXATION_RUNGS, UNEVENTFUL_RUNG } from '../relaxation-rung.ts';
import { selectEvent } from '../select-event.ts';

const { events, registries } = loadMiniPack();
const PACK = createContentPack(events, registries);

function makeState(overrides: Partial<RunState> = {}): RunState {
  const result = createRunState(createRunInit('ladder-seed', PACK.version, makeRoute()));
  if (!result.ok) throw new Error('fixture route rejected');
  return { ...result.state, status: 'travelling', ...overrides };
}

const rng = (): ReturnType<typeof createRng> => createRng('ladder-seed', createRngCursors());

const find = (id: string): GameEvent => {
  const event = PACK.byId.get(eventId(id));
  if (event === undefined) throw new Error(`fixture missing ${id}`);
  return event;
};

describe('the relaxation ladder', () => {
  it('has seven rungs plus filler and uneventful', () => {
    expect(RELAXATION_RUNGS).toHaveLength(6);
    expect(FILLER_RUNG).toBe(6);
    expect(UNEVENTFUL_RUNG).toBe(7);
  });

  it('relaxes monotonically — a rung never re-tightens a gate', () => {
    // Guards the ladder's shape: a rung that turned a gate back on would make the walk
    // non-monotonic and the reported rung meaningless.
    const keys = [
      'beatGate',
      'exclusiveGroup',
      'softContext',
      'cooldown',
      'locationTypes',
    ] as const;
    for (const key of keys) {
      let seenTrue = false;
      for (const rung of RELAXATION_RUNGS) {
        if (rung[key]) seenTrue = true;
        else expect(seenTrue, `${key} re-tightened`).toBe(false);
      }
    }
  });

  it('NEVER satisfies an unsatisfiable requires, at any rung', () => {
    // The correctness boundary. This is the assertion that keeps the ladder honest.
    const state = makeState({ resources: { ...createResources(), money: 0 } });
    const ctx = createPredicateContext(state, PACK.refs, 'test');
    const gated = find('rest.pickpocket_victim'); // requires money >= 10

    for (const [rung, relax] of RELAXATION_RUNGS.entries()) {
      const verdict = filterEvent(gated, state, PACK, ctx, relax);
      expect(verdict.eligible, `rung ${String(rung)} admitted a failed requires`).toBe(false);
    }
  });

  it('NEVER exceeds maxOccurrences, at any rung', () => {
    // Authored intent — "this happens once per run" — not a pacing hint.
    const capped = find('crisis.breakdown'); // maxOccurrences: 1
    const state = makeState({
      eventMemory: { [capped.id]: { count: 1, lastLeg: 0, lastChoiceId: null } },
    });
    const ctx = createPredicateContext(state, PACK.refs, 'test');

    for (const [rung, relax] of RELAXATION_RUNGS.entries()) {
      const verdict = filterEvent(capped, state, PACK, ctx, relax);
      expect(verdict.eligible, `rung ${String(rung)} exceeded maxOccurrences`).toBe(false);
    }
  });

  it('does relax the gates it is supposed to', () => {
    // Guards the guard: if every rung rejected everything the two tests above would pass
    // vacuously. transportMode blocks a bus event on foot at rung 0, and stops blocking once
    // soft context relaxes.
    const busEvent = find('transit.bus_ejection');
    const state = makeState();
    const ctx = createPredicateContext(state, PACK.refs, 'test');

    expect(filterEvent(busEvent, state, PACK, ctx, RELAXATION_RUNGS[0]).eligible).toBe(false);
    expect(filterEvent(busEvent, state, PACK, ctx, RELAXATION_RUNGS[3]).eligible).toBe(true);
  });

  it('returns uneventful, never a throw, when every rung fails', () => {
    const gatedOnly = createContentPack(
      events.filter((e) =>
        ['border.bribe_attempt', 'border.guard_remembers', 'rest.pickpocket_victim'].includes(e.id),
      ),
      registries,
    );
    const state = makeState({ resources: { ...createResources(), money: 0 } });

    const result = selectEvent(state, gatedOnly, rng());
    expect(result.kind).toBe('uneventful');
    if (result.kind !== 'uneventful') return;
    expect(result.params['rung']).toBe(UNEVENTFUL_RUNG);
  });

  it('reports the rung it stopped at', () => {
    const result = selectEvent(makeState(), PACK, rng());
    if (result.kind !== 'event') return;
    expect(result.rung).toBeGreaterThanOrEqual(0);
    expect(result.rung).toBeLessThanOrEqual(FILLER_RUNG);
  });
});

describe('the complication seam', () => {
  it('is inert with no sources — Phase 1 attaches none', () => {
    expect(PHASE_1_COMPLICATION_SOURCES).toEqual([]);
    const result = selectEvent(makeState(), PACK, rng());
    if (result.kind !== 'event') return;
    expect(result.complications).toEqual([]);
  });

  it('reaches a stub source appended by Phase 2', () => {
    // THIS is the assertion that matters: if the seam were decorative it could not be written.
    const stub: ComplicationSource = {
      id: 'stub',
      complicationsFor: () => [
        { id: 'night_crossing', labelKey: 'complication.night_crossing', params: {} },
      ],
    };

    const result = selectEvent(makeState(), PACK, rng(), { complicationSources: [stub] });
    if (result.kind !== 'event') return;
    expect(result.complications).toEqual([
      { id: 'night_crossing', labelKey: 'complication.night_crossing', params: {} },
    ]);
  });

  it('draws from encounterFlavor, so it cannot shift eventPick', () => {
    // The payoff of the counter-based RNG (ADR 0005 §1): Phase 2 can consume randomness in a
    // complication without invalidating M10's golden runs.
    const drawingStub: ComplicationSource = {
      id: 'drawing',
      complicationsFor: (_event, _state, r) => [
        { id: 'x', labelKey: 'c.x', params: { roll: r.nextInt(1, 6, 'encounterFlavor') } },
      ],
    };

    const withoutRng = rng();
    selectEvent(makeState(), PACK, withoutRng);
    const baseline = withoutRng.cursors().eventPick;

    const withRng = rng();
    selectEvent(makeState(), PACK, withRng, { complicationSources: [drawingStub] });

    expect(withRng.cursors().eventPick).toBe(baseline);
    expect(withRng.cursors().encounterFlavor).toBeGreaterThan(0);
  });

  it('collectComplications is order-stable across sources', () => {
    const a: ComplicationSource = {
      id: 'a',
      complicationsFor: () => [{ id: 'a1', labelKey: 'c.a1', params: {} }],
    };
    const b: ComplicationSource = {
      id: 'b',
      complicationsFor: () => [{ id: 'b1', labelKey: 'c.b1', params: {} }],
    };
    const event = PACK.events[0];
    if (event === undefined) throw new Error('empty pack');

    expect(collectComplications(event, makeState(), rng(), [a, b]).map((c) => c.id)).toEqual([
      'a1',
      'b1',
    ]);
    expect(collectComplications(event, makeState(), rng(), [b, a]).map((c) => c.id)).toEqual([
      'b1',
      'a1',
    ]);
  });
});
