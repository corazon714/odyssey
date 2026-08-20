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
import { filterEvent } from '../hard-filters.ts';
import { QUIET_JOURNAL_KEY } from '../quiet-gate.ts';
import { selectEvent } from '../select-event.ts';

const { events, registries } = loadMiniPack();
const PACK = createContentPack(events, registries);

function makeState(overrides: Partial<RunState> = {}): RunState {
  const result = createRunState(createRunInit('director-seed', PACK.version, makeRoute()));
  if (!result.ok) throw new Error('fixture route rejected');
  return { ...result.state, status: 'travelling', ...overrides };
}

const rng = (): ReturnType<typeof createRng> => createRng('director-seed', createRngCursors());

describe('selectEvent', () => {
  it('never throws, and always returns a typed result', () => {
    const result = selectEvent(makeState(), PACK, rng());
    expect(['event', 'uneventful']).toContain(result.kind);
  });

  it('falls through to uneventful rather than throwing on an empty pack', () => {
    // Tested against a pack with ZERO events — `content-lint` does not exist, so "the linter
    // guarantees fillers" is an assertion with no enforcement behind it.
    const empty = createContentPack([], registries);
    const result = selectEvent(makeState(), empty, rng());

    expect(result.kind).toBe('uneventful');
    if (result.kind !== 'uneventful') return;
    expect(result.reasonKey).toBe('director.uneventful.emptyPool');
  });

  it('falls through to uneventful when every event fails its requires', () => {
    // Note what this pack has to exclude. Rung 1 relaxes context and cooldown, so ANY event
    // whose `requires` is `always` becomes eligible there — which is correct, and which
    // means only genuinely gated events can demonstrate the fall-through. `requires` is the
    // one thing the ladder never relaxes.
    const gatedOnly = createContentPack(
      events.filter((e) =>
        ['border.bribe_attempt', 'border.guard_remembers', 'rest.pickpocket_victim'].includes(e.id),
      ),
      registries,
    );
    const state = makeState({ resources: { ...createResources(), cash: 0 } });

    const result = selectEvent(state, gatedOnly, rng());
    expect(result.kind).toBe('uneventful');
  });

  it('is deterministic for the same state and cursors', () => {
    const state = makeState();
    const a = selectEvent(state, PACK, rng());
    const b = selectEvent(state, PACK, rng());
    expect(
      a.kind === 'event' && b.kind === 'event' ? a.event.id === b.event.id : a.kind === b.kind,
    ).toBe(true);
  });

  it('draws only from the canonically ordered pack', () => {
    // Proves point D end to end: a shuffled input array cannot change the selection.
    const shuffled = createContentPack([...events].reverse(), registries);
    const state = makeState();
    const a = selectEvent(state, PACK, rng());
    const b = selectEvent(state, shuffled, rng());
    expect(a.kind === 'event' && b.kind === 'event' ? a.event.id : a.kind).toBe(
      b.kind === 'event' ? b.event.id : b.kind,
    );
  });
});

