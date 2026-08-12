import { type BeatType } from '../content/beat-type.ts';
import { type LocationType } from '../content/location-type.ts';
import { mulDivRound } from '../modifiers/modifier-tunables.ts';
import { drawWord } from '../rng/draw-word.ts';
import { deriveKey, streamKey } from '../rng/stream-key.ts';
import { type BeatSlot } from '../state/beat-slot.ts';
import { type RouteProfile } from '../state/route-state.ts';
import { type LegPlan, type LegSegment } from './leg-plan.ts';

/**
 * The beat schedule, derived from the route (ADR 0027).
 *
 * Beats are the only place the director is told "something of this kind should happen around
 * here". Everything else it does is emergent, so a schedule that is quietly wrong shows up as
 * content starvation rather than as a scheduling bug — which is exactly what happened to the
 * shipped `fixture.illicit`, and why the four invariants below are enforced HERE.
 */

/** More than four border beats is a route made of paperwork. */
const MAX_BORDER_BEATS = 4;

/**
 * Where a beat's events can actually fire.
 *
 * Only `border_crossing` is constrained, and only because its slack-1 window spans two legs. A
 * slack-0 slot is one leg chosen for that leg's own reason, and the curve beats
 * (`midpoint_crisis`, `approach`) are deliberately unconstrained — they are about WHEN, not
 * where.
 */
const BEAT_LOCATIONS: Partial<Record<BeatType, readonly LocationType[]>> = {
  border_crossing: ['border_crossing', 'checkpoint'],
};

export type BeatContext = {
  readonly seed: string;
  readonly startNodeId: string;
  readonly endNodeId: string;
  readonly profile: RouteProfile;
};

type Candidate = {
  readonly legIndex: number;
  readonly type: BeatType;
  readonly slackLegs: number;
};

/**
 * A cursor-free draw in `[-span, span]`.
 *
 * MANDATORY, not stylistic (ADR 0027 Decision 4). The NUMBER of jitter draws a route needs
 * depends on how many beats it has, which depends on the graph — so a cursored draw would make
 * `routeGen`'s cursor a function of geography, and editing the map would move every save
 * fixture. Addressing by label instead means generation consumes nothing.
 *
 * Rejection sampling rather than `% range`, matching `nextInt`: the ranges here are 3 and 5, and
 * a biased jitter is precisely the defect a sim report cannot tell apart from bad content.
 */
function jitter(key: number, span: number): number {
  const range = 2 * span + 1;
  const limit = Math.floor(0x1_0000_0000 / range) * range;
  for (let counter = 0; counter < 64; counter += 1) {
    const word = drawWord(key, counter);
    if (word < limit) return (word % range) - span;
  }
  return 0;
}

export function deriveBeatSchedule(
  plan: LegPlan,
  segments: readonly LegSegment[],
  locations: readonly LocationType[],
  ctx: BeatContext,
): readonly BeatSlot[] {
  const { legCount } = plan;
  if (legCount <= 0) return [];

  const base = streamKey(ctx.seed, 'routeGen');
  const label = (type: BeatType): string =>
    `${ctx.startNodeId}>${ctx.endNodeId}:${ctx.profile}:beat:${type}`;
  const clampLeg = (leg: number): number => Math.max(0, Math.min(legCount - 1, leg));

  const candidates: Candidate[] = [{ legIndex: 0, type: 'departure', slackLegs: 0 }];

  // ── structural beats: they exist because the ROUTE has that feature ──────────────────
  let borders = 0;
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    const arrival = plan.arrivalLegOfEdge[i];
    if (segment === undefined || arrival === undefined) continue;

    if (segment.ferry) {
      candidates.push({ legIndex: arrival, type: 'ferry_boarding', slackLegs: 0 });
      continue;
    }

    if (locations[arrival] !== 'border_crossing' || borders >= MAX_BORDER_BEATS) continue;
    borders += 1;
    // Anchored on the CHECKPOINT leg, not the crossing leg, so the slack-1 window is exactly
    // {checkpoint, border_crossing} — both eligible. Anchoring on the crossing itself would put
    // the second half of the window on whatever follows the border, which is not.
    candidates.push(
      arrival >= 1
        ? { legIndex: arrival - 1, type: 'border_crossing', slackLegs: 1 }
        : { legIndex: arrival, type: 'border_crossing', slackLegs: 0 },
    );
  }

  // ── curve beats: they exist because the route has a SHAPE ────────────────────────────
  // The 50/100 and 83/100 fractions reproduce all five curve beats in all three fixtures
  // exactly — but so do 48-52 and 82-84, so they are a decision consistent with the fixtures
  // rather than a recovered constant (ADR 0027 Decision 2).
  candidates.push({
    legIndex: clampLeg(
      mulDivRound(legCount, 50, 100) + jitter(deriveKey(base, label('midpoint_crisis')), 2),
    ),
    type: 'midpoint_crisis',
    slackLegs: legCount >= 20 ? 3 : 2,
  });

  // Threshold 14 rather than 16 deliberately: 16 is the short-trip cap, and a threshold on a
  // mode boundary invites an off-by-one that only appears on exactly-16-leg routes.
  if (legCount >= 14) {
    candidates.push({
      legIndex: clampLeg(
        mulDivRound(legCount, 83, 100) + jitter(deriveKey(base, label('approach')), 1),
      ),
      type: 'approach',
      slackLegs: 2,
    });
  }

  candidates.push({ legIndex: legCount - 1, type: 'finale', slackLegs: 0 });

  return admit(candidates, plan, locations);
}

