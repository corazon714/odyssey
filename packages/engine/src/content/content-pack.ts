import {
  type ComplicationId,
  type EventId,
  type ItemId,
  type NpcId,
  type TraitId,
} from '../ids/content-ids.ts';
import { EMPTY_MODIFIER_REGISTRY, type ModifierRegistry } from '../modifiers/registry-modifier.ts';
import {
  EMPTY_COMPLICATION_REGISTRY,
  type ComplicationRegistry,
  type RegistryComplication,
} from './registry-complication.ts';
import {
  EMPTY_UNIVERSAL_CHOICE_REGISTRY,
  type UniversalChoiceRegistry,
} from './universal-choice.ts';
import { type ContentRefs } from '../predicate/predicate-context.ts';
import { canonicalJson } from '../state/canonical-json.ts';
import { digestOf } from '../state/state-digest.ts';
import { BEAT_TYPES, type BeatType } from './beat-type.ts';
import { collectRefs, type ContentRef } from './collect-refs.ts';
import { type EventPriority } from './event-priority.ts';
import { type GameEvent } from './game-event.ts';
import { injectUniversalChoices, type ShadowedInjection } from './inject-universal-choices.ts';

/**
 * The loaded, indexed, canonically-ordered content.
 *
 * `ContentPack` is NOT `RunState`, so it may hold `Map`s — it is never serialised into a save.
 * Only `version` reaches state, as `RunState.contentVersion`.
 *
 * SORTED ONCE, AT CONSTRUCTION. Content arrives from a filesystem glob whose order differs
 * between operating systems, and CI runs Linux and Windows. An unsorted candidate pool would
 * make `weightedPick` select differently per platform while every test still passed on the
 * machine that wrote them. Sorting per leg would also be wasteful and would invite someone to
 * "optimise" it away later; doing it here makes the ordering a property of the pack.
 *
 * The comparison uses `<` on strings — exact UTF-16 code-unit order. `localeCompare` is
 * locale-dependent and would reintroduce the same divergence (ADR 0005 §3).
 */
export type ContentRegistries = {
  readonly npcs: readonly NpcId[];
  readonly items: readonly ItemId[];
  readonly traits: readonly TraitId[];
  /**
   * The global modifier registry, and it lives INSIDE `ContentRegistries` rather than beside
   * it on `ContentPack` for one specific reason.
   *
   * `contentVersion()` hashes `canonicalJson({ events, registries })`. A registry hung off
   * `ContentPack` as a sibling field would not be in that hash — so `pack.version` would not
   * move when `modifiers.yaml` changed, `replayRun`'s contentVersion refusal would never
   * fire, `reconcileContent` would report `changed: false`, and every golden run would
   * silently replay against different modifier maths with a green suite. Being in here makes
   * that impossible by construction; `content-pack.test.ts` asserts the version moves when
   * one modifier's delta changes by 1.
   */
  readonly modifiers: ModifierRegistry;
  /**
   * Situational layers the director attaches to a selected event. INSIDE, for the reason
   * spelled out above `modifiers` — a complication changes a DC and the choices on offer, so
   * a pack whose complications changed but whose `version` did not would replay a golden run
   * against different play with a green suite.
   */
  readonly complications: ComplicationRegistry;
  /**
   * Choices spliced into every event whose tags match, at pack construction. INSIDE for the
   * same reason, and more urgently: these change `GameEvent.choices` itself, so they alter
   * what `resolveChoice` will even accept.
   */
  readonly universalChoices: UniversalChoiceRegistry;
};

export const EMPTY_REGISTRIES: ContentRegistries = Object.freeze({
  npcs: [],
  items: [],
  traits: [],
  modifiers: EMPTY_MODIFIER_REGISTRY,
  complications: EMPTY_COMPLICATION_REGISTRY,
  universalChoices: EMPTY_UNIVERSAL_CHOICE_REGISTRY,
});

