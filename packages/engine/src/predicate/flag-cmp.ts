import { type FlagValue } from '../state/memory-entries.ts';
import { compareNumber, type NumberCmp } from './number-cmp.ts';

/**
 * Flags hold `boolean | number | string`, so comparing one needs more than a number
 * comparison. `owes:dmitri` is a number, `cover_story` is a string, `wanted` is a boolean.
 *
 * `isSet` / `notSet` are the common case and deliberately do NOT mean "the value is truthy":
 * a flag set to `false` or to `0` is still SET. Conflating the two is how "you already tried
 * bribing here" stops working the moment someone stores a count.
 */
export type FlagCmp =
  | { readonly op: 'isSet' }
  | { readonly op: 'notSet' }
  | { readonly op: 'eq'; readonly value: FlagValue }
  | { readonly op: 'neq'; readonly value: FlagValue }
  | { readonly op: 'number'; readonly cmp: NumberCmp };

/** `entry` is null when the flag was never set, or has expired (see readFlag). */
export function compareFlag(cmp: FlagCmp, entry: { readonly value: FlagValue } | null): boolean {
  switch (cmp.op) {
    case 'isSet':
      return entry !== null;
    case 'notSet':
      return entry === null;
    case 'eq':
      return entry !== null && entry.value === cmp.value;
    case 'neq':
      return entry === null || entry.value !== cmp.value;
    case 'number':
      // A non-numeric flag never satisfies a numeric comparison, rather than coercing.
      return entry !== null && typeof entry.value === 'number'
        ? compareNumber(cmp.cmp, entry.value)
        : false;
    default:
      return unreachableFlagOp(cmp);
  }
}

function unreachableFlagOp(cmp: never): boolean {
  void cmp;
  return false;
}
