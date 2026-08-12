/**
 * Which stretches of hard ground have no way round them.
 *
 * ## The fault this fixes
 *
 * `safest` masks `terrainDifficulty >= 3`. On the European slice that is 69 of 265 edges, and
 * removing them leaves **52 components with the largest holding 146 of 221 nodes** — so `safest`
 * could route only 74 of 220 sampled pairs. A profile that cannot reach the destination is not a
 * safer route, it is an absent one, and the diversity ladder then filled its slot with Yen
 * deviations of somebody else's path.
 *
 * This is the same fault `place-borders.ts` fixes for the boundary mask, and the same lesson:
 * **a mask is a divergence mechanism only while the masked graph stays connected.** Past that it
 * is a disconnection mechanism, and disconnection produces relaxation, and relaxation produces
 * sameness.
 *
 * ## What is flagged
 *
 * A spanning forest over the hard edges, seeded with the easy ones — Kruskal, preferring the
 * easiest and then the shortest hard edge wherever several would join the same two sides. That is
 * the minimum set that keeps the graph whole, so everything NOT flagged is hard ground with a
 * genuine alternative, and `safest` still refuses all of it. The divergence survives; the
 * disconnection does not.
 *
 * Both passes run over the edges `safest` can actually use — see `ConnectivityEdge.usable`, which
 * records what happened when they did not.
 *
 * ## Two things this deliberately is not
 *
 * **Not a bridge count.** A Tarjan bridge is an edge whose removal disconnects the FULL graph.
 * This asks a different question — whether the graph survives losing every optional hard edge at
 * once — and the answers differ: a mountain edge can be no bridge at all yet still be the only
 * link once its hard-ground neighbours are gone.
 *
 * **Not per origin-destination pair.** The exact set a given journey needs depends on where it
 * starts, and computing that would be a Dijkstra per pair inside a cost function. One global
 * spanning set is a deterministic, buildable over-approximation: it can flag an edge some
 * journeys could route around, never fail to flag one they cannot.
 *
 * Nothing here reads a place. Terrain and length in, a boolean out.
 */

/** `safest` refuses ground at or above this, unless it is the only way through. */
export const HARD_GROUND_DIFFICULTY = 3;

export type ConnectivityEdge = {
  readonly a: number;
  readonly b: number;
  readonly terrainDifficulty: number;
  readonly distanceKm: number;
  /**
   * Whether `safest` would take this edge if terrain were the only question — that is, it is
   * `all_year` and it is not an uncontrolled boundary crossing.
   *
   * **Seeding with every easy edge instead was wrong, and the measurement said so.** It computed
   * a spanning set against a graph `safest` cannot fully use, so the flag guaranteed connectivity
   * for somebody else: `safest` went from 74 of 200 routable to 136, not to 200. Each mask alone
   * leaves the graph whole; the two together do not, and the exemption has to be computed against
   * the intersection or it does not do its job.
   */
  readonly usable: boolean;
};

export function markUnavoidable(
  nodeCount: number,
  edges: readonly ConnectivityEdge[],
): ReadonlySet<number> {
  const parent = Array.from({ length: nodeCount }, (_, i) => i);
  const find = (n: number): number => {
    let root = n;
    while (parent[root] !== root) {
      const up = parent[root] ?? root;
      parent[root] = parent[up] ?? up;
      root = parent[root] ?? root;
    }
    return root;
  };
  const union = (x: number, y: number): boolean => {
    const rx = find(x);
    const ry = find(y);
    if (rx === ry) return false;
    parent[rx] = ry;
    return true;
  };

  const hard: number[] = [];
  for (let i = 0; i < edges.length; i += 1) {
    const edge = edges[i];
    if (edge === undefined || !edge.usable) continue;
    if (edge.terrainDifficulty >= HARD_GROUND_DIFFICULTY) hard.push(i);
    else union(edge.a, edge.b);
  }

  // Easiest first, then shortest, then index — a strict total order, so the chosen set cannot
  // depend on sort stability. Easiest first because if two hard edges would reconnect the same
  // two sides, the one `safest` minds least is the one to hand it.
  hard.sort((x, y) => {
    const ex = edges[x];
    const ey = edges[y];
    if (ex === undefined || ey === undefined) return x - y;
    return ex.terrainDifficulty - ey.terrainDifficulty || ex.distanceKm - ey.distanceKm || x - y;
  });

  const unavoidable = new Set<number>();
  for (const index of hard) {
    const edge = edges[index];
    if (edge === undefined) continue;
    if (union(edge.a, edge.b)) unavoidable.add(index);
  }
  return unavoidable;
}
