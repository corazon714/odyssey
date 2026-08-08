import { type EventId, type ItemId, type NpcId, type TraitId } from '../ids/content-ids.ts';
import { EMPTY_MODIFIER_REGISTRY, type ModifierRegistry } from '../modifiers/registry-modifier.ts';
import { type ContentRefs } from '../predicate/predicate-context.ts';
import { canonicalJson } from '../state/canonical-json.ts';
import { digestOf } from '../state/state-digest.ts';
import { BEAT_TYPES, type BeatType } from './beat-type.ts';
import { collectRefs, type ContentRef } from './collect-refs.ts';
import { type EventPriority } from './event-priority.ts';
import { type GameEvent } from './game-event.ts';

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
};

export const EMPTY_REGISTRIES: ContentRegistries = Object.freeze({
  npcs: [],
  items: [],
  traits: [],
  modifiers: EMPTY_MODIFIER_REGISTRY,
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
  /**
   * References to content ids absent from the registries. Empty in a healthy pack; the sim
   * and the future content linter both report it, because ADR 0001's silent-content-bug
   * problem has no other instrument.
   */
  readonly danglingRefs: readonly ContentRef[];
  readonly duplicateIds: readonly EventId[];
  /** Beat types no event in this pack can fill. A slot for one of these can only expire. */
  readonly unfillableBeatTypes: readonly BeatType[];
};

export function createContentPack(
  events: readonly GameEvent[],
  registries: ContentRegistries = EMPTY_REGISTRIES,
): ContentPack {
  const sorted = [...events].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

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
    danglingRefs,
    duplicateIds,
    unfillableBeatTypes: BEAT_TYPES.filter((type) => !byBeatType.has(type)),
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
