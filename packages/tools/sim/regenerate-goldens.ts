import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRunInit, replayRun, type ChoiceId, type RunInit } from '@odyssey/engine';
import { findWorkspaceRoot } from '../shared/workspace-root.ts';
import { loadFixturePack, loadFixtureScenarios, type FixtureScenario } from './load-pack.ts';
import { runOne } from './run-one.ts';
import { type PolicyName } from './policy.ts';

/**
 * `pnpm golden:update` — regenerate `golden-runs.json` from the engine.
 *
 * The fixture's own header and `golden-run.test.ts` both said to regenerate with
 * `ODYSSEY_UPDATE_GOLDEN=1`, and nothing anywhere implemented it. A documented escape hatch
 * that does not exist is worse than none: the first person to legitimately change engine
 * behaviour reaches for it, finds nothing, and hand-edits a file whose header says
 * "never hand-written".
 *
 * It lives in packages/tools rather than in the test because the engine may not touch
 * `process` or write files (CLAUDE.md rule 2.2, enforced by eslint's engine boundary), and
 * because writing generated data next to the sim's report writer is where it belongs.
 *
 * REVIEW THE DIFF. A changed digest is either a deliberate engine change you can name, or
 * exactly the nondeterminism bug the golden run exists to catch. There is no third case.
 *
 * The raw output is `JSON.stringify(…, null, 2)`, which is NOT byte-identical to Prettier —
 * Prettier collapses a short array onto one line and this does not. That is fine and
 * deliberate: `lint-staged` runs `prettier --write` over `*.json` at pre-commit, so the
 * committed file is always canonical and `pnpm format:check` passes in CI. Reimplementing
 * Prettier's line-fitting here to save one hook invocation would be a fragile copy of a rule
 * that already has an owner. If you regenerate WITHOUT committing through the hook, run
 * `pnpm exec prettier --write` on the fixture yourself.
 */
const ROOT = findWorkspaceRoot(dirname(fileURLToPath(import.meta.url)));
const GOLDEN_PATH = join(
  ROOT,
  'packages',
  'engine',
  'src',
  '__tests__',
  '__fixtures__',
  'golden-runs.json',
);

/** Kept in sync with the fixture by hand — three routes against three contrasting policies. */
const POLICY_NAMES: readonly PolicyName[] = ['random', 'greedy-safe', 'risk-taker'];

const HEADER: readonly string[] = [
  'Generated, never hand-written. Regenerate with `pnpm golden:update` and REVIEW the diff:',
  'a changed digest is either a deliberate engine change or the bug the golden run exists to catch.',
];

type GoldenRun = {
  readonly seed: string;
  readonly routeId: string;
  readonly policy: PolicyName;
  readonly contentVersion: string;
  readonly choiceSequence: readonly ChoiceId[];
  readonly expectedDigest: string;
  readonly expectedHistoryKeys: readonly string[];
  readonly expectedLegs: number;
  readonly expectedEndings: readonly string[];
};

const pack = loadFixturePack();
const scenarios = loadFixtureScenarios();
const runs: GoldenRun[] = [];
const failures: string[] = [];

for (const scenario of scenarios) {
  for (const policy of POLICY_NAMES) {
    const seed = `golden:${scenario.route.id}:${policy}`;
    const simulated = runOne(seed, scenario, pack, policy);
    if (simulated.error !== null) {
      failures.push(`${seed}: ${simulated.error}`);
      continue;
    }

    // Bare choice ids: the sim records `eventId/choiceId` for its report, but replay is
    // driven by the choice alone.
    const choiceSequence = simulated.choicesPicked.map(
      (picked) => picked.slice(picked.indexOf('/') + 1) as ChoiceId,
    );

    // Expectations come from `replayRun`, not from `runOne`, because replay is what the test
    // asserts. Generating them from the simulator instead would let the two drift apart and
    // still look green.
    const replayed = replayRun(initFor(seed, scenario), pack, choiceSequence);
    if (!replayed.ok) {
      failures.push(`${seed}: replay failed with ${replayed.error.code}`);
      continue;
    }

    runs.push({
      seed,
      routeId: scenario.route.id,
      policy,
      contentVersion: pack.version,
      choiceSequence,
      expectedDigest: replayed.digest,
      expectedHistoryKeys: replayed.historyKeys,
      expectedLegs: replayed.state.route.legIndex,
      expectedEndings: replayed.state.unlockedEndings,
    });
  }
}

if (failures.length > 0) {
  console.error('golden:update refused to write — some runs did not complete:');
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

if (runs.length === 0) {
  console.error('golden:update refused to write an empty fixture.');
  process.exit(1);
}

writeFileSync(GOLDEN_PATH, `${JSON.stringify({ _comment: HEADER, runs }, null, 2)}\n`, 'utf8');

// eslint-disable-next-line no-console -- this command's whole output is what it wrote.
console.log(`golden:update wrote ${String(runs.length)} runs to ${GOLDEN_PATH}`);

/** Must match `golden-run.test.ts`'s `initFor`, or the regenerated digests will not replay. */
function initFor(seed: string, scenario: FixtureScenario): RunInit {
  return {
    ...createRunInit(seed, pack.version, scenario.route),
    transport: scenario.transport,
    resources: scenario.resources,
    startHour: scenario.startHour,
    weather: scenario.weather,
  };
}
