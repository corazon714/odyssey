import { type EdgeId, type NodeId, type RouteId } from '../ids/content-ids.ts';
import { type BeatSlot } from './beat-slot.ts';

/**
 * The chosen route and how far along it the run is.
 *
 * Route GENERATION is out of Phase 1 — k-shortest paths, candidate routes and the leg-count
 * formula all need geo data and sim tuning that do not exist yet. The engine receives a
 * route through RunInit, validates it, and traverses it. That keeps the loop runnable now
 * without locking in numbers that will have to be unpicked later.
 *
 * `edges` has exactly `nodes.length - 1` entries: an edge is the crossing between
 * consecutive nodes. `legCount` is NOT `edges.length` — several legs can fall on one long
 * edge, and montage legs compress others.
 */
export const ROUTE_PROFILES = ['fastest', 'cheapest', 'safest', 'scenic', 'illicit'] as const;
export type RouteProfile = (typeof ROUTE_PROFILES)[number];

export type RouteState = {
  readonly id: RouteId;
  readonly profile: RouteProfile;
  readonly nodes: readonly NodeId[];
  readonly edges: readonly EdgeId[];
  readonly legIndex: number;
  readonly legCount: number;
  readonly progressKm: number;
  readonly totalKm: number;
  readonly beatSchedule: readonly BeatSlot[];
};
