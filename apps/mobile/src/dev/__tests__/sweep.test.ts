import { describe, expect, it } from '@jest/globals';
import { BUDGET_MS } from '../frame-fold';
import {
  SWEEP_STEPS,
  VERDICT_LAYERS,
  blurCostPerLayer,
  formatSweepTable,
  verdictFor,
  type SweepRow,
} from '../sweep';

/**
 * The sweep's arithmetic and its verdict.
 *
 * These matter more than most tests in this repo because **the code under test decides whether an
 * art direction survives**, and it will be read once, on a phone, possibly over a video stream from
 * a metered remote device. There is no opportunity to notice a wrong number and re-run cheaply.
 */

const row = (layers: number, meanMs: number, worstMs = meanMs, dropped = 0): SweepRow => ({
  layers,
  meanMs,
  worstMs,
  dropped,
});

/** A clean run: 16.0ms baseline, +0.5ms per blur layer. */
const clean = (perLayer: number, base = 16.0): SweepRow[] =>
  SWEEP_STEPS.map((n) => row(n, base + perLayer * n));

describe('blurCostPerLayer — the number the whole session exists to produce', () => {
  it('recovers a known per-layer cost', () => {
    expect(blurCostPerLayer(clean(0.5))).toBeCloseTo(0.5, 6);
    expect(blurCostPerLayer(clean(2.4))).toBeCloseTo(2.4, 6);
  });

  it('uses the HIGHEST step, not the first — the longest lever beats the noisiest', () => {
    // Step 1 is deliberately corrupted with noise; the slope from step 5 must still be right.
    const rows = [row(0, 16.0), row(1, 19.0), row(5, 18.5)];
    expect(blurCostPerLayer(rows)).toBeCloseTo(0.5, 6);
  });

  it('returns null rather than 0 when there is no baseline', () => {
    // "No data" and "free" are the two readings that must never be confused on a gate. A 0 here
    // would read as "blur costs nothing" and clear the direction on a sweep that never ran.
    expect(blurCostPerLayer([row(1, 16.5), row(2, 17.0)])).toBeNull();
    expect(blurCostPerLayer([])).toBeNull();
    expect(blurCostPerLayer([row(0, 0), row(2, 17)])).toBeNull();
  });

  it('returns null when no blurred step completed', () => {
    expect(blurCostPerLayer([row(0, 16.0)])).toBeNull();
  });
});

describe('verdictFor — §4 of the session doc, as code', () => {
  it('has NO pass in its vocabulary, by design', () => {
    // The session doc's §1: a pass is not a result this hardware can produce, so the enum does not
    // contain one. If a future change adds `pass`, this assertion is the thing that should stop it.
    const best = verdictFor(clean(0.0001));
    expect(best.verdict).toBe('not-disproven');
    expect(best.sentence).toContain('NOT a pass');
  });

  it('kills E when blur exceeds a quarter of the budget at 2 layers', () => {
    // 25% of 16.7ms is ~4.2ms of blur at 2 layers, i.e. ~2.1ms per layer.
    const rows = clean(2.5);
    const v = verdictFor(rows);
    expect(v.verdict).toBe('dead');
    expect(v.budgetShare).toBeGreaterThan(0.25);
    expect(v.sentence).toContain('E IS DEAD');
    expect(v.sentence).toContain('SAFE');
  });

  it('kills E when the WORST frame is already over budget at 1 or 2 layers, whatever the mean', () => {
    // The second, independent fatal condition — it needs no multiplier to justify it, so it must
    // fire even when the mean looks comfortable.
    const rows: SweepRow[] = [
      row(0, 16.0),
      row(1, 16.1, BUDGET_MS + 5),
      row(VERDICT_LAYERS, 16.2, 16.2),
    ];
    const v = verdictFor(rows);
    expect(v.verdict).toBe('dead');
    // ...and the mean-based test alone would NOT have fired here:
    expect(v.budgetShare).toBeLessThan(0.25);
  });

  it('reports NOT DISPROVEN below 5% of budget, and says it is not a pass', () => {
    const v = verdictFor(clean(0.2)); // 0.4ms at 2 layers = 2.4% of budget
    expect(v.verdict).toBe('not-disproven');
    expect(v.budgetShare).toBeLessThan(0.05);
    expect(v.sentence).toContain('Android measurement is still required');
  });

  it('reports INCONCLUSIVE between the two, and states the consequence', () => {
    // Baseline 13.0 rather than 16.0 ON PURPOSE. At a 16.0 baseline the WORST frame at one layer
    // is already 17.0 — over the 16.7 budget — and the other fatal rule fires first. That is the
    // code behaving correctly and the fixture being unrealistic, and it is worth a sentence here
    // because the two rules are easy to conflate when reading a failure.
    const v = verdictFor(clean(1.0, 13.0)); // 2.0ms at 2 layers = ~12% of budget
    expect(v.verdict).toBe('inconclusive');
    expect(v.budgetShare).toBeGreaterThan(0.05);
    expect(v.budgetShare).toBeLessThan(0.25);
    expect(v.sentence).toContain('MANDATORY');
    expect(v.sentence).toContain('release blocker');
  });

  it('reports no-data rather than guessing when the sweep did not complete', () => {
    expect(verdictFor([]).verdict).toBe('no-data');
    expect(verdictFor([row(0, 16.0)]).verdict).toBe('no-data');
    expect(verdictFor([row(VERDICT_LAYERS, 17.0)]).verdict).toBe('no-data');
  });

  it('treats a negative difference as noise, not as blur being free', () => {
    // Frame-time noise can make a blurred step measure faster than the baseline. Reporting a
    // negative cost would be nonsense; reporting it as a saving would be worse.
    const v = verdictFor([row(0, 16.5), row(VERDICT_LAYERS, 16.1)]);
    expect(v.blurMsAtVerdictLayers).toBe(0);
    expect(v.verdict).toBe('not-disproven');
  });

  it('honours a non-default budget — a 120Hz target halves it', () => {
    // Session doc §4: many budget Androids ship 120Hz panels, which makes the budget 8.3ms, and
    // SE 3 at 60Hz cannot observe that at all. The property under test is that the SAME rows get
    // a worse verdict against the tighter budget, without any threshold being edited.
    const rows = clean(0.4, 6.0); // 0.8ms at 2 layers; worst stays under both budgets
    expect(verdictFor(rows, 16.7).verdict).toBe('not-disproven'); // 4.8% of a 60Hz budget
    expect(verdictFor(rows, 1000 / 120).verdict).toBe('inconclusive'); // 9.6% of a 120Hz one
  });
});

describe('formatSweepTable — it will be read off a video stream', () => {
  it('is fixed-width, one row per step, with the cost line last', () => {
    const out = formatSweepTable(clean(0.5));
    const lines = out.split('\n');
    expect(lines[0]).toContain('layers');
    expect(lines).toHaveLength(SWEEP_STEPS.length + 3); // head + rows + blank + cost
    expect(lines.at(-1)).toContain('0.500 ms');
    // Columns must line up, or the table is unreadable at video-stream resolution.
    const widths = new Set(lines.slice(1, 1 + SWEEP_STEPS.length).map((l) => l.length));
    expect(widths.size).toBe(1);
  });

  it('prints n/a rather than a number when the cost cannot be computed', () => {
    expect(formatSweepTable([row(1, 16.5)])).toContain('n/a');
  });
});
