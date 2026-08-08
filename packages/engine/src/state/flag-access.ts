import { type FlagId } from '../ids/content-ids.ts';
import { type FlagEntry } from './memory-entries.ts';
import { type RunState } from './run-state.ts';

/**
 * Read a flag, honouring its TTL.
 *
 * Expiry is applied at READ time rather than by deleting the entry on a schedule. Two
 * reasons: a leg that never runs a housekeeping pass cannot leave a stale flag readable, and
 * the run's history stays intact — `setAtLeg` survives, so "when did this happen" is still
 * answerable after the flag stops being true.
 *
 * `expiresAtLeg` is the leg at which the flag STOPS being true, so it is inclusive of the
 * leg it was set for: `ttlLegs: 1` set at leg 4 gives `expiresAtLeg: 5` and reads as set on
 * leg 4 only.
 */
export function readFlag(state: RunState, id: FlagId): FlagEntry | null {
  const entry = state.flags[id];
  if (entry === undefined) return null;
  if (entry.expiresAtLeg !== null && state.route.legIndex >= entry.expiresAtLeg) return null;
  return entry;
}

/** True when the flag is set and not expired, whatever its value. */
export function hasFlag(state: RunState, id: FlagId): boolean {
  return readFlag(state, id) !== null;
}
