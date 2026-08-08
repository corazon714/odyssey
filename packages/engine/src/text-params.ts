/**
 * Interpolation values that travel with an i18n key.
 *
 * Restricted to JSON primitives because everything carrying these gets persisted: reason
 * traces land in `history`, applied effects feed the journal, and both must survive
 * `JSON.stringify` without a custom serialiser (engine-spec 1).
 *
 * Shared by the predicate trace and the effect log rather than duplicated in each, because
 * they are the same constraint for the same reason — and the result screen renders both side
 * by side.
 */
export type TextParams = Readonly<Record<string, string | number | boolean>>;

export const NO_TEXT_PARAMS: TextParams = Object.freeze({});
