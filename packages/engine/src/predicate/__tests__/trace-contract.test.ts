import { describe, expect, it } from 'vitest';
import { flagId, itemId, npcId, traitId } from '../../ids/content-ids.ts';
import { createResources } from '../../state/resources.ts';
import { describeReason } from '../describe-reason.ts';
import { evaluatePredicate } from '../evaluate-predicate.ts';
import { PREDICATE_KINDS, type Predicate, type PredicateKindsAreExhaustive } from '../predicate.ts';
import { type ReasonNode } from '../reason-node.ts';
import { makeContext, NO_REFS_KNOWN } from './support/make-context.ts';

/**
 * The trace is a FROZEN CONTRACT (docs/adr/0007 decision 2). Phase 7 renders it as the
 * dice modifier chips and the result screen reads it for design pillar 2, so these
 * assertions are about the shape other phases will build on, not about this evaluator.
 */

/** Every kind, so the sweeps below cannot silently miss one. */
const ALL_PREDICATES: readonly Predicate[] = [
  { kind: 'always' },
  { kind: 'never' },
  { kind: 'all', of: [{ kind: 'always' }, { kind: 'never' }] },
  { kind: 'any', of: [{ kind: 'always' }, { kind: 'never' }] },
  { kind: 'not', of: { kind: 'always' } },
  { kind: 'resource', key: 'money', cmp: { op: 'gte', value: 30 } },
  { kind: 'skill', key: 'negotiation', cmp: { op: 'gte', value: 2 } },
  { kind: 'language', id: 'ru' as never },
  { kind: 'trait', id: traitId('smooth_talker') },
  { kind: 'item', id: itemId('ration'), cmp: { op: 'gte', value: 1 } },
  { kind: 'passport', present: true, valid: null, flagged: null },
  { kind: 'visa', region: 'schengen' as never, valid: true },
  { kind: 'flag', id: flagId('wanted'), cmp: { op: 'isSet' } },
  { kind: 'relationship', npc: npcId('dmitri'), cmp: { op: 'gte', value: 0 } },
  { kind: 'npcMet', npc: npcId('dmitri'), met: true },
  { kind: 'eventMemory', event: 'e' as never, field: 'count', cmp: { op: 'gte', value: 1 } },
  { kind: 'transportMode', anyOf: ['bus'] },
  { kind: 'transportStat', key: 'fuel', cmp: { op: 'gte', value: 1 } },
  { kind: 'vehicleLegal', legal: true },
  { kind: 'weather', anyOf: ['clear'] },
  { kind: 'timeOfDay', anyOf: ['morning'] },
  { kind: 'locationType', anyOf: ['checkpoint'] },
  { kind: 'routeProfile', anyOf: ['cheapest'] },
  { kind: 'status', anyOf: ['travelling'] },
  { kind: 'leg', cmp: { op: 'gte', value: 0 } },
  { kind: 'day', cmp: { op: 'gte', value: 0 } },
  { kind: 'tension', cmp: { op: 'gte', value: 0 } },
  { kind: 'chance', percent: 50 },
];

function walk(node: ReasonNode, visit: (n: ReasonNode) => void): void {
  visit(node);
  for (const child of node.children) walk(child, visit);
}

describe('trace consistency', () => {
  it('exercises every predicate kind', () => {
    // Guards the sweeps: a kind added to the union but not constructed here would make every
    // sweep below pass without touching it. Compared against PREDICATE_KINDS rather than a
    // hard-coded count, so the failure names the missing kind instead of a drifted number.
    const kinds = new Set<string>(ALL_PREDICATES.map((p) => p.kind));
    expect([...PREDICATE_KINDS].filter((kind) => !kinds.has(kind))).toEqual([]);
    expect(kinds.size).toBe(PREDICATE_KINDS.length);
  });

  it('PREDICATE_KINDS covers the union exactly', () => {
    // The type does the work: `PredicateKindsAreExhaustive` resolves to `never` if the union
    // has a kind the array lacks, and `satisfies` in predicate.ts catches the reverse. This
    // line only forces the check to be instantiated somewhere a test run reports on.
    const exhaustive: PredicateKindsAreExhaustive = true;
    expect(exhaustive).toBe(true);
  });

  it.each(ALL_PREDICATES.map((p) => [p.kind, p] as const))(
    '%s: trace.value matches the returned value',
    (_kind, predicate) => {
      const result = evaluatePredicate(predicate, makeContext());
      expect(result.trace.value).toBe(result.value);
    },
  );

  it('every node in a nested trace agrees with its own children', () => {
    // Recursive consistency, not just the root: a wrapper that reported the wrong value
    // would still pass a root-only check whenever the answer happened to coincide.
    const predicate: Predicate = {
      kind: 'all',
      of: [
        {
          kind: 'any',
          of: [{ kind: 'never' }, { kind: 'resource', key: 'money', cmp: { op: 'gte', value: 0 } }],
        },
        { kind: 'not', of: { kind: 'flag', id: flagId('wanted'), cmp: { op: 'isSet' } } },
      ],
    };

    walk(evaluatePredicate(predicate, makeContext()).trace, (node) => {
      if (node.kind === 'all') expect(node.value).toBe(node.children.every((c) => c.value));
      if (node.kind === 'any') expect(node.value).toBe(node.children.some((c) => c.value));
      if (node.kind === 'not') expect(node.value).toBe(!node.children[0]?.value);
    });
  });

  it('gives leaves an empty children array rather than undefined', () => {
    walk(evaluatePredicate({ kind: 'always' }, makeContext()).trace, (node) => {
      expect(Array.isArray(node.children)).toBe(true);
    });
  });
});

