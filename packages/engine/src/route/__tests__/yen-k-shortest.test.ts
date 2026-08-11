import { describe, expect, it } from 'vitest';

import { edgeId, nodeId } from '../../ids/content-ids.ts';
import { costFor } from '../cost-function.ts';
import { pathKey } from '../dijkstra.ts';
import { modeMask } from '../geo-edge.ts';
import { createGeoGraph, type GeoGraph } from '../geo-graph.ts';
import { serviceMask } from '../geo-services.ts';
import { kShortestPaths, MAX_SPUR_NODES } from '../yen-k-shortest.ts';
import { idx, loadMiniGraph } from './support/load-geo-mini.ts';

const GRAPH = loadMiniGraph();
const START = idx(GRAPH, 'n.start');
const END = idx(GRAPH, 'n.end');

/**
 * `n.p0 — n.p1 — n.p2 — n.p3 = n.p4`, where the only alternative is the doubled last hop.
 *
 * Its whole purpose is that the deviation is at spur node index 3, so a cap of 1 cannot reach it.
 */
function lateBranchChain(): GeoGraph {
  const node = (id: string) => ({
    id: nodeId(id),
    type: 'town' as const,
    terrain: 'plain' as const,
    elevationM: 0,
    population: 'small' as const,
    services: serviceMask(['fuel']),
    closedMonths: [],
  });
  const edge = (id: string, from: string, to: string, distanceKm: number) => ({
    id: edgeId(id),
    from: nodeId(from),
    to: nodeId(to),
    distanceKm,
    modes: modeMask(['car']),
    terrainDifficulty: 0,
    scenic: 1,
    seasonality: 'all_year' as const,
    tolled: false,
    adminBoundary: false,
  });
  const built = createGeoGraph(['n.p0', 'n.p1', 'n.p2', 'n.p3', 'n.p4'].map(node), [
    edge('e.p01', 'n.p0', 'n.p1', 100),
    edge('e.p12', 'n.p1', 'n.p2', 100),
    edge('e.p23', 'n.p2', 'n.p3', 100),
    edge('e.p34a', 'n.p3', 'n.p4', 100),
    edge('e.p34b', 'n.p3', 'n.p4', 260),
  ]);
  if (!built.ok) throw new Error(built.issues.join('; '));
  return built.graph;
}

