import { type ReasonNode, type ReasonParams } from './reason-node.ts';

/**
 * One chip on the result screen. Phase 7 (MOTION MO2) renders these.
 *
 * `polarity` is what the player reads as colour or sign — did this help or hurt. It is not
 * simply the node's own value: under a `not`, a leaf that was TRUE is what made the
 * requirement fail, so it must show as a `con`.
 */
export type ReasonLine = {
  readonly labelKey: string;
  readonly params: ReasonParams;
  readonly polarity: 'pro' | 'con';
};

/**
 * Flatten a trace to the chips worth showing.
 *
 * Structural nodes (`all`, `any`, `not`) are dropped — "all of these three things" is not a
 * chip, it is grammar. Only leaves survive, each carrying the numbers that explain it.
 *
 * Inversion is tracked through `not` rather than read off each node, which is the whole
 * reason this is a walk and not a filter. Nested negation composes correctly:
 * `not(not(flag))` leaves polarity unchanged.
 */
export function describeReason(node: ReasonNode): readonly ReasonLine[] {
  const lines: ReasonLine[] = [];
  collect(node, false, lines);
  return lines;
}

function collect(node: ReasonNode, inverted: boolean, out: ReasonLine[]): void {
  if (node.kind === 'not') {
    for (const child of node.children) collect(child, !inverted, out);
    return;
  }

  if (node.kind === 'all' || node.kind === 'any') {
    for (const child of node.children) collect(child, inverted, out);
    return;
  }

  // `always` and `never` carry no information a player needs; they exist for authors.
  if (node.kind === 'always' || node.kind === 'never') return;

  out.push({
    labelKey: node.labelKey,
    params: node.params,
    polarity: node.value !== inverted ? 'pro' : 'con',
  });
}
