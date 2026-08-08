import { RNG_STREAMS, type RngStream } from './rng-stream.ts';

/**
 * One cursor per substream, and nothing else.
 *
 * This is the entire persisted randomness state (docs/engine-spec.md 1). It is a plain
 * `Record` of numbers on purpose: no class instance, no Map, no closure. RunState must
 * survive `JSON.parse(JSON.stringify(state))` unchanged, because save, load and golden-run
 * replay are all built on that.
 *
 * `Record<RngStream, number>` does NOT widen under `noUncheckedIndexedAccess` — that flag
 * widens index signatures, and a Record over a finite literal union is a mapped type with
 * known keys. So `cursors.eventPick` is `number`, not `number | undefined`. (A
 * `Record<FlagId, ...>` over a branded string WOULD widen. The asymmetry is relied on here
 * deliberately.)
 */
export type RngCursors = Record<RngStream, number>;

/**
 * A fresh cursor set, every stream at zero.
 *
 * Written as an explicit literal rather than a loop over RNG_STREAMS so that adding a
 * stream is a COMPILE error here instead of a silently missing key at runtime.
 * rng-cursors.test.ts asserts the reverse direction — that no key exists here which is
 * absent from RNG_STREAMS.
 */
export function createRngCursors(): RngCursors {
  return {
    eventPick: 0,
    outcomeRoll: 0,
    skillCheck: 0,
    npcGen: 0,
    encounterFlavor: 0,
    worldTick: 0,
    routeGen: 0,
    chanceGate: 0,
  };
}

/** Every stream name, for tests and tooling that must iterate exhaustively. */
export const ALL_RNG_STREAMS: readonly RngStream[] = RNG_STREAMS;
