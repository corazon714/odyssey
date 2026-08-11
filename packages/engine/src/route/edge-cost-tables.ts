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
 * Cash per 100 km. `foot` is free, which is deliberate and is one of the four things that stop
 * `cheapest` collapsing into `fastest`: walking has no fare but accrues a fortnight of
 * subsistence, so the cheapest path is not the shortest one.
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

/** Minutes lost at a controlled crossing. Worth ~150 km of motorway to `fastest`. */
export const CROSSING_MINUTES = 150;

/** Minutes spent waiting for a sailing, on top of the crossing itself. */
export const FERRY_WAIT_MINUTES = 240;

/** Cash per day of subsistence, charged against elapsed travel time by `cheapest`. */
export const SUBSISTENCE_PER_DAY = 22;

export const MINUTES_PER_DAY = 1440;
