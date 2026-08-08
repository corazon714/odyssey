import { RULES } from './run-lint.ts';

/**
 * `--key=value` only, and unknown flags are a hard error.
 *
 * Same shape as the sim's parser and for the same reasons: one form so there is no ambiguity
 * about whether `--rules references` means a value or a positional, and a typo'd flag stops
 * the run rather than being silently ignored — a linter that skips the rule you asked for is
 * worse than one that refuses to start.
 */
export type LintOptions = {
  readonly fix: boolean;
  /** Empty means every rule. */
  readonly only: readonly string[];
};

export type ParseResult =
  | { readonly ok: true; readonly options: LintOptions }
  | { readonly ok: false; readonly message: string };

export function parseArgs(argv: readonly string[]): ParseResult {
  let fix = false;
  let only: readonly string[] = [];

  for (const arg of argv) {
    // `pnpm content:lint -- --fix` forwards the bare `--` verbatim.
    if (arg === '--') continue;
    if (arg === '--fix') {
      fix = true;
      continue;
    }

    const match = /^--([a-z-]+)=(.*)$/.exec(arg);
    if (match === null) {
      return { ok: false, message: `unrecognised argument: ${arg}` };
    }
    const [, key = '', value = ''] = match;

    if (key === 'rules') {
      const names = value.split(',').filter(Boolean);
      const unknown = names.filter((name) => !RULES.some((rule) => rule.name === name));
      if (unknown.length > 0) {
        return {
          ok: false,
          message: `unknown rule(s): ${unknown.join(', ')}. Known: ${RULES.map((r) => r.name).join(', ')}`,
        };
      }
      only = names;
      continue;
    }

    return { ok: false, message: `unrecognised flag: --${key}` };
  }

  return { ok: true, options: { fix, only } };
}
