import { isPolicyName, type PolicyName } from './policy.ts';
import { type SimOptions } from './run-many.ts';

/**
 * Parse `pnpm sim -- --runs=1000 --seed=base --policy=random`.
 *
 * Unknown flags are an ERROR, not a shrug. A typo'd `--runs` that silently ran the default 100
 * would make a balance report quietly wrong, which is worse than a failed command.
 */
export type ParseResult =
  | { readonly ok: true; readonly options: SimOptions }
  | { readonly ok: false; readonly message: string };

const DEFAULTS: SimOptions = { runs: 100, seed: 'base', policies: [] };

export function parseArgs(argv: readonly string[]): ParseResult {
  let runs = DEFAULTS.runs;
  let seed = DEFAULTS.seed;
  const policies: PolicyName[] = [];

  for (const arg of argv) {
    // `pnpm sim -- --runs=1000` forwards the bare `--` to us verbatim. CLAUDE.md 5 documents
    // that invocation, so swallowing the separator is required rather than lenient.
    if (arg === '--') continue;

    const [rawKey, rawValue] = splitFlag(arg);
    if (rawKey === null) return { ok: false, message: `not a flag: ${arg}` };
    if (rawValue === null) return { ok: false, message: `${rawKey} needs a value` };

    switch (rawKey) {
      case '--runs': {
        const parsed = Number(rawValue);
        if (!Number.isInteger(parsed) || parsed < 1) {
          return { ok: false, message: `--runs must be a positive integer, got ${rawValue}` };
        }
        runs = parsed;
        break;
      }
      case '--seed':
        seed = rawValue;
        break;
      case '--policy': {
        if (!isPolicyName(rawValue)) {
          return { ok: false, message: `unknown policy: ${rawValue}` };
        }
        policies.push(rawValue);
        break;
      }
      default:
        return { ok: false, message: `unknown flag: ${rawKey}` };
    }
  }

  return { ok: true, options: { runs, seed, policies } };
}

/** Accepts both `--runs=10` and `--runs 10` is NOT supported — one form, no ambiguity. */
function splitFlag(arg: string): readonly [string | null, string | null] {
  if (!arg.startsWith('--')) return [null, null];
  const eq = arg.indexOf('=');
  if (eq < 0) return [arg, null];
  return [arg.slice(0, eq), arg.slice(eq + 1)];
}
