import { describe, expect, it } from 'vitest';

import { createIntHeap } from '../int-heap.ts';

/** Drain a heap into the order it pops. */
function drain(heap: ReturnType<typeof createIntHeap>): { cost: number; node: number }[] {
  const out: { cost: number; node: number }[] = [];
  for (;;) {
    const top = heap.pop();
    if (top === null) break;
    out.push({ cost: top.cost, node: top.node });
  }
  return out;
}

describe('createIntHeap', () => {
  it('pops in ascending cost', () => {
    const heap = createIntHeap();
    for (const cost of [40, 10, 30, 20, 50]) heap.push(cost, 0);
    expect(drain(heap).map((e) => e.cost)).toEqual([10, 20, 30, 40, 50]);
  });

  it('breaks a cost tie by node index, ascending', () => {
    const heap = createIntHeap();
    for (const node of [7, 2, 9, 4]) heap.push(100, node);
    expect(drain(heap).map((e) => e.node)).toEqual([2, 4, 7, 9]);
  });

  it('breaks a (cost, node) tie by push order, earlier first', () => {
    // The third comparator term. It can only separate two pushes of the SAME node at the SAME
    // cost — which lazy deletion produces constantly — and without it the sift path decides.
    const heap = createIntHeap();
    heap.push(5, 3);
    heap.push(5, 3);
    heap.push(5, 3);
    expect(drain(heap)).toEqual([
      { cost: 5, node: 3 },
      { cost: 5, node: 3 },
      { cost: 5, node: 3 },
    ]);
  });

  it('is insertion-order independent for distinct keys', () => {
    // The property the whole design turns on: the same SET of entries drains identically
    // however it was built, so a change in graph iteration order cannot change a route.
    const entries = [
      { cost: 30, node: 1 },
      { cost: 10, node: 5 },
      { cost: 30, node: 0 },
      { cost: 20, node: 9 },
      { cost: 10, node: 2 },
    ];
    const forward = createIntHeap();
    for (const e of entries) forward.push(e.cost, e.node);
    const backward = createIntHeap();
    for (const e of [...entries].reverse()) backward.push(e.cost, e.node);
    expect(drain(forward)).toEqual(drain(backward));
  });

  it('grows past its initial capacity without losing or reordering entries', () => {
    // INITIAL_CAPACITY is 64; Dijkstra pushes more than that on any real graph.
    const heap = createIntHeap();
    const count = 500;
    for (let i = count - 1; i >= 0; i -= 1) heap.push(i * 3, i);
    expect(heap.size).toBe(count);
    const drained = drain(heap);
    expect(drained.length).toBe(count);
    expect(drained.map((e) => e.cost)).toEqual(drained.map((e) => e.cost).sort((a, b) => a - b));
    expect(drained[0]).toEqual({ cost: 0, node: 0 });
  });

  it('reports size and returns null when empty', () => {
    const heap = createIntHeap();
    expect(heap.size).toBe(0);
    expect(heap.pop()).toBeNull();
    heap.push(1, 1);
    expect(heap.size).toBe(1);
    heap.pop();
    expect(heap.size).toBe(0);
    expect(heap.pop()).toBeNull();
  });

  it('handles a heap of one', () => {
    const heap = createIntHeap();
    heap.push(42, 7);
    expect(heap.pop()).toEqual({ cost: 42, node: 7 });
    expect(heap.pop()).toBeNull();
  });
});
