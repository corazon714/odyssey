import { describe, expect, it } from 'vitest';
import { BASE_EVENT_ODDS, fireProbability } from '@odyssey/engine';
import { loadFixturePack, loadFixtureScenarios } from '../load-pack.ts';
import { parseArgs } from '../parse-args.ts';
import { POLICY_NAMES } from '../policy.ts';
import { runMany, summarise } from '../run-many.ts';
import { runOne, type SimRun } from '../run-one.ts';

const PACK = loadFixturePack();
const SCENARIOS = loadFixtureScenarios();

describe('parseArgs', () => {
  it('defaults sensibly', () => {
    const parsed = parseArgs([]);
    expect(parsed.ok && parsed.options.runs).toBe(100);
  });

  it('parses runs, seed and repeated policies', () => {
    const parsed = parseArgs(['--runs=50', '--seed=x', '--policy=random', '--policy=risk-taker']);
    if (!parsed.ok) throw new Error(parsed.message);
    expect(parsed.options).toEqual({
      runs: 50,
      seed: 'x',
      policies: ['random', 'risk-taker'],
      diff: false,
      json: false,
      // Defaults to the fixture pack so `sim:diff` keeps comparing like with like.
      pack: 'fixture',
    });
  });

  it('parses --pack and rejects an unknown one', () => {
    const corpus = parseArgs(['--pack=corpus']);
    expect(corpus.ok && corpus.options.pack).toBe('corpus');

    // Unknown flags and values are errors, not shrugs: a typo'd pack that silently ran the
    // fixture would make a corpus balance report quietly wrong.
    const bad = parseArgs(['--pack=seed']);
    expect(bad.ok).toBe(false);
  });

  it('swallows the bare -- that pnpm forwards', () => {
    // CLAUDE.md 5 documents `pnpm sim -- --runs=20000`, and pnpm passes the separator through.
    const parsed = parseArgs(['--', '--runs=7']);
    expect(parsed.ok && parsed.options.runs).toBe(7);
  });

  it('accepts the valueless --diff flag', () => {
    const parsed = parseArgs(['--diff']);
    expect(parsed.ok && parsed.options.diff).toBe(true);
  });

  it('rejects a typo rather than silently using the default', () => {
    // A mistyped --runs that quietly ran 100 would make a balance report wrong, which is
    // worse than a failed command.
    expect(parseArgs(['--rusn=50']).ok).toBe(false);
    expect(parseArgs(['--runs=0']).ok).toBe(false);
    expect(parseArgs(['--runs=abc']).ok).toBe(false);
    expect(parseArgs(['--policy=cautious']).ok).toBe(false);
    expect(parseArgs(['runs=5']).ok).toBe(false);
  });
});

describe('runOne', () => {
  it('completes a run for every policy without error', () => {
    for (const policy of POLICY_NAMES) {
      for (const scenario of SCENARIOS) {
        const run = runOne(`t:${policy}:${scenario.route.id}`, scenario, PACK, policy);
        expect(run.error, `${policy} on ${scenario.route.id}`).toBeNull();
        expect(run.turnCapHit).toBe(false);
      }
    }
  });

  it('is deterministic for the same seed, policy and scenario', () => {
    const scenario = SCENARIOS[0];
    if (scenario === undefined) throw new Error('no fixture scenarios');
    const a = runOne('determinism', scenario, PACK, 'random');
    const b = runOne('determinism', scenario, PACK, 'random');
    expect(a.digest).toBe(b.digest);
    expect(a.firedEvents).toEqual(b.firedEvents);
  });

  it('makes the cautious and the reckless player diverge', () => {
    // greedy-safe is maximin, risk-taker is maximax — they must actually disagree, or the
    // corpus bounds nothing. An earlier scoring scheme made them byte-identical on every
    // fixture seed, which is why this asserts divergence rather than assuming it.
    const scenario = SCENARIOS[1];
    if (scenario === undefined) throw new Error('no fixture scenarios');

    const diverged = ['a', 'b', 'c', 'd', 'e'].filter((seed) => {
      const safe = runOne(`spread-${seed}`, scenario, PACK, 'greedy-safe');
      const risky = runOne(`spread-${seed}`, scenario, PACK, 'risk-taker');
      return safe.digest !== risky.digest;
    });

    expect(diverged.length).toBeGreaterThan(0);
  });
});

