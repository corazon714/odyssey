import { type LocationType } from '../content/location-type.ts';
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
  /**
   * What kind of place each leg passes through — one entry per leg.
   *
   * Caller-supplied along with the rest of the route, for the same reason: deriving it needs
   * geo data (Phase 2). Without it `context.locationTypes` cannot be evaluated at all, which
   * would make every border and rest-stop event unfilterable — so the field is load-bearing
   * rather than decorative.
   *
   * These are TYPES, never places (CLAUDE.md 11). There is nowhere here to put a nationality.
   */
  readonly legLocations: readonly LocationType[];
  /**
   * How far each leg covers, in integer kilometres. One entry per leg, summing to `totalKm`.
   *
   * **Uniform at M3.7 and everywhere today.** M3.9 replaces the values with terrain-density
   * sizing; this milestone ships the FIELD, the save bump and the migration on their own, so
   * that when the numbers change the golden diff is attributable to the numbers.
   *
   * The `legLocations` precedent deliberately does NOT transfer. That field is read only
   * through `locationAtLeg`, which has a `?? 'roadside'` fallback, so an absent one degrades to
   * a worse-but-working run. This one has a SUM invariant that a per-element fallback would
   * violate, and an absent array makes `route.legKm[i]` a `TypeError` thrown out of a function
   * whose whole contract is that it returns an `EngineError` and never throws — which is why
   * `migrate_4_to_5` writes it rather than letting it default.
   */
  readonly legKm: readonly number[];
  /**
   * Leg indices the journal summarises instead of playing, ascending and unique.
   *
   * **Empty at M3.7**, and the field exists now because without it montage is *labelled*
   * rather than implemented: `wilderness` is already used for ordinary legs, so there would be
   * nothing at run time to key a compressed leg off. Rejected alternatives are in ADR 0026 —
   * a `'montage'` `LocationType` (it would make every location-filtered event ineligible and
   * drop each montage leg to rung 5), and deriving montage from `legKm[i] >= THRESHOLD` (a
   * ferry crossing is one leg of 900 km and is emphatically not a montage — it is where
   * `ferry_boarding` lives).
   */
  readonly montageLegs: readonly number[];
};

/** The location of the current leg, or `roadside` if the route under-specifies. */
export function locationAtLeg(route: RouteState, legIndex: number): LocationType {
  return route.legLocations[legIndex] ?? 'roadside';
}
