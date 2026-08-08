import { engineError, type EngineError } from '../errors/engine-error.ts';
import { SAVE_VERSION } from '../state/create-run-state.ts';
import { type RunState } from '../state/run-state.ts';
import { type Migration } from './migration.ts';
import { MIGRATIONS } from './migrations.ts';
import { isRunStateShape } from './run-state-shape.ts';

/**
 * Bring a save up to the current schema version.
 *
 * RETURNS, never throws. A save that cannot be migrated is a player's run, and the app layer
 * decides whether to offer a fresh start — the engine's job is to say precisely what is wrong.
 *
 * A FUTURE version is refused rather than attempted. Someone who installed a newer build,
 * played, and rolled back has a save this build cannot understand; guessing at it would
 * silently discard whatever the newer fields meant.
 */
export type MigrateResult =
  | { readonly ok: false; readonly error: EngineError }
  | {
      readonly ok: true;
      readonly state: RunState;
      readonly fromVersion: number;
      /** Which migrations ran, in order. Empty when the save was already current. */
      readonly applied: readonly string[];
    };

export function migrateSave(
  raw: unknown,
  migrations: readonly Migration[] = MIGRATIONS,
  targetVersion: number = SAVE_VERSION,
): MigrateResult {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: engineError('save/shape-invalid', { reason: 'not-an-object' }) };
  }

  let save = { ...(raw as Record<string, unknown>) };
  const rawVersion = save['version'];
  if (typeof rawVersion !== 'number' || !Number.isInteger(rawVersion)) {
    return { ok: false, error: engineError('save/shape-invalid', { reason: 'no-version' }) };
  }

  if (rawVersion > targetVersion) {
    return {
      ok: false,
      error: engineError('save/version-too-new', { saveVersion: rawVersion, targetVersion }),
    };
  }

  const applied: string[] = [];
  let version = rawVersion;

  while (version < targetVersion) {
    const step = migrations.find((m) => m.from === version);
    if (step === undefined) {
      // A GAP in the ladder, not a corrupt save. Distinguishing the two matters: this one is
      // a build defect, and the fixture-completeness meta-test exists to catch it in CI rather
      // than on a player's device.
      return {
        ok: false,
        error: engineError('save/version-unsupported', {
          saveVersion: rawVersion,
          missing: version,
        }),
      };
    }
    save = { ...step.migrate(save), version: version + 1 };
    applied.push(step.describe);
    version += 1;
  }

  if (!isRunStateShape(save)) {
    return { ok: false, error: engineError('save/shape-invalid', { reason: 'post-migration' }) };
  }

  return { ok: true, state: save, fromVersion: rawVersion, applied };
}
