import { type LocationType } from '../content/location-type.ts';
import { type ContainerKind } from '../state/container-state.ts';
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
  /** `in: null` sums across every container; naming one asks about that container alone. */
  | {
      readonly kind: 'item';
      readonly id: ItemId;
      readonly cmp: NumberCmp;
      readonly in: ContainerKind | null;
    }

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
  /**
   * Where the player is THIS leg, read from `route.legLocations`.
   *
   * Added in Phase 2A M2A.3 for the modifier registry, whose `when` needs to say "at a
   * checkpoint, a uniform matters" without a location being a check TAG — location is state,
   * not a kind of test. It also closes a spec gap: `docs/engine-spec.md:143` writes
   * `requires: { context: { locationTypes: [...] } }` inside a `scheduleEvent`, and there was
   * no predicate kind that could express it.
   *
   * Distinct from `EventContext.locationTypes`, which is a director FILTER the relaxation
   * ladder can drop (rung 5). This never relaxes — it is an ordinary predicate.
   */
  | { readonly kind: 'locationType'; readonly anyOf: readonly LocationType[] }
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

/**
 * Every predicate kind, as data.
 *
 * A union cannot be enumerated at runtime, and two things need to enumerate this one:
 * `packages/content`'s schema-completeness test (a kind with no schema must fail the build,
 * not ship silently) and the trace-contract sweep, which until now asserted a hard-coded 27.
 *
 * `satisfies` catches an entry that is not a real kind. The other direction — a kind missing
 * from this array — is caught by `PredicateKindsAreExhaustive` below, and that pair is the
 * one genuinely non-vacuous conformance assertion in the repo: both sides are independently
 * hand-written, so neither can be derived from the other and quietly agree.
 */
export const PREDICATE_KINDS = [
  'always',
  'never',
  'all',
  'any',
  'not',
  'resource',
  'skill',
  'language',
  'trait',
  'item',
  'passport',
  'visa',
  'flag',
  'relationship',
  'npcMet',
  'eventMemory',
  'transportMode',
  'transportStat',
  'vehicleLegal',
  'weather',
  'timeOfDay',
  'locationType',
  'routeProfile',
  'status',
  'leg',
  'day',
  'tension',
  'chance',
] as const satisfies readonly PredicateKind[];

/**
 * `true` only if `PREDICATE_KINDS` covers the union exactly. Asserted in
 * `__tests__/trace-contract.test.ts`; a missing kind makes this `never` and fails there.
 */
export type PredicateKindsAreExhaustive = PredicateKind extends (typeof PREDICATE_KINDS)[number]
  ? true
  : never;

export const ALWAYS: Predicate = Object.freeze({ kind: 'always' });
export const NEVER: Predicate = Object.freeze({ kind: 'never' });
