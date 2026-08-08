/**
 * One step up the save-schema ladder.
 *
 * Takes `unknown` and returns `unknown` on purpose. A migration operates on a save written by
 * an OLDER build, whose shape the current `RunState` type does not describe — typing the input
 * as `RunState` would be a lie that the compiler would happily believe, and the first field
 * rename would produce a migration that typechecks and corrupts saves.
 *
 * TWO RULES, and the second is the one that gets broken:
 *
 *   1. Never edit a shipped migration. Its input is a save format that exists in the wild.
 *   2. Every new SAVE_VERSION adds a migration AND a checked-in fixture save. The
 *      fixture-completeness meta-test is what makes rule 2 enforceable rather than aspirational.
 */
export type Migration = {
  /** The version this migration reads. It produces `from + 1`. */
  readonly from: number;
  readonly describe: string;
  migrate(save: Record<string, unknown>): Record<string, unknown>;
};
