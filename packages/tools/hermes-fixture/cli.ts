import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createContentPack,
  createResources,
  createRunInit,
  createTransport,
  replayRun,
  type ChoiceId,
  type ContentRegistries,
  type GameEvent,
  type RouteState,
  type RunInit,
  type TransportMode,
} from '@odyssey/engine';
import { findWorkspaceRoot } from '../shared/workspace-root.ts';

/**
 * `pnpm hermes:fixture` — build the self-contained fixture `/dev/hermes-check` replays on a device.
 *
 * ## What this is for
 *
 * ADR 0012 §3: **the engine has never executed on Hermes.** Every determinism defence in
 * `packages/engine` — no transcendentals, no `localeCompare`, integer `weightedPick`, `Math.imul`
 * over BigInt — is PREVENTIVE and proven on V8 only, across Linux and Windows CI. That gap has been
 * open and named since Phase 1, and it is the highest-value thing a device session can close.
 *
 * A browser cannot close it (`docs/web-preview-traps.md` trap 6) and neither can CI. It needs the
 * engine to run, on Hermes, and produce the same digests.
 *
 * ## Why a generated fixture rather than importing the engine's test fixtures
 *
 * Two reasons, both hard rules rather than preferences:
 *
 * 1. **The engine's `__tests__/__fixtures__/` are read by PATH**, with `readFileSync`. That works in
 *    Node and not in React Native, where there is no filesystem.
 * 2. **`apps/mobile` may only import the engine BARREL** (`eslint.config.mjs`), and nothing in the
 *    test tree is or should be exported from it.
 *
 * So this combines the three fixtures into one JSON the app can `import` as a module, written to
 * `apps/mobile/src/dev/__fixtures__/`.
 *
 * ## Why it REPLAYS before writing, which is the part that matters
 *
 * **The fixture is self-certifying.** Every run is replayed here, on V8, and its digest compared to
 * the golden value before anything is written. If they disagree the generator FAILS and writes
 * nothing.
 *
 * That is not belt-and-braces, it is the difference between a useful device session and a wasted
 * one: a mismatch on the phone must mean "Hermes differs from V8", and it can only mean that if the
 * V8 side was verified at generation time. Without this step a harness bug would surface on the
 * device as a terrifying red result, and the obvious conclusion would be the wrong one.
 *
 * `golden-run.test.ts` makes the same rule explicit for its own fixtures: "The fixtures are
 * GENERATED, never hand-written. A hand-typed digest is a number someone made up."
 */

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

type FixtureStart = {
  readonly transportMode: string;
  readonly vehicleLegal: boolean;
  readonly cash: number;
  readonly startHour: number;
  readonly weather: string;
};

type RouteEntry = { readonly start: FixtureStart; readonly route: RouteState };

const ROOT = findWorkspaceRoot(dirname(fileURLToPath(import.meta.url)));
const FIXTURE_DIR = join(ROOT, 'packages', 'engine', 'src', '__tests__', '__fixtures__');
const OUT = join(ROOT, 'apps', 'mobile', 'src', 'dev', '__fixtures__', 'hermes-check.json');

const read = <T>(name: string): T => JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf8')) as T;

const miniPack = read<{ registries: ContentRegistries; events: readonly GameEvent[] }>(
  'mini-pack.json',
);
const routes = read<{ routes: readonly RouteEntry[] }>('routes.json').routes;
const golden = read<{ runs: readonly GoldenRun[] }>('golden-runs.json').runs;

const pack = createContentPack(miniPack.events, miniPack.registries);

/**
 * Reproduced from `golden-run.test.ts`'s `initFor`, field for field.
 *
 * **Any drift here produces a false Hermes failure**, which is the single worst outcome this whole
 * exercise could have — a red result on the device with the wrong cause. The replay check below is
 * what catches drift: an init that does not match will fail on V8, here, before anything ships.
 */
function initFor(run: GoldenRun): RunInit {
  const entry = routes.find((r) => String(r.route.id) === run.routeId);
  if (entry === undefined) throw new Error(`golden run names an unknown route: ${run.routeId}`);
  return {
    ...createRunInit(run.seed, pack.version, entry.route),
    transport: {
      ...createTransport(entry.start.transportMode as TransportMode),
      vehicleId: `${String(entry.route.id)}-vehicle`,
      legal: entry.start.vehicleLegal,
    },
    resources: { ...createResources(), cash: entry.start.cash },
    startHour: entry.start.startHour,
    weather: entry.start.weather,
  };
}

if (golden.length === 0) throw new Error('no golden runs — refusing to write an empty fixture');

const failures: string[] = [];
for (const run of golden) {
  const result = replayRun(initFor(run), pack, run.choiceSequence);
  if (!result.ok) {
    failures.push(`${run.routeId}/${run.policy}: replay failed ${result.error.code}`);
    continue;
  }
  if (result.digest !== run.expectedDigest) {
    failures.push(
      `${run.routeId}/${run.policy}: digest ${result.digest} != golden ${run.expectedDigest}`,
    );
  }
  if (result.state.route.legIndex !== run.expectedLegs) {
    failures.push(
      `${run.routeId}/${run.policy}: legs ${String(result.state.route.legIndex)} != ${String(run.expectedLegs)}`,
    );
  }
}

if (failures.length > 0) {
  // Nothing is written. A fixture whose V8 side does not reproduce would make every device reading
  // meaningless, and the failure would look like a Hermes defect.
  console.error('REFUSING TO WRITE — the golden runs do not reproduce on V8:');
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

const fixture = {
  _generated: 'pnpm hermes:fixture — do not edit by hand',
  _why: 'ADR 0012 section 3: the engine has never executed on Hermes. See packages/tools/hermes-fixture/cli.ts',
  contentVersion: pack.version,
  registries: miniPack.registries,
  events: miniPack.events,
  routes,
  runs: golden,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');

/* eslint-disable no-console -- the report IS this command's output, as in sim/cli.ts. */
console.log(`verified ${String(golden.length)} golden runs on V8, all digests reproduce`);
console.log(`wrote ${OUT}`);
console.log(`contentVersion ${pack.version}`);
/* eslint-enable no-console */
