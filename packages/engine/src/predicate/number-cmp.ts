/**
 * Numeric comparison, as data.
 *
 * Authored YAML says `{ resource: money, gte: 30 }`; M5's schema normalises that to
 * `{ op: 'gte', value: 30 }`. Keeping the operator in a field rather than in the key is what
 * lets the evaluator be an exhaustive `switch` instead of a chain of `in` checks.
 */
export const NUMBER_OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] as const;

export type NumberOp = (typeof NUMBER_OPS)[number];

export type NumberCmp = {
  readonly op: NumberOp;
  readonly value: number;
};

export function compareNumber(cmp: NumberCmp, actual: number): boolean {
  switch (cmp.op) {
    case 'eq':
      return actual === cmp.value;
    case 'neq':
      return actual !== cmp.value;
    case 'gt':
      return actual > cmp.value;
    case 'gte':
      return actual >= cmp.value;
    case 'lt':
      return actual < cmp.value;
    case 'lte':
      return actual <= cmp.value;
    default:
      // Exhaustive: adding an op without handling it fails to compile here.
      return unreachableOp(cmp.op);
  }
}

function unreachableOp(op: never): boolean {
  // Runtime safety for a malformed save or content pack — the engine never throws.
  void op;
  return false;
}
