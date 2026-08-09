import { tagsOf } from '../content/event-tags.ts';
import { type GameEvent } from '../content/game-event.ts';
import {
  type ComplicationRegistry,
  type RegistryComplication,
} from '../content/registry-complication.ts';
import { evaluatePredicate } from '../predicate/evaluate-predicate.ts';
import { type PredicateContext } from '../predicate/predicate-context.ts';
import { drawWord } from '../rng/draw-word.ts';
import { deriveKey, streamKey } from '../rng/stream-key.ts';
import { pickByWeight, totalWeight, type WeightedEntry } from '../rng/weighted-pick.ts';

/** 2^32, as a literal — `**` is implementation-approximated (ADR 0005 decision 3). */
const UINT32_RANGE = 4294967296;

/**
 * How often an eligible event gets a complication at all, as a percentage.
 *
 * ONE NUMBER, separate from the row weights, and that separation is the point. If attachment
 * were an emergent property of how many rows happened to match, the rate would drift every
 * time the corpus grew and there would be nothing to tune. Weights decide WHICH complication;
 * this decides WHETHER. The sim reports the measured rate against it.
 */
export const ATTACH_PERCENT = 60;

/**
 * Pick the complication for an event, or none. CURSOR-FREE.
 *
 * Both draws are content-addressed through `deriveKey`, the `chanceGate` pattern from
 * `evaluate-world-leaf.ts`, rather than taken from a running counter. Three consequences, all
 * of them the reason it is written this way:
 *
 *   - `encounterFlavor`'s cursor stays 0 forever, so no golden digest can ever move because a
 *     complication was drawn. Stream isolation already guarantees `eventPick` is safe; this
 *     additionally makes `encounterFlavor` itself stable.
 *   - Adding a row to `complications.yaml` shifts no other event's complication. A
 *     cursor-advancing draw would make the draw COUNT depend on how many rows were evaluated,
 *     which is the ADR 0005 §2 hazard.
 *   - Asking twice in one leg gives one answer, so the same selection can be recomputed for a
 *     report without changing what happens.
 *
 * The float arithmetic is division and multiplication of doubles, both exactly rounded by
 * IEEE-754 and therefore identical on every engine — the same argument `evaluateChance` makes.
 * `% total` would have been shorter and would have introduced modulo bias.
 */
export function selectComplication(
  event: GameEvent,
  seed: string,
  legIndex: number,
  registry: ComplicationRegistry,
  ctx: PredicateContext,
): RegistryComplication | null {
  if (registry.length === 0) return null;

  const tags = new Set(tagsOf(event));
  const eligible = registry.filter(
    (row) =>
      row.appliesTo.some((tag) => tags.has(tag)) &&
      // Addressed by the row's own id, so two rows carrying a `{ chance: p }` gate get
      // independent answers — the correlated-randomness bug M2A.3 fixed for modifiers.
      evaluatePredicate(row.requires, ctx, `x:${row.id}`).value,
  );
  if (eligible.length === 0) return null;

  const base = streamKey(seed, 'encounterFlavor');
  const label = `${String(event.id)}:${String(legIndex)}`;

  const attach = drawWord(deriveKey(base, `${label}:attach`), 0);
  if (attach >= (ATTACH_PERCENT / 100) * UINT32_RANGE) return null;

  const entries: WeightedEntry<RegistryComplication>[] = eligible.map((row) => ({
    value: row,
    weight: row.weight,
  }));
  const total = totalWeight(entries);
  if (total <= 0) return null;

  const pick = drawWord(deriveKey(base, `${label}:pick`), 0);
  return pickByWeight(entries, Math.floor((pick / UINT32_RANGE) * total));
}
