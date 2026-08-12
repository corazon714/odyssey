import { type TransportMode } from '../state/transport-state.ts';
import { type PopulationBand } from './geo-node.ts';

/**
 * The per-mode constants the five cost functions read. ADR 0025 Decision 1.
 *
 * Frozen `Record`s rather than arrays, and that is not an accident of style: an array exported
 * from anything the engine barrel re-exports is picked up by the conformance L2 sweep
 * (`conformance.test.ts:154`) and has to be classified as a content vocabulary or excused.
 * These are tuning tables, not vocabularies — nothing authors against them — so a `Record`
 * keyed by an existing vocabulary is the honest shape. (Choosing `Record` *to hide* from the
 * sweep would be the failure mode the sweep exists to prevent; the point is that these
 * genuinely are lookups keyed by `TransportMode`, which is already registered.)
 *
 * Every value is an integer. `KMH` is the one table shared with the run loop's hours model
 * (ADR 0026 Decision 5), and the two must not drift: a preview that promises six hours for a
 * leg the tick then charges nine is a lie the player can measure.
 */
export const KMH: Readonly<Record<TransportMode, number>> = Object.freeze({
  foot: 4,
  bus: 50,
  train: 80,
  car: 70,
  truck: 50,
  ferry: 30,
  rideshare: 65,
});

/**
 * Cash per 100 km.
 *
 * **`foot` being free was claimed here as one of the four things stopping `cheapest` collapsing
 * into `fastest`. It was the thing CAUSING the collapse.** Subsistence is charged against elapsed
 * time, time is distance over speed, so "no fare but a fortnight of subsistence" is still a term
 * proportional to distance and cannot reorder two paths. What it did instead was win the mode
 * comparison on every corridor at any length, which reduced `cheapest` to `0.23 x distance`
 * against `fastest`'s `0.86 x distance` — the same ordering in different units. Measured: the
 * identical path on 170 of 200 sampled pairs.
 *
 * Two things fixed it, and neither was a number in this table. `foot` is now offered only on
 * corridors short enough to walk (`FOOT_MAX_KM`), and `pickMode` scores the cash `cheapest`
 * actually pays rather than the fare alone.
 *
 * The breaker that then does the work is already here and had never been reachable: **`train` is
 * the fastest land mode and the dearest one.** `fastest` takes it and pays 0.75 per km where a
 * road costs 0.86; `cheapest` refuses it and pays 0.46 either way. So `fastest` detours onto rail
 * corridors and `cheapest` does not, which is a difference in the PATH rather than in the price.
 */
export const FARE_PER_100KM: Readonly<Record<TransportMode, number>> = Object.freeze({
  foot: 0,
  bus: 60,
  train: 90,
  car: 45,
  truck: 55,
  ferry: 120,
  rideshare: 50,
});

/** How exposed a mode leaves you. Read only by `safest`. */
export const MODE_EXPOSURE: Readonly<Record<TransportMode, number>> = Object.freeze({
  foot: 120,
  bus: 40,
  train: 10,
  car: 40,
  truck: 40,
  ferry: 30,
  rideshare: 40,
});

/**
 * How much a mode gets you looked at. Read only by `illicit`.
 *
 * `train` and `ferry` are high AND are masked out of `illicit` entirely — they are ticketed and
 * ID-checked. The values are kept so the table is total and so a future profile can read them.
 */
export const MODE_ATTENTION: Readonly<Record<TransportMode, number>> = Object.freeze({
  foot: 10,
  bus: 60,
  train: 200,
  car: 40,
  truck: 70,
  ferry: 200,
  rideshare: 50,
});

/** Settlement size as a cost to someone who does not want to be noticed. */
export const POP_ATTENTION: Readonly<Record<PopulationBand, number>> = Object.freeze({
  none: 0,
  hamlet: 5,
  small: 15,
  medium: 35,
  large: 70,
  metro: 120,
});

/**
 * A ferry fare is charged PER CROSSING, not per kilometre. Non-affine in distance, which is
 * precisely why it breaks the `fastest` ≡ `cheapest` collapse rather than merely softening it.
 */
export const FERRY_CROSSING_FEE = 90;

/** Authored per-edge in the overlay. The second structural breaker. */
export const TOLL_FEE = 25;

/**
 * A tolled corridor is a MOTORWAY, and a motorway is faster. Road modes only, as a percentage of
 * the mode's base speed — 110 km/h against a trunk road's 70.
 *
 * **This is the fastest-versus-cheapest divergence every satnav has, and it was missing.** A toll
 * cost `cheapest` 25 and gave `fastest` nothing, so it was pure downside: nobody had a reason to
 * want the tolled edge, and avoiding it cost `cheapest` nothing it had to weigh. A trade-off
 * needs both sides. With this, `fastest` routes onto the motorway and `cheapest` routes around
 * it, and that is a difference in the PATH rather than in the price.
 *
 * The rail inversion alone could not do this. `train` is 80 km/h against a car's 70 — a 12%
 * saving, worth a detour only if the rail corridor is under 12% longer, which it almost never
 * is. Measured: enabling it moved the identical-path count from 170 of 200 to 168.
 *
 * **`leg-hours.ts` must apply the same factor when it lands (ADR 0026 Decision 5).** `KMH` is
 * shared with the run loop and the two must not drift — a preview that promises five hours for a
 * motorway leg the tick then charges eight is a lie the player can measure.
 */
export const MOTORWAY_SPEED_PERCENT = 157;

/** Minutes lost at a controlled crossing. Worth ~150 km of motorway to `fastest`. */
export const CROSSING_MINUTES = 150;

/** Minutes spent waiting for a sailing, on top of the crossing itself. */
export const FERRY_WAIT_MINUTES = 240;

/** Cash per day of subsistence, charged against elapsed travel time by `cheapest`. */
export const SUBSISTENCE_PER_DAY = 22;

export const MINUTES_PER_DAY = 1440;
