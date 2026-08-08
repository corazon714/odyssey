import { type EdgeId, type RegionId } from '../ids/content-ids.ts';
import { type ContainerKind } from './container-state.ts';

/**
 * Papers. The single richest source of consequence in the game, so the shape is
 * deliberately more detailed than "has passport: yes/no".
 *
 * `present` and `valid` are separate because losing a passport and carrying an expired one
 * are different stories with different escapes. `flagged` is separate again: a perfectly
 * valid passport that lights up a database is the premise of an entire storyline.
 *
 * `passport: null` means the run never had one, which is distinct from `present: false`
 * meaning it was lost along the way — the second opens recovery events the first cannot.
 */
export type PassportState = {
  readonly present: boolean;
  readonly valid: boolean;
  readonly flagged: boolean;
  /**
   * WHERE YOU KEEP IT — and the reason the container model exists at all.
   *
   * Losing the bag must also lose a passport kept in the bag. Without this field the two
   * systems are unrelated and the game's best memory chain (stolen bag -> no papers -> a
   * border you cannot cross -> a whole storyline) cannot be expressed. `loseContainer`
   * reads it.
   */
  readonly container: ContainerKind;
};

/**
 * A visa is a stamp IN the passport, so it deliberately has NO container of its own.
 *
 * Two independently-losable records for one physical object is a content-bug generator: an
 * author writes "you lose your passport" and the visa survives, or vice versa. Visa reads
 * inherit the passport, which is also what the fiction says.
 */
export type VisaState = {
  readonly valid: boolean;
  /** null = open-ended. Otherwise compared against ClockState.day. */
  readonly expiresDay: number | null;
};

export type TicketState = {
  readonly id: string;
  readonly forEdge: EdgeId;
  readonly used: boolean;
  readonly container: ContainerKind;
};

export type DocumentsState = {
  readonly passport: PassportState | null;
  readonly visas: Readonly<Record<RegionId, VisaState>>;
  readonly tickets: readonly TicketState[];
};

export function createDocuments(): DocumentsState {
  return { passport: null, visas: {}, tickets: [] };
}
