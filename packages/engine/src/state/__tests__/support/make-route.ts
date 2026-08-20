import { type LocationType } from '../../../content/location-type.ts';
import { edgeId, nodeId, routeId } from '../../../ids/content-ids.ts';
import { type BeatSlot } from '../../beat-slot.ts';
import { type RouteState } from '../../route-state.ts';
import { uniformSplit } from '../../uniform-split.ts';

/**
 * A fixture route. Phase 1 takes the route as caller-supplied input, so tests and the sim
 * harness both need one — this is the shared shape.
 */
export function makeRoute(overrides: Partial<RouteState> = {}): RouteState {
  const merged: RouteState = {
    id: routeId('fixture.route'),
    profile: 'cheapest',
    nodes: [nodeId('start'), nodeId('middle'), nodeId('end')],
    edges: [edgeId('start-middle'), edgeId('middle-end')],
    legIndex: 0,
    legCount: 12,
    progressKm: 0,
    totalKm: 900,
    beatSchedule: makeBeats(),
    legLocations: [],
    legKm: [],
    montageLegs: [],
    ...overrides,
  };

  // Keep legLocations and legKm in step with legCount unless a test sets them deliberately.
  // Without this every `makeRoute({ legCount: n })` would fail validation for the wrong reason,
  // and the test that meant to exercise a beat range would report a location or distance
  // mismatch instead. `legKm` is derived from the MERGED legCount and totalKm, so overriding
  // either one alone still produces a route whose legs sum to its distance.
  return {
    ...merged,
    legLocations:
      overrides.legLocations === undefined
        ? defaultLocations(merged.legCount)
        : merged.legLocations,
    legKm:
      overrides.legKm === undefined ? uniformSplit(merged.totalKm, merged.legCount) : merged.legKm,
  };
}

export function makeBeats(): BeatSlot[] {
  return [
    { legIndex: 0, type: 'departure', slackLegs: 0, status: 'pending' },
    { legIndex: 6, type: 'midpoint_crisis', slackLegs: 2, status: 'pending' },
    { legIndex: 11, type: 'finale', slackLegs: 0, status: 'pending' },
  ];
}

/** A repeating spread that includes every location type the fixture pack filters on. */
const LOCATION_CYCLE: readonly LocationType[] = [
  'city',
  'roadside',
  'rest_stop',
  'roadside',
  'checkpoint',
  'town',
  'border_crossing',
  'roadside',
  'wilderness',
  'station',
];

export function defaultLocations(legCount: number): LocationType[] {
  return Array.from(
    { length: Math.max(0, legCount) },
    (_, i) => LOCATION_CYCLE[i % LOCATION_CYCLE.length] ?? 'roadside',
  );
}
