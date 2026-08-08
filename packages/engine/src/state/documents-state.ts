import { type EdgeId, type RegionId } from '../ids/content-ids.ts';

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
};

export type VisaState = {
  readonly valid: boolean;
  /** null = open-ended. Otherwise compared against ClockState.day. */
  readonly expiresDay: number | null;
};

export type TicketState = {
  readonly id: string;
  readonly forEdge: EdgeId;
  readonly used: boolean;
};

export type DocumentsState = {
  readonly passport: PassportState | null;
  readonly visas: Readonly<Record<RegionId, VisaState>>;
  readonly tickets: readonly TicketState[];
};

export function createDocuments(): DocumentsState {
  return { passport: null, visas: {}, tickets: [] };
}
