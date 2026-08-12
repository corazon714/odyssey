import { engineError, type EngineError } from '../errors/engine-error.ts';
import { type RouteState } from './route-state.ts';

/**
 * Reject an incoherent route before a run is built on it.
 *
 * Because the route is caller-supplied in Phase 1, this is the boundary where a bad one has
 * to be caught. A route with a beat scheduled past its last leg would otherwise produce a
 * slot that can never fill and a "beat missed" line in every sim report — a content bug
 * wearing the costume of a balance problem.
 *
 * Returns an error rather than throwing (see errors/engine-error.ts).
 */
export function validateRoute(route: RouteState): EngineError | null {
  if (route.nodes.length < 2) {
    return engineError('route/empty', { nodes: route.nodes.length });
  }

  if (route.edges.length !== route.nodes.length - 1) {
    return engineError('route/leg-count-mismatch', {
      nodes: route.nodes.length,
      edges: route.edges.length,
    });
  }

  if (route.legCount < 1) {
    return engineError('route/leg-count-mismatch', { legCount: route.legCount });
  }

  if (route.legLocations.length !== route.legCount) {
    // A short list would silently fall back to `roadside` for the tail of the route, turning
    // every border event into one that can never fire — a content bug wearing a balance
    // problem's clothes, which is exactly what this validator exists to catch early.
    return engineError('route/leg-count-mismatch', {
      legCount: route.legCount,
      legLocations: route.legLocations.length,
    });
  }

  if (route.legKm.length !== route.legCount) {
    return engineError('route/leg-count-mismatch', {
      legCount: route.legCount,
      legKm: route.legKm.length,
    });
  }

  // THE SUM IS THE POINT. `legKm` exists so distance can stop being uniform, and every consumer
  // from here on — `progressKm`, M3.8's `legHours`, the journal's total — assumes the parts add
  // up to the whole. A route whose legs sum to 2,139 of 2,140 km arrives one kilometre short
  // forever, which surfaces as a run that never completes rather than as a bad number.
  let sum = 0;
  for (const km of route.legKm) {
    if (!Number.isInteger(km) || km < 0) {
      return engineError('route/leg-distance-mismatch', { legKm: km });
    }
    sum += km;
  }
  if (sum !== route.totalKm) {
    return engineError('route/leg-distance-mismatch', { sum, totalKm: route.totalKm });
  }

  // Ascending and unique, so a consumer can binary-search or merge-walk it against the beat
  // schedule without sorting a persisted array on every read.
  let previousMontage = -1;
  for (const leg of route.montageLegs) {
    if (!Number.isInteger(leg) || leg < 0 || leg >= route.legCount) {
      return engineError('route/montage-out-of-range', { leg, legCount: route.legCount });
    }
    if (leg <= previousMontage) {
      return engineError('route/montage-out-of-range', { leg, previous: previousMontage });
    }
    previousMontage = leg;
  }

  const seenLegs = new Set<number>();
  for (const slot of route.beatSchedule) {
    if (!Number.isInteger(slot.legIndex) || slot.legIndex < 0 || slot.legIndex >= route.legCount) {
      return engineError('route/beat-out-of-range', {
        beatType: slot.type,
        legIndex: slot.legIndex,
        legCount: route.legCount,
      });
    }
    if (seenLegs.has(slot.legIndex)) {
      return engineError('route/duplicate-beat-leg', {
        legIndex: slot.legIndex,
        beatType: slot.type,
      });
    }
    seenLegs.add(slot.legIndex);
  }

  return null;
}
