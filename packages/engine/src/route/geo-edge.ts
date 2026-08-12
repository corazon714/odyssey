import { type EdgeId, type NodeId } from '../ids/content-ids.ts';
import { TRANSPORT_MODES, type TransportMode } from '../state/transport-state.ts';

/**
 * When a corridor is usable. Authored in the overlay for passes and ferries; `all_year`
 * otherwise, because the generator cannot infer a closure from geometry.
 */
export const SEASONALITY_KINDS = [
  'all_year',
  'summer_only',
  'winter_closed',
  'flood_risk',
] as const;

export type Seasonality = (typeof SEASONALITY_KINDS)[number];

/**
 * A corridor between two nodes. EVERY FIELD IS OURS — nothing here is extracted from a
 * licensed road database, which is the sentence `docs/geo-data-licensing.md` exists to
 * defend. Edges are synthesised geometrically from node coordinates and public-domain
 * polygons, then curated in `packages/content/geo/overlay.yaml`.
 *
 * `modes` is a 7-bit mask over `TRANSPORT_MODES` index order rather than its own vocabulary.
 * An `EDGE_MODES = ['road','rail','ferry',...]` list was rejected because it does not join to
 * `TRANSPORT_MODES` — there is no `road` mode and no `rail` mode in the engine — and a
 * mapping nobody defined is a mapping that drifts.
 *
 * **`adminBoundary` is a geometric fact, and that is the whole point** (ADR 0024 Decision 4).
 * It records that the segment crosses an administrative boundary. It does NOT record what
 * happens there. Combined with `viaCrossingNode` — derived from whether an endpoint is a
 * `border_crossing` node — it lets four route profiles mask out uncontrolled crossings while
 * `illicit` permits them. Difficulty comes from the PROFILE, exactly as CLAUDE.md 11 demands.
 * An earlier draft carried an `unofficialCrossing` boolean; that is a per-place danger index
 * at finer granularity than the per-country one 11 forbids, and it was cut.
 */
export type GeoEdge = {
  readonly id: EdgeId;
  readonly from: NodeId;
  readonly to: NodeId;
  /** Integer kilometres, always > 0. Precomputed by the build tool. */
  readonly distanceKm: number;
  /** 7-bit mask over `TRANSPORT_MODES` index order. Never empty. */
  readonly modes: number;
  /** 0-4. Physical difficulty of the ground, not of the people. */
  readonly terrainDifficulty: number;
  /** 0-3. Higher is more worth seeing. Drives the `scenic` profile only. */
  readonly scenic: number;
  readonly seasonality: Seasonality;
  /** Authored in the overlay. One of the four things that stops `cheapest` collapsing into `fastest`. */
  readonly tolled: boolean;
  /** GEOMETRIC: the segment crosses an admin polygon boundary. Says nothing about what is there. */
  readonly adminBoundary: boolean;
  /**
   * Hard ground with no way round it — `safest` refuses `terrainDifficulty >= 3` EXCEPT here.
   *
   * Without it that mask cut the European slice into 52 components, the largest holding 146 of
   * 221 nodes, and `safest` could reach its destination on 74 of 220 sampled pairs. A profile
   * that cannot arrive is not a safer route, it is an absent one, and the ladder then filled its
   * slot with a deviation of somebody else's path. A mask is a divergence mechanism only while
   * the masked graph stays connected — the same lesson `adminBoundary` learned above.
   *
   * Derived, never authored: a spanning forest over the hard edges seeded with the easy ones, so
   * everything NOT flagged is hard ground with a real alternative that `safest` still refuses.
   * `packages/tools/geo-build/mark-unavoidable.ts` computes it and says why at length.
   */
  readonly unavoidable: boolean;
};

export function modeMask(modes: readonly TransportMode[]): number {
  let mask = 0;
  for (const mode of modes) {
    const bit = TRANSPORT_MODES.indexOf(mode);
    if (bit >= 0) mask |= 1 << bit;
  }
  return mask;
}

export function hasMode(mask: number, mode: TransportMode): boolean {
  const bit = TRANSPORT_MODES.indexOf(mode);
  return bit >= 0 && (mask & (1 << bit)) !== 0;
}

export function modesOf(mask: number): readonly TransportMode[] {
  return TRANSPORT_MODES.filter((_, bit) => (mask & (1 << bit)) !== 0);
}
