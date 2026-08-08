import { type TimeOfDay } from '../state/clock-state.ts';
import {
  type EventId,
  type FlagId,
  type ItemId,
  type LanguageId,
  type NpcId,
  type RegionId,
  type TraitId,
} from '../ids/content-ids.ts';
import { type ResourceKey } from '../state/resources.ts';
import { type RouteProfile } from '../state/route-state.ts';
import { type RunStatus } from '../state/run-status.ts';
import { type SkillKey } from '../state/skills.ts';
import { type TransportMode } from '../state/transport-state.ts';
import { type FlagCmp } from './flag-cmp.ts';
import { type NumberCmp } from './number-cmp.ts';

/**
 * The `requires` DSL — a kind-tagged discriminated union.
 *
 * Authored YAML uses the terse key-as-discriminant form engine-spec 2 shows
 * (`{ resource: money, gte: 30 }`, `{ not: { flag: bribed } }`). That shape CANNOT be a
 * TypeScript discriminated union: narrowing it needs `in` checks, which defeat `switch`
 * exhaustiveness, `noFallthroughCasesInSwitch` and `noImplicitReturns`, and produce an
 * evaluator nobody can extend safely. M5's Zod schema normalises terse to canonical with
 * `.transform()`, so authors keep the short form and the engine gets an exhaustive switch.
 *
 * The canonical form is what gets PERSISTED (pendingEvents[].requires), so the save format
 * is stable and independently versionable.
 *
 * Adding a kind here is a compile error at every site that must handle it. That is the
 * point.
 */
export type Predicate =
  // ── logical ────────────────────────────────────────────────────────────────
  | { readonly kind: 'always' }
  | { readonly kind: 'never' }
  | { readonly kind: 'all'; readonly of: readonly Predicate[] }
  | { readonly kind: 'any'; readonly of: readonly Predicate[] }
  | { readonly kind: 'not'; readonly of: Predicate }

  // ── resources and skills ───────────────────────────────────────────────────
  | { readonly kind: 'resource'; readonly key: ResourceKey; readonly cmp: NumberCmp }
  | { readonly kind: 'skill'; readonly key: SkillKey; readonly cmp: NumberCmp }
  | { readonly kind: 'language'; readonly id: LanguageId }
  | { readonly kind: 'trait'; readonly id: TraitId }
  | { readonly kind: 'item'; readonly id: ItemId; readonly cmp: NumberCmp }

  // ── documents ──────────────────────────────────────────────────────────────
  | {
      readonly kind: 'passport';
      readonly present: boolean | null;
      readonly valid: boolean | null;
      readonly flagged: boolean | null;
    }
  | { readonly kind: 'visa'; readonly region: RegionId; readonly valid: boolean }

  // ── memory ─────────────────────────────────────────────────────────────────
  | { readonly kind: 'flag'; readonly id: FlagId; readonly cmp: FlagCmp }
  | { readonly kind: 'relationship'; readonly npc: NpcId; readonly cmp: NumberCmp }
  | { readonly kind: 'npcMet'; readonly npc: NpcId; readonly met: boolean }
  | {
      readonly kind: 'eventMemory';
      readonly event: EventId;
      readonly field: 'count' | 'lastLeg';
      readonly cmp: NumberCmp;
    }

  // ── transport ──────────────────────────────────────────────────────────────
  | { readonly kind: 'transportMode'; readonly anyOf: readonly TransportMode[] }
  | {
      readonly kind: 'transportStat';
      readonly key: 'condition' | 'fuel';
      readonly cmp: NumberCmp;
    }
  | { readonly kind: 'vehicleLegal'; readonly legal: boolean }

  // ── world ──────────────────────────────────────────────────────────────────
  | { readonly kind: 'weather'; readonly anyOf: readonly string[] }
  | { readonly kind: 'timeOfDay'; readonly anyOf: readonly TimeOfDay[] }
  | { readonly kind: 'routeProfile'; readonly anyOf: readonly RouteProfile[] }
  | { readonly kind: 'status'; readonly anyOf: readonly RunStatus[] }
  | { readonly kind: 'leg'; readonly cmp: NumberCmp }
  | { readonly kind: 'day'; readonly cmp: NumberCmp }
  | { readonly kind: 'tension'; readonly cmp: NumberCmp }

  // ── seeded gate ────────────────────────────────────────────────────────────
  /**
   * A pure probability gate. Draws from the `chanceGate` substream WITHOUT advancing any
   * cursor — see ADR 0005 decision 2. Idempotent within a leg, and adding content never
   * shifts it.
   */
  | { readonly kind: 'chance'; readonly percent: number };

export type PredicateKind = Predicate['kind'];

export const ALWAYS: Predicate = Object.freeze({ kind: 'always' });
export const NEVER: Predicate = Object.freeze({ kind: 'never' });
