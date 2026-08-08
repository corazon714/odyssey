import { z } from 'zod';
import {
  endingIdSchema,
  eventIdSchema,
  flagIdSchema,
  intSchema,
  itemIdSchema,
  list,
  npcIdSchema,
  nullable,
  traitIdSchema,
} from './common.ts';

/**
 * The declaration registries: flags, items, npcs, traits, endings.
 *
 * WHY THESE EXIST AT ALL. engine-spec §3 names the anti-pattern directly — "making everything
 * a flag; a 400-flag system is unmanageable" — and prescribes the fix: flags must be declared,
 * and the linter must reject one that is written and never read. You cannot detect an
 * undeclared reference without a declaration to be absent from, and you cannot detect an
 * orphan without knowing the full set. These files are that set.
 *
 * `description` is DEVELOPER documentation, not user-facing text, so rule 2.4 does not apply
 * to it — nothing renders it. It is the field that makes a 400-entry registry navigable, and
 * the linter requires it precisely so that adding a flag costs a sentence of thought.
 *
 * One file for all five because they are one concept with one shared base, not five. Splitting
 * would duplicate `declaration` five times to satisfy a file-count rule.
 */

/** Every declaration carries these. `category` is what `content:stats` groups by. */
const declaration = {
  description: z.string().min(12, 'say what it is for; one sentence is enough'),
  category: z.string().regex(/^[a-z][a-z0-9_]*$/, 'category is snake_case'),
};

/**
 * Flag lifetime, and the reason it is declared rather than inferred from usage.
 *
 * A flag's TTL is set at WRITE time by the effect (`ttlLegs`), so the same flag could in
 * principle be written permanently in one event and with a TTL in another — which is almost
 * always a bug, and an invisible one. Declaring the intent here lets the linter compare every
 * write against it.
 */
const lifetimeSchema = z.union([
  z.literal('permanent'),
  z.strictObject({ ttlLegs: intSchema.positive() }),
]);

export const flagDeclarationSchema = z.strictObject({
  id: flagIdSchema,
  ...declaration,
  lifetime: lifetimeSchema,
});

/**
 * `legality` and `hot` are separate on purpose: a legally-owned item can be stolen (`hot`),
 * and a legal item can be illegal to carry across a border. Collapsing them would lose the
 * distinction the search mechanic is built on.
 */
export const itemDeclarationSchema = z.strictObject({
  id: itemIdSchema,
  ...declaration,
  /** Slots consumed in a container. */
  size: intSchema.positive(),
  /** Added to the container's searchDC when someone looks for THIS item. */
  concealability: intSchema.nonnegative(),
  legality: z.enum(['legal', 'restricted', 'illegal']),
  /** Stolen. Distinct from illegal — a stolen passport is legal to own and ruinous to hold. */
  hot: z
    .boolean()
    .nullish()
    .transform((v) => v ?? false),
  consumable: z
    .boolean()
    .nullish()
    .transform((v) => v ?? false),
  /** Sale value in the abstract unit. 0 means it cannot be sold. */
  value: intSchema.nonnegative(),
  tags: list(z.string()),
  /**
   * THE LIABILITY RULE, made decidable.
   *
   * "Every item must be capable of being a liability as well as an asset" is not statically
   * decidable — whether an outcome is *bad* is a judgement about semantics, not a property of
   * the content graph. Rather than ship a heuristic that produces false confidence, the
   * judgement is moved to the author at declaration time: name the events where carrying this
   * hurts. `content:lint` then checks something it actually can — that the list is non-empty,
   * that each event exists, and that the event really does read this item.
   *
   * An item with an empty list is not an item. It is a number.
   */
  liability: z.array(eventIdSchema).min(1, 'name at least one event where carrying this hurts'),
});

export const npcDeclarationSchema = z.strictObject({
  id: npcIdSchema,
  ...declaration,
  /**
   * ARCHETYPE, never a person. CLAUDE.md §11: no event may attach behaviour to a real
   * nationality, and an NPC named for one would do exactly that through the back door.
   */
  archetype: z.string().regex(/^[a-z][a-z0-9_]*$/, 'archetype is snake_case'),
  tags: list(z.string()),
});

export const traitDeclarationSchema = z.strictObject({
  id: traitIdSchema,
  ...declaration,
  tags: list(z.string()),
});

export const endingDeclarationSchema = z.strictObject({
  id: endingIdSchema,
  ...declaration,
  /** Arrival endings are reachable; failure endings terminate the run. */
  kind: z.enum(['arrival', 'failure']),
  /** Ordering hint for the journal. null sorts last. */
  rank: nullable(intSchema),
});

export type FlagDeclaration = z.infer<typeof flagDeclarationSchema>;
export type ItemDeclaration = z.infer<typeof itemDeclarationSchema>;
export type NpcDeclaration = z.infer<typeof npcDeclarationSchema>;
export type TraitDeclaration = z.infer<typeof traitDeclarationSchema>;
export type EndingDeclaration = z.infer<typeof endingDeclarationSchema>;

/**
 * The five registries, keyed by the file they live in. Driving the loader from data rather
 * than five hand-written call sites means adding a sixth registry cannot half-land.
 */
export const REGISTRY_FILES = {
  'flags.yaml': flagDeclarationSchema,
  'items.yaml': itemDeclarationSchema,
  'npcs.yaml': npcDeclarationSchema,
  'traits.yaml': traitDeclarationSchema,
  'endings.yaml': endingDeclarationSchema,
} as const;

export type RegistryFile = keyof typeof REGISTRY_FILES;
