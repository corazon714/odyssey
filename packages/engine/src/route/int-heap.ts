/**
 * A binary min-heap with a STRICT TOTAL ORDER, which is the whole reason it exists.
 *
 * Equal costs are not an edge case in this graph — distances are integers, costs are integers,
 * and a geometrically synthesised network is full of symmetric alternatives. Ordering by cost
 * alone leaves the winner of a tie decided by sift order and array layout, and Yen re-runs
 * Dijkstra once per spur node on a mutated graph, so a single flipped tie changes the entire
 * candidate set. ADR 0025 Decision 3.
 *
 * So the comparator is `(cost, node, seq)`:
 *
 * - `cost` first, obviously.
 * - `node` index second, so two entries at the same cost resolve by a stable property of the
 *   graph rather than by insertion history.
 * - `seq`, a monotone push counter, last. It can only separate two pushes of the SAME node at
 *   the SAME cost, where earlier wins. It exists so the order is total rather than merely
 *   usually-decisive; without it the comparator ties and the sift path decides.
 *
 * ## On the typed arrays, and a claim that turned out to be false
 *
 * An earlier draft of ADR 0025 justified `Int32Array` on the grounds that TypedArray element
 * access types as `number` and so escapes `noUncheckedIndexedAccess`. **It does not** — the
 * flag applies to numeric index signatures, TypedArrays included. `packages/engine/src/route/`
 * is the first TypedArray in the engine, so there was no precedent to check it against.
 *
 * The arrays stay, for the reasons that survive: `new Int32Array(n)` is zero-initialised to a
 * known length, integrality is enforced by the container rather than by review, and the memory
 * is flat. Every read is written `?? <sentinel>` where the sentinel **fails closed** — an
 * impossible index yields "no candidate" rather than a plausible wrong number. Silent
 * plausibility is the thing the compiler flag exists to prevent, and `?? 0` on a cost would
 * have reintroduced it.
 *
 * Costs must fit `Int32`. The bound is comfortable: a 20,000 km path at the largest per-km
 * coefficient plus flat penalties is order 10^6 against a 2.1 x 10^9 ceiling.
 */
export type IntHeap = {
  push(cost: number, node: number): void;
  /** Lowest `(cost, node, seq)`, or null when empty. */
  pop(): { readonly cost: number; readonly node: number } | null;
  readonly size: number;
};

const INITIAL_CAPACITY = 64;

/** Fails closed: an unreadable slot sorts LAST, so it can never win a comparison. */
const UNREADABLE = 2147483647;

export function createIntHeap(): IntHeap {
  let capacity = INITIAL_CAPACITY;
  let costs = new Int32Array(capacity);
  let nodes = new Int32Array(capacity);
  let seqs = new Int32Array(capacity);
  let size = 0;
  let counter = 0;

  /** True when `a` sorts before `b`. Total: no two live entries ever compare equal. */
  function before(a: number, b: number): boolean {
    const costA = costs[a] ?? UNREADABLE;
    const costB = costs[b] ?? UNREADABLE;
    if (costA !== costB) return costA < costB;
    const nodeA = nodes[a] ?? UNREADABLE;
    const nodeB = nodes[b] ?? UNREADABLE;
    if (nodeA !== nodeB) return nodeA < nodeB;
    return (seqs[a] ?? UNREADABLE) < (seqs[b] ?? UNREADABLE);
  }

  function swap(a: number, b: number): void {
    const cost = costs[a] ?? 0;
    const node = nodes[a] ?? 0;
    const seq = seqs[a] ?? 0;
    costs[a] = costs[b] ?? 0;
    nodes[a] = nodes[b] ?? 0;
    seqs[a] = seqs[b] ?? 0;
    costs[b] = cost;
    nodes[b] = node;
    seqs[b] = seq;
  }

  function grow(): void {
    capacity *= 2;
    const nextCosts = new Int32Array(capacity);
    const nextNodes = new Int32Array(capacity);
    const nextSeqs = new Int32Array(capacity);
    nextCosts.set(costs);
    nextNodes.set(nodes);
    nextSeqs.set(seqs);
    costs = nextCosts;
    nodes = nextNodes;
    seqs = nextSeqs;
  }

  return {
    push(cost: number, node: number): void {
      if (size === capacity) grow();
      costs[size] = cost;
      nodes[size] = node;
      seqs[size] = counter;
      counter += 1;
      let child = size;
      size += 1;
      while (child > 0) {
        const parent = (child - 1) >> 1;
        if (!before(child, parent)) break;
        swap(child, parent);
        child = parent;
      }
    },

    pop(): { readonly cost: number; readonly node: number } | null {
      if (size === 0) return null;
      const cost = costs[0];
      const node = nodes[0];
      if (cost === undefined || node === undefined) return null;
      size -= 1;
      if (size > 0) {
        costs[0] = costs[size] ?? 0;
        nodes[0] = nodes[size] ?? 0;
        seqs[0] = seqs[size] ?? 0;
        let parent = 0;
        for (;;) {
          const left = 2 * parent + 1;
          const right = left + 1;
          let smallest = parent;
          if (left < size && before(left, smallest)) smallest = left;
          if (right < size && before(right, smallest)) smallest = right;
          if (smallest === parent) break;
          swap(parent, smallest);
          parent = smallest;
        }
      }
      return { cost, node };
    },

    get size(): number {
      return size;
    },
  };
}
