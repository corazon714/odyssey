import { describe, expect, it } from 'vitest';

import { edgeId, nodeId } from '../../ids/content-ids.ts';
import { pathKey } from '../dijkstra.ts';
import { modeMask, type GeoEdge } from '../geo-edge.ts';
import { createGeoGraph, type GeoGraph } from '../geo-graph.ts';
import { type GeoNode } from '../geo-node.ts';
import { serviceMask } from '../geo-services.ts';
import { MIN_CANDIDATE_ROUTES, selectPaths } from '../select-paths.ts';
import { idx, loadMiniGraph } from './support/load-geo-mini.ts';

const GRAPH = loadMiniGraph();

function chainNode(id: string): GeoNode {
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

function chainEdge(id: string, from: string, to: string): GeoEdge {
  return {
    id: edgeId(id),
    from: nodeId(from),
    to: nodeId(to),
    distanceKm: 100,
    modes: modeMask(['car', 'bus']),
    terrainDifficulty: 0,
    scenic: 1,
    seasonality: 'all_year',
    tolled: false,
    adminBoundary: false,
  };
}

/** a — b — c — d, with no alternative anywhere. The single-corridor case. */
function singleCorridor(): GeoGraph {
  const built = createGeoGraph(
    [chainNode('n.a'), chainNode('n.b'), chainNode('n.c'), chainNode('n.d')],
    [
      chainEdge('e.ab', 'n.a', 'n.b'),
      chainEdge('e.bc', 'n.b', 'n.c'),
      chainEdge('e.cd', 'n.c', 'n.d'),
    ],
  );
  if (!built.ok) throw new Error(built.issues.join('; '));
  return built.graph;
}

describe('selectPaths', () => {
  it('finds three distinct routes on the mini graph at rung 0', () => {
    const result = selectPaths(GRAPH, idx(GRAPH, 'n.start'), idx(GRAPH, 'n.end'));
    expect(result.paths.length).toBeGreaterThanOrEqual(MIN_CANDIDATE_ROUTES);
    expect(result.shortfall).toBeNull();
    // Rung 0 means the profiles alone were enough — no Yen, no threshold move, no mask dropped.
    expect(result.rungReached).toBe(0);
  });

  it('returns genuinely distinct paths, never the same route twice', () => {
    const result = selectPaths(GRAPH, idx(GRAPH, 'n.start'), idx(GRAPH, 'n.end'));
    const keys = result.paths.map((p) => pathKey(p.path));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('REPORTS a profile whose path duplicated an earlier one, rather than dropping it', () => {
    // On this graph `safest` agrees with `fastest` and `illicit` agrees with `scenic`. Silently
    // omitting them would make five profiles yield three routes with no explanation — the
    // caller could not tell "redundant" from "failed". Design pillar 2.
    const result = selectPaths(GRAPH, idx(GRAPH, 'n.start'), idx(GRAPH, 'n.end'));
    const duplicates = result.rejected.filter((r) => r.reasonKey === 'route.rejected.duplicate');
    expect(duplicates.map((r) => r.profile).sort()).toEqual(['illicit', 'safest']);
    for (const entry of duplicates) expect(entry.overlapPercent).toBe(100);
  });

  it('reports a shortfall rather than an error on a single corridor', () => {
    // One valid route is a playable run. A corridor with no alternative is a fact about the
    // world, not a fault in the router.
    const graph = singleCorridor();
    const result = selectPaths(graph, 0, graph.nodes.length - 1);
    expect(result.paths).toHaveLength(1);
    expect(result.shortfall).not.toBeNull();
    expect(result.shortfall?.produced).toBe(1);
    expect(result.shortfall?.requested).toBe(MIN_CANDIDATE_ROUTES);
    expect(result.shortfall?.reasonKey).toBe('route.shortfall.single_corridor');
    // It walked the whole ladder before giving up, and says so.
    expect(result.shortfall?.rungReached).toBe(5);
  });

  it('escalates through the ladder only as far as it has to', () => {
    // Guards the guard on the rung numbers: the mini graph stops at 0, the corridor runs to 5.
    const easy = selectPaths(GRAPH, idx(GRAPH, 'n.start'), idx(GRAPH, 'n.end'));
    const hard = selectPaths(singleCorridor(), 0, 3);
    expect(easy.rungReached).toBeLessThan(hard.rungReached);
  });

  it('returns no path at all between disconnected nodes', () => {
    const built = createGeoGraph(
      [chainNode('n.a'), chainNode('n.b'), chainNode('n.island')],
      [chainEdge('e.ab', 'n.a', 'n.b')],
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const island = built.graph.nodeIndex.get(nodeId('n.island')) ?? -1;
    const result = selectPaths(built.graph, 0, island);
    expect(result.paths).toHaveLength(0);
    expect(result.shortfall?.produced).toBe(0);
  });

  it('honours a lower request without reporting a shortfall', () => {
    const result = selectPaths(GRAPH, idx(GRAPH, 'n.start'), idx(GRAPH, 'n.end'), 1);
    expect(result.paths).toHaveLength(1);
    expect(result.shortfall).toBeNull();
  });

  it('never returns more than the cap', () => {
    const result = selectPaths(GRAPH, idx(GRAPH, 'n.start'), idx(GRAPH, 'n.end'), 99);
    expect(result.paths.length).toBeLessThanOrEqual(5);
  });

  it('is deterministic', () => {
    const a = selectPaths(GRAPH, idx(GRAPH, 'n.start'), idx(GRAPH, 'n.end'));
    const b = selectPaths(GRAPH, idx(GRAPH, 'n.start'), idx(GRAPH, 'n.end'));
    expect(b.paths.map((p) => `${p.profile}:${pathKey(p.path)}`)).toEqual(
      a.paths.map((p) => `${p.profile}:${pathKey(p.path)}`),
    );
    expect(b.rungReached).toBe(a.rungReached);
    expect(b.shortfall).toEqual(a.shortfall);
  });

  it('keeps the profile that produced each path', () => {
    const result = selectPaths(GRAPH, idx(GRAPH, 'n.start'), idx(GRAPH, 'n.end'));
    // Consideration order is ROUTE_PROFILES order, so the first accepted is `fastest`.
    expect(result.paths[0]?.profile).toBe('fastest');
    for (const selected of result.paths) expect(selected.fromBackfill).toBe(false);
  });
});
