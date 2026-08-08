import { type Relaxation } from './hard-filters.ts';

/**
 * The fallback ladder. An empty eligible pool WILL happen; this is the designed response.
 *
 * Ordered by what each relaxation costs the player. The beat gate goes first because a beat
 * slot can absorb the miss by sliding, whereas firing an event whose context is wrong is a
 * coherence failure that cannot be undone. `locationTypes` goes last of the context gates
 * because place is the constraint a player most obviously notices being violated.
 *
 * TWO GATES ARE ABSENT FROM EVERY RUNG, and that is the point of the type:
 *
 *   `requires`        — the correctness boundary. An event needing a passport you do not have
 *                       must not fire, however desperate the ladder gets.
 *   `maxOccurrences`  — authored intent ("this happens once per run"), not a pacing hint.
 *                       Relaxing it produces exactly the incoherence the ladder exists to
 *                       avoid.
 *
 * `relaxation-ladder.test.ts` asserts both across all rungs, against a pack whose only event
 * is unsatisfiable.
 */
export const RELAXATION_RUNGS: readonly Relaxation[] = [
  // 0 — nothing relaxed.
  {
    beatGate: false,
    exclusiveGroup: false,
    softContext: false,
    cooldown: false,
    locationTypes: false,
  },
  // 1 — the beat gate. A slot that cannot be filled slides rather than forcing a bad event.
  {
    beatGate: true,
    exclusiveGroup: false,
    softContext: false,
    cooldown: false,
    locationTypes: false,
  },
  // 2 — exclusiveGroup: allow a second event from a group already claimed this leg.
  {
    beatGate: true,
    exclusiveGroup: true,
    softContext: false,
    cooldown: false,
    locationTypes: false,
  },
  // 3 — soft context: time of day, transport, weather, route profile.
  {
    beatGate: true,
    exclusiveGroup: true,
    softContext: true,
    cooldown: false,
    locationTypes: false,
  },
  // 4 — cooldown. A repeat is now allowed; the recency FACTOR still makes it unlikely.
  { beatGate: true, exclusiveGroup: true, softContext: true, cooldown: true, locationTypes: false },
  // 5 — location. The last context gate to go.
  { beatGate: true, exclusiveGroup: true, softContext: true, cooldown: true, locationTypes: true },
];

/** Rung 6 is the filler pool, rung 7 is `uneventful`; neither is expressed as a Relaxation. */
export const FILLER_RUNG = RELAXATION_RUNGS.length;
export const UNEVENTFUL_RUNG = FILLER_RUNG + 1;
