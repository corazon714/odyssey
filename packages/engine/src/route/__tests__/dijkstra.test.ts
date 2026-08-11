import { describe, expect, it } from 'vitest';

import { nodeId } from '../../ids/content-ids.ts';
import { canonicalJson } from '../../state/canonical-json.ts';
import { ROUTE_PROFILES, type RouteProfile } from '../../state/route-state.ts';
import { costFor } from '../cost-function.ts';
import { pathKey, shortestPath, type GeoPath } from '../dijkstra.ts';
import { createGeoGraph, type GeoGraph } from '../geo-graph.ts';
import { serviceMask } from '../geo-services.ts';
import {
  edgeIdsOf,
  idx,
  loadMiniGraph,
  nodeIdsOf,
  readMiniGraph,
} from './support/load-geo-mini.ts';

const GRAPH = loadMiniGraph();

/**
 * A path expressed in IDS rather than indices.
 *
 * Indices shift whenever the node set changes — nodes are sorted by id — so an id-shaped
 * identity is the only one that can compare a path across two differently-sized graphs. It is
 * also the stronger claim: the route is the same real route, not merely the same array.
 */
function identity(graph: GeoGraph, path: GeoPath): string {
  return canonicalJson({
    nodes: nodeIdsOf(graph, path.nodes),
    edges: edgeIdsOf(graph, path.edges),
    cost: path.cost,
    distanceKm: path.distanceKm,
  });
}

function route(
  graph: GeoGraph,
  from: string,
  to: string,
  profile: RouteProfile = 'fastest',
): GeoPath | null {
  return shortestPath(graph, idx(graph, from), idx(graph, to), costFor(profile));
}

