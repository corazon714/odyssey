/**
 * Is the graph one piece, and which edges hold it together?
 *
 * The build tool FAILS CLOSED on more than one component: a node no route can reach is dead
 * weight in every Dijkstra, and a second component is not a curiosity but a map the player can
 * be stranded on. ADR 0024's verification table puts this check in three places — here, in
 * `content:lint` as `GEO_DISCONNECTED`, and in a test over the committed artifacts — because it
 * is the one property whose violation is invisible until someone picks the wrong pair of cities.
 *
 * ## Bridges are counted, not forbidden
 *
 * A Tarjan bridge is any edge whose removal disconnects the graph. On a k-nearest graph with
 * water rejection, every fjord, peninsula and desert spur contributes a CHAIN of them — so the
 * bridge count is an order of magnitude larger than the count of things a human would call a
 * lifeline. Demanding a written justification per bridge would mean several hundred overlay
 * rows; demanding one per *branch* is the useful version, and that is what `leafBranches`
 * reports. `GEO_UNDECLARED_BRIDGE` is a warning with a budget, never a per-edge error.
 */

/**
 * How many nodes a component needs before it counts as a LANDMASS rather than a fragment.
 *
 * ADR 0036 replaced "the graph is exactly one component" with "every component is a landmass",
 * because the old rule made a world map impossible — no overlay row can land-connect the
 * Americas to Eurasia — and so quietly capped the game at one continent.
 *
 * **Calibrated, not chosen.** Measured over the Afro-Eurasia slice
 * (`--bbox=-18,-35,180,72`, 805 nodes, 49 components): the largest component holds 692 nodes
 * and the next five hold 20, 15, 10, 7 and 6. There is a two-order gap and 40 sits inside it —
 * comfortably below the smallest continental quota (`oceania` 55, so Australia qualifies as its
 * own landmass) and double the largest thing the edge builder actually produced by accident.
 *
 * Re-measure it whenever the bbox or the quotas move. A floor that admits a fragment ships a
 * place a player can be routed into and stranded on, which is the failure ADR 0024 named and
 * ADR 0036 kept.
 */
export const MIN_LANDMASS_NODES = 40;

export type ConnectivityEdge = {
  readonly a: number;
  readonly b: number;
};

export type ConnectivityReport = {
  readonly componentCount: number;
  /** Node indices per component, each ascending, components ordered by their lowest member. */
  readonly components: readonly (readonly number[])[];
  readonly degreeOf: readonly number[];
  /** Node indices with no edge at all. */
  readonly orphans: readonly number[];
  /** Indices into the edge array. Ascending. */
  readonly bridges: readonly number[];
  /**
   * Bridges whose removal strands a SMALL side — the ones worth declaring. Sorted by the size
   * of the stranded side, so the biggest lifelines read first.
   */
  readonly leafBranches: readonly { readonly edge: number; readonly stranded: number }[];
};

