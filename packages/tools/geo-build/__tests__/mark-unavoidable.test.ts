import { describe, expect, it } from 'vitest';

import {
  markUnavoidable,
  HARD_GROUND_DIFFICULTY,
  type ConnectivityEdge,
} from '../mark-unavoidable.ts';

function edge(over: Partial<ConnectivityEdge> & { a: number; b: number }): ConnectivityEdge {
  return { terrainDifficulty: 0, distanceKm: 100, usable: true, ...over };
}

/** Difficulty at or above the threshold — what `safest` refuses unless it is the only way. */
const HARD = HARD_GROUND_DIFFICULTY;

describe('markUnavoidable', () => {
  it('flags nothing when every node is reachable over easy ground', () => {
    const edges = [edge({ a: 0, b: 1 }), edge({ a: 1, b: 2 }), edge({ a: 0, b: 2 })];
    expect(markUnavoidable(3, edges).size).toBe(0);
  });

  it('flags a hard edge that is the only way to reach a node', () => {
    const edges = [edge({ a: 0, b: 1 }), edge({ a: 1, b: 2, terrainDifficulty: HARD })];
    expect([...markUnavoidable(3, edges)]).toEqual([1]);
  });

  it('leaves a hard edge unflagged when easy ground already joins the same two sides', () => {
    // This is the divergence the mask exists for: `safest` still refuses edge 1 and detours.
    const edges = [
      edge({ a: 0, b: 1 }),
      edge({ a: 0, b: 1, terrainDifficulty: HARD }),
      edge({ a: 1, b: 2 }),
    ];
    expect(markUnavoidable(3, edges).size).toBe(0);
  });

  it('flags only the first of a chain of hard edges into a dead end', () => {
    // 0 -1- 1 =2= 2 =3= 3, where 2 and 3 are hard. Reaching node 2 needs edge 1; node 3 then
    // hangs off it, so edge 2 is needed too. Both are structural.
    const edges = [
      edge({ a: 0, b: 1 }),
      edge({ a: 1, b: 2, terrainDifficulty: HARD }),
      edge({ a: 2, b: 3, terrainDifficulty: HARD }),
    ];
    expect([...markUnavoidable(4, edges)].sort((x, y) => x - y)).toEqual([1, 2]);
  });

  it('flags only one of two hard edges that would each reconnect the same pair', () => {
    const edges = [
      edge({ a: 0, b: 1, terrainDifficulty: HARD, distanceKm: 500 }),
      edge({ a: 0, b: 1, terrainDifficulty: HARD, distanceKm: 100 }),
    ];
    const flagged = markUnavoidable(2, edges);
    expect(flagged.size).toBe(1);
    // Shorter wins at equal difficulty: if `safest` must take hard ground, take less of it.
    expect(flagged.has(1)).toBe(true);
  });

  it('prefers the EASIER hard edge over the shorter one', () => {
    const edges = [
      edge({ a: 0, b: 1, terrainDifficulty: HARD + 1, distanceKm: 10 }),
      edge({ a: 0, b: 1, terrainDifficulty: HARD, distanceKm: 900 }),
    ];
    expect([...markUnavoidable(2, edges)]).toEqual([1]);
  });

  it('ignores an edge `safest` refuses for another reason', () => {
    // The measured bug. Seeding with every easy edge computed a spanning set against a graph
    // safest cannot fully use, and it went from 74 of 200 routable to 136 rather than to 200.
    // Here the easy link is an uncontrolled boundary crossing, so the hard one is still needed.
    const edges = [
      edge({ a: 0, b: 1, usable: false }),
      edge({ a: 0, b: 1, terrainDifficulty: HARD }),
    ];
    expect([...markUnavoidable(2, edges)]).toEqual([1]);
  });

  it('never flags an unusable hard edge — it would not help safest anyway', () => {
    const edges = [edge({ a: 0, b: 1, terrainDifficulty: HARD, usable: false })];
    expect(markUnavoidable(2, edges).size).toBe(0);
  });

  it('leaves the usable graph connected — the property the whole module exists for', () => {
    // A ring of five nodes where every other link is hard ground.
    const edges = [
      edge({ a: 0, b: 1 }),
      edge({ a: 1, b: 2, terrainDifficulty: HARD }),
      edge({ a: 2, b: 3 }),
      edge({ a: 3, b: 4, terrainDifficulty: HARD }),
      edge({ a: 4, b: 0, terrainDifficulty: HARD }),
    ];
    const flagged = markUnavoidable(5, edges);

    const parent = [0, 1, 2, 3, 4];
    const find = (n: number): number => {
      let r = n;
      while (parent[r] !== r) r = parent[r] ?? r;
      return r;
    };
    edges.forEach((e, i) => {
      if (!e.usable) return;
      if (e.terrainDifficulty >= HARD && !flagged.has(i)) return;
      const ra = find(e.a);
      const rb = find(e.b);
      if (ra !== rb) parent[ra] = rb;
    });
    expect(new Set([0, 1, 2, 3, 4].map(find)).size).toBe(1);
  });

  it('is invariant to the order the edges arrive in', () => {
    const edges = [
      edge({ a: 0, b: 1 }),
      edge({ a: 1, b: 2, terrainDifficulty: HARD, distanceKm: 200 }),
      edge({ a: 2, b: 3, terrainDifficulty: HARD, distanceKm: 300 }),
      edge({ a: 0, b: 3 }),
    ];
    const forward = markUnavoidable(4, edges);
    const reversed = markUnavoidable(4, [...edges].reverse());
    expect(forward.size).toBe(reversed.size);
  });

  it('gives the same answer twice', () => {
    const edges = [edge({ a: 0, b: 1 }), edge({ a: 1, b: 2, terrainDifficulty: HARD })];
    expect([...markUnavoidable(3, edges)]).toEqual([...markUnavoidable(3, edges)]);
  });
});
