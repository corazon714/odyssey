/**
 * Errors the engine RETURNS. It does not throw them.
 *
 * A thrown error crossing the engine boundary would take down a player's run mid-journey,
 * and there is no recovery path in a game whose state is 30 legs deep. Every entry point
 * returns a discriminated result instead, so the app layer decides what to show.
 *
 * `messageKey` is an i18n key (CLAUDE.md 2.4). `params` exists so a message can name what
 * was wrong without embedding prose, and is restricted to JSON primitives so an error can
 * be persisted in `history` or a bug report.
 */
export const ENGINE_ERROR_CODES = [
  'route/empty',
  'route/leg-count-mismatch',
  'route/leg-distance-mismatch',
  'route/montage-out-of-range',
  'route/beat-out-of-range',
  'route/duplicate-beat-leg',
  'save/version-too-new',
  'save/version-unsupported',
  'save/shape-invalid',
  'replay/content-version-mismatch',
  'loop/wrong-status',
  'loop/no-presented-event',
  'loop/unknown-choice',
] as const;

export type EngineErrorCode = (typeof ENGINE_ERROR_CODES)[number];

export type EngineError = {
  readonly code: EngineErrorCode;
  readonly messageKey: string;
  readonly params: Readonly<Record<string, string | number | boolean>>;
};

export function engineError(
  code: EngineErrorCode,
  params: Readonly<Record<string, string | number | boolean>> = {},
): EngineError {
  return { code, messageKey: `engine.error.${code}`, params };
}