export function analyseConnectivity(
  nodeCount: number,
  edges: readonly ConnectivityEdge[],
): ConnectivityReport {
  const adjacency: number[][] = Array.from({ length: nodeCount }, () => []);
  const degreeOf = new Array<number>(nodeCount).fill(0);
  for (let e = 0; e < edges.length; e += 1) {
    const edge = edges[e];
    if (edge === undefined) continue;
    adjacency[edge.a]?.push(e);
    adjacency[edge.b]?.push(e);
    degreeOf[edge.a] = (degreeOf[edge.a] ?? 0) + 1;
    degreeOf[edge.b] = (degreeOf[edge.b] ?? 0) + 1;
  }
  // Ascending edge index within each node, matching the engine's CSR ordering rule. Every
  // traversal below is then a function of the graph rather than of insertion order.
  for (const list of adjacency) list.sort((x, y) => x - y);

  const componentOf = new Array<number>(nodeCount).fill(-1);
  const components: number[][] = [];
  for (let start = 0; start < nodeCount; start += 1) {
    if (componentOf[start] !== -1) continue;
    const id = components.length;
    const members: number[] = [];
    const stack = [start];
    componentOf[start] = id;
    while (stack.length > 0) {
      const node = stack.pop();
      if (node === undefined) continue;
      members.push(node);
      for (const e of adjacency[node] ?? []) {
        const edge = edges[e];
        if (edge === undefined) continue;
        const next = edge.a === node ? edge.b : edge.a;
        if (componentOf[next] !== -1) continue;
        componentOf[next] = id;
        stack.push(next);
      }
    }
    components.push(members.sort((x, y) => x - y));
  }

  // Iterative Tarjan. Recursion would blow the stack at 1,200 nodes on a chain-shaped graph,
  // which is exactly the shape a corridor produces.
  const discovery = new Array<number>(nodeCount).fill(-1);
  const low = new Array<number>(nodeCount).fill(0);
  const subtreeSize = new Array<number>(nodeCount).fill(1);
  const bridges: number[] = [];
  let timer = 0;

  for (let root = 0; root < nodeCount; root += 1) {
    if (discovery[root] !== -1) continue;
    const stack: { node: number; parentEdge: number; next: number }[] = [
      { node: root, parentEdge: -1, next: 0 },
    ];
    discovery[root] = timer;
    low[root] = timer;
    timer += 1;

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      if (frame === undefined) break;
      const incident = adjacency[frame.node] ?? [];

      if (frame.next < incident.length) {
        const e = incident[frame.next];
        frame.next += 1;
        if (e === undefined || e === frame.parentEdge) continue;
        const edge = edges[e];
        if (edge === undefined) continue;
        const child = edge.a === frame.node ? edge.b : edge.a;
        if (discovery[child] === -1) {
          discovery[child] = timer;
          low[child] = timer;
          timer += 1;
          stack.push({ node: child, parentEdge: e, next: 0 });
        } else {
          low[frame.node] = Math.min(low[frame.node] ?? 0, discovery[child] ?? 0);
        }
        continue;
      }

      stack.pop();
      const parent = stack[stack.length - 1];
      if (parent === undefined) continue;
      low[parent.node] = Math.min(low[parent.node] ?? 0, low[frame.node] ?? 0);
      subtreeSize[parent.node] = (subtreeSize[parent.node] ?? 1) + (subtreeSize[frame.node] ?? 1);
      if ((low[frame.node] ?? 0) > (discovery[parent.node] ?? 0)) {
        bridges.push(frame.parentEdge);
      }
    }
  }

  bridges.sort((x, y) => x - y);

  // The stranded side of a bridge is the smaller of the two pieces it separates. Reporting that
  // is what turns "several hundred bridges" into the handful a human should actually declare.
  const leafBranches = bridges
    .map((e) => {
      const edge = edges[e];
      if (edge === undefined) return { edge: e, stranded: 0 };
      const child = (discovery[edge.a] ?? 0) > (discovery[edge.b] ?? 0) ? edge.a : edge.b;
      const size = subtreeSize[child] ?? 1;
      return { edge: e, stranded: Math.min(size, nodeCount - size) };
    })
    .sort((x, y) => y.stranded - x.stranded || x.edge - y.edge);

  return {
    componentCount: components.length,
    components,
    degreeOf,
    orphans: degreeOf.flatMap((d, node) => (d === 0 ? [node] : [])),
    bridges,
    leafBranches,
  };
}

/** Degree histogram, for the audit report. Index is the degree, value is how many nodes have it. */
export function degreeHistogram(degreeOf: readonly number[]): readonly number[] {
  const max = degreeOf.reduce((a, b) => Math.max(a, b), 0);
  const out = new Array<number>(max + 1).fill(0);
  for (const degree of degreeOf) out[degree] = (out[degree] ?? 0) + 1;
  return out;
}
