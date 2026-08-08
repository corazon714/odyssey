import { describe, expect, it } from 'vitest';
import { loadFixturePack, loadFixtureScenarios } from '../load-pack.ts';
import { parseArgs } from '../parse-args.ts';
import { POLICY_NAMES } from '../policy.ts';
import { runMany } from '../run-many.ts';
import { runOne } from '../run-one.ts';

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
    });
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
  const summary = runMany(PACK, SCENARIOS, { runs: 300, seed: 'gate', policies: [], diff: false });

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
    expect(summary.scheduled).toBeGreaterThan(0);
    expect(summary.payoffRate).toBeGreaterThan(0.5);
  });

  it('never throws for any policy over a fuzzed corpus', () => {
    expect(() =>
      runMany(PACK, SCENARIOS, { runs: 200, seed: 'fuzz', policies: [], diff: false }),
    ).not.toThrow();
  });
});
