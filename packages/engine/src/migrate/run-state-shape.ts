import { RNG_STREAMS } from '../rng/rng-stream.ts';
import { CONTAINER_KINDS } from '../state/container-state.ts';
import { RESOURCE_KEYS } from '../state/resources.ts';
import { SKILL_KEYS } from '../state/skills.ts';
import { type RunState } from '../state/run-state.ts';

/**
 * A SHALLOW guard that a migrated save is structurally a RunState.
 *
 * Hand-written, not Zod, and deliberately not exhaustive. Two reasons:
 *
 *   - The engine has zero dependencies and must run under bare Node (CLAUDE.md 2.2). Pulling
 *     Zod in to validate a save would also invert the layering ADR 0009 settled.
 *   - Deep validation belongs with the persistence layer in Phase 2, which knows what it read
 *     and can report where. This is the engine's own floor: enough to refuse a save that would
 *     crash the loop, not enough to pretend it is a schema.
 *
 * What it checks is chosen by what BREAKS: the fields the loop dereferences on its first tick.
 * A missing `rngCursors` key is unrecoverable and silent — every draw would read `undefined`
 * and produce NaN — so the cursor set is checked exhaustively while `history` is only checked
 * for being an array.
 */
export function isRunStateShape(value: unknown): value is RunState {
  if (value === null || typeof value !== 'object') return false;
  const save = value as Record<string, unknown>;

  if (typeof save['version'] !== 'number') return false;
  if (typeof save['contentVersion'] !== 'string') return false;
  if (typeof save['seed'] !== 'string') return false;
  if (typeof save['status'] !== 'string') return false;

  // Exhaustive: a missing cursor is silently catastrophic rather than loudly broken.
  const cursors = save['rngCursors'];
  if (cursors === null || typeof cursors !== 'object') return false;
  for (const stream of RNG_STREAMS) {
    if (typeof (cursors as Record<string, unknown>)[stream] !== 'number') return false;
  }

  for (const key of ['clock', 'route', 'transport', 'resources', 'skills', 'documents']) {
    const branch = save[key];
    if (branch === null || typeof branch !== 'object' || Array.isArray(branch)) return false;
  }

  /**
   * Resources and skills are checked EXHAUSTIVELY, for the same reason the rng cursors are.
   *
   * The docstring above justifies the cursor loop by "a missing cursor is silently
   * catastrophic". A missing resource key is exactly as catastrophic and was unchecked until
   * SAVE_VERSION 2: `resources[key] + delta` is `NaN`, `clampResources` compares `NaN < min`
   * and `NaN > max` — both false — so it writes the NaN straight through, and `stateDigest`
   * serialises it as `null`. The run continues with a meter that is not a number and every
   * comparison against it silently false.
   *
   * Adding `bank` is what made that reachable: a v1 save has no such key, so a migration that
   * forgot it would produce exactly this.
   */
  const resources = save['resources'] as Record<string, unknown>;
  for (const key of RESOURCE_KEYS) {
    if (typeof resources[key] !== 'number' || Number.isNaN(resources[key])) return false;
  }

  const skills = save['skills'] as Record<string, unknown>;
  for (const key of SKILL_KEYS) {
    if (typeof skills[key] !== 'number' || Number.isNaN(skills[key])) return false;
  }
  if (!Array.isArray(skills['languages'])) return false;

  for (const key of ['traits', 'pendingEvents', 'history', 'unlockedEndings']) {
    if (!Array.isArray(save[key])) return false;
  }

  /**
   * `inventory` STOPPED BEING AN ARRAY at SAVE_VERSION 3.
   *
   * It was in the list above until then, and leaving it there while the type changed would
   * have been the worst possible failure: `migrate_2_to_3` would run, produce a correct
   * container inventory, and then this guard would reject it — `migrateSave` returns
   * `save/shape-invalid` with reason `post-migration`, so EVERY save becomes unloadable and
   * the error blames the migration rather than the guard that is actually wrong.
   *
   * Capacity is deliberately NOT checked. A container may legitimately hold more than its
   * slots — the v2->v3 migration overfills the bag rather than dropping a player's property —
   * and making capacity a shape invariant would turn a legal old save into an unloadable one.
   * Capacity is enforced on INSERT, which is where it belongs.
   */
  const inventory = save['inventory'];
  if (inventory === null || typeof inventory !== 'object' || Array.isArray(inventory)) return false;
  for (const kind of CONTAINER_KINDS) {
    const container = (inventory as Record<string, unknown>)[kind];
    if (container === null && kind !== 'person') continue;
    if (container === null || typeof container !== 'object') return false;
    const shape = container as Record<string, unknown>;
    if (typeof shape['slots'] !== 'number' || typeof shape['searchDC'] !== 'number') return false;
    if (!Array.isArray(shape['items'])) return false;
  }

  for (const key of ['flags', 'relationships', 'eventMemory']) {
    const branch = save[key];
    if (branch === null || typeof branch !== 'object' || Array.isArray(branch)) return false;
  }

  return true;
}
