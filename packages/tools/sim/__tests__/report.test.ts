import { describe, expect, it } from 'vitest';
import { createContentPack, collectFlagUsage, RECENCY_WINDOW, type EventId } from '@odyssey/engine';
import { diffReports, runCountOf } from '../diff-report.ts';
import { formatReport, nearRepeatRate, repeatRate } from '../format-report.ts';
import { loadCorpusPack, loadFixturePack, loadFixtureScenarios } from '../load-pack.ts';
import { ascending, percentile } from '../percentile.ts';
import { POLICY_NAMES } from '../policy.ts';
import { runMany } from '../run-many.ts';

const PACK = loadFixturePack();
const SCENARIOS = loadFixtureScenarios();
const SUMMARY = runMany(PACK, SCENARIOS, {
  runs: 200,
  seed: 'report',
  policies: [],
  diff: false,
  json: false,
  byRoute: false,
  moods: false,
  pack: 'fixture',
});
const REPORT = formatReport(SUMMARY, PACK, { seed: 'report', runs: 200, elapsedMs: 42 });

describe('percentile', () => {
  it('picks an existing element rather than interpolating', () => {
    // Interpolation is the textbook definition and the wrong choice: a reported statistic that
    // depends on float rounding can differ between machines, and `sim:diff` exists to show
    // that a number moved because the ENGINE changed.
    const values = ascending([5, 1, 9, 3, 7]);
    expect(values).toEqual([1, 3, 5, 7, 9]);
    expect(percentile(values, 0)).toBe(1);
    expect(percentile(values, 50)).toBe(5);
    expect(percentile(values, 100)).toBe(9);
    for (const p of [10, 25, 75, 90]) expect(values).toContain(percentile(values, p));
  });

  it('handles an empty and a single-element series', () => {
    expect(percentile([], 50)).toBe(0);
    expect(percentile([7], 90)).toBe(7);
  });
});

describe('formatReport — the engine-spec 6 shape', () => {
  it('contains every section the spec asks for', () => {
    for (const heading of [
      'Grid cells sampled',
      'Completion rate',
      'Never-fired events',
      'Empty-pool fallbacks',
      'Long-range payoff rate',
      'Repeat-event rate',
      '## Endings',
      '## Never-fired events',
      '## Choices picked <2%',
      '## Flags',
      '## Resource trajectories (p10/p50/p90 by leg)',
    ]) {
      expect(REPORT, `missing: ${heading}`).toContain(heading);
    }
  });

  it('is deterministic for the same corpus', () => {
    const again = formatReport(SUMMARY, PACK, { seed: 'report', runs: 200, elapsedMs: 42 });
    expect(again).toBe(REPORT);
  });

  it('surfaces a flag that is read but never written', () => {
    // The gate can never open, so the branch behind it is unreachable — ADR 0001's silent
    // content bug. The fixture pack HAD one (`wanted`) from Phase 1 until M2A.6, when
    // content:lint promoted the same finding to a build error and it was fixed in the
    // fixture. So this now proves the INSTRUMENT works rather than that the corpus is broken:
    // an assertion about a specific broken flag would have to be deleted the moment anyone
    // fixed it, which makes it a test of the content, not of the report.
    const usage = collectFlagUsage(PACK.events);
    expect(usage.readNeverWritten).toEqual([]);

    // A synthetic pack with the gap, so the instrument is exercised without the corpus
    // having to stay broken for it.
    const gated = PACK.events[0];
    if (gated === undefined) throw new Error('no fixture events');
    const ghostPack = createContentPack([
      {
        ...gated,
        requires: { kind: 'flag', id: 'ghost_flag' as never, cmp: { op: 'isSet' } },
      },
    ]);
    const withGap = formatReport(SUMMARY, ghostPack, { seed: 'report', runs: 200, elapsedMs: 42 });
    expect(withGap).toContain('read but NEVER WRITTEN');
    expect(withGap).toContain('ghost_flag');
  });

  it('surfaces choices that are never picked', () => {
    expect(REPORT).toContain('never picked');
  });

  it('lists beat types no event can fill', () => {
    expect(REPORT).toContain('## Beat types no event can fill');
  });
});

