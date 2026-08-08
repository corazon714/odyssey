import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createContentPack,
  createResources,
  createTransport,
  type ContentPack,
  type ContentRegistries,
  type GameEvent,
  type Resources,
  type RouteState,
  type TransportMode,
  type TransportState,
} from '@odyssey/engine';
import { findWorkspaceRoot } from '../shared/workspace-root.ts';

/**
 * Load the Phase 1 fixture pack and routes.
 *
 * Read by PATH rather than imported, because the fixtures live in the engine's `__tests__`
 * tree and nothing there is — or should be — exported from its barrel. `findWorkspaceRoot`
 * exists for exactly this: resolving from `process.cwd()` breaks the moment the sim is run
 * from a subdirectory or by a git hook, which its own JSDoc anticipated.
 *
 * Phase 2 replaces this with the YAML loader over `packages/content/events/`. The fixture
 * pack is not the seed corpus and must not become it (ADR 0009 §5).
 */
const FIXTURE_DIR = join(
  findWorkspaceRoot(dirname(fileURLToPath(import.meta.url))),
  'packages',
  'engine',
  'src',
  '__tests__',
  '__fixtures__',
);

type MiniPackFile = {
  readonly registries: ContentRegistries;
  readonly events: readonly GameEvent[];
};

type FixtureStart = {
  readonly transportMode: TransportMode;
  readonly vehicleLegal: boolean;
  readonly cash: number;
  readonly startHour: number;
  readonly weather: string;
};

/**
 * A route plus the preparation choices it implies.
 *
 * These are inseparable: a route through two border crossings implies a vehicle, and a pack
 * of vehicle-constrained events is unreachable without one. Keeping them together stops a
 * future route being added without a start block and quietly halving the reachable content.
 */
export type FixtureScenario = {
  readonly route: RouteState;
  readonly transport: TransportState;
  readonly resources: Resources;
  readonly startHour: number;
  readonly weather: string;
};

type RoutesFile = {
  readonly routes: readonly { readonly start: FixtureStart; readonly route: RouteState }[];
};

export function loadFixturePack(): ContentPack {
  const file = JSON.parse(
    readFileSync(join(FIXTURE_DIR, 'mini-pack.json'), 'utf8'),
  ) as MiniPackFile;
  return createContentPack(file.events, file.registries);
}

export function loadFixtureScenarios(): readonly FixtureScenario[] {
  const file = JSON.parse(readFileSync(join(FIXTURE_DIR, 'routes.json'), 'utf8')) as RoutesFile;

  return file.routes.map(({ start, route }) => ({
    route,
    transport: {
      ...createTransport(start.transportMode),
      vehicleId: start.transportMode === 'foot' ? null : `${route.id}-vehicle`,
      legal: start.vehicleLegal,
    },
    resources: { ...createResources(), cash: start.cash },
    startHour: start.startHour,
    weather: start.weather,
  }));
}
