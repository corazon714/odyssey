import { type Migration } from './migration.ts';

/**
 * Every migration, in ascending order of `from`.
 *
 * EMPTY TODAY, and that is the correct state rather than an omission: `SAVE_VERSION` is 1, so
 * no save format has ever been superseded. Inventing a fake schema change to exercise the
 * machinery would put a lie in the ladder — a migration whose input format never existed.
 *
 * The machinery is instead tested against a SYNTHETIC list in `migrate-save.test.ts`, which
 * proves chaining, ordering and gap detection without pretending history happened.
 *
 * When the first real migration lands: append it here, add `__fixtures__/save-v1.json`'s
 * successor, and let the fixture-completeness meta-test tell you if you forgot.
 */
export const MIGRATIONS: readonly Migration[] = [];
