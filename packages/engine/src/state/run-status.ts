/**
 * Where a run is in its lifecycle.
 *
 * `preparing` covers budget, gear, documents and cover story — the choices made before the
 * first leg. `travelling` is the leg loop. `ended` is terminal in both directions: arrival
 * and failure are the same status, distinguished by `unlockedEndings`.
 *
 * The loop returns a typed error rather than throwing when an entry point is called in the
 * wrong status, so a UI bug cannot corrupt a run.
 */
export const RUN_STATUSES = ['preparing', 'travelling', 'ended'] as const;

export type RunStatus = (typeof RUN_STATUSES)[number];
