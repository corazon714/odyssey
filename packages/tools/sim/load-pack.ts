import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  declaredIds,
  formatIssue,
  loadComplications,
  loadDeclarations,
  loadEvents,
  loadGeo,
  loadModifiers,
  loadUniversalChoices,
} from '@odyssey/content/loader';
import {
  createContentPack,
  createGeoGraph,
  createResources,
  createTransport,
  generateRoutes,
  nodeId,
  type ContentPack,
  type ContentRegistries,
  type GameEvent,
  type ItemId,
  type NpcId,
  type Resources,
  type RouteState,
  type TraitId,
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

/**
 * The pack built from `packages/content/` — YAML events plus every real registry.
 *
 * THE DIFFERENCE THAT MATTERS, and it is not the events. `mini-pack.json` carries
 * `registries.modifiers: []`, so the ten rows in `modifiers.yaml` have never applied in a
 * golden run or a sim run — M2A.3 moved `contentVersion` because the KEY appeared, not because
 * the rows did. This is the first loader that puts them in front of the engine, and the same
 * goes for `complications.yaml` and `universal-choices.yaml`.
 *
 * So `--pack=corpus` is not "the same numbers with more events". It is the first measurement
 * of the registries at all, and its report is expected to differ from the fixture baseline in
 * ways that are the point rather than a regression.
 *
 * Loader issues are RETURNED alongside the pack rather than thrown: the sim's job is to report,
 * and a corpus that half-loads is a finding, not a crash.
 */
export function loadCorpusPack(): {
  readonly pack: ContentPack;
  readonly issues: readonly string[];
} {
  const root = findWorkspaceRoot(dirname(fileURLToPath(import.meta.url)));
  const contentRoot = join(root, 'packages', 'content');

  const events = loadEvents(join(contentRoot, 'events'), contentRoot);
  const declarations = loadDeclarations(contentRoot);
  const modifiers = loadModifiers(contentRoot);
  const complications = loadComplications(contentRoot);
  const universalChoices = loadUniversalChoices(contentRoot);

  const declared = declaredIds(declarations.declarations);
  const pack = createContentPack(events.events, {
    npcs: declared.npcs as readonly NpcId[],
    items: declared.items as readonly ItemId[],
    traits: declared.traits as readonly TraitId[],
    modifiers: modifiers.modifiers,
    complications: complications.complications,
    universalChoices: universalChoices.universalChoices,
  });

  const issues = [
    ...events.issues,
    ...declarations.issues,
    ...modifiers.issues,
    ...complications.issues,
    ...universalChoices.issues,
  ].map((issue) => `${formatIssue(issue)} ${issue.message}`);

  return { pack, issues };
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

/**
 * Corpus scenarios — GENERATED at sim time from the committed geo artifacts.
 *
 * ## Why this is not a committed `corpus-routes.json`
 *
 * The phase plan left that open (question 4): commit the generated file with a staleness
 * digest, or build it here. Building it here, because **a route is a pure deterministic
 * function of inputs that are already committed and already digest-checked** — the geo
 * artifacts (`geo:build --check` proves they regenerate byte-identically) plus the fixed seed
 * below. A committed route file would add a second staleness class, its own digest, its own
 * `--check` and its own CI guard, all to re-derive something that cannot drift from its inputs.
 * The thing that CAN drift — the geo slice — already has all of that.
 *
 * What is given up is reviewing a route change as a diff. What is gained is that a route change
 * is impossible without a geo change or a code change, both of which are diffs already. See
 * `docs/adr/0034`.
 *
 * ## The short band, deliberately
 *
 * M3.10a takes only 10-16-leg routes so route SHAPE is measured without leg COUNT moving;
 * M3.10b raises to the full 22-48 band. ADR 0026's addendum measured 0.1% completion at 24 legs
 * and 0.0% beyond, so a combined milestone could not tell a shape regression from the known
 * survivability wall.
 */
const CORPUS_ROUTE_SEED = 'corpus:m3.10a';
const SHORT_BAND_MIN = 10;
const SHORT_BAND_MAX = 16;

/**
 * Endpoint pairs, by node id. Stable, so the sim is reproducible.
 *
 * **Four of the six cross a border, and that is the whole point of the selection.** The first
 * attempt at this list took pairs off the overlay's tolled corridors — which are deliberately
 * INTRA-country roads — so not one generated route passed a crossing, and
 * `border.night_crossing` never fired in 2,000 runs. A route set that cannot reach a category
 * of content reports a beat-fill ceiling nobody can see, which is precisely the misleading
 * number M3.10a exists to remove.
 *
 * Two intra-country pairs are kept on purpose: a corpus where every route crosses a border
 * would be the same distortion in the other direction.
 *
 * Chosen by measurement rather than by guess — 40 city pairs on the shipped slice yield a
 * 10-16-leg route that passes a crossing; these are six of them.
 */
const CORPUS_PAIRS: readonly (readonly [string, string])[] = [
  ['n.city.g2267095', 'n.city.g2510911'],
  ['n.city.g2464470', 'n.city.g2525068'],
  ['n.city.g2618425', 'n.city.g2891122'],
  ['n.city.g2512989', 'n.city.g2972315'],
  ['n.city.g3169070', 'n.city.g3172394'],
  ['n.city.g2988507', 'n.city.g2989317'],
];

export function loadCorpusScenarios(): {
  readonly scenarios: readonly FixtureScenario[];
  readonly issues: readonly string[];
} {
  const contentRoot = join(
    findWorkspaceRoot(dirname(fileURLToPath(import.meta.url))),
    'packages',
    'content',
  );
  const geo = loadGeo(contentRoot);
  if (geo.geo === null) {
    return { scenarios: [], issues: geo.issues.map((i) => `${i.file}: ${i.message}`) };
  }

  const built = createGeoGraph(
    geo.geo.nodes.map((record) => record.node),
    geo.geo.edges,
  );
  if (!built.ok) return { scenarios: [], issues: built.issues.map((i) => `geo graph: ${i}`) };

  const graph = built.graph;
  const scenarios: FixtureScenario[] = [];
  const issues: string[] = [];

  for (const [from, to] of CORPUS_PAIRS) {
    const a = graph.nodeIndex.get(nodeId(from));
    const b = graph.nodeIndex.get(nodeId(to));
    if (a === undefined || b === undefined) {
      issues.push(`corpus route pair names a node not in the slice: ${from} > ${to}`);
      continue;
    }

    for (const plan of generateRoutes(graph, a, b, CORPUS_ROUTE_SEED).plans) {
      const legs = plan.route.legCount;
      if (legs < SHORT_BAND_MIN || legs > SHORT_BAND_MAX) continue;
      scenarios.push({
        route: plan.route,
        transport: {
          ...createTransport(plan.start.transportMode),
          vehicleId: plan.start.transportMode === 'foot' ? null : `${plan.route.id}-vehicle`,
          legal: plan.start.vehicleLegal,
        },
        resources: { ...createResources(), cash: plan.start.cash },
        startHour: plan.start.startHour,
        weather: plan.start.weather,
      });
    }
  }

  // An empty scenario set would make every sim number meaningless while the report still looked
  // healthy, so it is a loud failure rather than a quiet zero.
  if (scenarios.length === 0) {
    issues.push('no corpus route landed in the 10-16 leg band — the sim would measure nothing');
  }
  return { scenarios, issues };
}
