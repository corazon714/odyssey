/**
 * The physical character of a stretch of ground — never a judgement about the people on it.
 *
 * CLAUDE.md 11 and ADR 0024 Decision 4 are the constraint. Terrain is derived at build time
 * from elevation and Natural Earth's geography regions, both of which are physical facts. It
 * is the only per-place quantity the route generator reads, and it is deliberately the kind
 * that cannot encode a nationality: a mountain is a mountain on either side of a boundary.
 *
 * `sea` is a terrain rather than a mode so that a ferry edge has somewhere to say what it
 * crosses. It never appears on a settlement.
 */
export const TERRAIN_KINDS = [
  'plain',
  'hill',
  'mountain',
  'desert',
  'steppe',
  'forest',
  'coast',
  'marsh',
  'urban',
  'sea',
] as const;

export type TerrainKind = (typeof TERRAIN_KINDS)[number];
