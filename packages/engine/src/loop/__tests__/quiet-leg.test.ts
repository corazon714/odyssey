import { describe, expect, it } from 'vitest';
import { createContentPack, type ContentPack } from '../../content/content-pack.ts';
import { QUIET_GATE_REASON_KEY, QUIET_JOURNAL_KEY } from '../../director/quiet-gate.ts';
import { createResources } from '../../state/resources.ts';
import { createRunInit } from '../../state/run-init.ts';
import { createRunState } from '../../state/create-run-state.ts';
import { type RunState } from '../../state/run-state.ts';
import { createTransport } from '../../state/transport-state.ts';
import { loadFixtureRouteEntries, loadMiniPack } from '../../__tests__/support/load-fixtures.ts';
import { advanceLeg } from '../advance-leg.ts';
import { resolveChoice } from '../resolve-choice.ts';

/**
 * M3.12a'S FENCE, AT THE LEVEL THE LOOP RUNS IT.
 *
 * `event-odds.test.ts` proves the arithmetic cannot leave certainty under any combination of
 * multipliers. This proves the wiring agrees: the gate is drawn on every non-forced leg and
 * still never silences one, so no golden digest can move and `golden-run.test.ts` is measuring
 * a real claim rather than an unexecuted branch.
 *
 * The quiet ARM of `advanceLeg` is therefore unreachable at this milestone by construction —
 * that is what the fence means, not a gap in coverage. Its pieces are tested directly in
 * `director/__tests__/quiet-gate.test.ts`; the branch itself is first exercised end-to-end by
 * M3.12b's sweep, which is the commit that is allowed to move a digest.
 */
const { events, registries } = loadMiniPack();
const PACK: ContentPack = createContentPack(events, registries);
const SCENARIOS = loadFixtureRouteEntries();

function start(scenarioIndex: number, seed: string): RunState {
  const scenario = SCENARIOS[scenarioIndex];
  if (scenario === undefined) throw new Error('fixture routes missing');

  const result = createRunState({
    ...createRunInit(seed, PACK.version, scenario.route),
    transport: {
      ...createTransport(scenario.start.transportMode as never),
      vehicleId: 'v',
      legal: scenario.start.vehicleLegal,
    },
    resources: { ...createResources(), cash: scenario.start.cash },
    startHour: scenario.start.startHour,
    weather: scenario.start.weather,
  });
  if (!result.ok) throw new Error(`fixture route rejected: ${result.error.code}`);
  return result.state;
}

type Played = {
  readonly state: RunState;
  readonly legs: number;
  readonly kinds: readonly string[];
  /** Every `uneventful` presentation's reason key, in order — the screen-side view. */
  readonly reasonKeys: readonly string[];
};

/** Drive a run to its ending, always taking the first selectable choice. */
function playOut(scenarioIndex: number, seed: string): Played {
  let state = start(scenarioIndex, seed);
  const kinds: string[] = [];
  const reasonKeys: string[] = [];
  let legs = 0;

  while (state.status !== 'ended' && legs < 300) {
    legs += 1;
    const advanced = advanceLeg(state, PACK);
    if (!advanced.ok) throw new Error(`advanceLeg failed: ${advanced.error.code}`);
    state = advanced.state;

    if (advanced.selection !== null) kinds.push(advanced.selection.kind);
    if (state.presentation.kind === 'uneventful') reasonKeys.push(state.presentation.reasonKey);
    if (advanced.selection?.kind !== 'event') continue;

    const first = advanced.selection.event.choices[0];
    if (first === undefined) throw new Error('event with no choices');
    const resolved = resolveChoice(state, PACK, first.id);
    if (!resolved.ok) throw new Error(`resolveChoice failed: ${resolved.error.code}`);
    state = resolved.state;
  }

  return { state, legs, kinds, reasonKeys };
}

const SEEDS = ['gate-a', 'gate-b', 'gate-c', 'gate-d'] as const;
const RUNS = SCENARIOS.flatMap((_, index) => SEEDS.map((seed) => [index, seed] as const));

describe('the loop at BASE_EVENT_ODDS 1:0', () => {
  it('has runs to check', () => {
    // Anti-vacuous guard: an empty scenario list would make every assertion below pass on
    // nothing. Counts are derived from the fixtures, never written down.
    expect(SCENARIOS.length).toBeGreaterThan(0);
    expect(RUNS.length).toBe(SCENARIOS.length * SEEDS.length);
  });

  it.each(RUNS)('route %i / seed %s never produces a quiet leg', (index, seed) => {
    const played = playOut(index, seed);
    expect(played.kinds.length).toBeGreaterThan(0);
    expect(played.kinds).not.toContain('quiet');
  });

  it.each(RUNS)('route %i / seed %s writes no quiet journal entry', (index, seed) => {
    // The other half of the same claim, read off state rather than off the return value: the
    // digest covers `history`, so one stray entry would move every golden run.
    const played = playOut(index, seed);
    expect(played.state.history.every((entry) => entry.textKey !== QUIET_JOURNAL_KEY)).toBe(true);
    // And the screen never showed the gate's reason either. `Presentation` reuses its
    // `uneventful` arm for both cases, so the reason key is the only thing separating them.
    expect(played.reasonKeys).not.toContain(QUIET_GATE_REASON_KEY);
  });

  it('leaves history untouched on a leg advanceLeg presents by itself', () => {
    // Pins the invariant the quiet entry is the sole exception to: today `recordHistory` is
    // reachable only from `resolveChoice`, so `advanceLeg` writing an entry AT ALL is new. If
    // this starts failing, something began writing history from the loop's own spread.
    let state = start(0, 'no-history');
    for (let leg = 0; leg < 3; leg += 1) {
      const advanced = advanceLeg(state, PACK);
      if (!advanced.ok) throw new Error('expected ok');
      expect(advanced.state.history).toEqual([]);
      // Clear the presentation the way resolveChoice would, so the next call is legal.
      state = { ...advanced.state, presentation: { kind: 'none' } };
    }
  });
});