describe('quiet legs are printed, and never as a content gap (ADR 0029 D7 item 4)', () => {
  const lineFor = (label: string): string => {
    const found = REPORT.split('\n').find((line) => line.startsWith(label));
    if (found === undefined) throw new Error(`no report line starts with: ${label}`);
    return found;
  };

  it('prints both new instruments', () => {
    expect(REPORT).toContain('Quiet legs (designed)');
    expect(REPORT).toContain('Forced-fire legs');
  });

  it('keeps four distinct lines, so designed silence never reads as starvation', () => {
    // The report is the last place the distinction can be lost, and losing it is cheap: fold
    // quiet into either line above and a 30% quiet share buries a 1% content gap under it.
    // Decision 7 item 4 is a requirement ON THIS FILE as much as on `SelectionResult`.
    const labels = [
      'Empty-pool fallbacks',
      'Uneventful legs',
      'Quiet legs (designed)',
      'Forced-fire legs',
    ];
    expect(new Set(labels.map(lineFor)).size).toBe(labels.length);
    expect(lineFor('Quiet legs (designed)')).toContain('NOT the two gaps above');
  });

  it('does not sell the quiet share against a target the pack is failing', () => {
    // The two lines above it print `(target <2%)` because a fallback is a bug. A quiet leg is
    // the design working, and M3.12b sets its target — this milestone has no business
    // implying one.
    expect(lineFor('Quiet legs (designed)')).not.toContain('target');
  });

  it('states the ceiling the forced share puts on any quiet ratio', () => {
    // Decision 3's identity, evaluated in the report so reading it does not require knowing it.
    // Derived from the summary rather than written out: a hardcoded percentage here would be a
    // second source of truth for the same number.
    const cap = `${((1 - SUMMARY.forcedFireShare) * 100).toFixed(1)}%`;
    expect(lineFor('Forced-fire legs')).toContain(`caps quiet at ${cap}`);
    expect(SUMMARY.forcedFireShare).toBeGreaterThan(0);
  });
});

