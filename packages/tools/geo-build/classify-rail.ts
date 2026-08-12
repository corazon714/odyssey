import { interpolate, type LatLng } from './geodesy.ts';
import { nearestVertexKm, type VertexIndex } from './vertex-index.ts';

/**
 * Whether a corridor supports `train` — a test on the WHOLE corridor, not on its two ends.
 *
 * ## The bug this replaces, measured
 *
 * The predicate was "a railway passes within a quarter-degree of each endpoint". In Europe every
 * settlement over 15,000 people has a railway that close, so it was true almost everywhere:
 * **247 of 265 edges, 93%**, against the ~13% minority ADR 0025 assumed when it named `train`
 * one of the four structural breakers between `fastest` and `cheapest`. A mode available on
 * every edge cannot differentiate two profiles — `pickMode` simply chose it on both sides of
 * every comparison, and the breaker was inert.
 *
 * Two ends being on the rail network says nothing about whether a line runs BETWEEN them. Paris
 * and Palermo are both served; there is no direct train. So the corridor is sampled, and a
 * majority of the samples must lie near a line. That is the test the phase plan specified and
 * that was never built.
 *
 * ## It is a proximity predicate and nothing more
 *
 * Natural Earth's `ne_10m_railroads` is a display-scale layer: no gauge, no electrification, no
 * services, no timetable. It supports "a railway runs along here" and refuses to support
 * anything finer, which is exactly what ADR 0024 says about using it. `train` on an edge means
 * a line follows that corridor, never that a service exists on it.
 *
 * Nothing here reads a country. Sampling a great circle and measuring distance to a vertex is
 * geometry. CLAUDE.md 11.
 */

/**
 * A node is on the network when a line passes this close. The worse endpoint of a land edge sits
 * within 20 km on 90% of the slice, so this gate alone removes only the genuinely unserved.
 */
export const RAIL_STATION_KM = 20;

/**
 * A sample counts as following a line when one passes this close.
 *
 * **Ten kilometres, and not tuned to a target.** Our edges are great circles while a real road
 * wanders — the measured circuity factor is 1.39 — so a tolerance tight enough to track the road
 * itself would reject corridors that plainly carry rail. Ten kilometres is roughly the scale at
 * which a line and a road are the same corridor through the same valley or pass, and it is wide
 * enough to survive the straight-line approximation.
 *
 * The measured sweep, on 257 land edges of the European slice, share of edges carrying `train`:
 *
 * ```
 *   km      7 of 9    8 of 9
 *    5        22%       13%
 *    8        42%       33%
 *   10        53%       41%     <- 10 km / 8 of 9
 *   15        69%       62%
 *   30        86%       84%
 * ```
 *
 * **ADR 0025's "`train` on ~380 of ~3,000 edges, a minority" does not survive contact with the
 * data, and should be read as the planet-scale guess it was.** It was written before any geometry
 * existed. Europe has the densest rail network on Earth: the interior samples of a slice edge sit
 * a MEDIAN 5.7 km from a line. Forcing 13% here would mean deleting real railways to hit a number
 * in a document. 41% is what this ground actually looks like, and the discrimination that matters
 * came from replacing an endpoint test with a corridor test — 93% to 41% — not from the constant.
 */
export const RAIL_CORRIDOR_KM = 10;

/**
 * Interior samples per corridor. Nine, matching `WATER_SAMPLES` — the same trade-off against the
 * same layer resolution, and a second sampling constant that could drift from the first would be
 * two numbers where the reason for them is one.
 */
export const RAIL_SAMPLES = 9;

/**
 * How many of those must follow a line. A COUNT rather than a percentage on purpose: with nine
 * samples only 11, 22, 33 … are reachable, so a "60%" constant would silently mean 66% and the
 * next reader would have to rediscover that.
 */
export const RAIL_SAMPLES_REQUIRED = 8;

/**
 * Endpoints are excluded from the sampling, as in `landFractionPercent` and for the same reason:
 * they are already tested, by a tighter threshold, and counting them twice would let two
 * well-served cities carry a corridor that has no line along any of its middle.
 */
export function railFollowsCorridor(index: VertexIndex, a: LatLng, b: LatLng): boolean {
  if (nearestVertexKm(index, a) > RAIL_STATION_KM) return false;
  if (nearestVertexKm(index, b) > RAIL_STATION_KM) return false;

  let following = 0;
  for (let i = 1; i <= RAIL_SAMPLES; i += 1) {
    const point = interpolate(a, b, i / (RAIL_SAMPLES + 1));
    if (nearestVertexKm(index, point) <= RAIL_CORRIDOR_KM) following += 1;
  }
  return following >= RAIL_SAMPLES_REQUIRED;
}
