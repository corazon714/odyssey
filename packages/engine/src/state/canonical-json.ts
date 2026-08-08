/**
 * Serialise a value to a byte-stable string.
 *
 * `JSON.stringify` is NOT stable enough for a digest. Its object key order is insertion
 * order, except that integer-like keys are hoisted and sorted numerically ahead of string
 * keys — so two states that are `toEqual` can stringify differently depending on the order
 * their flags happened to be set in. Every key is therefore sorted explicitly.
 *
 * The sort uses `<` on strings, which is exact UTF-16 code-unit order. `localeCompare` is
 * locale-dependent and would make the digest disagree between two machines with different
 * locales — the same class of hazard purity.test.ts bans (ADR 0005 decision 3).
 *
 * Numbers go through `String(value)`: ECMAScript specifies Number::toString exactly, so it
 * is the same on every engine. `undefined` is written as `null` rather than omitted, so a
 * key that changes from present-but-undefined to absent cannot slip past unnoticed — though
 * RunState's no-optional-properties rule should mean that never happens.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';

  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value);

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const parts = keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
    return `{${parts.join(',')}}`;
  }

  // Functions and symbols cannot appear in RunState (engine-spec 1). Reaching here means the
  // no-Map/Set/Date rule was broken, so produce something that will not silently match.
  return 'null';
}