describe('hard filters', () => {
  const ctxFor = (state: RunState): ReturnType<typeof createPredicateContext> =>
    createPredicateContext(state, PACK.refs, 'test');

  const find = (id: string): GameEvent => {
    const event = PACK.byId.get(eventId(id));
    if (event === undefined) throw new Error(`fixture missing ${id}`);
    return event;
  };

  it('rejects on requires, and names it', () => {
    const state = makeState({ resources: { ...createResources(), cash: 0 } });
    const verdict = filterEvent(find('rest.pickpocket_victim'), state, PACK, ctxFor(state));

    expect(verdict.eligible).toBe(false);
    if (verdict.eligible) return;
    expect(verdict.reasonKey).toBe('director.reject.requires');
  });

  it('rejects a beat event with no matching slot due', () => {
    const state = makeState({ route: { ...makeRoute(), legIndex: 1 } });
    const verdict = filterEvent(find('crisis.breakdown'), state, PACK, ctxFor(state));
    expect(verdict.eligible).toBe(false);
    if (verdict.eligible) return;
    expect(verdict.reasonKey).toBe('director.reject.beatGate');
  });

  it('rejects on transport mode', () => {
    const state = makeState();
    const verdict = filterEvent(find('transit.bus_ejection'), state, PACK, ctxFor(state));
    expect(verdict.eligible).toBe(false);
    if (verdict.eligible) return;
    expect(verdict.reasonKey).toBe('director.reject.transportMode');
  });

  it('NEVER relaxes requires, at any rung', () => {
    // The correctness boundary. An event needing a passport you do not have must not fire,
    // however desperate the ladder gets.
    const state = makeState({ resources: { ...createResources(), cash: 0 } });
    const relaxAll = {
      beatGate: true,
      softContext: true,
      cooldown: true,
      locationTypes: true,
      exclusiveGroup: true,
    };
    const verdict = filterEvent(
      find('rest.pickpocket_victim'),
      state,
      PACK,
      ctxFor(state),
      relaxAll,
    );
    expect(verdict.eligible).toBe(false);
  });

  it('NEVER relaxes maxOccurrences, at any rung', () => {
    // Authored intent — "this happens once per run" — not a pacing hint.
    const event = find('crisis.breakdown');
    const state = makeState({
      route: { ...makeRoute(), legIndex: 6 },
      eventMemory: { [event.id]: { count: 1, lastLeg: 0, lastChoiceId: null } },
    });
    const relaxAll = {
      beatGate: true,
      softContext: true,
      cooldown: true,
      locationTypes: true,
      exclusiveGroup: true,
    };
    const verdict = filterEvent(event, state, PACK, ctxFor(state), relaxAll);

    expect(verdict.eligible).toBe(false);
    if (verdict.eligible) return;
    expect(verdict.reasonKey).toBe('director.reject.maxOccurrences');
  });

  it('reports the FIRST failure, so the reason is the informative one', () => {
    const state = makeState({ resources: { ...createResources(), cash: 0 } });
    const verdict = filterEvent(find('border.bribe_attempt'), state, PACK, ctxFor(state));
    if (verdict.eligible) return;
    // requires is checked before the beat gate and before context, deliberately.
    expect(verdict.reasonKey).toBe('director.reject.requires');
  });

  describe('cooldown is WALL-CLOCK legs, and a quiet leg burns it (ADR 0029 addendum)', () => {
    /**
     * THE UNIT DECISION, PINNED. `recency` moved to a window over fired events at M3.12a and
     * this deliberately did not, so the split needs a test or it is a comment somebody will
     * "tidy up". `cooldownLegs` is AUTHORED content in a field named for its unit; a montage
     * stretch is quiet by design (ADR 0026), and a fired-event unit would freeze cooldowns
     * across it — the player would emerge from a week of summarised travel into the same event
     * they left.
     *
     * `filler.roadside_quiet` is chosen because cooldown is the ONLY gate it can fail: no
     * `requires`, no declared context, `filler` priority so the beat gate is skipped. A verdict
     * from it is a verdict about cooldown and nothing else.
     */
    const event = find('filler.roadside_quiet');

    /** Fired at leg 0, then `legs` legs pass with EVERY one of them silenced by the gate. */
    const afterQuietLegs = (legs: number): RunState =>
      makeState({
        route: { ...makeRoute(), legIndex: legs },
        eventMemory: { [event.id]: { count: 1, lastLeg: 0, lastChoiceId: null } },
        history: [
          {
            legIndex: 0,
            day: 0,
            eventId: event.id,
            choiceId: null,
            textKey: 'k',
            params: {},
            tags: [],
          },
          ...Array.from({ length: legs }, (_, i) => ({
            legIndex: i + 1,
            day: 0,
            eventId: null,
            choiceId: null,
            textKey: QUIET_JOURNAL_KEY,
            params: {},
            tags: [],
          })),
        ],
      });

    it('has a cooldown to test', () => {
      // Anti-vacuous: `cooldownLegs: 0` skips the gate entirely and both cases below would pass.
      expect(event.cooldownLegs).toBeGreaterThan(0);
    });

    it('still rejects one leg short, with nothing but quiet legs in between', () => {
      const state = afterQuietLegs(event.cooldownLegs - 1);
      const verdict = filterEvent(event, state, PACK, ctxFor(state));
      expect(verdict.eligible).toBe(false);
      if (verdict.eligible) return;
      expect(verdict.reasonKey).toBe('director.reject.cooldown');
    });

    it('clears on the leg the author asked for, though NOTHING fired in between', () => {
      // The half that would fail under a fired-event reading: zero draws have happened since,
      // so a draws-denominated cooldown would still be blocking here. Legs is what it counts.
      const state = afterQuietLegs(event.cooldownLegs);
      expect(filterEvent(event, state, PACK, ctxFor(state)).eligible).toBe(true);
    });
  });
});