describe('shortestPath', () => {
  it('has a connected fixture to route across', () => {
    const path = route(GRAPH, 'n.start', 'n.end');
    expect(path).not.toBeNull();
    expect(path?.edges.length).toBeGreaterThan(0);
  });

  it('returns a well-formed path: nodes = edges + 1, endpoints correct, distance summed', () => {
    for (const profile of ROUTE_PROFILES) {
      const path = route(GRAPH, 'n.start', 'n.end', profile);
      expect(path, profile).not.toBeNull();
      if (path === null) continue;
      expect(path.nodes.length).toBe(path.edges.length + 1);
      expect(path.nodes[0]).toBe(idx(GRAPH, 'n.start'));
      expect(path.nodes[path.nodes.length - 1]).toBe(idx(GRAPH, 'n.end'));
      const summed = path.edges.reduce((sum, e) => sum + (GRAPH.edges[e]?.distanceKm ?? 0), 0);
      expect(path.distanceKm).toBe(summed);
      const costed = path.edges.reduce((sum, e) => sum + (costFor(profile)(GRAPH, e) ?? 0), 0);
      expect(path.cost).toBe(costed);
    }
  });

  it('every edge on a path connects its two consecutive nodes', () => {
    for (const profile of ROUTE_PROFILES) {
      const path = route(GRAPH, 'n.start', 'n.end', profile);
      if (path === null) continue;
      for (let i = 0; i < path.edges.length; i += 1) {
        const e = path.edges[i] ?? -1;
        const a = path.nodes[i] ?? -1;
        const b = path.nodes[i + 1] ?? -1;
        const ends = [GRAPH.edgeFrom[e], GRAPH.edgeTo[e]];
        expect(ends.includes(a) && ends.includes(b), `${profile} step ${String(i)}`).toBe(true);
      }
    }
  });

  it('is a no-op from a node to itself', () => {
    const start = idx(GRAPH, 'n.start');
    expect(shortestPath(GRAPH, start, start, costFor('fastest'))).toEqual({
      nodes: [start],
      edges: [],
      cost: 0,
      distanceKm: 0,
    });
  });

  it('returns null for an out-of-range endpoint rather than routing from node 0', () => {
    expect(shortestPath(GRAPH, -1, 0, costFor('fastest'))).toBeNull();
    expect(shortestPath(GRAPH, 0, GRAPH.nodes.length, costFor('fastest'))).toBeNull();
  });

  it('reverses exactly — the same edges, mirrored', () => {
    for (const profile of ROUTE_PROFILES) {
      const there = route(GRAPH, 'n.start', 'n.end', profile);
      const back = route(GRAPH, 'n.end', 'n.start', profile);
      expect(there, profile).not.toBeNull();
      expect(back, profile).not.toBeNull();
      if (there === null || back === null) continue;
      expect(back.cost).toBe(there.cost);
      expect(back.distanceKm).toBe(there.distanceKm);
      expect([...back.edges].reverse()).toEqual([...there.edges]);
    }
  });

  it('IS UNCHANGED BY AN UNRELATED NODE — the acceptance test for determinism', () => {
    // ADR 0025 Decision 3. Inserting a disconnected node with an id that sorts FIRST shifts
    // every node index in the graph. If anything in the router depended on index identity, on
    // Map iteration order, or on an unstable tie-break, this is where it would show.
    const { nodes, edges } = readMiniGraph();
    const intruder = {
      id: nodeId('n.aaa_unrelated'),
      type: 'village' as const,
      terrain: 'hill' as const,
      elevationM: 10,
      population: 'hamlet' as const,
      services: serviceMask([]),
      closedMonths: [],
    };
    const widened = createGeoGraph([...nodes, intruder], edges);
    expect(widened.ok).toBe(true);
    if (!widened.ok) return;

    // The insert really did move things, or the test proves nothing.
    expect(idx(widened.graph, 'n.start')).not.toBe(idx(GRAPH, 'n.start'));

    for (const profile of ROUTE_PROFILES) {
      const before = route(GRAPH, 'n.start', 'n.end', profile);
      const after = route(widened.graph, 'n.start', 'n.end', profile);
      expect(before, profile).not.toBeNull();
      expect(after, profile).not.toBeNull();
      if (before === null || after === null) continue;
      expect(identity(widened.graph, after), profile).toBe(identity(GRAPH, before));
    }
  });

  it('is unchanged by the order the graph was built from', () => {
    const { nodes, edges } = readMiniGraph();
    const shuffled = createGeoGraph([...nodes].reverse(), [...edges].reverse());
    expect(shuffled.ok).toBe(true);
    if (!shuffled.ok) return;
    for (const profile of ROUTE_PROFILES) {
      const a = route(GRAPH, 'n.start', 'n.end', profile);
      const b = route(shuffled.graph, 'n.start', 'n.end', profile);
      if (a === null || b === null) continue;
      expect(identity(shuffled.graph, b), profile).toBe(identity(GRAPH, a));
    }
  });

  it('repeats identically — no hidden state between calls', () => {
    const first = route(GRAPH, 'n.start', 'n.end');
    const second = route(GRAPH, 'n.start', 'n.end');
    expect(first).not.toBeNull();
    if (first === null || second === null) return;
    expect(identity(GRAPH, second)).toBe(identity(GRAPH, first));
  });

  describe('blocking, which is what Yen will drive it with', () => {
    it('routes around a blocked edge', () => {
      const direct = route(GRAPH, 'n.start', 'n.end');
      expect(direct).not.toBeNull();
      if (direct === null) return;
      const blockedEdges = new Set(direct.edges);
      const detour = shortestPath(
        GRAPH,
        idx(GRAPH, 'n.start'),
        idx(GRAPH, 'n.end'),
        costFor('fastest'),
        {
          blockedEdges,
        },
      );
      expect(detour).not.toBeNull();
      if (detour === null) return;
      expect(pathKey(detour)).not.toBe(pathKey(direct));
      expect(detour.edges.some((e) => blockedEdges.has(e))).toBe(false);
      // A detour is never cheaper than the optimum it detours around.
      expect(detour.cost).toBeGreaterThanOrEqual(direct.cost);
    });

    it('routes around a blocked node', () => {
      const via = idx(GRAPH, 'n.m1');
      const path = shortestPath(
        GRAPH,
        idx(GRAPH, 'n.start'),
        idx(GRAPH, 'n.end'),
        costFor('fastest'),
        {
          blockedNodes: new Set([via]),
        },
      );
      expect(path).not.toBeNull();
      expect(path?.nodes.includes(via)).toBe(false);
    });

    it('returns null when blocking disconnects the pair, rather than a partial path', () => {
      // n.z1 hangs off n.end by a single edge. Block it and z1 is unreachable.
      const spur = GRAPH.edges.findIndex((e) => String(e.id) === 'e.end_z1');
      const path = shortestPath(
        GRAPH,
        idx(GRAPH, 'n.start'),
        idx(GRAPH, 'n.z1'),
        costFor('fastest'),
        {
          blockedEdges: new Set([spur]),
        },
      );
      expect(path).toBeNull();
    });

    it('reaches the spur when it is NOT blocked', () => {
      // Guards the guard: the null above is the blocking, not an unreachable fixture.
      expect(route(GRAPH, 'n.start', 'n.z1')).not.toBeNull();
    });
  });

  it('gives 3 distinct paths across the 5 profiles on this graph', () => {
    // Recorded rather than aspired to. `fastest` and `safest` agree here, and so do `scenic`
    // and `illicit` — which is exactly the collapse ADR 0025 Decision 2 names, appearing on a
    // 22-edge toy graph. It is what the diversity filter and Yen backfill exist to handle, and
    // it makes this fixture a better test for M3.3 than five distinct paths would be.
    const keys = new Set<string>();
    for (const profile of ROUTE_PROFILES) {
      const path = route(GRAPH, 'n.start', 'n.end', profile);
      if (path !== null) keys.add(pathKey(path));
    }
    expect(keys.size).toBe(3);
  });
});
