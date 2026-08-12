import { type LocationType } from '../content/location-type.ts';
import { type LegPlan, type LegSegment } from './leg-plan.ts';

/**
 * What kind of place each leg passes through — one entry per leg.
 *
 * `validateRoute` rejects a length mismatch, and it does so because a short list silently falls
 * back to `roadside` for the tail of the route, turning every border event into one that can
 * never fire. That is a content bug wearing a balance problem's clothes.
 *
 * **A `GeoNode.type` IS a `LocationType`** (ADR 0024), not a parallel vocabulary, so this is a
 * direct read rather than a mapping table that would drift. These are TYPES, never places
 * (CLAUDE.md §11) — there is nowhere here to put a nationality.
 *
 * Consumes `LegPlan.arrivalLegOfEdge` rather than recomputing it: one allocator, two consumers
 * (ADR 0027 Decision 1).
 */

/**
 * Where a leg is when it is between two nodes rather than arriving at one.
 *
 * A long segment covers several legs; only the last of them reaches the node. The rest are on
 * the road, and which KIND of road is the terrain's business. `wilderness` for ground with
 * nobody on it, `roadside` otherwise — both already appear in the fixture routes, so no event
 * pool changes shape because of this choice.
 */
const IN_TRANSIT: Readonly<Record<string, LocationType>> = {
  desert: 'wilderness',
  steppe: 'wilderness',
  mountain: 'wilderness',
  sea: 'wilderness',
};

export function deriveLegLocations(
  segments: readonly LegSegment[],
  plan: LegPlan,
): readonly LocationType[] {
  const out: LocationType[] = new Array<LocationType>(plan.legCount).fill('roadside');

  let firstLeg = 0;
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    const arrival = plan.arrivalLegOfEdge[i];
    if (segment === undefined || arrival === undefined) continue;

    // Every leg this segment covers except the last is in transit on it.
    for (let leg = firstLeg; leg < arrival; leg += 1) {
      out[leg] = IN_TRANSIT[segment.terrain] ?? 'roadside';
    }
    out[arrival] = segment.arrivalType;
    firstLeg = arrival + 1;
  }

  return applyCrossingApproach(out);
}

/**
 * INVARIANT (c), the half of it that belongs to locations.
 *
 * A border slot carries slack 1, so its window is two legs — and both of them have to be legs
 * where border events are location-eligible, or the beat gate passes (filter 3) while the
 * location filter (filter 4) rejects every border event. That failure is silent and asymmetric:
 * `beatGate` relaxes at rung 1 of the ladder while `locationTypes` relaxes LAST at rung 5, so by
 * the time location opens up the slot no longer gates anything.
 *
 * The fix is to type the leg BEFORE a crossing as `checkpoint`. Border content already accepts
 * it — `border/night_crossing.yaml` declares `locationTypes: [border_crossing, checkpoint]` —
 * so this widens the eligible window without touching a single event.
 *
 * It does NOT require the crossing edge to own two legs, which is what makes it safe: the
 * preceding leg may belong to the previous segment, and overriding its type is the point.
 */
function applyCrossingApproach(locations: readonly LocationType[]): readonly LocationType[] {
  const out = [...locations];
  for (let leg = 1; leg < out.length; leg += 1) {
    if (out[leg] !== 'border_crossing') continue;
    if (out[leg - 1] === 'border_crossing') continue;
    out[leg - 1] = 'checkpoint';
  }
  return out;
}

/** Legs on which a beat of this type could find a location-eligible event. */
export function eligibleLegsFor(
  locations: readonly LocationType[],
  types: readonly LocationType[],
): ReadonlySet<number> {
  const allowed = new Set<LocationType>(types);
  const out = new Set<number>();
  locations.forEach((location, leg) => {
    if (allowed.has(location)) out.add(leg);
  });
  return out;
}
