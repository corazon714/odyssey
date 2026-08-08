/**
 * The structural moments a run is guaranteed to contain.
 *
 * This is shared vocabulary rather than content or state: a BeatSlot in RunState names one,
 * and M5's GameEvent declares which one it can fill. That is the whole coupling — a slot
 * never names an event (CLAUDE.md 2.1). The director filters the pool to events whose
 * beatType matches the due slot and picks among them with the seeded RNG, so the SHAPE of
 * a run is guaranteed while its CONTENT stays emergent.
 *
 * `departure` and `finale` bracket every run. `border_crossing` and `ferry_boarding` are
 * route-derived — they exist at the leg where the route actually crosses or boards.
 * `midpoint_crisis` and `approach` come from the pacing curve.
 */
export const BEAT_TYPES = [
  'departure',
  'border_crossing',
  'ferry_boarding',
  'midpoint_crisis',
  'approach',
  'finale',
] as const;

export type BeatType = (typeof BEAT_TYPES)[number];