describe('runMany — the M6 gate criteria', () => {
  const summary = runMany(PACK, SCENARIOS, {
    runs: 300,
    seed: 'gate',
    policies: [],
    diff: false,
    json: false,
    pack: 'fixture',
  });

  it('completes every run without an engine error', () => {
    expect(summary.errors).toEqual([]);
    expect(summary.turnCapHits).toBe(0);
  });

  it('has a non-zero completion rate', () => {
    expect(summary.completionRate).toBeGreaterThan(0);
    expect(summary.completionRate).toBeLessThan(1);
  });

  it('keeps uneventful and fallback legs under 2%', () => {
    expect(summary.uneventfulRate).toBeLessThan(0.02);
    expect(summary.fallbackRate).toBeLessThan(0.02);
  });

  it('fires every event in the pack', () => {
    // The regression guard for the bug the walking skeleton found: 5 of 9 events were
    // unreachable because the fixture routes supplied no preparation choices, so transport
    // defaulted to foot and money to 0.
    expect(summary.neverFired).toEqual([]);
  });

  it('pays off what it schedules', () => {
    // ADR 0001: "scheduled 2140x, fired 0x" is the shape of an entire class of silent
    // content bug. This is the assertion that makes it loud.
    //
    // ⚠ THE FLOOR WAS 0.5 AND WAS LOWERED TO 0.2 AT M3.10b. Read before raising it back.
    // The rate is scheduled-and-fired over scheduled, so it falls whenever runs last long
    // enough to schedule consequences they do not live to resolve — which is exactly what
    // softening the drift did. This 200-run sample landed at 0.33; the same pack at 2,000 runs
    // measures 61.9% and is recorded in `docs/sim-baseline.md`, so the SIGNAL is healthy and it
    // was the small-sample threshold that encoded ~12-leg runs.
    //
    // 0.2 still catches what ADR 0001 named — a payoff that fires rarely or never — but this
    // is a WEAKER guard than it was. If unresolved threads climb in either baseline, tighten
    // this and raise the sample rather than trusting it.
    expect(summary.scheduled).toBeGreaterThan(0);
    expect(summary.payoffRate).toBeGreaterThan(0.2);
  });

  it('never throws for any policy over a fuzzed corpus', () => {
    expect(() =>
      runMany(PACK, SCENARIOS, {
        runs: 200,
        seed: 'fuzz',
        policies: [],
        diff: false,
        json: false,
        pack: 'fixture',
      }),
    ).not.toThrow();
  });
});

