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
const LEG_BAND_MIN = 22;
const LEG_BAND_MAX = 48;

/**
 * Endpoint pairs, by node id. Stable, so the sim is reproducible.
 *
 * **Every endpoint is at least 900 km from every other, and that constraint is the point.**
 *
 * This list has been wrong twice, in opposite directions, and both mistakes were invisible in
 * the sim report:
 *
 * 1. The first version took pairs off the overlay's tolled corridors — which are deliberately
 *    INTRA-country roads — so no generated route passed a crossing and `border.night_crossing`
 *    never fired in 2,000 runs. A route set that cannot reach a category of content reports a
 *    beat-fill ceiling nobody can see.
 * 2. The second version was picked by a search that scanned candidate endpoints downward from
 *    the end of the city list, so **all four pairs converged on the same destination** and every
 *    corpus route finished in the same city. Leg counts and completion looked healthy throughout;
 *    what was actually being measured was one destination four times.
 *
 * So the selection is now constrained rather than merely measured: candidates are sampled across
 * the whole sorted city list, and a pair is only taken if BOTH endpoints are ≥900 km from every
 * endpoint already chosen. 873 pairs on the shipped slice yield a 22-48 leg route; these four are
 * the spread-out ones.
 *
 * ONE PAIR PER LEG BUCKET (22-27, 28-33, 34-39, 40-45, 46-48), which is the third constraint
 * and was added at the Afro-Eurasia switch. Ranking candidates by longest-first returned five
 * pairs ALL AT EXACTLY 48 LEGS — on a continental graph everything long saturates the cap, so
 * "take the best" concentrates rather than spreads. Same class of error as the shared-destination
 * set: the ranking, not the measurement, decides the shape.
 *
 * All six cross borders. FIVE of the six yield the full five candidate routes; Beira-Aktobe
 * yields THREE, and that is measured rather than assumed — see the paragraph below. **Route count
 * is not route health**, and Nairobi-Segezha is the pair that proves it: it yields five, and it
 * does so out of the same collapsed generator Beira-Aktobe has. The correction is at the bottom
 * of this comment.
 *
 * ## The sixth pair, and why the leg-bucket constraint is AMENDED rather than kept
 *
 * C2 made `acceptByDiversity` two-directional and correct, and the corpus fell 25 routes to 23.
 * The whole loss is at ONE pair. Measured at `YEN_K = 6`: Beira-Aktobe's five profile cost
 * functions produce only **2 distinct shortest paths**, so its candidate pool is 12 where the
 * other pairs' are 14-29, the ladder climbs to rung 3 (overlap 90) and every remaining candidate
 * there overlaps an accepted route by **91-98%**. The filter is not over-rejecting; the generator
 * is under-supplying, and the three routes that survive are `scenic`, `illicit`, `illicit` —
 * one endpoint pair contributing the SAME profile twice.
 *
 * That is also why the >500 h tail was two routes, both from this pair: `illicit` starts on a
 * truck and its cost function detours around controls, so it is systematically the slowest
 * profile (median 490 h against 284 h for the next-slowest, `scenic`/car), and at 48 legs the LEG
 * cap saturates while kilometres and hours keep climbing. A leg bucket is therefore a poor proxy
 * for the long-hour regime, which is the constraint that actually needed spreading.
 *
 * So the third constraint becomes ONE PAIR PER LEG BUCKET, **except the 46-48 bucket, which
 * takes two** — because that bucket is where the hour tail lives and a floor measured over a
 * regime carried by a single endpoint pair is measuring that pair, not the regime.
 *
 * The sixth pair was picked under a constraint stated BEFORE the search ran, which is the
 * discipline the two degenerate re-picks lacked:
 *
 * 1. both endpoints >=900 km from all ten already chosen (the existing separation rule, extended);
 * 2. all five routes inside the 22-48 leg band;
 * 3. **five DISTINCT profiles** among the plans `generateRoutes` returns — intended to exclude
 *    Beira-Aktobe's collapse. **It did not. See the correction below.**
 * 4. longest route at 46-48 legs and above 400 travel hours, i.e. the regime the breaching
 *    routes occupy;
 * 5. **the MEDIAN of the qualifying set by that hour figure, never the maximum.** 94 pairs
 *    qualified, spanning 401-631 h. Taking the extreme is exactly what produced five pairs at
 *    the 48-leg cap last time; a median of an already-constrained set cannot saturate.
 *
 * ## CORRECTION: constraint 3 did not do the work it was written to do
 *
 * It was written to guarantee that the sixth pair could not "import the same collapse under a
 * healthier-looking count". Adversarial review measured the sixth pair against the same
 * instruments Beira-Aktobe was measured with, and the collapse is IDENTICAL:
 *
 * | measured at `YEN_K = 6`        | Beira-Aktobe | Nairobi-Segezha | the healthy four |
 * | ------------------------------ | ------------ | --------------- | ---------------- |
 * | distinct profile shortest paths| 2 of 5       | **2 of 5**      | 2, 2, 5, 5       |
 * | profiles with NO path at all   | 3 of 5       | **3 of 5**      | 0 of 5           |
 * | pool B (profiles + Yen)        | 12           | **12**          | 14, 24, 29, 28   |
 * | rung the ladder had to reach   | 3            | **4**           | 1, 1, 0, 0       |
 * | plans returned                 | 3            | 5               | 5, 5, 5, 5       |
 *
 * `fastest`, `cheapest` and `safest` return NO PATH at rung-0 masks on BOTH pairs. Both therefore
 * enter the ladder with a two-path pool. The only thing that differs is where they stop: at rung 3
 * Beira-Aktobe has already collected three routes and the loop breaks, while Nairobi-Segezha has
 * not, so it climbs to rung 4 — **masks dropped** — where its pool goes 12 -> 29 and five routes
 * appear. Those five carry five distinct profile LABELS, but they are labels applied after the
 * profiles' own cost functions were relaxed away. Nairobi-Segezha did not satisfy constraint 3;
 * it climbed past the rung at which the constraint was meaningful.
 *
 * So the constraint measured an OUTPUT of `generateRoutes` and inferred a property of the
 * generator, and the inference is invalid: profile diversity in the returned plans does not
 * imply profile diversity in the pool they were drawn from. The pair still delivers five routes
 * in the 22-48 band and it STAYS — the amendment it was added for (two pairs in the 46-48 bucket,
 * so the long-hour regime is not carried by one endpoint pair) it does deliver, and the >500 h
 * tail is now three routes across two pairs rather than two routes from one. But it was kept for
 * a stated reason that measurement refuted, and the reason is corrected here rather than quietly
 * dropped.
 *
 * The constraint that WOULD have done the job is `selectPaths`'s own `rungReached` — 0 or 1 is a
 * generator that supplies alternatives, 3 or 4 is one that does not — and `generateRoutes`
 * already returns it. Nothing reads it. That, not the profile count, is the check to write if a
 * seventh pair is ever added.
 */
