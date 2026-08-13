import { describe, expect, it } from 'vitest';
import { createContentPack } from '../../content/content-pack.ts';
import { chanceAddress, createPredicateContext } from '../../predicate/predicate-context.ts';
import { deriveKey, streamKey } from '../../rng/stream-key.ts';
import { createResources } from '../../state/resources.ts';
import { createRunInit } from '../../state/run-init.ts';
import { createRunState } from '../../state/create-run-state.ts';
import { type RouteState } from '../../state/route-state.ts';
import { type RunState } from '../../state/run-state.ts';
import { makeRoute } from '../../state/__tests__/support/make-route.ts';
import { loadMiniPack } from '../../__tests__/support/load-fixtures.ts';
import { EVENT_ODDS_MULTIPLIERS } from '../event-odds.ts';
import { eventGate, legOddsFactors, quietHistoryEntry, QUIET_JOURNAL_KEY } from '../quiet-gate.ts';

const { events, registries } = loadMiniPack();
const PACK = createContentPack(events, registries);

function makeState(overrides: Partial<RunState> = {}, route?: RouteState): RunState {
  const result = createRunState(createRunInit('gate-seed', PACK.version, route ?? makeRoute()));
  if (!result.ok) throw new Error(`fixture route rejected: ${result.error.code}`);
  return { ...result.state, status: 'travelling', ...overrides };
}

describe('the quiet-leg gate at BASE_EVENT_ODDS 1:0', () => {
  it('fires on every leg of a route, whatever the leg looks like', () => {
    // THE FENCE, at the level the loop uses. Leg count is read from the route rather than
    // written down, so widening the fixture cannot silently shrink the sweep.
    const route = makeRoute({ profile: 'illicit', montageLegs: [2, 5] });
    for (let leg = 0; leg < route.legCount; leg += 1) {
      const state = makeState(
        {
          weather: 'fog',
          resources: { ...createResources(), heat: 10 },
          clock: { day: 0, hour: 2, weekday: 0 },
        },
        route,
      );
      expect(eventGate({ ...state, route: { ...route, legIndex: leg } }, leg).fires).toBe(true);
    }
  });

  it('draws rather than short-circuiting, and the draw cannot change the answer', () => {
    // ADR 0029's fence would prove the wrong thing if certainty came from an early return: the
    // branch M3.12b exercises has to be the branch M3.12a fenced. At P = 1 the threshold is
    // 2^32 and `drawWord` returns a uint32, so the comparison is exact without a special case.
    const state = makeState();
    expect(eventGate(state, 0).fires).toBe(true);
    expect(eventGate(state, 0)).toEqual(eventGate(state, 0));
  });

  it('is cursor-free: no cursor position can change the verdict', () => {
    // The property, not the convention. A CURSORED draw would make this gate's answer depend on
    // how many weather rerolls preceded it, and adding a director draw later would move every
    // leg's fire/quiet — which is exactly what would make "digests unchanged" unprovable.
    const state = makeState();
    const moved = {
      ...state,
      rngCursors: { ...state.rngCursors, chanceGate: 999, worldTick: 42, eventPick: 17 },
    };
    expect(eventGate(moved, 3)).toEqual(eventGate(state, 3));
  });
});

describe('the gate address', () => {
  const SEED = 'address-seed';
  const ROUTE_ID = String(makeRoute().id);

  const gateKey = (leg: number): number =>
    deriveKey(streamKey(SEED, 'chanceGate'), `gate:${ROUTE_ID}:${String(leg)}`);

  it('cannot collide with chanceAddress, because no id may contain a colon', () => {
    // The STRUCTURAL reason, verified rather than assumed. `chanceAddress` derives on the same
    // key with `${scope}:${path}`, and every scope is built from a route id, an event id or the
    // literal `outcome:` prefix. ID_PATTERN (/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/) forbids
    // `:` inside an id, so no authored label can begin `gate:` and the namespaces are disjoint.
    expect(ROUTE_ID).not.toContain(':');
    expect(PACK.events.length).toBeGreaterThan(0);
    for (const event of PACK.events) {
      expect(String(event.id)).not.toContain(':');
      for (const choice of event.choices) expect(String(choice.id)).not.toContain(':');
    }
  });

  it('differs from every chance-gate address the same leg produces', () => {
    // The structural argument, spot-checked numerically against the scopes and paths that
    // actually occur: selection scopes on `${routeId}:${leg}`, resolution on `${eventId}:${leg}`
    // and `outcome:${choiceId}`, with root, indexed, requires, queue and outcome paths.
    const state = { ...makeState(), seed: SEED };
    const event = PACK.events[0];
    if (event === undefined) throw new Error('fixture pack is empty');

    const scopes = [`${ROUTE_ID}:0`, `${String(event.id)}:0`, `outcome:${String(event.id)}`];
    const paths = ['r', 'r.0', 'r.0.1', `req:${String(event.id)}`, `queue:${String(event.id)}`];

    const chanceKeys = new Set<number>();
    for (const scope of scopes) {
      const ctx = createPredicateContext(state, PACK.refs, scope);
      for (const path of paths) chanceKeys.add(chanceAddress(ctx, path));
    }

    expect(chanceKeys.size).toBe(scopes.length * paths.length);
    expect(chanceKeys.has(gateKey(0))).toBe(false);
  });

  it('is namespaced by route, so two routes do not share a fire pattern', () => {
    // Omitting the route id would make the identical fire/quiet sequence apply to every route
    // in a fixed-seed sim — the failure ADR 0029 D5 names.
    const other = deriveKey(streamKey(SEED, 'chanceGate'), `gate:some.other.route:0`);
    expect(other).not.toBe(gateKey(0));
  });

  it('gives a different address to every leg', () => {
    const route = makeRoute();
    const keys = new Set(Array.from({ length: route.legCount }, (_, leg) => gateKey(leg)));
    expect(keys.size).toBe(route.legCount);
  });
});

