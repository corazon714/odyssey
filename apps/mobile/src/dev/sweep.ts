import { BUDGET_MS } from './frame-fold';

/**
 * The blur sweep: its steps, its arithmetic, and **its verdict**.
 *
 * ## Why the verdict is code rather than mental arithmetic
 *
 * `docs/device-measurement-session.md` §4 defines the go/no-go as a share of the frame budget. The
 * session will be read either off a phone held in one hand or — see §5.2 — **off a compressed video
 * stream from a remote device farm**. Neither is a place to do division. Computing the verdict
 * on-device and printing it in the session's own words is what makes a remote Android measurement
 * practical at all.
 *
 * ## Why the sweep measures a SLOPE
 *
 * The available hardware is an iPhone SE 3, which is not the low-end Android the 60fps floor
 * targets: fewer pixels to blur on a much stronger GPU. **Its pass does not transfer, so a pass/fail
 * at one layer count is the wrong statistic.** The cost of ONE blur layer, in milliseconds, is a
 * number that can at least be multiplied by a penalty factor. That is why step 0 exists and why
 * every step reports a mean.
 */

/**
 * Layer counts to walk, ascending, starting at ZERO.
 *
 * **Zero is the load-bearing entry.** Without a no-blur baseline there is nothing to subtract, and
 * every reading would carry the cost of the transforms, the text and the shadows as though it were
 * blur. It is also exactly the flat-fill mode `Sheet` renders, so the baseline and the fallback
 * design are the same measurement.
 */
export const SWEEP_STEPS = [0, 1, 2, 3, 4, 5] as const;

/**
 * Frames held at each step. ~2s at 60fps.
 *
 * Long enough for the fold's 60-frame window to close at least once, so every row reports a real
 * mean rather than a zero. Short enough that the whole sweep is ~12s, which matters when the device
 * is metered by the minute.
 */
export const SWEEP_FRAMES = 120;

/** The layer count the verdict is read at — §4 states its thresholds "at 2 layers". */
export const VERDICT_LAYERS = 2;

export type SweepRow = {
  readonly layers: number;
  readonly meanMs: number;
  readonly worstMs: number;
  readonly dropped: number;
};

/**
 * The marginal cost of one blur layer, in milliseconds, or `null` if it cannot be computed.
 *
 * `(mean at N − mean at 0) / N`, taken at the HIGHEST completed step rather than at step 1: the
 * per-layer cost is small next to frame-to-frame noise, so the longest available lever gives the
 * best signal-to-noise. Returns `null` rather than 0 when the baseline is missing, because "no
 * data" and "free" are the two readings that must never be confused on a gate.
 */
export function blurCostPerLayer(rows: readonly SweepRow[]): number | null {
  const base = rows.find((r) => r.layers === 0);
  if (base === undefined || base.meanMs <= 0) return null;

  const top = rows.filter((r) => r.layers > 0 && r.meanMs > 0).at(-1);
  if (top === undefined) return null;

  return (top.meanMs - base.meanMs) / top.layers;
}

/** What the session is allowed to conclude. The strings are `docs/device-measurement-session.md`'s. */
export const VERDICTS = ['no-data', 'dead', 'inconclusive', 'not-disproven'] as const;
export type Verdict = (typeof VERDICTS)[number];

export type VerdictResult = {
  readonly verdict: Verdict;
  /** Milliseconds of the budget blur consumes at `VERDICT_LAYERS`, or null when unknown. */
  readonly blurMsAtVerdictLayers: number | null;
  /** That figure as a share of the frame budget. */
  readonly budgetShare: number | null;
  /** The sentence to copy into the session record, verbatim. */
  readonly sentence: string;
};

/** §4's fatal share: a quarter of the budget at 2 layers, on the device that should find it easiest. */
const DEAD_SHARE = 0.25;
/** §4's "not disproven" share. Below this, 10x the estimated Android penalty might still fit. */
const SAFE_SHARE = 0.05;

/**
 * Apply §4's thresholds.
 *
 * Two independent ways to be dead, and the second needs no multiplier to justify it:
 *
 *  1. Blur consumes more than a quarter of the budget at 2 layers. At the session doc's estimated
 *     10x Android penalty that is 250% of the budget there — certainly broken.
 *  2. The WORST frame already exceeds the budget at 1 or 2 layers. That is a dropped frame on the
 *     easiest device in the comparison, and no extrapolation is involved in reading it.
 *
 * **There is deliberately no `pass`.** `docs/device-measurement-session.md` §1: a pass on this
 * hardware is not a result the hardware can produce, so the vocabulary does not contain one.
 */
export function verdictFor(rows: readonly SweepRow[], budgetMs = BUDGET_MS): VerdictResult {
  const base = rows.find((r) => r.layers === 0);
  const at = rows.find((r) => r.layers === VERDICT_LAYERS);

  if (base === undefined || at === undefined || base.meanMs <= 0 || at.meanMs <= 0) {
    return {
      verdict: 'no-data',
      blurMsAtVerdictLayers: null,
      budgetShare: null,
      sentence: 'NO DATA — the sweep did not complete a baseline and a 2-layer step.',
    };
  }

  // A negative difference is noise, not a saving: clamp rather than report blur as free.
  const blurMs = Math.max(0, at.meanMs - base.meanMs);
  const share = blurMs / budgetMs;

  const worstOverBudget = rows.some(
    (r) => (r.layers === 1 || r.layers === VERDICT_LAYERS) && r.worstMs > budgetMs,
  );

  if (worstOverBudget || share > DEAD_SHARE) {
    return {
      verdict: 'dead',
      blurMsAtVerdictLayers: blurMs,
      budgetShare: share,
      sentence:
        'E IS DEAD as specified — fall back to F. This verdict is SAFE: a failure on SE 3 is ' +
        'strong evidence, because it has fewer pixels to blur on a stronger GPU than the target.',
    };
  }

  if (share < SAFE_SHARE) {
    return {
      verdict: 'not-disproven',
      blurMsAtVerdictLayers: blurMs,
      budgetShare: share,
      sentence:
        'NOT DISPROVEN ON SE 3. This is NOT a pass and must not be recorded as one — an Android ' +
        'measurement is still required before the 60fps floor can be signed off.',
    };
  }

  return {
    verdict: 'inconclusive',
    blurMsAtVerdictLayers: blurMs,
    budgetShare: share,
    sentence:
      'INCONCLUSIVE. The flat-fill architecture is now MANDATORY rather than recommended, and an ' +
      'Android measurement is a release blocker.',
  };
}

/** Fixed-width so it survives being read off a video stream. */
export function formatSweepTable(rows: readonly SweepRow[]): string {
  const head = 'layers   mean ms   worst ms   dropped';
  const body = rows.map(
    (r) =>
      `${String(r.layers).padStart(6)}   ${r.meanMs.toFixed(2).padStart(7)}   ` +
      `${r.worstMs.toFixed(1).padStart(8)}   ${String(r.dropped).padStart(7)}`,
  );
  const cost = blurCostPerLayer(rows);
  const costLine = cost === null ? 'cost/layer   n/a' : `cost/layer   ${cost.toFixed(3)} ms`;
  return [head, ...body, '', costLine].join('\n');
}
