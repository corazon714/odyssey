import { readFlag } from '../state/flag-access.ts';
import { compareFlag } from './flag-cmp.ts';
import { compareNumber } from './number-cmp.ts';
import { type PredicateContext } from './predicate-context.ts';
import { type Predicate } from './predicate.ts';
import { leafReason, unknownRefReason, type ReasonNode } from './reason-node.ts';

/**
 * Leaves that read the run's memory (ADR 0001's three mechanisms).
 *
 * Note the asymmetry in how a missing id is treated, which is deliberate:
 *
 *   flag        — an unrecognised id is just a flag that was never set. Flags are RUNTIME
 *                 data; there is no registry to be missing from until flags.yaml lands, and
 *                 even then an old save may legitimately carry a retired flag.
 *   npc / event — an unrecognised id is a CONTENT reference that no longer resolves, so it
 *                 gets its own `unknown-ref` node and the sim can count it. Silently
 *                 returning false here would hide a whole class of content bug.
 */
type MemoryLeaf = Extract<Predicate, { kind: 'flag' | 'relationship' | 'npcMet' | 'eventMemory' }>;

export function evaluateMemoryLeaf(predicate: MemoryLeaf, ctx: PredicateContext): ReasonNode {
  const { state } = ctx;

  switch (predicate.kind) {
    case 'flag': {
      // readFlag applies TTL, so an expired flag reads as unset without needing a sweep.
      const entry = readFlag(state, predicate.id);
      return leafReason(
        'flag',
        compareFlag(predicate.cmp, entry),
        `reason.flag.${predicate.cmp.op}`,
        {
          id: predicate.id,
          set: entry !== null,
        },
      );
    }

    case 'relationship': {
      if (!ctx.refs.hasNpc(predicate.npc)) return unknownRefReason('npc', predicate.npc);
      const entry = state.relationships[predicate.npc];
      const trust = entry?.trust ?? 0;

      return leafReason(
        'relationship',
        compareNumber(predicate.cmp, trust),
        `reason.relationship.${predicate.cmp.op}`,
        { npc: predicate.npc, required: predicate.cmp.value, actual: trust },
      );
    }

    case 'npcMet': {
      if (!ctx.refs.hasNpc(predicate.npc)) return unknownRefReason('npc', predicate.npc);
      const met = state.relationships[predicate.npc]?.met ?? false;
      return leafReason('npcMet', met === predicate.met, 'reason.npcMet', {
        npc: predicate.npc,
        actual: met,
      });
    }

    case 'eventMemory': {
      if (!ctx.refs.hasEvent(predicate.event)) return unknownRefReason('event', predicate.event);
      const entry = state.eventMemory[predicate.event];
      // Never seen: count 0, and lastLeg -1 so "seen in the last 3 legs" is false at leg 0
      // rather than accidentally true against a default of 0.
      const actual = predicate.field === 'count' ? (entry?.count ?? 0) : (entry?.lastLeg ?? -1);

      return leafReason(
        'eventMemory',
        compareNumber(predicate.cmp, actual),
        `reason.eventMemory.${predicate.cmp.op}`,
        { event: predicate.event, field: predicate.field, required: predicate.cmp.value, actual },
      );
    }

    default:
      return unreachableLeaf(predicate);
  }
}

function unreachableLeaf(predicate: never): ReasonNode {
  void predicate;
  return leafReason('unknown-kind', false, 'reason.unknown-kind');
}