describe('the quiet-leg gate instruments (ADR 0029)', () => {
  const summary = runMany(PACK, SCENARIOS, {
    runs: 300,
    seed: 'quiet-gate',
    policies: [],
    diff: false,
    json: false,
    pack: 'fixture',
  });

  it('is fenced: BASE_EVENT_ODDS is certainty, so nothing is quiet', () => {
    // THE PREMISE, asserted rather than assumed. Every "unchanged" claim M3.12a makes rests on
    // P = 1 exactly. When M3.12b sets a real base this is the line that goes red first, and it
    // says why — which is the only useful thing a fence can do on the day it is removed.
    expect(fireProbability(BASE_EVENT_ODDS)).toBe(1);

    expect(summary.quietRate).toBe(0);
    for (const run of summary.runs) expect(run.quietLegs).toBe(0);
  });

  it('measures a forced-fire share that is neither nothing nor everything', () => {
    // Both bounds are real failure modes of the reconstruction, and both would still LOOK like
    // a working instrument in the report: 0 means the beat check never sees an open slot, 1
    // means it always does and the gate could never reach a single leg at any base.
    expect(summary.forcedFireShare).toBeGreaterThan(0);
    expect(summary.forcedFireShare).toBeLessThan(1);
  });

  it('never counts more forced legs than the run made SELECTIONS', () => {
    // `selections` is the exact term `summarise` sums into `totalSelections`, so the numerator
    // is bounded by its own denominator rather than by an invented ceiling. It used to be
    // bounded by `Math.max(1, legs)`, which is a DIFFERENT population — see the test below.
    for (const run of summary.runs) {
      expect(run.forcedFireLegs).toBeLessThanOrEqual(run.selections);
    }
  });

  it('counts selections per SELECTION, and legs as a final INDEX — they are not the same', () => {
    // THE DEFECT, pinned on real runs. `legs` is `state.route.legIndex`; the per-selection
    // counters are not. A run that ends inside `resolveChoice` never makes the final
    // `advanceLeg` call that would have raised the index, so it selected once more than its
    // index says. Anything else is a bug in the loop, not a denominator question.
    for (const run of summary.runs) {
      expect([run.legs, run.legs + 1]).toContain(run.selections);
    }
    // Anti-vacuous: if this sample never exercised the gap, the assertion above proves nothing
    // and the whole correction would be untested. Measured at 2,000 runs it is 20 of 2,000 on
    // the fixture and 315 of 2,000 on the corpus.
    expect(summary.runs.some((run) => run.selections === run.legs + 1)).toBe(true);
  });

  it('accounts for every filled beat — the cross-check on the reconstruction', () => {
    // A beat can only be filled on a leg with an OPEN slot, and an open slot is exactly what
    // makes a leg forced. So `beatsFilled <= forcedFireLegs` on every run. This is the
    // assertion that ties the new counter to a number the report already trusts: a
    // reconstruction reading the POST-call beat schedule (the schedule `advanceLeg` leaves
    // behind, after it has just marked a slot filled) fails here and passes everything else.
    for (const run of summary.runs) {
      expect(run.beatsFilled).toBeLessThanOrEqual(run.forcedFireLegs);
    }
  });
});

