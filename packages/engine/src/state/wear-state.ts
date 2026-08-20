import { type HistoryEntry } from './history-entry.ts';

/**
 * The run's TRAVEL clock, and the one chip the wear curve owes the player.
 *
 * ## Why this is a second clock rather than a derivation
 *
 * `clock` is the WALL clock (`day * 24 + hour`) and it counts every hour a run spends,
 * including the ones an event charges through `advanceTime`. Measured, it runs at roughly
 * twice travel time — a 144-travel-hour fixture route reaches day 12, about 288 wall hours.
 * The drain curve is a statement about how long you have been ON THE ROAD, so it needs the
 * other number.
 *
 * **It cannot be derived from what the run already carries**, and that was checked before the
 * field was added rather than assumed. A leg's duration is
 * `legHours(legKm[i], transport.mode, montage) + rng.nextInt(...)`, so recovering the total
 * would need (a) the per-leg distances — available, (b) the transport MODE AT EACH LEG — only
 * the current mode is in state and a `transport` effect can change it mid-run, and (c) the
 * per-leg jitter, which is an RNG draw sharing the `worldTick` cursor with the weather reroll
 * and is therefore not reconstructible without replaying the whole run. `progressKm` is
 * kilometres and answers a different question; wall time minus event time is unavailable
 * because event time is never accumulated separately.
 *
 * `hours` is RAW travel hours. The compression lives in `worn()` (`loop/wear-curve.ts`), which
 * is applied at the point of drain — storing a pre-compressed figure would bake today's
 * `FULL_UNTIL` into every save and make the sweep unsweepable.
 */
export type WearState = {
  /** Cumulative RAW travel hours. Never wall-clock hours; never kilometres. */
  readonly hours: number;
  /**
   * The i18n key for the band-change chip this leg earned, or null on every other leg.
   *
   * Design pillar 2, and it is not decoration: a non-stationary drain economy the player
   * cannot see is an invisible subsidy. Rewritten by `worldTick` every leg — the chip belongs
   * to the leg that crossed, not to the run — and cleared by `advanceLeg` alongside
   * `presentation` so a run that ENDS on its arrival check cannot show a stale one.
   */
  readonly chipKey: string | null;
};

export function createWear(): WearState {
  return { hours: 0, chipKey: null };
}

/**
 * How hard the drain bites, as a band of the travel clock.
 *
 * `full` is the identity band — below the knee nothing is compressed at all, which is what
 * makes a short route bit-identical to the pre-curve engine.
 *
 * NOT a content vocabulary. Nothing authored may name a band: the curve is engine balance,
 * and an event that fired on "the tail band" would be an event keyed on how tired the drain
 * economy thinks you are, which is exactly the coupling that would make the sweep unrunnable.
 * The barrel export is classified under `NOT_CONTENT` in the L2 sweep for that reason.
 */
export const WEAR_BANDS = ['full', 'mid', 'tail'] as const;
export type WearBand = (typeof WEAR_BANDS)[number];

/**
 * The journal line and the result-screen chip a band change leaves, DERIVED from the band
 * rather than tabulated (CLAUDE.md 2.4 — keys are derived from ids).
 *
 * BOTH FAMILIES STAY OUT OF `i18n/en/`, exactly as ADR 0029's `journal.leg.quiet` and
 * `director.quiet.gate` do. There is not one `journal.*` or `world.*` key there today and
 * `requiredKeys()` cannot generate one, so adding them turns `locale.test.ts`'s orphan
 * assertion red on the same commit.
 */
export function wearJournalKey(band: WearBand): string {
  return `journal.wear.${band}`;
}

export function wearChipKey(band: WearBand): string {
  return `world.wear.${band}`;
}

/**
 * True when a history entry is a wear NOTE rather than a leg verdict.
 *
 * This exists because `eventId === null` is overloaded. It used to mean exactly one thing —
 * "no event fired on this leg" — and `tension.ts`'s streak reads it as a rule rather than a
 * guard. A wear note also carries `eventId: null` but says nothing about what fired: a band
 * change can land on the same leg as a high-tension event. Without this predicate the note
 * would silently end the consecutive-high-tension streak, which is a director behaviour
 * change smuggled in under a legibility feature.
 *
 * Keyed on the textKey because that is the only thing that distinguishes them, and a
 * `kind` discriminant on `HistoryEntry` would have to be back-filled onto every entry of
 * every save in the wild for a distinction only one reader needs.
 */
export function isWearNote(entry: HistoryEntry): boolean {
  return (
    entry.eventId === null && WEAR_BANDS.some((band) => wearJournalKey(band) === entry.textKey)
  );
}
