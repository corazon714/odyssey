/**
 * The kind of place a leg passes through — never a specific place.
 *
 * CLAUDE.md 11 is the constraint: geography is real, character is not. An event fires at
 * "a border crossing", never at a named country's border, and no data file carries a
 * per-country danger index. Difficulty comes from the route PROFILE and the player's STATE.
 *
 * Keeping this list of TYPES rather than of places is what makes that rule enforceable
 * instead of aspirational: there is nowhere to put a nationality.
 */
export const LOCATION_TYPES = [
  'border_crossing',
  'checkpoint',
  'city',
  'town',
  'village',
  'roadside',
  'rest_stop',
  'station',
  'port',
  'wilderness',
] as const;

export type LocationType = (typeof LOCATION_TYPES)[number];
