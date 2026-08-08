import { countEverywhere, countIn } from '../state/container-state.ts';
import { compareNumber } from './number-cmp.ts';
import { type PredicateContext } from './predicate-context.ts';
import { type Predicate } from './predicate.ts';
import { leafReason, unknownRefReason, type ReasonNode } from './reason-node.ts';

/**
 * Leaves that read the player's own condition — resources, skills, what they carry, what
 * papers they hold, what is carrying them.
 *
 * Every leaf reports `actual` alongside `required` in its params, because a chip that says
 * only "not enough money" is strictly worse than one that says "money 12 / 30". Design
 * pillar 2 is about reconstructing WHY, and the number is most of the why.
 */
type StateLeaf = Extract<
  Predicate,
  {
    kind:
      | 'resource'
      | 'skill'
      | 'language'
      | 'trait'
      | 'item'
      | 'passport'
      | 'visa'
      | 'transportMode'
      | 'transportStat'
      | 'vehicleLegal';
  }
>;

export function evaluateStateLeaf(predicate: StateLeaf, ctx: PredicateContext): ReasonNode {
  const { state } = ctx;

  switch (predicate.kind) {
    case 'resource': {
      const actual = state.resources[predicate.key];
      return leafReason(
        'resource',
        compareNumber(predicate.cmp, actual),
        `reason.resource.${predicate.cmp.op}`,
        { key: predicate.key, required: predicate.cmp.value, actual },
      );
    }

    case 'skill': {
      const actual = state.skills[predicate.key];
      return leafReason(
        'skill',
        compareNumber(predicate.cmp, actual),
        `reason.skill.${predicate.cmp.op}`,
        {
          key: predicate.key,
          required: predicate.cmp.value,
          actual,
        },
      );
    }

    case 'language':
      return leafReason(
        'language',
        state.skills.languages.includes(predicate.id),
        'reason.language',
        { id: predicate.id },
      );

    case 'trait': {
      if (!ctx.refs.hasTrait(predicate.id)) return unknownRefReason('trait', predicate.id);
      return leafReason('trait', state.traits.includes(predicate.id), 'reason.trait', {
        id: predicate.id,
      });
    }

    case 'item': {
      if (!ctx.refs.hasItem(predicate.id)) return unknownRefReason('item', predicate.id);
      // Summed across EVERY container: "do I have 3 rations" should not care whether they are
      // in the bag or the boot. The `item` effect drains in the same order for exactly this
      // reason — if the reader summed and the writer took the first match, a choice enabled
      // by 4 rations across two containers would charge the player for 2 (M2A.5, ADR 0017).
      //
      // `in` narrows the question to one container when the author means to ask it.
      const count =
        predicate.in === null
          ? countEverywhere(state.inventory, predicate.id)
          : countIn(state.inventory[predicate.in], predicate.id);
      return leafReason(
        'item',
        compareNumber(predicate.cmp, count),
        `reason.item.${predicate.cmp.op}`,
        {
          id: predicate.id,
          required: predicate.cmp.value,
          actual: count,
        },
      );
    }

    case 'passport': {
      const passport = state.documents.passport;
      // No passport at all reads as present/valid/flagged all false, which is distinct from
      // having one that is merely invalid — the difference the DocumentsState shape exists
      // to preserve.
      const present = passport?.present ?? false;
      const valid = passport?.valid ?? false;
      const flagged = passport?.flagged ?? false;

      const value =
        (predicate.present === null || predicate.present === present) &&
        (predicate.valid === null || predicate.valid === valid) &&
        (predicate.flagged === null || predicate.flagged === flagged);

      return leafReason('passport', value, 'reason.passport', { present, valid, flagged });
    }

    case 'visa': {
      const visa = state.documents.visas[predicate.region];
      const notExpired =
        visa !== undefined && (visa.expiresDay === null || state.clock.day < visa.expiresDay);
      const held = visa !== undefined && visa.valid && notExpired;

      return leafReason('visa', held === predicate.valid, 'reason.visa', {
        region: predicate.region,
        held,
        expired: visa !== undefined && !notExpired,
      });
    }

    case 'transportMode':
      return leafReason(
        'transportMode',
        predicate.anyOf.includes(state.transport.mode),
        'reason.transportMode',
        { actual: state.transport.mode },
      );

    case 'transportStat': {
      const actual = state.transport[predicate.key];
      return leafReason(
        'transportStat',
        compareNumber(predicate.cmp, actual),
        `reason.transportStat.${predicate.cmp.op}`,
        { key: predicate.key, required: predicate.cmp.value, actual },
      );
    }

    case 'vehicleLegal':
      return leafReason(
        'vehicleLegal',
        state.transport.legal === predicate.legal,
        'reason.vehicleLegal',
        { actual: state.transport.legal },
      );

    default:
      return unreachableLeaf(predicate);
  }
}

function unreachableLeaf(predicate: never): ReasonNode {
  void predicate;
  return leafReason('unknown-kind', false, 'reason.unknown-kind');
}
