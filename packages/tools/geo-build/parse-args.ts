import { type BoundingBox } from './read-geonames.ts';

/**
 * Parse `pnpm geo:audit -- --bbox=-12,36,42,62`.
 *
 * `--key=value` only, and an unknown flag is a HARD ERROR — the same rule `sim/parse-args.ts`
 * states and for the same reason: a typo'd `--bbox` that silently audited the whole planet would
 * produce a report that reads as a finding about the slice.
 */
export const STAGES = ['fetch', 'audit', 'all', 'diversity'] as const;
export type Stage = (typeof STAGES)[number];

export type GeoBuildOptions = {
  readonly stage: Stage;
  /** Null means "the whole candidate set". */
  readonly bbox: BoundingBox | null;
  /** Regenerate and byte-compare instead of writing. No writer exists until M3.5. */
  readonly check: boolean;
  /** Read the checked-in synthetic sample instead of `.geo-cache/`. */
  readonly fixture: boolean;
};

export type ParseResult =
  | { readonly ok: true; readonly options: GeoBuildOptions }
  | { readonly ok: false; readonly message: string };

const DEFAULTS: GeoBuildOptions = {
  stage: 'audit',
  bbox: null,
  check: false,
  // Defaults to the fixture because the real sources are a deliberate, permissioned download
  // (`--stage=fetch`). A tool that silently reached for the network on first run would make
  // `pnpm geo:audit` behave differently on a fresh checkout than in CI.
  fixture: true,
};

export function parseArgs(argv: readonly string[]): ParseResult {
  let stage = DEFAULTS.stage;
  let bbox = DEFAULTS.bbox;
  let check = DEFAULTS.check;
  let fixture = DEFAULTS.fixture;

  for (const arg of argv) {
    // `pnpm geo:audit -- --bbox=...` forwards the bare separator verbatim.
    if (arg === '--') continue;

    const [key, value] = splitFlag(arg);
    if (key === null) return { ok: false, message: `not a flag: ${arg}` };

    if (key === '--check') {
      check = true;
      continue;
    }
    if (key === '--real') {
      fixture = false;
      continue;
    }
    if (value === null) return { ok: false, message: `${key} needs a value` };

    switch (key) {
      case '--stage': {
        if (!isStage(value)) {
          return { ok: false, message: `unknown stage: ${value} (${STAGES.join('|')})` };
        }
        stage = value;
        break;
      }
      case '--bbox': {
        const parsed = parseBox(value);
        if (parsed === null) {
          return {
            ok: false,
            message: `--bbox wants four numbers, minLng,minLat,maxLng,maxLat — got ${value}`,
          };
        }
        bbox = parsed;
        break;
      }
      default:
        return { ok: false, message: `unknown flag: ${key}` };
    }
  }

  return { ok: true, options: { stage, bbox, check, fixture } };
}

function isStage(value: string): value is Stage {
  return (STAGES as readonly string[]).includes(value);
}

function parseBox(value: string): BoundingBox | null {
  const parts = value.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [minLng, minLat, maxLng, maxLat] = parts;
  if (
    minLng === undefined ||
    minLat === undefined ||
    maxLng === undefined ||
    maxLat === undefined
  ) {
    return null;
  }
  if (minLng >= maxLng || minLat >= maxLat) return null;
  if (minLat < -90 || maxLat > 90 || minLng < -180 || maxLng > 180) return null;
  return { minLng, minLat, maxLng, maxLat };
}

function splitFlag(arg: string): readonly [string | null, string | null] {
  if (!arg.startsWith('--')) return [null, null];
  const at = arg.indexOf('=');
  if (at === -1) return [arg, null];
  return [arg.slice(0, at), arg.slice(at + 1)];
}
