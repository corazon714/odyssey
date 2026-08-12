import { createInventory } from './container-state.ts';
import { type EngineError } from '../errors/engine-error.ts';
import { createRngCursors } from '../rng/rng-cursors.ts';
import { type ClampEvent } from './clamp-event.ts';
import { createClock } from './clock-state.ts';
import { createDocuments } from './documents-state.ts';
import { NO_PRESENTATION } from './presentation.ts';
import { clampResources, createResources } from './resources.ts';
import { type RunInit } from './run-init.ts';
import { type RunState } from './run-state.ts';
import { clampSkills, createSkills } from './skills.ts';
import { createTransport } from './transport-state.ts';
import { validateRoute } from './validate-route.ts';

/** The save schema version this build writes. Bumping it requires a migration and a fixture. */
export const SAVE_VERSION = 5;

export type CreateRunStateResult =
  | { readonly ok: true; readonly state: RunState; readonly clamps: readonly ClampEvent[] }
  | { readonly ok: false; readonly error: EngineError };

/**
 * Build the starting state for a run.
 *
 * Two things it deliberately does NOT trust from the caller. The route's traversal fields
 * are normalised to the start rather than taken as given, so a reused RunInit cannot begin a
 * run halfway along. And resources and skills are clamped, with every clamp reported — a
 * preparation screen that over-allocates should show up in the sim as a clamp count, not
 * vanish into a silent Math.min.
 */
export function createRunState(init: RunInit): CreateRunStateResult {
  const routeError = validateRoute(init.route);
  if (routeError !== null) return { ok: false, error: routeError };

  const resources = clampResources(init.resources ?? createResources());
  const skills = clampSkills(init.skills ?? createSkills(init.languages ?? []));

  const state: RunState = {
    version: SAVE_VERSION,
    contentVersion: init.contentVersion,
    seed: init.seed,
    rngCursors: createRngCursors(),

    clock: createClock(init.startWeekday ?? 0, init.startHour ?? 8),
    weather: init.weather ?? 'clear',

    route: {
      ...init.route,
      legIndex: 0,
      progressKm: 0,
    },
    transport: init.transport ?? createTransport(),
    resources: resources.resources,
    skills: skills.skills,

    traits: init.traits ?? [],
    inventory: init.inventory ?? createInventory(),
    documents: init.documents ?? createDocuments(),

    flags: {},
    relationships: {},
    eventMemory: {},
    pendingEvents: [],

    history: [],
    tension: 0,
    unlockedEndings: [],
    status: 'preparing',
    presentation: NO_PRESENTATION,
  };

  return { ok: true, state, clamps: [...resources.clamps, ...skills.clamps] };
}