export type ContentPack = {
  readonly version: string;
  readonly events: readonly GameEvent[];
  readonly byId: ReadonlyMap<EventId, GameEvent>;
  readonly byPriority: ReadonlyMap<EventPriority, readonly GameEvent[]>;
  readonly byBeatType: ReadonlyMap<BeatType, readonly GameEvent[]>;
  readonly fillers: readonly GameEvent[];
  readonly refs: ContentRefs;
  /** Surfaced from the registries so `resolveChoice` reaches it without a new parameter. */
  readonly modifiers: ModifierRegistry;
  readonly complications: ComplicationRegistry;
  /**
   * Complications by id, for the one lookup `resolveChoice` makes.
   *
   * A `Map.get` that misses degrades to no-complication, which is the whole reason
   * `Presentation` persists an ID rather than the row: after a content update the row a live
   * save names may be gone, and `reconcileContent` tolerates that mismatch by policy. Same
   * treatment the queue already gives a pending event whose target vanished.
   */
  readonly complicationById: ReadonlyMap<ComplicationId, RegistryComplication>;
  /**
   * References to content ids absent from the registries. Empty in a healthy pack; the sim
   * and the future content linter both report it, because ADR 0001's silent-content-bug
   * problem has no other instrument.
   */
  readonly danglingRefs: readonly ContentRef[];
  readonly duplicateIds: readonly EventId[];
  /** Beat types no event in this pack can fill. A slot for one of these can only expire. */
  readonly unfillableBeatTypes: readonly BeatType[];
  /**
   * Universal choices dropped because their id collided with a hand-authored one.
   *
   * Should always be empty: `UNIVERSAL_CHOICE_PREFIX` uses a character `ID_PATTERN` forbids,
   * so an author cannot write a colliding id. Reported anyway, beside `danglingRefs`, for the
   * reason that field exists — the failure is SILENT if unreported (the player would pick the
   * injected choice and get the authored one's outcomes), and "unreachable" is only worth
   * saying if something checks it.
   */
  readonly shadowedInjections: readonly ShadowedInjection[];
};

export function createContentPack(
  events: readonly GameEvent[],
  registries: ContentRegistries = EMPTY_REGISTRIES,
): ContentPack {
  const ordered = [...events].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // BEFORE everything below, and that ordering is the whole point. The spliced events are what
  // gets indexed, walked for refs, and hashed — so `pack.version` fingerprints what the pack
  // actually PLAYS rather than what was authored. Splicing after the hash would give a pack
  // that offers different choices under an unchanged version, which is the failure the
  // `ContentRegistries` docstring above describes.
  const injected = injectUniversalChoices(ordered, registries.universalChoices);
  const sorted = injected.events;

  const byId = new Map<EventId, GameEvent>();
  const duplicateIds: EventId[] = [];
  for (const event of sorted) {
    if (byId.has(event.id)) duplicateIds.push(event.id);
    byId.set(event.id, event);
  }

  const byPriority = groupBy(sorted, (event) => event.priority);
  const byBeatType = new Map<BeatType, GameEvent[]>();
  for (const event of sorted) {
    if (event.priority !== 'beat' || event.beatType === null) continue;
    const bucket = byBeatType.get(event.beatType);
    if (bucket === undefined) byBeatType.set(event.beatType, [event]);
    else bucket.push(event);
  }

  const knownNpcs = new Set<string>(registries.npcs);
  const knownItems = new Set<string>(registries.items);
  const knownTraits = new Set<string>(registries.traits);

  const refs: ContentRefs = {
    hasEvent: (id) => byId.has(id),
    hasNpc: (id) => knownNpcs.has(id),
    hasItem: (id) => knownItems.has(id),
    hasTrait: (id) => knownTraits.has(id),
  };

  // The registry is walked too, or a modifier naming a deleted npc never appears here.
  const danglingRefs = collectRefs(sorted, registries.modifiers).filter((ref) => {
    switch (ref.kind) {
      case 'event':
        return !byId.has(ref.id as EventId);
      case 'npc':
        return !knownNpcs.has(ref.id);
      case 'item':
        return !knownItems.has(ref.id);
      case 'trait':
        return !knownTraits.has(ref.id);
      default:
        return false;
    }
  });

  return {
    version: contentVersion(sorted, registries),
    events: sorted,
    byId,
    byPriority,
    byBeatType,
    fillers: byPriority.get('filler') ?? [],
    refs,
    modifiers: registries.modifiers,
    complications: registries.complications,
    complicationById: new Map(registries.complications.map((row) => [row.id, row])),
    danglingRefs,
    duplicateIds,
    unfillableBeatTypes: BEAT_TYPES.filter((type) => !byBeatType.has(type)),
    shadowedInjections: injected.shadowed,
  };
}

/**
 * A stable fingerprint of the pack.
 *
 * Order-independent by construction: the input is sorted first, and `canonicalJson` sorts
 * every object key. So two checkouts that read the same YAML in a different order agree,
 * while changing any authored field does not — which is what makes a `contentVersion`
 * mismatch a meaningful reason to refuse a golden run.
 */
export function contentVersion(
  events: readonly GameEvent[],
  registries: ContentRegistries = EMPTY_REGISTRIES,
): string {
  const sorted = [...events].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return digestOf(canonicalJson({ events: sorted, registries }));
}

function groupBy<K, T>(items: readonly T[], key: (item: T) => K): ReadonlyMap<K, readonly T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const bucket = out.get(key(item));
    if (bucket === undefined) out.set(key(item), [item]);
    else bucket.push(item);
  }
  return out;
}
