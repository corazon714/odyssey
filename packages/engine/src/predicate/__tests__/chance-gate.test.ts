import { describe, expect, it } from 'vitest';
import { createRng } from '../../rng/rng.ts';
import { createRngCursors } from '../../rng/rng-cursors.ts';
import { createPredicateContext } from '../predicate-context.ts';
import { ALL_REFS_KNOWN } from '../predicate-context.ts';
import { evaluatePredicate } from '../evaluate-predicate.ts';
import { type Predicate } from '../predicate.ts';
import { makeContext, makeState } from './support/make-context.ts';

/**
 * The `chance` gate is the one predicate that touches randomness, and it is the one place
 * where a careless implementation would silently invalidate every golden run. See ADR 0005
 * decision 2.
 */

const scoped = (scope: string): ReturnType<typeof createPredicateContext> =>
  createPredicateContext(makeState(), ALL_REFS_KNOWN, scope);

describe('chance gate', () => {
  it('is certain at the extremes without consulting the generator', () => {
    expect(evaluatePredicate({ kind: 'chance', percent: 0 }, makeContext()).value).toBe(false);
    expect(evaluatePredicate({ kind: 'chance', percent: 100 }, makeContext()).value).toBe(true);
    expect(evaluatePredicate({ kind: 'chance', percent: -5 }, makeContext()).value).toBe(false);
    expect(evaluatePredicate({ kind: 'chance', percent: 150 }, makeContext()).value).toBe(true);
  });

  it('is idempotent within a scope', () => {
    // The director must be able to explain its reasoning without the explanation changing
    // the outcome.
    const ctx = scoped('border.bribe_attempt:4');
    const first = evaluatePredicate({ kind: 'chance', percent: 50 }, ctx);
    const second = evaluatePredicate({ kind: 'chance', percent: 50 }, ctx);
    expect(second.value).toBe(first.value);
    expect(second.trace.params).toEqual(first.trace.params);
  });

  it('gives different scopes independent answers', () => {
    const results = Array.from(
      { length: 40 },
      (_, i) => evaluatePredicate({ kind: 'chance', percent: 50 }, scoped(`event-${i}:0`)).value,
    );
    expect(new Set(results).size).toBe(2);
  });

  it('gives two gates in one predicate independent answers', () => {
    // Both are 50% in the same scope; without per-node addressing they would always agree.
    const predicate: Predicate = {
      kind: 'all',
      of: Array.from({ length: 12 }, () => ({ kind: 'chance', percent: 50 }) as const),
    };
    const trace = evaluatePredicate(predicate, scoped('same.scope:0')).trace;
    const values = trace.children.map((child) => child.value);
    expect(new Set(values).size).toBe(2);
  });

  it('ADVANCES NO CURSOR — the whole point', () => {
    // If a chance gate consumed eventPick, the draw COUNT would depend on how many events
    // the director evaluated, so adding one event would shift every later draw and
    // invalidate every golden run.
    const state = makeState();
    const rng = createRng(state.seed, createRngCursors());
    const before = rng.cursors();

    const ctx = createPredicateContext(state, ALL_REFS_KNOWN, 'scope:0');
    for (let i = 0; i < 50; i += 1) {
      evaluatePredicate({ kind: 'chance', percent: 50 }, ctx, `r${i}`);
    }

    expect(rng.cursors()).toEqual(before);
    expect(Object.values(rng.cursors()).every((c) => c === 0)).toBe(true);
  });

  it('lands near the requested rate', () => {
    let hits = 0;
    const trials = 4000;
    for (let i = 0; i < trials; i += 1) {
      if (evaluatePredicate({ kind: 'chance', percent: 30 }, scoped(`trial-${i}:0`)).value)
        hits += 1;
    }
    expect(hits / trials).toBeCloseTo(0.3, 1);
  });

  it('reports the roll as a 0-99 band for the result screen', () => {
    const { trace } = evaluatePredicate({ kind: 'chance', percent: 50 }, scoped('report:0'));
    const roll = trace.params['roll'];
    expect(typeof roll).toBe('number');
    expect(roll).toBeGreaterThanOrEqual(0);
    expect(roll).toBeLessThanOrEqual(99);
  });

  it('is stable across two runs of the same seed', () => {
    const a = evaluatePredicate({ kind: 'chance', percent: 42 }, scoped('stable:7'));
    const b = evaluatePredicate({ kind: 'chance', percent: 42 }, scoped('stable:7'));
    expect(a.value).toBe(b.value);
  });
});
