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
