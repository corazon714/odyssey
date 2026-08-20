import { mulDivRound } from '../modifiers/modifier-tunables.ts';
import { type TransportMode } from '../state/transport-state.ts';

/**
 * What a leg COSTS IN TIME, as a function of how far it covers and how you are travelling.
 *
 * This replaces a flat `HOURS_PER_LEG[mode]`, and the replacement is the reason M3.7 shipped
 * `legKm` on its own first: with distance per leg now variable, duration can stop being a
 * property of the transport mode alone.
 *
 * ## Why this is nearly free — the strongest structural result in the leg model
 *
 * `worldTick`'s drift is ALREADY denominated in hours rather than legs (ADR 0014, restated at
 * `world-tick.ts:19-27`: "TIME makes you hungry, not legs"). So the moment hours become a
 * function of distance, **montage drain becomes proportional with no new code** — the clock,
 * hunger via `spanPoints`, energy, health and `progressKm` all scale by themselves. Nothing in
 * this commit teaches them to; they were already reading the right quantity.
 *
 * ## The shape: an overhead plus a rate
 *
 * A journey is not distance ÷ speed. Waiting for a bus that comes twice a day, loading a truck,
 * clearing a ferry terminal — these cost hours that do not shrink on a short hop, and they are
 * why a 60 km leg by bus is not 20% of a 300 km one. `foot` is the only mode with **zero**
 * overhead, which is exactly right: walking has no schedule to wait for.
 *
 * Integer arithmetic via `mulDivRound`, never `km / kmh`. A float here would reach `advanceTime`
 * and therefore the clock, the digest and every golden run — the one place a platform-dependent
 * rounding difference would be least visible and most damaging (CLAUDE.md rule 2.3).
 */

/** Hours a leg costs before it covers any ground at all: waiting, loading, boarding, clearing. */
const LEG_OVERHEAD_HOURS: Readonly<Record<TransportMode, number>> = {
  foot: 0,
  bus: 3,
  train: 2,
  car: 4,
  truck: 4,
  ferry: 4,
  rideshare: 3,
};

/** Ground speed once moving. Door-to-door averages, not top speeds. */
const KMH: Readonly<Record<TransportMode, number>> = {
  foot: 4,
  bus: 50,
  train: 80,
  car: 70,
  truck: 50,
  ferry: 30,
  rideshare: 65,
};

/**
 * A leg cannot cost zero hours.
 *
 * The plan sketched a per-mode `MIN_LEG_HOURS` table. It collapses to this constant, and saying
 * so is better than shipping a second table that must agree with the first: every mode except
 * `foot` already has an overhead of 2 or more, so the floor can only ever bite on a very short
 * walk — `mulDivRound(1, 1, 4)` is 0, so a one-kilometre stroll would otherwise take no time and
 * advance the clock by nothing.
 */
const MIN_LEG_HOURS = 1;

/**
 * The ceiling, and why montage gets a different one.
 *
 * An ordinary leg is a day's travel; twelve hours is the honest cap on one. A MONTAGE leg is a
 * stretch the journal summarises rather than plays, so it is allowed to swallow a much longer
 * span — that is the whole point of compressing it.
 *
 * The cap is also what makes ADR 0026 Decision 6's known incoherence survivable rather than
 * absurd: if the truck is impounded and the player walks a leg planned at 450 km,
 * `0 + mulDivRound(450, 1, 4)` is 112 hours, and this clamps it to 12. Twelve hours to walk
 * 450 km is still wrong. It is recorded as an open incoherence with an owner, not fixed here —
 * the proper fix recomputes `legKm` on a mode change, which moves `legCount` and rebases the
 * beat schedule, which is the exact problem leg-as-time-slice was rejected for.
 */
const MAX_LEG_HOURS = 12;
const MAX_MONTAGE_HOURS = 30;

export function legHours(km: number, mode: TransportMode, montage: boolean): number {
  const travel = LEG_OVERHEAD_HOURS[mode] + mulDivRound(km, 1, KMH[mode]);
  const ceiling = montage ? MAX_MONTAGE_HOURS : MAX_LEG_HOURS;
  return Math.min(ceiling, Math.max(MIN_LEG_HOURS, travel));
}
