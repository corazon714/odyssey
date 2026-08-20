import { describe, expect, it } from 'vitest';
import { MOOD_IDS, type MoodId } from '@odyssey/engine';
import { formatMoods, moodStats, moodTotals } from '../moods.ts';
import { loadFixturePack, loadFixtureScenarios } from '../load-pack.ts';
import { parseArgs } from '../parse-args.ts';
import { formatReport } from '../format-report.ts';
import { runMany, type SimSummary } from '../run-many.ts';
import { type SimRun } from '../run-one.ts';

/**
 * Mood occupancy — the fold that makes mood CALIBRATION measurable.
 *
 * The properties under test are the ones a calibration decision would be made on: which
 * denominator each share uses, that a terminal-only mood is not reported as dead, and that a mood
 * which is rare corpus-wide but constant on one route is visible rather than averaged away.
 */

const PACK = loadFixturePack();
const SCENARIOS = loadFixtureScenarios();
const OPTIONS = {
  runs: 300,
  seed: 'moods',
  policies: [],
  diff: false,
  json: false,
  byRoute: false,
  moods: true,
  pack: 'fixture',
} as const;
const SUMMARY = runMany(PACK, SCENARIOS, OPTIONS);

const counts = (over: Partial<Record<MoodId, number>>): Record<MoodId, number> => {
  const out = {} as Record<MoodId, number>;
  for (const m of MOOD_IDS) out[m] = over[m] ?? 0;
  return out;
};

const template = SUMMARY.runs[0]!;
const run = (
  routeId: string,
  moodLegs: Partial<Record<MoodId, number>>,
  finalMood: MoodId = 'default',
  error: string | null = null,
): SimRun => ({ ...template, routeId, moodLegs: counts(moodLegs), finalMood, error });
const summaryOf = (runs: readonly SimRun[]): SimSummary => ({ ...SUMMARY, runs });

describe('--moods is a FOURTH output mode, refused in combination', () => {
  it('parses the valueless flag', () => {
    // One const, so the `.ok` check actually narrows — calling parseArgs twice does not, and
    // vitest would not have caught it because it does not typecheck.
    const on = parseArgs(['--moods']);
    expect(on.ok && on.options.moods).toBe(true);
    const off = parseArgs([]);
    expect(off.ok && off.options.moods).toBe(false);
  });

  it('refuses every other output mode', () => {
    // One output per invocation. `--moods` has no baseline, is not the `--json` trace, and wants a
    // different run count from gate 9 — so all three combinations are mistakes about what the
    // command will print rather than requests it could honour.
    expect(parseArgs(['--moods', '--diff']).ok).toBe(false);
    expect(parseArgs(['--moods', '--json']).ok).toBe(false);
    expect(parseArgs(['--moods', '--by-route']).ok).toBe(false);
  });

  it('does NOT appear in the standard report — the guard that keeps both baselines still', () => {
    // `diff-report.ts` compares by LINE INDEX, so a mood section appended to `format-report.ts`
    // would offset every line beneath it and force both baselines to regenerate for a change that
    // is purely presentational. ADR 0032 is the record of that false positive.
    const report = formatReport(SUMMARY, PACK, { seed: 'moods', runs: 300, elapsedMs: 1 });
    expect(report).not.toContain('mood occupancy');
    expect(report).not.toContain('NEVER OBSERVED');
    expect(report).not.toContain('Legs NOT');
  });
});

