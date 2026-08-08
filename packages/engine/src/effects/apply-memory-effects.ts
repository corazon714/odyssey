import { schedulePending } from '../queue/schedule-pending.ts';
import { readFlag } from '../state/flag-access.ts';
import { type RunState } from '../state/run-state.ts';
import { appliedEffect, type AppliedEffect } from './applied-effect.ts';
import { type EffectContext } from './effect-context.ts';
import { type Effect } from './effect.ts';

/**
 * The memory mechanisms: flags, relationships, the consequence queue, unlocked endings.
 *
 * `scheduleEvent` APPENDS NAIVELY here. Caps, per-eventId limits, deterministic eviction and
 * rebasing across a route change all land in M8. Building them now would mean building them
 * against a queue nothing reads yet.
 */
type MemoryEffect = Extract<
  Effect,
  { op: 'flag' | 'clearFlag' | 'relationship' | 'scheduleEvent' | 'unlockEnding' }
>;

export type MemoryResult = { readonly state: RunState; readonly applied: AppliedEffect };

export function applyMemoryEffect(
  state: RunState,
  effect: MemoryEffect,
  ctx: EffectContext,
): MemoryResult {
  const leg = state.route.legIndex;

  switch (effect.op) {
    case 'flag': {
      const existing = readFlag(state, effect.id);
      const expiresAtLeg = effect.ttlLegs === null ? null : leg + effect.ttlLegs;

      // Re-setting a flag to the same value with the same lifetime is a noop, but re-setting
      // it with a NEW ttl is not — that is how a temporary flag gets renewed.
      if (
        existing !== null &&
        existing.value === effect.value &&
        existing.expiresAtLeg === expiresAtLeg
      ) {
        return { state, applied: appliedEffect(effect, false, { id: effect.id }) };
      }

      return {
        state: {
          ...state,
          flags: {
            ...state.flags,
            [effect.id]: { value: effect.value, setAtLeg: leg, expiresAtLeg },
          },
        },
        applied: appliedEffect(effect, true, {
          id: effect.id,
          value: effect.value,
          permanent: expiresAtLeg === null,
        }),
      };
    }

    case 'clearFlag': {
      if (state.flags[effect.id] === undefined) {
        return { state, applied: appliedEffect(effect, false, { id: effect.id }) };
      }
      const next = { ...state.flags };
      delete next[effect.id];
      return {
        state: { ...state, flags: next },
        applied: appliedEffect(effect, true, { id: effect.id }),
      };
    }

    case 'relationship': {
      const existing = state.relationships[effect.npc];
      const trust = (existing?.trust ?? 0) + effect.trustDelta;
      const met = effect.meet || (existing?.met ?? false);
      // Tags are a set in spirit but an array in state (engine-spec 1 bans Set), so dedupe
      // on write and keep insertion order — which is stable, so the digest is too.
      const tags = [...(existing?.tags ?? [])];
      for (const tag of effect.addTags) {
        if (!tags.includes(tag)) tags.push(tag);
      }

      return {
        state: {
          ...state,
          relationships: {
            ...state.relationships,
            [effect.npc]: { trust, met, lastSeenLeg: leg, tags },
          },
        },
        applied: appliedEffect(effect, true, {
          npc: effect.npc,
          trustDelta: effect.trustDelta,
          trust,
          met,
        }),
      };
    }

    case 'scheduleEvent': {
      const [fromOffset, toOffset] = effect.inLegs;
      // Offsets are relative to now; the stored window is absolute, plus scheduledAtLeg so a
      // future route change can rebase it (M8) rather than voiding it.
      const earliestLeg = leg + Math.max(0, Math.min(fromOffset, toOffset));
      const latestLeg = leg + Math.max(fromOffset, toOffset);

      const scheduled = schedulePending(
        state.pendingEvents,
        {
          eventId: effect.eventId,
          earliestLeg,
          latestLeg,
          scheduledAtLeg: leg,
          source: ctx.sourceEventId,
          requires: effect.requires,
          payload: effect.payload,
        },
        leg,
      );

      return {
        state: { ...state, pendingEvents: scheduled.pending },
        applied: appliedEffect(effect, true, {
          eventId: effect.eventId,
          earliestLeg,
          latestLeg,
          source: ctx.sourceEventId,
          // Non-zero when the caps displaced something — a queue-pressure signal for the sim.
          evicted: scheduled.dropped.length,
        }),
      };
    }

    case 'unlockEnding': {
      if (state.unlockedEndings.includes(effect.id)) {
        return { state, applied: appliedEffect(effect, false, { id: effect.id }) };
      }
      return {
        state: { ...state, unlockedEndings: [...state.unlockedEndings, effect.id] },
        applied: appliedEffect(effect, true, { id: effect.id }),
      };
    }

    default:
      return unreachable(effect, state);
  }
}

function unreachable(effect: never, state: RunState): MemoryResult {
  void effect;
  return { state, applied: appliedEffect({ op: 'clearFlag' } as never, false) };
}