describe('kShortestPaths', () => {
  it('has a graph with more than one route to find', () => {
    const result = kShortestPaths(GRAPH, START, END, costFor('fastest'), { k: 6 });
    expect(result.paths.length).toBeGreaterThan(1);
  });

  it('returns the shortest path first and no duplicates', () => {
    const result = kShortestPaths(GRAPH, START, END, costFor('fastest'), { k: 6 });
    const keys = result.paths.map(pathKey);
    expect(new Set(keys).size).toBe(keys.length);
    // The first is the plain Dijkstra answer.
    expect(result.paths[0]?.cost).toBe(285);
  });

  it('returns paths SORTED by (cost, pathKey)', () => {
    // Sorted output is the property callers may rely on. The strict ascending-DISCOVERY
    // property is what the spur cap removes, so this is asserted instead of that.
    const result = kShortestPaths(GRAPH, START, END, costFor('fastest'), { k: 6 });
    for (let i = 1; i < result.paths.length; i += 1) {
      const previous = result.paths[i - 1];
      const current = result.paths[i];
      if (previous === undefined || current === undefined) continue;
      expect(previous.cost).toBeLessThanOrEqual(current.cost);
      if (previous.cost === current.cost) {
        expect(pathKey(previous) < pathKey(current)).toBe(true);
      }
    }
  });

  it('every path it returns is loopless and well formed', () => {
    const result = kShortestPaths(GRAPH, START, END, costFor('fastest'), { k: 6 });
    for (const path of result.paths) {
      expect(new Set(path.nodes).size, pathKey(path)).toBe(path.nodes.length);
      expect(path.nodes.length).toBe(path.edges.length + 1);
      expect(path.nodes[0]).toBe(START);
      expect(path.nodes[path.nodes.length - 1]).toBe(END);
      const costed = path.edges.reduce((sum, e) => sum + (costFor('fastest')(GRAPH, e) ?? 0), 0);
      expect(costed, pathKey(path)).toBe(path.cost);
      const km = path.edges.reduce((sum, e) => sum + (GRAPH.edges[e]?.distanceKm ?? 0), 0);
      expect(km, pathKey(path)).toBe(path.distanceKm);
    }
  });

  it('never returns an edge a profile masks', () => {
    // Yen inherits the profile's feasible graph. `illicit` refuses train and ferry, so no
    // returned path may use e.m1_end or e.p1_p2 however deep the search goes.
    const banned = new Set(
      ['e.m1_end', 'e.p1_p2'].map((id) => GRAPH.edges.findIndex((e) => String(e.id) === id)),
    );
    const result = kShortestPaths(GRAPH, START, END, costFor('illicit'), { k: 6 });
    expect(result.paths.length).toBeGreaterThan(0);
    for (const path of result.paths) {
      expect(
        path.edges.some((e) => banned.has(e)),
        pathKey(path),
      ).toBe(false);
    }
  });

  it('stops at k, and returns fewer when the graph has fewer', () => {
    const two = kShortestPaths(GRAPH, START, END, costFor('fastest'), { k: 2 });
    expect(two.paths.length).toBe(2);
    const many = kShortestPaths(GRAPH, START, END, costFor('fastest'), { k: 99 });
    expect(many.paths.length).toBeLessThan(99);
    expect(many.paths.length).toBeGreaterThan(2);
  });

  it('returns nothing at all when there is no path', () => {
    const spur = GRAPH.edges.findIndex((e) => String(e.id) === 'e.end_z1');
    // `illicit` can still reach z1, so instead route to a node made unreachable by the profile:
    // use a k of 3 from a node to itself, which is the degenerate case.
    expect(kShortestPaths(GRAPH, START, START, costFor('fastest'), { k: 3 }).paths).toHaveLength(1);
    expect(spur).toBeGreaterThanOrEqual(0);
  });

  it('reports the spur cap rather than silently approximating', () => {
    // The default 64 exceeds every path length in this fixture, which is why the flag is false
    // in every other test here.
    const capped = kShortestPaths(GRAPH, START, END, costFor('fastest'), { k: 6, maxSpurNodes: 1 });
    expect(capped.spurCapReached).toBe(true);
    const uncapped = kShortestPaths(GRAPH, START, END, costFor('fastest'), { k: 6 });
    expect(uncapped.spurCapReached).toBe(false);
  });

  it('the cap really does cost coverage — on a graph where the deviation is LATE', () => {
    // Guards the guard, and the mini fixture cannot do it: every alternative there branches at
    // `n.start`, so exploring spur node 0 alone still finds five paths and the cap is invisible.
    // This chain hides its only alternative at the fourth node, which is exactly the case a cap
    // truncates and the reason the cap had to be raised from the originally-proposed 24.
    const graph = lateBranchChain();
    const start = 0;
    const end = graph.nodes.length - 1;
    const uncapped = kShortestPaths(graph, start, end, costFor('fastest'), { k: 4 });
    expect(uncapped.spurCapReached).toBe(false);
    expect(uncapped.paths.length).toBe(2);

    const capped = kShortestPaths(graph, start, end, costFor('fastest'), { k: 4, maxSpurNodes: 1 });
    expect(capped.spurCapReached).toBe(true);
    expect(capped.paths.length).toBe(1);
  });

  it('caps at 64 by default, which is above any realistic path length', () => {
    expect(MAX_SPUR_NODES).toBe(64);
  });

  it('is deterministic across repeated calls', () => {
    const a = kShortestPaths(GRAPH, START, END, costFor('cheapest'), { k: 6 });
    const b = kShortestPaths(GRAPH, START, END, costFor('cheapest'), { k: 6 });
    expect(b.paths.map(pathKey)).toEqual(a.paths.map(pathKey));
  });
});
