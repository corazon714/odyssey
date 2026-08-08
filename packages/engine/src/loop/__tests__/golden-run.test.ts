import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createContentPack } from '../../content/content-pack.ts';
import { type ChoiceId } from '../../ids/content-ids.ts';
import { createResources } from '../../state/resources.ts';
import { createRunInit } from '../../state/run-init.ts';
import { createTransport } from '../../state/transport-state.ts';
import { type RunInit } from '../../state/run-init.ts';
import { loadFixtureRouteEntries, loadMiniPack } from '../../__tests__/support/load-fixtures.ts';
import { replayRun } from '../replay-run.ts';

/**
 * THE TEST CLAUDE.md RULE 2.3 IS ACTUALLY ABOUT.
 *
 * ADR 0002 named golden-run replay as the only backstop that survives a determined violation
 * of the lint rules — someone can obfuscate `Math.random()` past every regex, and this still
 * catches them. Everything else in the engine exists so that replay can be an equality:
 * counter-based RNG, canonical pack ordering, integer pick weights, no transcendental math,
 * no `localeCompare`.
 *
 * The fixtures are GENERATED, never hand-written. A hand-typed digest is a number someone
 * chose; a generated one is a number the engine produced, and the difference is the entire
 * value of the test. Regenerate with ODYSSEY_UPDATE_GOLDEN=1 and REVIEW the diff — a changed
 * digest is either a deliberate engine change or exactly the bug this exists to catch.
 */
const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '__tests__',
  '__fixtures__',
);

type GoldenRun = {
  readonly seed: string;
  readonly routeId: string;
  readonly policy: string;
  readonly contentVersion: string;
  readonly choiceSequence: readonly ChoiceId[];
  readonly expectedDigest: string;
  readonly expectedHistoryKeys: readonly string[];
  readonly expectedLegs: number;
  readonly expectedEndings: readonly string[];
};

const golden = (
  JSON.parse(readFileSync(join(FIXTURE_DIR, 'golden-runs.json'), 'utf8')) as {
    readonly runs: readonly GoldenRun[];
  }
).runs;

const { events, registries } = loadMiniPack();
const PACK = createContentPack(events, registries);
const SCENARIOS = loadFixtureRouteEntries();

function initFor(run: GoldenRun, contentVersion = PACK.version): RunInit {
  const scenario = SCENARIOS.find((s) => s.route.id === run.routeId);
  if (scenario === undefined) throw new Error(`golden run names an unknown route: ${run.routeId}`);

  return {
    ...createRunInit(run.seed, contentVersion, scenario.route),
    transport: {
      ...createTransport(scenario.start.transportMode as never),
      vehicleId: `${scenario.route.id}-vehicle`,
      legal: scenario.start.vehicleLegal,
    },
    resources: { ...createResources(), money: scenario.start.money },
    startHour: scenario.start.startHour,
    weather: scenario.start.weather,
  };
}

describe('golden-run replay (CLAUDE.md 2.3, ADR 0002)', () => {
  it('has fixtures to check', () => {
    // Anti-vacuous guard, the same one purity.test.ts carries: an empty corpus passes every
    // assertion below.
    expect(golden.length).toBeGreaterThan(0);
    expect(golden.every((run) => run.choiceSequence.length > 0)).toBe(true);
  });

  it.each(golden.map((run) => [`${run.routeId}/${run.policy}`, run] as const))(
    '%s replays to an identical digest',
    (_label, run) => {
      const result = replayRun(initFor(run), PACK, run.choiceSequence);
      if (!result.ok) throw new Error(`replay failed: ${result.error.code}`);
      expect(result.digest).toBe(run.expectedDigest);
    },
  );

  it.each(golden.map((run) => [`${run.routeId}/${run.policy}`, run] as const))(
    '%s reproduces the same history keys',
    (_label, run) => {
      // A digest alone can be too coarse: two different stories reaching the same numbers
      // would pass. The key sequence is what proves the same run happened.
      const result = replayRun(initFor(run), PACK, run.choiceSequence);
      if (!result.ok) throw new Error(`replay failed: ${result.error.code}`);
      expect(result.historyKeys).toEqual(run.expectedHistoryKeys);
      expect(result.state.route.legIndex).toBe(run.expectedLegs);
      expect(result.state.unlockedEndings).toEqual(run.expectedEndings);
    },
  );

  it('is stable across repeated replays in one process', () => {
    const run = golden[0];
    if (run === undefined) throw new Error('no golden runs');
    const first = replayRun(initFor(run), PACK, run.choiceSequence);
    const second = replayRun(initFor(run), PACK, run.choiceSequence);
    expect(first.ok && second.ok && first.digest === second.digest).toBe(true);
  });

  it('REFUSES a contentVersion mismatch rather than tolerating it', () => {
    // The reconciliation policy is deliberately generous to players — a content update must
    // not delete an in-progress run. Replay points the other way: a tolerant replay proves
    // nothing about determinism.
    const run = golden[0];
    if (run === undefined) throw new Error('no golden runs');

    const result = replayRun(initFor(run, 'some-other-version'), PACK, run.choiceSequence);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('replay/content-version-mismatch');
  });

  it('produces a DIFFERENT digest when the choice sequence changes', () => {
    // Guards the guard. If replay ignored the choices — or the digest were insensitive to
    // them — every assertion above would pass while proving nothing.
    const run = golden.find((r) => r.choiceSequence.length > 2);
    if (run === undefined) throw new Error('no golden run long enough');

    const truncated = replayRun(initFor(run), PACK, run.choiceSequence.slice(0, 2));
    if (!truncated.ok) throw new Error('replay failed');
    expect(truncated.digest).not.toBe(run.expectedDigest);
  });

  it('records the contentVersion the fixtures were generated against', () => {
    // If the pack changes without regenerating, this fails loudly here rather than as nine
    // confusing digest mismatches.
    for (const run of golden) {
      expect(run.contentVersion, `${run.routeId}/${run.policy} predates a content change`).toBe(
        PACK.version,
      );
    }
  });
});
