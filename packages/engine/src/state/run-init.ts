import { type LanguageId, type TraitId } from '../ids/content-ids.ts';
import { type Weekday } from './clock-state.ts';
import { type InventoryEntry } from './memory-entries.ts';
import { type DocumentsState } from './documents-state.ts';
import { type Resources } from './resources.ts';
import { type RouteState } from './route-state.ts';
import { type Skills } from './skills.ts';
import { type TransportState } from './transport-state.ts';

/**
 * Everything the caller must supply to start a run.
 *
 * THE ROUTE IS AN INPUT, NOT A PRODUCT. Route generation, the leg-count formula and
 * beat-schedule generation are all out of Phase 1: leg density by terrain and montage
 * compression are design decisions that need terrain data and simulation tuning, and
 * shipping a provisional version now would lock in numbers that have to be unpicked.
 * `createRunState` validates what it is given and returns a typed error if it is incoherent.
 *
 * `route` here carries the traversal fields at their starting values — `legIndex: 0`,
 * `progressKm: 0` — and createRunState does not trust them; it normalises.
 */
export type RunInit = {
  readonly seed: string;
  readonly contentVersion: string;
  readonly route: RouteState;

  /** Omitted parts fall back to the createX() defaults, so a smoke test needs three fields. */
  readonly startWeekday: Weekday | null;
  readonly startHour: number | null;
  readonly weather: string | null;
  readonly transport: TransportState | null;
  readonly resources: Resources | null;
  readonly skills: Skills | null;
  readonly languages: readonly LanguageId[] | null;
  readonly traits: readonly TraitId[] | null;
  readonly inventory: readonly InventoryEntry[] | null;
  readonly documents: DocumentsState | null;
};

/**
 * The minimum viable init. Every optional axis is null, which createRunState reads as
 * "use the default" — keeping test fixtures and the sim harness short without introducing
 * optional properties (see the house rule on RunState).
 */
export function createRunInit(seed: string, contentVersion: string, route: RouteState): RunInit {
  return {
    seed,
    contentVersion,
    route,
    startWeekday: null,
    startHour: null,
    weather: null,
    transport: null,
    resources: null,
    skills: null,
    languages: null,
    traits: null,
    inventory: null,
    documents: null,
  };
}
