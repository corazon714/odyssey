import { type BeatSlot } from '../../beat-slot.ts';
import { edgeId, nodeId, routeId } from '../../../ids/content-ids.ts';
import { type RouteState } from '../../route-state.ts';

/**
 * A fixture route. Phase 1 takes the route as caller-supplied input, so tests and the sim
 * harness both need one — this is the shared shape.
 */
export function makeRoute(overrides: Partial<RouteState> = {}): RouteState {
  const nodes = [nodeId('start'), nodeId('middle'), nodeId('end')];

  return {
    id: routeId('fixture.route'),
    profile: 'cheapest',
    nodes,
    edges: [edgeId('start-middle'), edgeId('middle-end')],
    legIndex: 0,
    legCount: 12,
    progressKm: 0,
    totalKm: 900,
    beatSchedule: makeBeats(),
    ...overrides,
  };
}

export function makeBeats(): BeatSlot[] {
  return [
    { legIndex: 0, type: 'departure', slackLegs: 0, status: 'pending' },
    { legIndex: 6, type: 'midpoint_crisis', slackLegs: 2, status: 'pending' },
    { legIndex: 11, type: 'finale', slackLegs: 0, status: 'pending' },
  ];
}
