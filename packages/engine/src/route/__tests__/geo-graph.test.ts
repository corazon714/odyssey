import { describe, expect, it } from 'vitest';

import { edgeId, nodeId } from '../../ids/content-ids.ts';
import { createGeoGraph, edgeAt, nodeAt, otherEnd } from '../geo-graph.ts';
import { modeMask, type GeoEdge } from '../geo-edge.ts';
import { type GeoNode } from '../geo-node.ts';
import { serviceMask } from '../geo-services.ts';
import { loadMiniGraph, readMiniGraph } from './support/load-geo-mini.ts';

function node(id: string): GeoNode {
  return {
    id: nodeId(id),
    type: 'town',
    terrain: 'plain',
    elevationM: 0,
    population: 'small',
    services: serviceMask(['fuel']),
    closedMonths: [],
  };
}

function edge(id: string, from: string, to: string, distanceKm = 10): GeoEdge {
  return {
    id: edgeId(id),
    from: nodeId(from),
    to: nodeId(to),
    distanceKm,
    modes: modeMask(['car']),
    terrainDifficulty: 0,
    scenic: 0,
    seasonality: 'all_year',
    tolled: false,
    adminBoundary: false,
    unavoidable: false,
  };
}

describe('createGeoGraph', () => {
  it('has a fixture with enough graph to check', () => {
    // Anti-vacuous, the same guard purity.test.ts and conformance.test.ts carry: every
    // assertion below passes on an empty graph.
    const graph = loadMiniGraph();
    expect(graph.nodes.length).toBeGreaterThan(10);
    expect(graph.edges.length).toBeGreaterThan(15);
  });

  it('sorts nodes and edges by id, whatever order they arrive in', () => {
    const { nodes, edges } = readMiniGraph();
    const forward = createGeoGraph(nodes, edges);
    const backward = createGeoGraph([...nodes].reverse(), [...edges].reverse());
    expect(forward.ok && backward.ok).toBe(true);
    if (!forward.ok || !backward.ok) return;
    expect(forward.graph.nodes.map((n) => n.id)).toEqual(backward.graph.nodes.map((n) => n.id));
    expect(forward.graph.edges.map((e) => e.id)).toEqual(backward.graph.edges.map((e) => e.id));
    expect([...forward.graph.adjacencyEdges]).toEqual([...backward.graph.adjacencyEdges]);
  });

  it('puts every edge in BOTH endpoints’ adjacency slices', () => {
    const graph = loadMiniGraph();
    for (let e = 0; e < graph.edges.length; e += 1) {
      const from = graph.edgeFrom[e] ?? -1;
      const to = graph.edgeTo[e] ?? -1;
      for (const n of [from, to]) {
        const start = graph.adjacencyOffsets[n] ?? 0;
        const end = graph.adjacencyOffsets[n + 1] ?? 0;
        const slice = [...graph.adjacencyEdges.slice(start, end)];
        expect(
          slice,
          `edge ${String(graph.edges[e]?.id)} missing from node ${String(n)}`,
        ).toContain(e);
      }
    }
  });

  it('keeps edge indices ASCENDING inside each adjacency slice', () => {
    // The equal-cost tie-break in dijkstra.ts retains the lowest edge index. That is only a
    // deterministic rule if the order edges are offered in is itself fixed. ADR 0025 §3.
    const graph = loadMiniGraph();
    for (let n = 0; n < graph.nodes.length; n += 1) {
      const start = graph.adjacencyOffsets[n] ?? 0;
      const end = graph.adjacencyOffsets[n + 1] ?? 0;
      const slice = [...graph.adjacencyEdges.slice(start, end)];
      expect(slice, `node ${String(graph.nodes[n]?.id)}`).toEqual([...slice].sort((a, b) => a - b));
    }
  });

  it('offsets are a prefix sum covering every adjacency entry exactly once', () => {
    const graph = loadMiniGraph();
    expect(graph.adjacencyOffsets.length).toBe(graph.nodes.length + 1);
    expect(graph.adjacencyOffsets[0]).toBe(0);
    expect(graph.adjacencyOffsets[graph.nodes.length]).toBe(2 * graph.edges.length);
    expect(graph.adjacencyEdges.length).toBe(2 * graph.edges.length);
  });

  it('otherEnd returns the far endpoint, and -1 rather than a plausible index when out of range', () => {
    const graph = loadMiniGraph();
    const from = graph.edgeFrom[0] ?? -1;
    const to = graph.edgeTo[0] ?? -1;
    expect(otherEnd(graph, 0, from)).toBe(to);
    expect(otherEnd(graph, 0, to)).toBe(from);
    // Fails closed. Returning 0 here would silently relax into whichever node sorts first.
    expect(otherEnd(graph, graph.edges.length + 99, from)).toBe(-1);
  });

  it('nodeAt and edgeAt return null out of range rather than undefined', () => {
    const graph = loadMiniGraph();
    expect(nodeAt(graph, -1)).toBeNull();
    expect(nodeAt(graph, graph.nodes.length)).toBeNull();
    expect(edgeAt(graph, graph.edges.length)).toBeNull();
    expect(nodeAt(graph, 0)?.id).toBe(graph.nodes[0]?.id);
  });

  describe('reports every reason it cannot index, rather than the first', () => {
    it('duplicate node id', () => {
      const built = createGeoGraph([node('n.a'), node('n.a')], []);
      expect(built.ok).toBe(false);
      if (built.ok) return;
      expect(built.issues.join(' ')).toContain('duplicate node id');
    });

    it('duplicate edge id', () => {
      const built = createGeoGraph(
        [node('n.a'), node('n.b')],
        [edge('e.x', 'n.a', 'n.b'), edge('e.x', 'n.b', 'n.a')],
      );
      expect(built.ok).toBe(false);
      if (built.ok) return;
      expect(built.issues.join(' ')).toContain('duplicate edge id');
    });

    it('an endpoint that does not exist', () => {
      const built = createGeoGraph([node('n.a')], [edge('e.x', 'n.a', 'n.ghost')]);
      expect(built.ok).toBe(false);
      if (built.ok) return;
      expect(built.issues.join(' ')).toContain('names a node that does not exist');
    });

    it('a self-loop, a non-positive distance and an empty mode mask, all at once', () => {
      const built = createGeoGraph(
        [node('n.a'), node('n.b')],
        [
          edge('e.loop', 'n.a', 'n.a'),
          { ...edge('e.zero', 'n.a', 'n.b'), distanceKm: 0 },
          { ...edge('e.nomode', 'n.a', 'n.b'), modes: 0 },
        ],
      );
      expect(built.ok).toBe(false);
      if (built.ok) return;
      const all = built.issues.join(' ');
      expect(all).toContain('self-loop');
      expect(all).toContain('must be a positive integer');
      expect(all).toContain('empty mode mask');
      // The point of collecting rather than short-circuiting: three problems, one round trip.
      expect(built.issues.length).toBeGreaterThanOrEqual(3);
    });

    it('accepts the guard is not simply always failing', () => {
      // Guards the guard: the same shape WITHOUT a defect indexes cleanly.
      const built = createGeoGraph([node('n.a'), node('n.b')], [edge('e.x', 'n.a', 'n.b')]);
      expect(built.ok).toBe(true);
    });
  });
});
