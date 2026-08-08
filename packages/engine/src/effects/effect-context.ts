import { type EventId } from '../ids/content-ids.ts';

/**
 * What the applier needs beyond the state itself.
 *
 * Deliberately tiny, and deliberately WITHOUT an Rng. Applying an effect is fully
 * determined by (state, effect): `scheduleEvent` stores its leg window rather than rolling
 * within it, and every other op is arithmetic. Keeping randomness out means the applier can
 * be replayed, tested and reasoned about without a generator, and it is one fewer place a
 * cursor can drift.
 *
 * `sourceEventId` is provenance for the consequence queue — which event's outcome scheduled
 * this. The journal reads it ("the guard you bribed at the mountain pass"), and it is why
 * duplicate schedules are kept separate rather than merged (ADR 0001).
 */
export type EffectContext = {
  readonly sourceEventId: EventId;
};

export function createEffectContext(sourceEventId: EventId): EffectContext {
  return { sourceEventId };
}
