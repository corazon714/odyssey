import { mulDivRound } from '../modifiers/modifier-tunables.ts';
import { type HistoryEntry } from '../state/history-entry.ts';
import { type RunState } from '../state/run-state.ts';
import { wearJournalKey, type WearBand } from '../state/wear-state.ts';

/**
 * The wear curve: the drain economy stops being stationary.
 *
 * ## What it is
 *
 * Drain runs at FULL rate for the first `FULL_UNTIL` travel hours, at half rate for the next
 * `MID_SPAN`, and at a quarter rate thereafter. `worn(h)` is the EFFECTIVE drain hours a run
 * has bought with `h` real travel hours, and every drain in `world-tick.ts` charges the SPAN
 * `worn(travel + hours) − worn(travel)` instead of `hours`.
 *
 * ## Why the span and not the base — the naive version is wrong
 *
 * The obvious change is to swap `spanPoints`' base from `elapsedHours(state)` to the travel
 * accumulator. That is wrong. `elapsedHours` is the WALL clock and includes the hours events
 * charge, so it runs at about twice travel time (measured: a 144-travel-hour fixture route
 * reaches day 12, ~288 wall hours). Swapping the base would change the PHASE of every
 * `spanPoints` call on every route — including all three fixtures, which sit entirely below
 * the knee and must stay bit-identical.
 *
 * Keeping the wall-clock phase and compressing only the span LENGTH makes the sub-knee case
 * the exact identity: `worn` is `h ↦ h` there, so the span is `hours` and every draw, every
 * point and every clamp is unchanged.
 *
 * The cost of that choice, stated rather than discovered: once compression bites, the spans no
 * longer TILE the wall-clock axis, so `spanPoints`' remainder-carry — "summed over a contiguous
 * sequence the total is `floor(total / per)`" — stops being exact past the knee. It was already
 * inexact in `worldTick` for a different reason (event hours advance `elapsed` without any span
 * being charged), and the property is a fact about `spanPoints`, which still holds. Past the
 * knee the drain is a rate, not a ledger.
 *
 * ## Integer arithmetic, no exceptions
 *
 * Every step is `mulDivRound`, which is exact integer arithmetic (ADR 0012 §3). A float here
 * would reach a resource delta and therefore the digest and every golden run — the one place a
 * platform-dependent rounding difference between V8 and Hermes would be least visible and most
 * damaging (CLAUDE.md rule 2.3).
 *
 * ## Shape properties this file guarantees, and `wear-curve.test.ts` pins
 *
 *   - `worn` is monotone non-decreasing, and integer for integer input.
 *   - `worn(h) === h` for every `h <= FULL_UNTIL`.
 *   - `worn(a + b) − worn(a) <= b` for all non-negative `a`, `b` — the slope never exceeds 1,
 *     so a leg can never cost MORE than it did before the curve existed.
 *   - It is the identity function outright when `FULL_UNTIL` exceeds the longest route.
 */

/**
 * The KNEE, in travel hours — and the only dial the sweep turns.
 *
 * **SWEPT AND CHOSEN AT M3.12b: 200.** Measured on the real engine over
 * `{140, 160, 180, 200, 240}` plus a no-curve control, 2,000 runs per cell on the full 25 × 5
 * corpus grid, scored on the surviving acceptance — NO ROUTE BELOW 3% completion, a run
 * nobody can finish being design pillar 4's dead end:
 *
 *   knee   pooled   routes <3%   routes in 30–50%   worst route
 *   140    51.0%    0            4                  14.2%   <- pooled OUT of band
 *   160    47.9%    0            5                   9.3%
 *   180    45.1%    0            6                   6.2%
 *   200    42.7%    0            7                   4.8%   <- chosen
 *   240    38.7%    4            6                   1.2%   <- fails acceptance
 *   none   36.0%    7            5                   0.0%
 *
 * 140 puts pooled completion above the 30–50% band; 240 and the control leave routes on the
 * floor. Of the three survivors 200 is the highest, which is the stated tie-break — a higher
 * knee applies the curve to less of the corpus — AND it wins on its own merits: it disturbs
 * the routes that were ALREADY healthy least (+26pp summed over the five in-band routes,
 * against 160's +58pp), because lifting a route that already completes toward the ceiling is
 * a cost rather than a benefit. It also leaves the most room under the band's ceiling for a
 * registry row to do work.
 *
 * **The analytic model that predicted 143–178 h was a LOWER bound and is superseded.** It
 * computed `P(S > worn(R))` holding survival invariant in drain-hours; the real engine does
 * far better, because under the curve the same events fire at the same legs but at lower
 * drain-hours, so a run collects more recovery per drain-hour than the model allowed. Measured
 * against predicted on the seven doomed routes: 4.8–16.6% against 0.7–14.4%.
 *
 * Two things the model already establishes, which constrain what a sweep of this constant can
 * be expected to do:
 *
 *   1. **Morale binds on every doomed route** — median survival 165 h to `gave_up` against
 *      279 h to `collapsed`, because morale starts at 7 (`createResources`) and its wall
 *      therefore precedes health's. Any registry graft that ships alongside this curve wants
 *      to be a MORALE row.
 *   2. **This curve buys hours; it does not redirect the failure.** Every drain is
 *      `spanPoints` over one accumulator, so compressing the span compresses every meter
 *      identically and the exhaustion ORDER is invariant. The single exception is energy's
 *      `+ (harsh ? 1 : 0)`, which is charged per leg OUTSIDE `spanPoints` and is deliberately
 *      left alone here.
 *
 * **The fixtures are NOT all below this knee, and the assumption that they were is wrong.**
 * A route's STATIC hour total (`sum(legHours(legKm[i], startMode, montage))`) is 50 / 80 / 144
 * for short / scenic / illicit, which is where the ≤144 h reading comes from. What a run
 * actually accumulates is a different number, because `legHours` is a function of the mode the
 * run is in WHEN THE LEG IS TRAVELLED, and a `transport` effect can change it mid-run — plus
 * `LEG_JITTER` adds a mean +0.5 h a leg. Measured over the nine golden runs:
 *
 *   fixture.short    54 / 54 / 55 h    → `full` throughout
 *   fixture.illicit  83 / 155 / 155 h  → `full` throughout
 *   fixture.scenic  161 / 181 / 187 h  → `full` throughout AT 200; crossed into `mid` at 160
 *
 * **At the chosen knee ALL NINE goldens are below it, and that is a stated cost of choosing
 * 200 rather than a happy accident.** At 160 the scenic runs crossed into `mid` and three of
 * the nine exercised the bend; at 200 none do. What the golden set proves is now only the
 * IDENTITY claim — measured, and it is exact: regenerating at 200 moved the nine digests and
 * nothing else, no history key, no leg count, no ending, because `RunState` gained a field.
 * `sim:diff --pack=fixture` prints no line at all. The BEND is proved by `wear-curve.test.ts`'s
 * `bends` case and by the corpus, where seven routes run 420–547 h and live in `tail`.
 */
