/**
 * How the player is currently moving, and the condition of whatever is carrying them.
 *
 * `legal` is separate from `condition` because a stolen car in perfect repair and a
 * roadworthy one you own behave identically on the road and completely differently at a
 * checkpoint. Collapsing them into one number would lose exactly the distinction that makes
 * the illicit route profile interesting.
 */
export const TRANSPORT_MODES = [
  'foot',
  'bus',
  'train',
  'car',
  'truck',
  'ferry',
  'rideshare',
] as const;

export type TransportMode = (typeof TRANSPORT_MODES)[number];

export type TransportState = {
  readonly mode: TransportMode;
  /** null when the mode has no vehicle of the player's own — foot, bus, train, ferry. */
  readonly vehicleId: string | null;
  /** 0-10. 0 = broken down. */
  readonly condition: number;
  /** 0-10. Only meaningful for modes the player fuels themselves. */
  readonly fuel: number;
  readonly legal: boolean;
};

export const TRANSPORT_MIN = 0;
export const TRANSPORT_MAX = 10;

export function createTransport(mode: TransportMode = 'foot'): TransportState {
  return { mode, vehicleId: null, condition: 10, fuel: 10, legal: true };
}