describe('the two repetition instruments (ADR 0029 addendum, D1)', () => {
  /**
   * `Repeat-event rate` is a share of DRAWS over a whole run, so it moves whenever the number
   * of draws moves — which is exactly what the quiet-leg gate does. It is kept because it is
   * true, and because no redefinition can be both unconfounded at a positive quiet share and
   * arithmetically identical at `BASE_EVENT_ODDS = 1:0`, where the M3.12a fence requires every
   * printed number to hold still. `Near-repeat rate` is the companion that moves LESS.
   *
   * **It does not "survive the change", and that claim is retracted** — the impossibility above
   * applies to the replacement as much as to the thing replaced. Sharing units removes the
   * SCALING confound; it does not remove SEQUENCE COMPRESSION. The last test in this block is
   * the retraction, stated as arithmetic.
   *
   * The sequences below are synthetic and exact rather than sampled: one immediate redraw per
   * eight draws over a pool of seven, so both rates are closed-form and the test asserts
   * arithmetic instead of a threshold somebody would later have to loosen.
   */
  const POOL = PACK.events.slice(0, 7).map((e) => e.id);

  const at = (i: number): EventId => {
    const id = POOL[i];
    if (id === undefined) throw new Error(`fixture pack has fewer than ${String(i + 1)} events`);
    return id;
  };

  /** `cycles` repeats of `[a, a, b, c, d, e, f, g]` — one near-repeat per eight draws. */
  const sequence = (cycles: number): { readonly firedEvents: readonly EventId[] } => {
    const fired: EventId[] = [];
    for (let c = 0; c < cycles; c += 1) {
      fired.push(at(0));
      for (let i = 0; i < POOL.length; i += 1) fired.push(at(i));
    }
    return { firedEvents: fired };
  };

  /** One event, `gap - 1` distinct events, then the same event again. */
  const spaced = (gap: number): { readonly firedEvents: readonly EventId[] } => {
    const fired: EventId[] = [at(0)];
    for (let i = 1; i < gap; i += 1) fired.push(at(i));
    fired.push(at(0));
    return { firedEvents: fired };
  };

  it('has a pool large enough to separate the two', () => {
    // Anti-vacuous. With a pool at or below the window every draw is a near-repeat and the two
    // rates collapse onto each other, which would make every assertion below pass for the
    // wrong reason.
    expect(POOL).toHaveLength(7);
    expect(RECENCY_WINDOW).toBeLessThan(POOL.length);
  });

  it('the whole-run rate moves on sequence LENGTH alone', () => {
    // Same generative process, two lengths, nothing else different: `unique` is capped by the
    // pool and the draws are not. This is the ~10pp "improvement" M3.12b would otherwise show
    // in the report's only repetition line with the director untouched.
    expect(repeatRate([sequence(2)])).toBeCloseTo(1 - 7 / 16, 10);
    expect(repeatRate([sequence(10)])).toBeCloseTo(1 - 7 / 80, 10);
    expect(repeatRate([sequence(2)])).not.toBe(repeatRate([sequence(10)]));
  });

  it('the near-repeat rate does not — same process, same number, either length', () => {
    // LENGTH invariance, which is the scaling confound and is genuinely gone. It is NOT
    // compression invariance; those are different properties and conflating them is the error
    // the last test in this block exists to prevent.
    expect(nearRepeatRate([sequence(2)])).toBeCloseTo(1 / 8, 10);
    expect(nearRepeatRate([sequence(10)])).toBe(nearRepeatRate([sequence(2)]));
  });

  it('counts a redraw recency is still penalising, and not one it has forgiven', () => {
    // The window is RECENCY_WINDOW - 1 draws back, because `recency`'s `gap` is inclusive of
    // the draw being scored: it is still penalising at gap RECENCY_WINDOW - 1 and returns 1 at
    // RECENCY_WINDOW. Measuring one draw wider would count redraws the director had already
    // been forgiven for, and the number would stop meaning what its label says.
    expect(nearRepeatRate([spaced(RECENCY_WINDOW - 1)])).toBeGreaterThan(0);
    expect(nearRepeatRate([spaced(RECENCY_WINDOW)])).toBe(0);
  });

  it('IS moved by sequence compression, in BOTH directions — the retraction, as arithmetic', () => {
    /**
     * `Near-repeat rate` shipped advertised as unconfounded: "the quiet share cancels, so what
     * is left is a property of the DIRECTOR rather than of how often it was asked". FALSE. A
     * quiet share deletes draws, deleting draws COMPRESSES the sequence, and the window is
     * measured in draws — so pairs move relative to it with the director untouched.
     *
     * Both directions are constructed exactly, because the sign is what makes this dangerous:
     * a metric that moved one way could at least be read with a caveat, and this one cannot.
     *
     * Measured on real 2,000-run sequences at a 30% quiet share (non-periodic mask, ten seeds):
     * corpus 25.99% -> 33.57% (+7.6pp), fixture 62.29% -> 56.63% (-5.7pp).
     */

    // SPARSE — the corpus case. The pair sits one draw OUTSIDE the window, so the rate is 0.
    // Deleting an interior draw pulls it IN and the rate RISES off the floor.
    const sparse = spaced(RECENCY_WINDOW).firedEvents;
    const sparseCompressed = sparse.filter((_, i) => i !== 3);
    expect(nearRepeatRate([{ firedEvents: sparse }])).toBe(0);
    expect(nearRepeatRate([{ firedEvents: sparseCompressed }])).toBeCloseTo(1 / 6, 10);

    // DENSE — the fixture case. The pair is already inside the window, so deleting a MEMBER of
    // it destroys the pair and the rate FALLS. Same operation, opposite sign.
    const dense = sequence(1).firedEvents;
    const denseCompressed = dense.filter((_, i) => i !== 1);
    expect(nearRepeatRate([{ firedEvents: dense }])).toBeCloseTo(1 / 8, 10);
    expect(nearRepeatRate([{ firedEvents: denseCompressed }])).toBe(0);
  });

  it('sells the line honestly — the printed text claims LESS confounded, not unconfounded', () => {
    // The claim lives in a string a reader sees before they ever open this file, so it is the
    // string that is asserted. Six sites carried "the quiet share cancels" / "diff THIS across
    // a base change"; this is the one that ships in the artifact.
    const line = REPORT.split('\n').find((l) => l.startsWith('Near-repeat rate'));
    expect(line).toContain('NOT unconfounded');
    expect(line).toContain('null baseline');
    expect(line).not.toContain('diff THIS');
  });

  it('prints the confounder next to the confounded number', () => {
    // `draws/run` lives on the NEW line rather than being appended to the old one: a line that
    // already prints cannot gain text without moving under `sim:diff`, and the fence forbids it.
    const line = REPORT.split('\n').find((l) => l.startsWith('Near-repeat rate'));
    expect(line).toBeDefined();
    expect(line).toContain('draws/run');
    expect(line).toContain(`${String(RECENCY_WINDOW)}-event window`);
    // No target band. M3.12b sets one if it wants one; implying one here would be the same fold
    // the quiet line refuses.
    expect(line).not.toContain('target');
  });
});

