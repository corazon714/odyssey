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
 *
 * ## Eight kinds, not ten — because two could not be filled
 *
 * `forest` and `marsh` were cut after measuring the classifier against all 34,078 real
 * candidates. Natural Earth's `geography_regions_polys` has no forest class at all, and its
 * three `Wetlands` polygons classified 112 candidates — which, after thinning to ~720 nodes,
 * is about two. No other licence-clean vector source fills either (ADR 0024 rules out OSM
 * landcover along with everything else ODbL).
 *
 * Keeping them would have meant an entry in `LEG_DENSITY_KM` and one in `TERRAIN_INTEREST`
 * that never fires — the same dead configuration `--stage=audit` exists to catch. A terrain a
 * node can never have is not expressiveness, it is a tuning knob wired to nothing.
 *
 * If a licence-clean landcover source ever appears, adding a member back is additive: the
 * schema derives from this array, so nothing downstream restates it.
 */
export const TERRAIN_KINDS = [
  'plain',
  'hill',
  'mountain',
  'desert',
  'steppe',
  'coast',
  'urban',
  'sea',
] as const;

export type TerrainKind = (typeof TERRAIN_KINDS)[number];
