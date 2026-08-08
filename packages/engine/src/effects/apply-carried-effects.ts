import { type InventoryEntry } from '../state/memory-entries.ts';
import { type RunState } from '../state/run-state.ts';
import { appliedEffect, type AppliedEffect } from './applied-effect.ts';
import { type Effect } from './effect.ts';

/**
 * What the player carries: inventory and documents.
 *
 * The passport cases are deliberately separate ops rather than a single "set passport". A
 * lost passport (`present: false`) and never having had one (`null`) are different stories
 * with different escapes, and collapsing them into a settable record is how that distinction
 * gets destroyed by the first author who writes the obvious thing.
 */
type CarriedEffect = Extract<Effect, { op: 'item' | 'document' }>;

export type CarriedResult = { readonly state: RunState; readonly applied: AppliedEffect };

export function applyCarriedEffect(state: RunState, effect: CarriedEffect): CarriedResult {
  return effect.op === 'item' ? applyItem(state, effect) : applyDocument(state, effect);
}

function applyItem(state: RunState, effect: Extract<Effect, { op: 'item' }>): CarriedResult {
  const index = state.inventory.findIndex((entry) => entry.id === effect.id);
  const existing = index >= 0 ? state.inventory[index] : undefined;
  const before = existing?.count ?? 0;
  const after = Math.max(0, before + effect.countDelta);

  if (after === before && (existing === undefined || effect.condition === null)) {
    return {
      state,
      applied: appliedEffect(effect, false, {
        id: effect.id,
        requested: effect.countDelta,
        before,
      }),
    };
  }

  const inventory: InventoryEntry[] = [...state.inventory];

  if (after === 0) {
    if (index >= 0) inventory.splice(index, 1);
  } else if (existing === undefined) {
    inventory.push({ id: effect.id, count: after, condition: effect.condition });
  } else {
    inventory[index] = {
      id: effect.id,
      count: after,
      condition: effect.condition ?? existing.condition,
    };
  }

  return {
    state: { ...state, inventory },
    applied: appliedEffect(effect, true, {
      id: effect.id,
      requested: effect.countDelta,
      applied: after - before,
      after,
    }),
  };
}

function applyDocument(
  state: RunState,
  effect: Extract<Effect, { op: 'document' }>,
): CarriedResult {
  const { change } = effect;
  const documents = state.documents;

  switch (change.field) {
    case 'grantPassport':
      return {
        state: {
          ...state,
          documents: {
            ...documents,
            passport: { present: true, valid: change.valid, flagged: false },
          },
        },
        applied: appliedEffect(effect, true, { valid: change.valid }),
      };

    case 'losePassport': {
      if (documents.passport === null || !documents.passport.present) {
        return { state, applied: appliedEffect(effect, false) };
      }
      return {
        state: {
          ...state,
          documents: { ...documents, passport: { ...documents.passport, present: false } },
        },
        applied: appliedEffect(effect, true),
      };
    }

    case 'passportFlagged': {
      if (documents.passport === null || documents.passport.flagged === change.flagged) {
        return { state, applied: appliedEffect(effect, false, { flagged: change.flagged }) };
      }
      return {
        state: {
          ...state,
          documents: { ...documents, passport: { ...documents.passport, flagged: change.flagged } },
        },
        applied: appliedEffect(effect, true, { flagged: change.flagged }),
      };
    }

    case 'visa':
      return {
        state: {
          ...state,
          documents: {
            ...documents,
            visas: {
              ...documents.visas,
              [change.region]: { valid: change.valid, expiresDay: change.expiresDay },
            },
          },
        },
        applied: appliedEffect(effect, true, { region: change.region, valid: change.valid }),
      };

    case 'useTicket': {
      let found = false;
      const tickets = documents.tickets.map((ticket) => {
        if (ticket.id !== change.ticketId || ticket.used) return ticket;
        found = true;
        return { ...ticket, used: true };
      });

      if (!found) {
        return { state, applied: appliedEffect(effect, false, { ticketId: change.ticketId }) };
      }
      return {
        state: { ...state, documents: { ...documents, tickets } },
        applied: appliedEffect(effect, true, { ticketId: change.ticketId }),
      };
    }

    default:
      return unreachableChange(change, state, effect);
  }
}

function unreachableChange(change: never, state: RunState, effect: Effect): CarriedResult {
  void change;
  return { state, applied: appliedEffect(effect, false) };
}