describe('the denominators, which is what a calibration decision rests on', () => {
  it('divides leg shares by LEGS and terminal shares by RUNS', () => {
    // Two screens, two populations. Sharing a denominator would make `triumphant` — one sample per
    // run against ~48 legs — look about fifty times rarer than it is.
    const totals = moodTotals(
      moodStats(
        summaryOf([
          run('fixture.short', { default: 30, night: 10 }, 'injured'),
          run('fixture.short', { default: 10, night: 50 }, 'triumphant'),
        ]),
        SCENARIOS.filter((s) => String(s.route.id) === 'fixture.short'),
      ),
    );
    expect(totals.legs).toBe(100);
    expect(totals.runs).toBe(2);
    expect(totals.byMood.night).toBe(60);
    expect(totals.terminal.triumphant).toBe(1);
  });

  it('excludes errored runs from both populations', () => {
    // An errored run reached no legs and produced no screens; counting it would dilute every share
    // by the error rate and make a corpus look calmer the more it broke.
    const stats = moodStats(
      summaryOf([
        run('fixture.short', { wanted: 20 }, 'wanted'),
        run('fixture.short', { wanted: 999 }, 'wanted', 'advanceLeg: BOOM'),
      ]),
      SCENARIOS.filter((s) => String(s.route.id) === 'fixture.short'),
    );
    expect(stats[0]!.legs).toBe(20);
    expect(stats[0]!.runs).toBe(1);
  });

  it('reports `reactingShare` as the share of legs that are NOT default', () => {
    // Pillar 3's world REACTS, which presupposes a baseline to react from. At ~100% there is no
    // baseline and `default` is a palette that ships and is never seen.
    const scenarios = SCENARIOS.filter((s) => String(s.route.id) === 'fixture.short');
    const allCalm = moodTotals(
      moodStats(summaryOf([run('fixture.short', { default: 40 })]), scenarios),
    );
    expect(allCalm.reactingShare).toBe(0);

    const neverCalm = moodTotals(
      moodStats(summaryOf([run('fixture.short', { wanted: 30, night: 10 })]), scenarios),
    );
    expect(neverCalm.reactingShare).toBe(1);

    const mixed = moodTotals(
      moodStats(summaryOf([run('fixture.short', { default: 25, storm: 75 })]), scenarios),
    );
    expect(mixed.reactingShare).toBeCloseTo(0.75, 10);
  });
});

describe('a terminal-only mood is not reported as dead', () => {
  it('keeps `triumphant` out of neverObserved when it only ever ends runs', () => {
    // THE MISTAKE THIS PREVENTS. `triumphant` is reachable only at `status === 'ended'`, so a fold
    // over legs alone reports it at zero — and "never observed" is the signal that a palette
    // should not be built. Reporting a terminal mood as dead would delete a screen that exists.
    const totals = moodTotals(
      moodStats(
        summaryOf([run('fixture.short', { default: 40 }, 'triumphant')]),
        SCENARIOS.filter((s) => String(s.route.id) === 'fixture.short'),
      ),
    );
    expect(totals.byMood.triumphant).toBe(0);
    expect(totals.terminal.triumphant).toBe(1);
    expect(totals.neverObserved).not.toContain('triumphant');
  });

  it('DOES report a mood no screen ever showed', () => {
    const totals = moodTotals(
      moodStats(
        summaryOf([run('fixture.short', { default: 40 }, 'default')]),
        SCENARIOS.filter((s) => String(s.route.id) === 'fixture.short'),
      ),
    );
    expect(totals.neverObserved).toContain('storm');
    expect(totals.neverObserved).toContain('wanted');
    expect(totals.neverObserved).not.toContain('default');
  });
});

describe('the peak route is printed beside the mean, and that is the point', () => {
  it('surfaces a mood that is rare corpus-wide and constant on one route', () => {
    // The same argument gate 9 makes about pooled completion: a mood at 2% corpus-wide and 100% on
    // one route is always-on for anyone who picks that route, and route choice is the player's
    // first meaningful decision. An average would hide it completely.
    const ids = [...new Set(SCENARIOS.map((s) => String(s.route.id)))];
    expect(ids.length).toBeGreaterThan(1);
    const [rare, ...rest] = ids;

    const runs = [run(rare!, { storm: 40 }), ...rest.map((id) => run(id, { default: 1000 }))];
    const table = formatMoods(summaryOf(runs), SCENARIOS, {
      seed: 'moods',
      runs: runs.length,
      pack: 'fixture',
      elapsedMs: 1,
    });

    const stormLine = table.split('\n').find((l) => l.startsWith('storm'));
    expect(stormLine).toBeDefined();
    // Rare in the corpus...
    expect(stormLine).toMatch(/\s[01]\.\d\d%\s/);
    // ...and total on the route that has it, which is the number that matters.
    expect(stormLine).toContain('100.00%');
    expect(stormLine).toContain(rare!);
  });

  it('renders a real corpus run without dividing by zero anywhere', () => {
    const table = formatMoods(SUMMARY, SCENARIOS, {
      seed: 'moods',
      runs: 300,
      pack: 'fixture',
      elapsedMs: 1,
    });
    expect(table).toContain('# Sim mood occupancy');
    expect(table).toContain('Legs NOT');
    expect(table).toContain('TERMINAL MOOD');
    expect(table).not.toContain('NaN');
    expect(table).not.toContain('Infinity');
    // Every mood in the vocabulary gets a row, including the ones at zero — a missing row reads
    // as "not part of the system" rather than "never happened".
    for (const mood of MOOD_IDS) {
      expect(table.split('\n').some((l) => l.startsWith(mood))).toBe(true);
    }
  });
});
