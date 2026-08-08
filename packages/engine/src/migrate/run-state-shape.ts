import { RNG_STREAMS } from '../rng/rng-stream.ts';
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

  for (const key of ['traits', 'inventory', 'pendingEvents', 'history', 'unlockedEndings']) {
    if (!Array.isArray(save[key])) return false;
  }

  for (const key of ['flags', 'relationships', 'eventMemory']) {
    const branch = save[key];
    if (branch === null || typeof branch !== 'object' || Array.isArray(branch)) return false;
  }

  return true;
}