describe('the report says which part of the grid it measured', () => {
  /**
   * Added at M3.11g, after the SECOND pairing bug. Before it, `format-report.ts` contained the
   * string "route" zero times: two strides in a row averaged over a collapsed sample and the
   * artifact people read carried no line that could have said so. The report is the last place
   * this class of defect can be caught, so it prints the sample before the first rate computed
   * over it.
   */
  it('names the routes and policies behind every rate below it', () => {
    expect(REPORT).toContain('Grid cells sampled');
    expect(REPORT).toContain(
      `${String(SCENARIOS.length)}/${String(SCENARIOS.length)} routes x ` +
        `${String(POLICY_NAMES.length)}/${String(POLICY_NAMES.length)} policies`,
    );
  });

  it('does not cry truncation when the marginals are whole', () => {
    // 200 runs over a 15-cell grid. Cells short of the grid is ordinary; a MISSING ROUTE is not,
    // and only the second is a finding.
    expect(REPORT).not.toContain('NEVER RUN');
  });

  it('SHOUTS when a route or a policy never ran', () => {
    // The odometer's failure mode, made loud: one run touches one cell, so the other routes and
    // policies are unmeasured and every rate underneath is an average over a hole.
    const thin = runMany(PACK, SCENARIOS, {
      runs: 1,
      seed: 'thin',
      policies: [],
      diff: false,
      json: false,
      byRoute: false,
      moods: false,
      pack: 'fixture',
    });
    const report = formatReport(thin, PACK, { seed: 'thin', runs: 1, elapsedMs: 1 });
    expect(report).toContain('NEVER RUN');
    expect(report).toContain(`${String(SCENARIOS.length - 1)} routes`);
    expect(report).toContain(`${String(POLICY_NAMES.length - 1)} policies`);
  });

  it('says "1 route", not "1 routes", when exactly one marginal is short', () => {
    // REGRESSION (M3.11g). The gap clause was unconditionally plural, so the one-short case —
    // the COMMON one, since a grid is usually missing its last cell rather than half an axis —
    // printed "<- 1 routes NEVER RUN" in the one line whose whole job is to be read carefully.
    //
    // The test above cannot catch it and no run count would let it: the fixture's 3 routes and 5
    // policies make its assertions read "2 routes" and "4 policies", both already plural. Catching
    // a singular needs a shape that leaves exactly ONE marginal short, which is what this picks.
    //
    // `runs` is DERIVED, not the literal 2. `scenario = i % S` visits a distinct route per run
    // while `i < S`, so `S - 1` runs leave exactly one route unvisited whatever S becomes — the
    // leg-length-assumption trap this repo has now hit five times, avoided by construction.
    const runs = SCENARIOS.length - 1;
    const short = runMany(PACK, SCENARIOS, {
      runs,
      seed: 'one-short',
      policies: [],
      diff: false,
      json: false,
      byRoute: false,
      moods: false,
      pack: 'fixture',
    });
    const report = formatReport(short, PACK, { seed: 'one-short', runs, elapsedMs: 1 });
    expect(report).toContain('1 route ');
    expect(report).not.toContain('1 routes');
  });
});