describe('trace labels are i18n keys (CLAUDE.md 2.4)', () => {
  const KEY_SHAPE = /^reason\.[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9-]+)*$/;

  it.each(ALL_PREDICATES.map((p) => [p.kind, p] as const))(
    '%s emits only key-shaped labels',
    (_kind, predicate) => {
      walk(evaluatePredicate(predicate, makeContext()).trace, (node) => {
        expect(node.labelKey).toMatch(KEY_SHAPE);
        // Prose detector: a translated sentence would contain spaces.
        expect(node.labelKey).not.toContain(' ');
      });
    },
  );

  it('rejects a prose label if one were ever introduced', () => {
    // Guards the guard: the regex above must actually be able to fail.
    expect('You lost your passport').not.toMatch(KEY_SHAPE);
    expect('reason.resource.gte').toMatch(KEY_SHAPE);
  });

  it('keeps params to JSON primitives so a trace can be persisted', () => {
    for (const predicate of ALL_PREDICATES) {
      walk(evaluatePredicate(predicate, makeContext()).trace, (node) => {
        for (const value of Object.values(node.params)) {
          expect(['string', 'number', 'boolean']).toContain(typeof value);
        }
      });
    }
  });
});

describe('describeReason', () => {
  it('drops structural nodes and keeps leaves', () => {
    const lines = describeReason(
      evaluatePredicate(
        {
          kind: 'all',
          of: [
            { kind: 'weather', anyOf: ['clear'] },
            { kind: 'leg', cmp: { op: 'gte', value: 0 } },
          ],
        },
        makeContext(),
      ).trace,
    );

    expect(lines.map((l) => l.labelKey)).toEqual(['reason.weather', 'reason.leg.gte']);
  });

  it('inverts polarity under a not', () => {
    // The leaf is TRUE, but it is what made the requirement FAIL, so the chip reads as a con.
    const ctx = makeContext({
      flags: { [flagId('wanted')]: { value: true, setAtLeg: 0, expiresAtLeg: null } },
    });
    const trace = evaluatePredicate(
      { kind: 'not', of: { kind: 'flag', id: flagId('wanted'), cmp: { op: 'isSet' } } },
      ctx,
    ).trace;

    const lines = describeReason(trace);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.polarity).toBe('con');
  });

  it('composes nested negation', () => {
    const ctx = makeContext({ resources: { ...createResources(), money: 100 } });
    const inner: Predicate = { kind: 'resource', key: 'money', cmp: { op: 'gte', value: 30 } };

    expect(describeReason(evaluatePredicate(inner, ctx).trace)[0]?.polarity).toBe('pro');
    expect(
      describeReason(evaluatePredicate({ kind: 'not', of: inner }, ctx).trace)[0]?.polarity,
    ).toBe('con');
    expect(
      describeReason(
        evaluatePredicate({ kind: 'not', of: { kind: 'not', of: inner } }, ctx).trace,
      )[0]?.polarity,
    ).toBe('pro');
  });

  it('omits always and never, which are authoring tools not player information', () => {
    expect(describeReason(evaluatePredicate({ kind: 'always' }, makeContext()).trace)).toEqual([]);
  });

  it('keeps unknown-ref visible', () => {
    const ctx = makeContext({}, NO_REFS_KNOWN);
    const lines = describeReason(evaluatePredicate({ kind: 'trait', id: traitId('x') }, ctx).trace);
    expect(lines[0]?.labelKey).toBe('reason.unknown-ref');
  });
});
