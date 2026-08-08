import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type ContentRegistries } from '../../content/content-pack.ts';
import { type GameEvent } from '../../content/game-event.ts';
import { type RouteState } from '../../state/route-state.ts';

/**
 * Load the JSON fixtures and assert their shape.
 *
 * The fixtures are DATA files, so something has to turn them into typed values. That is
 * normally Zod's job, but the schemas are Phase 2 and live in `packages/content` — so this is
 * a hand-written shape guard, deliberately shallow: it checks the fields the engine actually
 * reads and THROWS with a path on mismatch.
 *
 * Throwing is right here and wrong in the engine. A malformed fixture is a broken test, which
 * should stop immediately; a malformed save is a player's run, which must degrade instead.
 */
const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__');

type MiniPackFile = {
  readonly registries: ContentRegistries;
  readonly events: readonly GameEvent[];
};

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf8')) as unknown;
}

function requireObject(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`fixture ${path}: expected an object, got ${JSON.stringify(value)}`);
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`fixture ${path}: expected an array, got ${JSON.stringify(value)}`);
  }
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw new Error(`fixture ${path}: expected a string, got ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * Check the fields the director and loop read. Anything deeper is covered by the engine's own
 * types once the value is cast — a fixture that satisfies this and then breaks a test tells
 * you which test, which is enough.
 */
function checkEvent(raw: unknown, index: number): void {
  const event = requireObject(raw, `events[${index}]`);
  const id = requireString(event['id'], `events[${index}].id`);

  for (const key of ['titleKey', 'bodyKey', 'category', 'priority'] as const) {
    requireString(event[key], `events[${id}].${key}`);
  }
  requireObject(event['requires'], `events[${id}].requires`);
  requireObject(event['context'], `events[${id}].context`);

  const choices = requireArray(event['choices'], `events[${id}].choices`);
  if (choices.length === 0) throw new Error(`fixture events[${id}]: needs at least one choice`);

  choices.forEach((rawChoice, ci) => {
    const choice = requireObject(rawChoice, `events[${id}].choices[${ci}]`);
    requireString(choice['id'], `events[${id}].choices[${ci}].id`);
    requireString(choice['labelKey'], `events[${id}].choices[${ci}].labelKey`);

    const outcomes = requireArray(choice['outcomes'], `events[${id}].choices[${ci}].outcomes`);
    if (outcomes.length === 0) {
      throw new Error(`fixture events[${id}].choices[${ci}]: needs at least one outcome`);
    }
    outcomes.forEach((rawOutcome, oi) => {
      const outcome = requireObject(rawOutcome, `events[${id}].choices[${ci}].outcomes[${oi}]`);
      requireString(outcome['textKey'], `events[${id}].choices[${ci}].outcomes[${oi}].textKey`);
    });
  });
}

export function loadMiniPack(): MiniPackFile {
  const file = requireObject(readJson('mini-pack.json'), 'mini-pack.json');
  const events = requireArray(file['events'], 'events');
  events.forEach(checkEvent);

  return {
    registries: requireObject(file['registries'], 'registries') as unknown as ContentRegistries,
    events: events as readonly GameEvent[],
  };
}

export function loadFixtureRoutes(): readonly RouteState[] {
  const file = requireObject(readJson('routes.json'), 'routes.json');
  const routes = requireArray(file['routes'], 'routes');

  routes.forEach((raw, i) => {
    const route = requireObject(raw, `routes[${i}]`);
    requireString(route['id'], `routes[${i}].id`);
    requireArray(route['nodes'], `routes[${i}].nodes`);
    requireArray(route['edges'], `routes[${i}].edges`);
    requireArray(route['beatSchedule'], `routes[${i}].beatSchedule`);
  });

  return routes as readonly RouteState[];
}
