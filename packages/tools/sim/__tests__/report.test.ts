import { describe, expect, it } from 'vitest';
import { createContentPack, collectFlagUsage } from '@odyssey/engine';
import { diffReports, runCountOf } from '../diff-report.ts';
import { formatReport } from '../format-report.ts';
import { loadFixturePack, loadFixtureScenarios } from '../load-pack.ts';
import { ascending, percentile } from '../percentile.ts';
import { runMany } from '../run-many.ts';

const PACK = loadFixturePack();
const SCENARIOS = loadFixtureScenarios();
const SUMMARY = runMany(PACK, SCENARIOS, {
  runs: 200,
  seed: 'report',
  policies: [],
  diff: false,
  json: false,
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