export const FULL_UNTIL = 200;

/** How long the half-rate band runs before the tail takes over. */
export const MID_SPAN = 120;

/**
 * The two reduced rates, as exact fractions. The tail stays at a quarter for now: step 2
 * measured the tail band as worth ±0.5pp against the knee's ~5pp, so it is not what this
 * sweep is about, and moving both at once is how ADR 0035's conservation result got measured
 * three times before anyone noticed the levers were deleting each other's failure mode.
 */
const MID_NUM = 1;
const MID_DEN = 2;
const TAIL_NUM = 1;
const TAIL_DEN = 4;

/** Rate per band, as the exact fraction the band charges at. `full` is the identity. */
const BAND_RATE: Readonly<Record<WearBand, readonly [number, number]>> = {
  full: [1, 1],
  mid: [MID_NUM, MID_DEN],
  tail: [TAIL_NUM, TAIL_DEN],
};

/**
 * Effective drain hours bought by `hours` of real travel.
 *
 * Below the knee this is the identity, which is the whole reason the sub-knee case is
 * bit-identical rather than merely close.
 */
export function worn(hours: number): number {
  if (hours <= FULL_UNTIL) return hours;

  const mid = Math.min(hours - FULL_UNTIL, MID_SPAN);
  const tail = hours - FULL_UNTIL - mid;

  return FULL_UNTIL + mulDivRound(mid, MID_NUM, MID_DEN) + mulDivRound(tail, TAIL_NUM, TAIL_DEN);
}

/**
 * Which band a run is in at `hours` of travel — the rate it is about to be charged at, not the
 * one it has just left. So exactly `FULL_UNTIL` is already `mid`: the next hour is a half-rate
 * hour, even though `worn(FULL_UNTIL)` is still the identity.
 */
export function wearBandAt(hours: number): WearBand {
  if (hours < FULL_UNTIL) return 'full';
  if (hours < FULL_UNTIL + MID_SPAN) return 'mid';
  return 'tail';
}

/** The band's rate as a whole percent, for the chip. Derived, so 50 and 25 are never typed. */
export function wearRatePercent(band: WearBand): number {
  const [num, den] = BAND_RATE[band];
  return mulDivRound(100, num, den);
}

/**
 * The journal line a band change leaves behind, on the precedent of `quietHistoryEntry`.
 *
 * `eventId` is null, which keeps it out of `tag-saturation.ts`'s window over FIRED events and
 * out of `drawsSince`'s draw count — a leg where the drain relented must not consume an
 * anti-repetition slot. `isWearNote` is what stops the same null ending `tension.ts`'s streak.
 *
 * `params` is design pillar 2's reconstructible reason: which band, at what travel hour, at
 * what rate. Every value is a JSON primitive, because `TextParams` gets persisted into
 * `history` and read back in a language this run was not played in.
 */
export function wearHistoryEntry(state: RunState, legIndex: number, band: WearBand): HistoryEntry {
  return {
    legIndex,
    day: state.clock.day,
    eventId: null,
    choiceId: null,
    textKey: wearJournalKey(band),
    params: { leg: legIndex, band, travelHours: state.wear.hours, rate: wearRatePercent(band) },
    tags: [],
  };
}