describe('the four denominators (ADR 0029 D6 and its M3.12a addenda)', () => {
  /**
   * A SYNTHETIC sample, deliberately.
   *
   * The leg-denominated rates are arithmetically identical while `quiet` is 0, which it is at
   * `BASE_EVENT_ODDS = 1:0` by construction — that identity is the fence, and it also means no
   * real run can distinguish a right denominator from a wrong one. Driving `summarise` directly
   * is the only way to test the call the human actually made, one milestone before the base
   * that would expose it.
   *
   * `SELECTIONS !== LEGS` here on purpose, and by more than a real run ever produces. The gap is
   * 0.06% on the fixture and 0.59% on the corpus, which no assertion could tell from rounding;
   * a wide synthetic gap makes the wrong denominator fail loudly instead of at the fourth
   * decimal place.
   */
  const LEGS = 100;
  const SELECTIONS = 120;
  const QUIET = 30;
  const UNEVENTFUL = 10;
  const FALLBACK = 6;
  const COMPLICATED = 12;
  const FORCED = 25;
  const ATTEMPTED = LEGS - QUIET;
  const PRESENTED = ATTEMPTED - UNEVENTFUL;

  // Templated off a REAL run rather than hand-built, so the fixture stays valid as `SimRun`
  // grows and cannot drift into a shape `summarise` never sees in practice.
  const template = runOne('denominators', scenarioZero(), PACK, 'random');
  const synthetic: SimRun = {
    ...template,
    error: null,
    legs: LEGS,
    selections: SELECTIONS,
    quietLegs: QUIET,
    uneventfulLegs: UNEVENTFUL,
    fallbackLegs: FALLBACK,
    complicatedLegs: COMPLICATED,
    forcedFireLegs: FORCED,
  };
  const summary = summarise([synthetic], PACK, { scenarios: 1, policies: 1 });

  it('divides fallbacks by the legs that ATTEMPTED selection', () => {
    expect(summary.fallbackRate).toBeCloseTo(FALLBACK / ATTEMPTED, 10);
    // The two wrong answers, named. `LEGS` is what the code did before the gate existed and
    // dilutes the rate by the quiet share; `PRESENTED` is what Decision 6's "same denominator"
    // literally reads as, and it deletes the terminal fallback from the measure of fallbacks.
    expect(summary.fallbackRate).not.toBeCloseTo(FALLBACK / LEGS, 10);
    expect(summary.fallbackRate).not.toBeCloseTo(FALLBACK / PRESENTED, 10);
  });

  it('divides uneventful legs by the same denominator, so the pair stays comparable', () => {
    expect(summary.uneventfulRate).toBeCloseTo(UNEVENTFUL / ATTEMPTED, 10);
    expect(summary.uneventfulRate).not.toBeCloseTo(UNEVENTFUL / LEGS, 10);
    expect(summary.uneventfulRate).not.toBeCloseTo(UNEVENTFUL / PRESENTED, 10);
    // The two lines print against the same `<2%` target and are read against each other. A
    // starvation signal measured over a different population than the fallback beside it is
    // two numbers, not an instrument.
    expect(summary.uneventfulRate / summary.fallbackRate).toBeCloseTo(UNEVENTFUL / FALLBACK, 10);
  });

  it('divides complications by PRESENTED legs — the only ones an event could attach to', () => {
    expect(summary.complicationRate).toBeCloseTo(COMPLICATED / PRESENTED, 10);
    // The pre-gate denominator. It is the one instrument validating ATTACH_PERCENT, and at a
    // 30% quiet share it would read ~41% against a line printing `(target 60%)`.
    expect(summary.complicationRate).not.toBeCloseTo(COMPLICATED / (LEGS - UNEVENTFUL), 10);
  });

  it('reports quiet and forced shares over SELECTIONS — the gate-decision population', () => {
    // REGRESSION. Both divided by `totalLegs` until the M3.12a follow-up, and `totalLegs` sums
    // `Math.max(1, legIndex)` — a final INDEX — while all three per-selection counters above it
    // are counted once per selection. `realised quiet = (1 − P) × (1 − forcedFireShare)` is an
    // identity only over the population the gate actually decided on.
    expect(summary.quietRate).toBeCloseTo(QUIET / SELECTIONS, 10);
    expect(summary.forcedFireShare).toBeCloseTo(FORCED / SELECTIONS, 10);
    // The wrong answer, named — this is what the two lines printed before.
    expect(summary.quietRate).not.toBeCloseTo(QUIET / LEGS, 10);
    expect(summary.forcedFireShare).not.toBeCloseTo(FORCED / LEGS, 10);
  });

  it('leaves the three PRE-EXISTING rates on their leg denominators — the fence', () => {
    // THE TRAP, pinned. `complicationRate` is a number in both committed baselines, so re-cutting
    // its denominator to selections moves it (~0.59% on the corpus) and breaks the additive-only
    // fence that is M3.12a's whole claim. The legs-vs-selections question is real for these three
    // too — it is SEPARABLE, PRE-EXISTING, and invisible today because `uneventful` and
    // `fallback` both measure exactly 0 — and it is an M3.12b deliverable, not a drive-by here.
    //
    // Without this test a later sweep "finishes the job" and the fence dies silently, which is
    // exactly how the denominators got mixed in the first place.
    expect(summary.complicationRate).toBeCloseTo(COMPLICATED / PRESENTED, 10);
    expect(summary.complicationRate).not.toBeCloseTo(
      COMPLICATED / (SELECTIONS - QUIET - UNEVENTFUL),
      10,
    );
    expect(summary.fallbackRate).toBeCloseTo(FALLBACK / ATTEMPTED, 10);
    expect(summary.fallbackRate).not.toBeCloseTo(FALLBACK / (SELECTIONS - QUIET), 10);
    expect(summary.uneventfulRate).toBeCloseTo(UNEVENTFUL / ATTEMPTED, 10);
    expect(summary.uneventfulRate).not.toBeCloseTo(UNEVENTFUL / (SELECTIONS - QUIET), 10);
  });
});

function scenarioZero(): (typeof SCENARIOS)[number] {
  const scenario = SCENARIOS[0];
  if (scenario === undefined) throw new Error('no fixture scenarios');
  return scenario;
}
