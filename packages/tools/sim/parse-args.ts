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

const PACK_NAMES = ['fixture', 'corpus'] as const;
export type PackName = (typeof PACK_NAMES)[number];

const DEFAULTS: SimOptions = {
  runs: 100,
  seed: 'base',
  policies: [],
  diff: false,
  json: false,
  byRoute: false,
  moods: false,
  // DEFAULTS TO FIXTURE so `sim:diff` keeps comparing like with like. The fixture pack is the
  // stable control the golden runs are built on; the corpus is the thing under development.
  pack: 'fixture',
};

export function parseArgs(argv: readonly string[]): ParseResult {
  let runs = DEFAULTS.runs;
  let seed = DEFAULTS.seed;
  const policies: PolicyName[] = [];
  let diff = false;
  let json = false;
  let byRoute = false;
  let moods = false;
  let pack = DEFAULTS.pack;

  for (const arg of argv) {
    // `pnpm sim -- --runs=1000` forwards the bare `--` to us verbatim. CLAUDE.md 5 documents
    // that invocation, so swallowing the separator is required rather than lenient.
    if (arg === '--') continue;

    const [rawKey, rawValue] = splitFlag(arg);
    if (rawKey === null) return { ok: false, message: `not a flag: ${arg}` };
    // --diff and --json are the valueless flags.
    if (rawKey === '--diff') {
      diff = true;
      continue;
    }
    // Emits the runs as JSON instead of the markdown report — the per-run TRACE rather than the
    // aggregate. `--runs=1 --seed=x --policy=random --json` is one reproducible journey with its
    // fired events and picked choices in order, which is the only way to check that a memory
    // chain fires in the right sequence rather than merely firing.
    if (rawKey === '--json') {
      json = true;
      continue;
    }
    // The per-route completion table — `docs/phase-3-dod.md` gate 9's measurement, and a THIRD
    // output mode rather than a section appended to the report. `diff-report.ts` compares by
    // line index, so an extra section in the standard report would offset every line beneath it
    // and force both baselines to regenerate for a formatting change (ADR 0032). See
    // `by-route.ts`.
    if (rawKey === '--by-route') {
      byRoute = true;
      continue;
    }
    // Mood occupancy per route — what share of the game each mood covers, which is what mood
    // CALIBRATION is read against (`docs/phase-3-closeout.md` §6). A FOURTH output mode for the
    // same baseline-neutrality reason as `--by-route`, plus one of its own: gate 9 needs 280,000
    // runs to resolve a tail, and a distributional mean converges in a fraction of that, so the
    // two want different counts and must not share an invocation. See `moods.ts`.
    if (rawKey === '--moods') {
      moods = true;
      continue;
    }
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
      case '--pack': {
        if (!PACK_NAMES.includes(rawValue as PackName)) {
          return { ok: false, message: `unknown pack: ${rawValue} (fixture|corpus)` };
        }
        pack = rawValue as PackName;
        break;
      }
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

  /**
   * ONE OUTPUT PER INVOCATION, refused rather than silently ranked.
   *
   * `--json` already exits before the `--diff` block in `cli.ts`, so `--json --diff` quietly
   * ignores the diff — a pre-existing wart, and not one to reproduce a second time. A
   * `--by-route` run has no baseline to diff against (that is the whole point of it being a
   * separate mode) and its table is not the trace `--json` emits, so both combinations are
   * mistakes about what the command will do. Saying so beats printing one of the three and
   * letting the reader assume they got the other.
   */
  if (byRoute && diff) {
    return { ok: false, message: '--by-route has no baseline to diff against; drop --diff' };
  }
  if (byRoute && json) {
    return { ok: false, message: '--by-route and --json are two different outputs; pick one' };
  }
  if (moods && diff) {
    return { ok: false, message: '--moods has no baseline to diff against; drop --diff' };
  }
  if (moods && json) {
    return { ok: false, message: '--moods and --json are two different outputs; pick one' };
  }
  if (moods && byRoute) {
    return {
      ok: false,
      message:
        '--moods and --by-route are two different measurements at two different run counts; ' +
        'pick one',
    };
  }

  return { ok: true, options: { runs, seed, policies, diff, json, byRoute, moods, pack } };
}

/** Accepts both `--runs=10` and `--runs 10` is NOT supported — one form, no ambiguity. */
function splitFlag(arg: string): readonly [string | null, string | null] {
  if (!arg.startsWith('--')) return [null, null];
  const eq = arg.indexOf('=');
  if (eq < 0) return [arg, null];
  return [arg.slice(0, eq), arg.slice(eq + 1)];
}
