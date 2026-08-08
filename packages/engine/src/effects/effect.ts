import {
  type EndingId,
  type EventId,
  type FlagId,
  type ItemId,
  type NpcId,
  type RegionId,
} from '../ids/content-ids.ts';
import { type Predicate } from '../predicate/predicate.ts';
import { type BeatSlotStatus } from '../state/beat-slot.ts';
import { type ContainerKind } from '../state/container-state.ts';
import { type FlagValue } from '../state/memory-entries.ts';
import { type ResourceKey } from '../state/resources.ts';
import { type SkillKey } from '../state/skills.ts';
import { type TransportMode } from '../state/transport-state.ts';
import { type TextParams } from '../text-params.ts';

/**
 * The Effect DSL — the only way RunState changes (CLAUDE.md 2.7).
 *
 * Unlike Predicate, this needs no terse-to-canonical normalisation: engine-spec 2 already
 * writes effects as `{ op: resource, key: money, delta: -40 }`, so `op` is a proper
 * discriminant in the authored YAML too. M5's schema validates rather than transforms.
 *
 * The compound ops (`transport`, `document`, `route`) carry a nested tagged `field` union
 * rather than a bag of nullable properties. `{ vehicleId: string | null }` cannot express
 * "leave it alone" and "set it to none" as different things, and a partial-update shape with
 * optional properties is exactly what ADR 0006 decision 1 rules out.
 */
export const EFFECT_OPS = [
  'resource',
  'skill',
  'flag',
  'clearFlag',
  'relationship',
  'advanceTime',
  'scheduleEvent',
  'unlockEnding',
  'item',
  'transport',
  'document',
  'route',
  'moveItem',
  'loseContainer',
  'grantContainer',
] as const;

export type EffectOp = (typeof EFFECT_OPS)[number];

export type TransportChange =
  | { readonly field: 'mode'; readonly mode: TransportMode; readonly vehicleId: string | null }
  | { readonly field: 'condition'; readonly delta: number }
  | { readonly field: 'fuel'; readonly delta: number }
  | { readonly field: 'legal'; readonly legal: boolean };

export type DocumentChange =
  | { readonly field: 'grantPassport'; readonly valid: boolean }
  /** Distinct from never having one: `present: false` opens recovery events. */
  | { readonly field: 'losePassport' }
  | { readonly field: 'passportFlagged'; readonly flagged: boolean }
  | {
      readonly field: 'visa';
      readonly region: RegionId;
      readonly valid: boolean;
      readonly expiresDay: number | null;
    }
  | { readonly field: 'useTicket'; readonly ticketId: string };

export type RouteChange =
  | { readonly field: 'progressKm'; readonly delta: number }
  | { readonly field: 'beatStatus'; readonly legIndex: number; readonly status: BeatSlotStatus };

export type Effect =
  | { readonly op: 'resource'; readonly key: ResourceKey; readonly delta: number }
  | { readonly op: 'skill'; readonly key: SkillKey; readonly delta: number }
  | {
      readonly op: 'flag';
      readonly id: FlagId;
      readonly value: FlagValue;
      /** null = permanent. Otherwise expiresAtLeg = current leg + ttlLegs. */
      readonly ttlLegs: number | null;
    }
  | { readonly op: 'clearFlag'; readonly id: FlagId }
  | {
      readonly op: 'relationship';
      readonly npc: NpcId;
      readonly trustDelta: number;
      readonly meet: boolean;
      readonly addTags: readonly string[];
    }
  | { readonly op: 'advanceTime'; readonly hours: number }
  | {
      readonly op: 'scheduleEvent';
      readonly eventId: EventId;
      /** Leg offsets from now, inclusive: `[4, 12]` means 4 to 12 legs ahead. */
      readonly inLegs: readonly [number, number];
      readonly requires: Predicate | null;
      readonly payload: TextParams | null;
    }
  | { readonly op: 'unlockEnding'; readonly id: EndingId }
  | {
      readonly op: 'item';
      readonly id: ItemId;
      readonly countDelta: number;
      readonly condition: number | null;
      /**
       * Where it goes, or where it comes from. null means "wherever there is room", filling
       * in `DRAIN_ORDER` — person first for a grant, and draining in the same order for a
       * removal so the total always matches what the `item` predicate reported.
       */
      readonly container: ContainerKind | null;
    }
  /** Between containers. Packing the passport into the stash is a real, risky decision. */
  | {
      readonly op: 'moveItem';
      readonly id: ItemId;
      readonly count: number;
      readonly from: ContainerKind;
      readonly to: ContainerKind;
    }
  /**
   * The bag is stolen; the car is impounded. Contents go WITH it — explicitly, never
   * silently relocated (W3). A passport kept in that container becomes `present: false`,
   * which is the recoverable state, not `null`, which means you never had one.
   */
  | { readonly op: 'loseContainer'; readonly container: Exclude<ContainerKind, 'person'> }
  /** Acquiring a bag, a vehicle, or a hidden compartment. Idempotent if you already have one. */
  | {
      readonly op: 'grantContainer';
      readonly container: Exclude<ContainerKind, 'person'>;
      /** null uses `CONTAINER_SPECS`. A bigger vehicle overrides. */
      readonly slots: number | null;
      readonly searchDC: number | null;
    }
  | { readonly op: 'transport'; readonly change: TransportChange }
  | { readonly op: 'document'; readonly change: DocumentChange }
  | { readonly op: 'route'; readonly change: RouteChange };