describe('legOddsFactors', () => {
  const at = (leg: number, overrides: Partial<RunState> = {}, route?: RouteState): string[] => [
    ...legOddsFactors(makeState(overrides, route), leg),
  ];

  it('reads urban, border and empty terrain off the leg location TYPE', () => {
    // A type of place, never a place (CLAUDE.md 11). The fixture cycle is
    // city/roadside/rest_stop/roadside/checkpoint/town/border_crossing/roadside/wilderness/…
    expect(at(0)).toContain('urban'); // city
    expect(at(5)).toContain('urban'); // town
    expect(at(4)).toContain('border'); // checkpoint
    expect(at(6)).toContain('border'); // border_crossing
    expect(at(8)).toContain('emptyTerrain'); // wilderness
    expect(at(1)).toEqual([]); // roadside, clear, daytime, cheapest, no heat
  });

  it('reads night off the clock and bad weather off anything but clear', () => {
    expect(at(1, { clock: { day: 0, hour: 23, weekday: 0 } })).toEqual(['night']);
    expect(at(1, { weather: 'rain' })).toEqual(['badWeather']);
    // Fog is deliberately included here and deliberately absent from world-tick's
    // HARSH_WEATHER: it does not tire you, and it very much raises the odds.
    expect(at(1, { weather: 'fog' })).toEqual(['badWeather']);
    expect(at(1, { weather: 'clear' })).toEqual([]);
  });

  it('reads heat off the RESOURCE, at the documented threshold', () => {
    const heatAt = (heat: number): string[] => at(1, { resources: { ...createResources(), heat } });
    expect(heatAt(5)).toEqual([]);
    expect(heatAt(6)).toEqual(['heat']);
    expect(heatAt(10)).toEqual(['heat']);
    // The weather named `heat` is a DIFFERENT thing and must reach the odds as badWeather.
    expect(at(1, { weather: 'heat' })).toEqual(['badWeather']);
  });

  it('reads illicit off the route profile and montage off the route plan', () => {
    const illicit = makeRoute({ profile: 'illicit' });
    expect(at(1, {}, illicit)).toEqual(['illicit']);

    const montage = makeRoute({ montageLegs: [3] });
    expect(at(3, {}, montage)).toContain('montage');
    expect(at(1, {}, montage)).not.toContain('montage');
  });

  it('never reports a factor that is not in the table', () => {
    const known = new Set(Object.keys(EVENT_ODDS_MULTIPLIERS));
    const route = makeRoute({ profile: 'illicit', montageLegs: [0] });
    for (let leg = 0; leg < route.legCount; leg += 1) {
      for (const factor of at(leg, { weather: 'rain' }, route))
        expect(known.has(factor)).toBe(true);
    }
  });

  it('reports each factor at most once, so nothing is squared', () => {
    const route = makeRoute({ profile: 'illicit', montageLegs: [0] });
    const factors = at(
      0,
      {
        weather: 'rain',
        resources: { ...createResources(), heat: 9 },
        clock: { day: 0, hour: 1, weekday: 0 },
      },
      route,
    );
    expect(new Set(factors).size).toBe(factors.length);
    expect(factors.length).toBeGreaterThan(1);
  });
});

describe('the quiet journal entry', () => {
  it('is a fired-nothing entry carrying its own key', () => {
    const entry = quietHistoryEntry(makeState(), 4);
    // `eventId: null` is what tag-saturation filters on, and the key is distinct from the
    // starvation reason so a designed silence and a content gap never read alike.
    expect(entry.eventId).toBeNull();
    expect(entry.choiceId).toBeNull();
    expect(entry.tags).toEqual([]);
    expect(entry.textKey).toBe(QUIET_JOURNAL_KEY);
    expect(entry.legIndex).toBe(4);
  });
});
