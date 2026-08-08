import {
  LOCATION_TYPES,
  ROUTE_PROFILES,
  TIMES_OF_DAY,
  TRANSPORT_MODES,
  type GameEvent,
  type LocationType,
  type ModifierRegistry,
  type RouteProfile,
  type TimeOfDay,
  type TransportMode,
} from '@odyssey/engine';

/**
 * Counting, and the one rule that makes the counts mean anything.
 *
 * AN EMPTY CONSTRAINT ARRAY MEANS NO CONSTRAINT (ADR 0009 §2). `locationTypes: []` is an event
 * that can fire ANYWHERE, not one that can fire nowhere — so every axis expands an empty list
 * to the full vocabulary before counting. Getting this backwards would invert the entire
 * report: the events that fit everywhere would read as fitting nothing.
 */

export type Axis = {
  readonly locationType: LocationType;
  readonly timeOfDay: TimeOfDay;
  readonly transportMode: TransportMode;
  readonly routeProfile: RouteProfile;
};

/** What can fire in one cell of the space, split by whether it is real content or filler. */
export type Cell = {
  readonly total: number;
  readonly fillers: number;
  /** total - fillers. The number that actually matters. */
  readonly substantive: number;
};

export function countBy<T extends string>(
  events: readonly GameEvent[],
  pick: (event: GameEvent) => readonly T[],
): ReadonlyMap<T, number> {
  const out = new Map<T, number>();
  for (const event of events) {
    for (const value of pick(event)) out.set(value, (out.get(value) ?? 0) + 1);
  }
  return out;
}

/** Sorted descending by count, then by key. Deterministic — `<`, never `localeCompare`. */
export function ranked<T extends string>(counts: ReadonlyMap<T, number>): readonly [T, number][] {
  return [...counts.entries()].sort((a, b) => {
    if (a[1] !== b[1]) return b[1] - a[1];
    return a[0] < b[0] ? -1 : 1;
  });
}

/** Expand an empty constraint list to the whole axis. THE rule this module turns on. */
function axisOf<T extends string>(declared: readonly T[], all: readonly T[]): readonly T[] {
  return declared.length === 0 ? all : declared;
}

export function eligibleAt(events: readonly GameEvent[], at: Axis): Cell {
  let total = 0;
  let fillers = 0;

  for (const event of events) {
    const context = event.context;
    if (!axisOf(context.locationTypes, LOCATION_TYPES).includes(at.locationType)) continue;
    if (!axisOf(context.timeOfDay, TIMES_OF_DAY).includes(at.timeOfDay)) continue;
    if (!axisOf(context.transportModes, TRANSPORT_MODES).includes(at.transportMode)) continue;
    if (!axisOf(context.routeProfiles, ROUTE_PROFILES).includes(at.routeProfile)) continue;

    total += 1;
    if (event.priority === 'filler') fillers += 1;
  }

  return { total, fillers, substantive: total - fillers };
}

export type Coverage = {
  readonly cells: number;
  /** Cells no event at all can fill. */
  readonly empty: readonly Axis[];
  /**
   * Cells where the ONLY eligible events are fillers.
   *
   * This is the number worth reading, and the reason the report splits filler from
   * substantive at all. A cell that is technically covered because two universal fillers can
   * fire there is a hole with a rug over it — the sim already reports fillers as 75% of
   * everything that fires, and this says WHERE that comes from.
   */
  readonly fillerOnly: readonly Axis[];
};

export function coverage(events: readonly GameEvent[]): Coverage {
  const empty: Axis[] = [];
  const fillerOnly: Axis[] = [];
  let cells = 0;

  for (const locationType of LOCATION_TYPES) {
    for (const timeOfDay of TIMES_OF_DAY) {
      for (const transportMode of TRANSPORT_MODES) {
        for (const routeProfile of ROUTE_PROFILES) {
          const at: Axis = { locationType, timeOfDay, transportMode, routeProfile };
          const cell = eligibleAt(events, at);
          cells += 1;
          if (cell.total === 0) empty.push(at);
          else if (cell.substantive === 0) fillerOnly.push(at);
        }
      }
    }
  }

  return { cells, empty, fillerOnly };
}

/** The 2-D slice worth printing: the two axes the director filters hardest on. */
export function locationByTime(
  events: readonly GameEvent[],
): ReadonlyMap<LocationType, ReadonlyMap<TimeOfDay, number>> {
  const out = new Map<LocationType, Map<TimeOfDay, number>>();

  for (const locationType of LOCATION_TYPES) {
    const row = new Map<TimeOfDay, number>();
    for (const timeOfDay of TIMES_OF_DAY) {
      // Substantive only. Counting fillers here would paint the grid uniformly green and
      // hide the thing it exists to show.
      let count = 0;
      for (const event of events) {
        if (event.priority === 'filler') continue;
        if (!axisOf(event.context.locationTypes, LOCATION_TYPES).includes(locationType)) continue;
        if (!axisOf(event.context.timeOfDay, TIMES_OF_DAY).includes(timeOfDay)) continue;
        count += 1;
      }
      row.set(timeOfDay, count);
    }
    out.set(locationType, row);
  }

  return out;
}

export function modifierSourceKinds(registry: ModifierRegistry): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  for (const row of registry) out.set(row.sourceKind, (out.get(row.sourceKind) ?? 0) + 1);
  return out;
}

export function checkTagUse(events: readonly GameEvent[]): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  for (const event of events) {
    for (const choice of event.choices) {
      for (const tag of choice.skillCheck?.tags ?? []) out.set(tag, (out.get(tag) ?? 0) + 1);
    }
  }
  return out;
}
