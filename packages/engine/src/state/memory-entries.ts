import { type ChoiceId, type ItemId } from '../ids/content-ids.ts';

/**
 * The three memory mechanisms, deliberately not one (ADR 0001).
 *
 * Collapsing these into "just use flags" produces the unmanageable 400-flag system that
 * decision exists to avoid. Each answers a different question:
 *
 *   flag            — durable state read from many places later (`passport_lost`, `wanted`)
 *   relationship    — an NPC's standing attitude toward the player
 *   eventMemory     — "you have been here before", for variant text and novelty scoring
 *
 * The fourth mechanism, the consequence queue, lives in pending-event.ts.
 */

/**
 * Flags may hold more than a boolean: `owes:dmitri` wants a number, a cover story wants a
 * string. The union stays narrow so flags never become a place to hide arbitrary state.
 */
export type FlagValue = boolean | number | string;

export type FlagEntry = {
  readonly value: FlagValue;
  readonly setAtLeg: number;
  /** null = permanent. Otherwise the leg at which it stops being true (ttlLegs). */
  readonly expiresAtLeg: number | null;
};

export type RelationshipEntry = {
  /** Signed: an NPC can actively dislike the player, not merely fail to like them. */
  readonly trust: number;
  readonly met: boolean;
  readonly lastSeenLeg: number;
  readonly tags: readonly string[];
};

export type EventMemoryEntry = {
  readonly count: number;
  readonly lastLeg: number;
  readonly lastChoiceId: ChoiceId | null;
};

export type InventoryEntry = {
  readonly id: ItemId;
  readonly count: number;
  /** null for items that cannot degrade. */
  readonly condition: number | null;
};