describe('diffReports', () => {
  it('reports no change for identical reports', () => {
    expect(diffReports(REPORT, REPORT).changed).toBe(false);
  });

  it('ignores the wall clock and the header, which change every run', () => {
    const other = formatReport(SUMMARY, PACK, { seed: 'report', runs: 200, elapsedMs: 999 });
    expect(diffReports(REPORT, other).changed).toBe(false);
  });

  it('strips a leading HTML comment so the committed header does not offset every line', () => {
    // Caught by the diff reporting a change when nothing had changed: the baseline carries a
    // regeneration header, and a line-index diff cannot absorb the offset.
    const withHeader = `<!--\n  how to regenerate\n-->\n\n${REPORT}`;
    expect(diffReports(withHeader, REPORT).changed).toBe(false);
  });

  it('DOES report a real difference', () => {
    // Guards the guard: a diff that ignores everything would pass all four tests above.
    const changed = REPORT.replace('Completion rate', 'Completion rateX');
    const result = diffReports(REPORT, changed);
    expect(result.changed).toBe(true);
    expect(result.lines.some((line) => line.startsWith('+'))).toBe(true);
  });
});

describe('runCountOf — the guard on comparing two different sample sizes', () => {
  it('reads the count out of a report header', () => {
    expect(runCountOf('# Sim Report — seed=base contentVersion=aee5a082 runs=2000\n')).toBe(2000);
  });

  it('reads it past a leading HTML comment block, as a committed baseline has', () => {
    const baseline = [
      '<!--',
      '  THE FIXTURE BALANCE BASELINE.',
      '  Regenerate deliberately:  pnpm sim -- --runs=2000',
      '-->',
      '',
      '# Sim Report — seed=base contentVersion=aee5a082 runs=2000',
    ].join('\n');
    // The comment block mentions the count too, and the first match is the one that counts —
    // both say 2000 for the same reason, so either is right.
    expect(runCountOf(baseline)).toBe(2000);
  });

  it('returns null when the header does not say, rather than guessing', () => {
    expect(runCountOf('# Sim Report — seed=base contentVersion=aee5a082\n')).toBeNull();
    expect(runCountOf('')).toBeNull();
  });

  it('does not match a number that merely contains the digits', () => {
    expect(runCountOf('overruns=99')).toBeNull();
  });

  it('is what `diffReports` cannot tell you, because normalise blanks the count', () => {
    // The whole reason the check lives outside the diff. These two reports differ ONLY in run
    // count, and the diff calls them identical — correctly, since the count is not a balance
    // property. But every sampled rate underneath would move, and nothing would say why.
    const at = (runs: number): string =>
      `# Sim Report — seed=base contentVersion=aee5a082 runs=${String(runs)}\nCompleted 44.1%\n`;
    expect(diffReports(at(2000), at(5000)).changed).toBe(false);
    expect(runCountOf(at(2000))).not.toBe(runCountOf(at(5000)));
  });
});

describe('the modifier target is only printed against a pack that could meet it', () => {
  // The fixture pack carries `registries.modifiers: []` ON PURPOSE — it is the empty-registry
  // control the golden runs are built on. Printing "target 3-7" against it reported a standing
  // failure that could never be fixed without destroying the control, and it cost an
  // investigation before anyone checked whether the pack had a registry at all.
  it('the fixture pack really does have no modifier registry', () => {
    expect(PACK.modifiers).toHaveLength(0);
  });

  it('says so, and does not print a band the pack cannot reach', () => {
    expect(REPORT).toContain('NO modifier registry in this pack');
    expect(REPORT).not.toContain('target 3-7');
    // The starved-check count is still reported — it is just no longer called a finding.
    expect(REPORT).toContain('Checks under 2 chips');
    expect(REPORT).not.toContain('each one draws nothing the registry exists for');
  });

  it('prints the band again as soon as the pack has rows', () => {
    // The REAL corpus rather than a hand-built row, so this cannot pass against a registry
    // shape the loader would reject. The summary is the fixture's and does not describe the
    // corpus — deliberately: which parenthetical renders depends only on whether the pack has
    // rows, and pairing a mismatched summary with it proves exactly that.
    const corpus = loadCorpusPack().pack;
    expect(corpus.modifiers.length).toBeGreaterThan(0);

    const report = formatReport(SUMMARY, corpus, { seed: 'report', runs: 200, elapsedMs: 42 });
    expect(report).toContain('target 3-7');
    expect(report).toContain('each one draws nothing the registry exists for');
    expect(report).not.toContain('NO modifier registry in this pack');
  });
});