const CORPUS_PAIRS: readonly (readonly [string, string])[] = [
  // Riyadh-Beersheba: 22 legs, 1,957 km, 5 routes
  ['n.city.g108410', 'n.city.g295530'],
  // Bengaluru-Bangkok: 30 legs, 4,881 km, 5 routes
  ['n.city.g1277333', 'n.city.g1609350'],
  // Jijel-Shakhty: 36 legs, 6,090 km, 5 routes
  ['n.city.g2492913', 'n.city.g496015'],
  // Copenhagen-Brest: 42 legs, 8,353 km, 5 routes
  ['n.city.g2618425', 'n.city.g3030300'],
  // Beira-Aktobe: 48 legs, 15,296 km, THREE routes — the collapse described above
  ['n.city.g1052373', 'n.city.g610611'],
  // Nairobi-Segezha: 48 legs, longest 509 h — the median of the 94 qualifiers. Five routes, but
  // only from rung 4 (masks dropped) and out of the SAME collapsed pool as Beira-Aktobe above.
  ['n.city.g184745', 'n.city.g497927'],
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
      if (legs < LEG_BAND_MIN || legs > LEG_BAND_MAX) continue;
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
    issues.push('no corpus route landed in the 22-48 leg band — the sim would measure nothing');
  }
  return { scenarios, issues };
}