/**
 * The four invariants, enforced here because `validateRoute` checks NONE of them.
 *
 * (a) **Ascending emission.** `dueBeatSlot` scans ARRAY ORDER (`beat-slots.ts:27-32`), not
 *     lowest `legIndex`, and nothing validates ordering — so an out-of-order schedule silently
 *     lets a later beat win.
 * (b) **Non-overlapping windows.** `advanceBeatSchedule` slides or expires EVERY open slot each
 *     leg while `dueBeatSlot` offers only the first, so an overlapped slot is marked `slid`
 *     without ever being attempted. **This is already violated by the shipped `fixture.illicit`**
 *     (`border_crossing@17 slack 3` vs `approach@20`) and every such collision reports as content
 *     starvation. It is NOT added to `validateRoute` — that would invalidate the fixture, break
 *     13 test files and move the control baseline.
 * (c) **The whole window must be location-eligible**, not just `legIndex` — the beat gate passes
 *     at rung 1 while `locationTypes` relaxes last at rung 5.
 * (d) **No window may intersect a montage leg**, again the whole window.
 *
 * Structural beats are admitted first and curve beats yield to them: a border crossing is a
 * thing that IS on the route, while `approach` is a preference about pacing.
 */
function admit(
  candidates: readonly Candidate[],
  plan: LegPlan,
  locations: readonly LocationType[],
): readonly BeatSlot[] {
  const montage = new Set(plan.montageLegs);
  const PRIORITY: readonly BeatType[] = [
    'departure',
    'finale',
    'ferry_boarding',
    'border_crossing',
    'midpoint_crisis',
    'approach',
  ];

  const ordered = [...candidates].sort((a, b) => {
    const p = PRIORITY.indexOf(a.type) - PRIORITY.indexOf(b.type);
    return p !== 0 ? p : a.legIndex - b.legIndex;
  });

  const accepted: Candidate[] = [];
  for (const candidate of ordered) {
    const from = candidate.legIndex;
    const to = candidate.legIndex + candidate.slackLegs;
    if (from < 0 || to >= plan.legCount) continue;

    // (d) — the whole window, not just legIndex.
    let blocked = false;
    for (let leg = from; leg <= to && !blocked; leg += 1) blocked = montage.has(leg);
    if (blocked) continue;

    // (c) — the whole window, for the beats that are location-constrained.
    const allowed = BEAT_LOCATIONS[candidate.type];
    if (allowed !== undefined) {
      const ok = new Set<LocationType>(allowed);
      for (let leg = from; leg <= to && !blocked; leg += 1) {
        const at = locations[leg];
        blocked = at === undefined || !ok.has(at);
      }
      if (blocked) continue;
    }

    // (b) — windows may not touch, and `validateRoute` separately forbids a duplicate legIndex.
    const overlaps = accepted.some(
      (other) => from <= other.legIndex + other.slackLegs && other.legIndex <= to,
    );
    if (overlaps) continue;

    accepted.push(candidate);
  }

  // (a) — ascending emission, because `dueBeatSlot` reads array order rather than legIndex.
  return accepted
    .sort((a, b) => a.legIndex - b.legIndex)
    .map((c): BeatSlot => ({
      legIndex: c.legIndex,
      type: c.type,
      slackLegs: c.slackLegs,
      status: 'pending',
    }));
}
