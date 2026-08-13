import { drawWord } from '../rng/draw-word.ts';
import { deriveKey, streamKey } from '../rng/stream-key.ts';
import { timeOfDayFor } from '../state/clock-state.ts';
import { type HistoryEntry } from '../state/history-entry.ts';
import { locationAtLeg } from '../state/route-state.ts';
import { type RunState } from '../state/run-state.ts';
import { type TextParams } from '../text-params.ts';
import {
  applyOddsFactors,
  BASE_EVENT_ODDS,
  fireProbability,
  type EventOdds,
  type EventOddsFactor,
} from './event-odds.ts';

/** 2^32, as a literal — `**` is implementation-approximated (ADR 0005 decision 3). */
const UINT32_RANGE = 4294967296;

/**
 * The wanted level at which the `heat` multiplier applies (ADR 0029 D2's "heat ≥ 6").
 *
 * The RESOURCE, not the weather — see `EVENT_ODDS_MULTIPLIERS`. A hunted player attracts
 * events; the two names colliding in this codebase is the trap this constant is named against.
 */
const HEAT_ODDS_MIN = 6;

/**
 * Weather that raises the odds. Anything that is not `clear`, expressed as the absence rather
 * than as a list, so a new member of `WEATHERS` cannot silently default to harmless.
 *
 * DELIBERATELY NOT `world-tick.ts`'s `HARSH_WEATHER`, which is `rain`/`wind`/`heat` and excludes
 * fog. That list answers a different question — which weather TIRES you on a long leg — and fog
 * does not drain energy while very much raising the odds that something happens. Two different
 * judgements that happen to be about weather; sharing one list would make each wrong somewhere.
 */
const CALM_WEATHER = 'clear';

/**
 * The reason a leg was quiet, and the journal line it leaves.
 *
 * BOTH KEYS STAY OUT OF `i18n/en/` (ADR 0029 Consequences). There is not one `director.*`,
 * `journal.*` or `loop.*` key there today and `requiredKeys()` cannot generate one, so adding
 * them turns `locale.test.ts`'s orphan assertion red on the same commit.
 *
 * `director.quiet.gate` is distinct from `director.uneventful.emptyPool` on purpose, and it is
 * the whole point of the fourth `SelectionResult` arm: a designed silence and a content gap must
 * not look identical to a player, in a run log, or in the sim's `Empty-pool fallbacks` line.
 */
export const QUIET_GATE_REASON_KEY = 'director.quiet.gate';
export const QUIET_JOURNAL_KEY = 'journal.leg.quiet';

export type QuietGateVerdict = {
  readonly fires: boolean;
  readonly odds: EventOdds;
  readonly factors: readonly EventOddsFactor[];
};

/**
 * Which multipliers this leg earns, read off state the run already carries.
 *
 * Order is fixed by source rather than by discovery, which costs nothing (composition is
 * order-independent) and keeps the `factors` param stable for the trace a player reads.
 */
export function legOddsFactors(state: RunState, legIndex: number): readonly EventOddsFactor[] {
  const factors: EventOddsFactor[] = [];
  const location = locationAtLeg(state.route, legIndex);

  // A TYPE of place, never a place (CLAUDE.md 11). Difficulty comes from what kind of ground
  // the leg crosses, and there is nowhere here to put a nationality.
  if (location === 'city' || location === 'town') factors.push('urban');
  if (location === 'border_crossing' || location === 'checkpoint') factors.push('border');
  if (location === 'wilderness') factors.push('emptyTerrain');

  if (timeOfDayFor(state.clock.hour) === 'night') factors.push('night');
  if (state.weather !== CALM_WEATHER) factors.push('badWeather');
  if (state.route.profile === 'illicit') factors.push('illicit');
  if (state.resources.heat >= HEAT_ODDS_MIN) factors.push('heat');

  // Montage is the strongest factor in either direction, and the only one that is a property of
  // the ROUTE PLAN rather than of the world: a leg the journal summarises instead of playing is
  // quiet by definition (ADR 0026), so the gate is where that finally becomes true.
  if (state.route.montageLegs.includes(legIndex)) factors.push('montage');

  return factors;
}

/**
 * Draw the gate for one leg. CURSOR-FREE, on `chanceGate` (ADR 0029 D5).
 *
 * `chanceGate` is the right stream for three reasons: it is the only one in the repo used
 * exclusively cursor-free, it is literally the stream `{chance: p}` gates draw from, and a
 * per-leg event-fire gate IS a chance gate. `worldTick` — the intuitive choice — is used
 * exclusively CURSORED, so addressing it both ways would make it the first stream in the repo
 * with two addressing modes.
 *
 * Cursor-free matters on its own terms: a cursored draw would make this gate's position in the
 * stream depend on how many weather rerolls preceded it, and it is why M3.12a can claim
 * unchanged digests at all — a draw that advances no cursor shifts nothing downstream.
 *
 * The `gate:` prefix keeps the address disjoint from `chanceAddress`, which derives on the same
 * key with `${scope}:${path}`. Every scope is built from a route id, an event id, or the literal
 * `outcome:` — and `ID_PATTERN` (`/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/`) forbids `:` inside
 * an id, so no authored label can begin `gate:`. The route id is in the address because
 * omitting it would give every route in a fixed-seed sim the identical fire/quiet pattern.
 *
 * NO SHORT-CIRCUIT AT P = 1. `evaluateChance` returns early at `percent >= 100`; this does not,
 * because the branch M3.12b exercises has to be the branch M3.12a fenced. It costs nothing —
 * the draw advances no cursor either way — and certainty is exact regardless: at P = 1 the
 * threshold is 2³² and `drawWord` returns a uint32, which is always below it.
 */
export function eventGate(state: RunState, legIndex: number): QuietGateVerdict {
  const factors = legOddsFactors(state, legIndex);
  const odds = applyOddsFactors(BASE_EVENT_ODDS, factors);

  const address = deriveKey(
    streamKey(state.seed, 'chanceGate'),
    `gate:${state.route.id}:${String(legIndex)}`,
  );

  // Division then multiplication of doubles, both exactly rounded by IEEE-754 and therefore
  // identical on every engine — the same construction `evaluateChance` uses, kept identical so
  // there is one threshold convention in the engine rather than two.
  const threshold = fireProbability(odds) * UINT32_RANGE;

  return { fires: drawWord(address, 0) < threshold, odds, factors };
}

/** What the player is told about a quiet leg. `params` is design pillar 2's legible reason. */
export function quietGateParams(verdict: QuietGateVerdict, legIndex: number): TextParams {
  return {
    leg: legIndex,
    fire: verdict.odds.fire,
    quiet: verdict.odds.quiet,
    // Joined rather than nested: `TextParams` is restricted to JSON primitives because
    // everything carrying it gets persisted into `history` (see `text-params.ts`).
    factors: verdict.factors.join(','),
  };
}

/**
 * The journal line a quiet leg leaves behind.
 *
 * `eventId` is null, which is what `tag-saturation.ts` filters on — a leg where nothing
 * happened must not consume a slot in the anti-repetition window over FIRED events.
 */
export function quietHistoryEntry(state: RunState, legIndex: number): HistoryEntry {
  return {
    legIndex,
    day: state.clock.day,
    eventId: null,
    choiceId: null,
    textKey: QUIET_JOURNAL_KEY,
    params: { leg: legIndex },
    tags: [],
  };
}
