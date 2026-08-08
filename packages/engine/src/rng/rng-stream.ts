/**
 * The named substreams. Every draw in the engine names one.
 *
 * The first seven come from docs/engine-spec.md 5. `chanceGate` is an addition, and the
 * reason is worth recording: a `{ chance: p }` predicate that drew from `eventPick` would
 * make the NUMBER of draws depend on how many events the director evaluated, so adding a
 * single event to the content pack would shift every subsequent draw and invalidate every
 * golden run — precisely the failure this whole design exists to prevent. `chanceGate` is
 * addressed by a content-derived index rather than a cursor (see deriveKey in
 * stream-key.ts), so it never advances at all. See docs/adr/0005.
 *
 * Adding a stream here is a breaking change to the save format: RngCursors gains a key, so
 * SAVE_VERSION must be bumped and a migration written.
 */
export const RNG_STREAMS = [
  'eventPick',
  'outcomeRoll',
  'skillCheck',
  'npcGen',
  'encounterFlavor',
  'worldTick',
  'routeGen',
  'chanceGate',
] as const;

export type RngStream = (typeof RNG_STREAMS)[number];
