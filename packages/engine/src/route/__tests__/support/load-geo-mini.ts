import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { edgeId, nodeId } from '../../../ids/content-ids.ts';
import { type LocationType } from '../../../content/location-type.ts';
import { type TransportMode } from '../../../state/transport-state.ts';
import { modeMask, type GeoEdge, type Seasonality } from '../../geo-edge.ts';
import { createGeoGraph, type GeoGraph } from '../../geo-graph.ts';
import { type GeoNode, type PopulationBand } from '../../geo-node.ts';
import { serviceMask, type ServiceKind } from '../../geo-services.ts';
import { type TerrainKind } from '../../geo-terrain.ts';

/**
 * Load the mini graph for unit tests.
 *
 * Test-only, and it lives here rather than in `src/route/` because reading a file is not
 * something the engine is allowed to do — `tsconfig.src.json` sets `types: []` so `node:fs`
 * does not even typecheck outside tests, and `ci.yml` executes the barrel under bare Node.
 *
 * `modes` and `services` arrive as string arrays and are converted here, which means every
 * test that touches the fixture also exercises the mask helpers on the way in.
 */

type RawNode = {
  readonly id: string;
  readonly type: LocationType;
  readonly terrain: TerrainKind;
  readonly elevationM: number;
  readonly population: PopulationBand;
  readonly services: readonly ServiceKind[];
  readonly closedMonths: readonly number[];
};

type RawEdge = {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly distanceKm: number;
  readonly modes: readonly TransportMode[];
  readonly terrainDifficulty: number;
  readonly scenic: number;
  readonly seasonality: Seasonality;
  readonly tolled: boolean;
  readonly adminBoundary: boolean;
};

type RawGraph = { readonly nodes: readonly RawNode[]; readonly edges: readonly RawEdge[] };

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '__fixtures__',
  'geo-mini.json',
);

export function readMiniGraph(): { readonly nodes: GeoNode[]; readonly edges: GeoEdge[] } {
  const raw = JSON.parse(readFileSync(FIXTURE, 'utf8')) as RawGraph;

  const nodes = raw.nodes.map((n): GeoNode => ({
    id: nodeId(n.id),
    type: n.type,
    terrain: n.terrain,
    elevationM: n.elevationM,
    population: n.population,
    services: serviceMask(n.services),
    closedMonths: n.closedMonths,
  }));

  const edges = raw.edges.map((e): GeoEdge => ({
    id: edgeId(e.id),
    from: nodeId(e.from),
    to: nodeId(e.to),
    distanceKm: e.distanceKm,
    modes: modeMask(e.modes),
    terrainDifficulty: e.terrainDifficulty,
    scenic: e.scenic,
    seasonality: e.seasonality,
    tolled: e.tolled,
    adminBoundary: e.adminBoundary,
  }));

  return { nodes, edges };
}

/** The indexed graph. Throws in tests rather than returning a result — a broken fixture is a bug. */
export function loadMiniGraph(): GeoGraph {
  const { nodes, edges } = readMiniGraph();
  const built = createGeoGraph(nodes, edges);
  if (!built.ok) throw new Error(`geo-mini.json does not index: ${built.issues.join('; ')}`);
  return built.graph;
}

/** Node index by id, for readable test assertions. */
export function idx(graph: GeoGraph, id: string): number {
  const found = graph.nodeIndex.get(nodeId(id));
  if (found === undefined) throw new Error(`no such node in geo-mini.json: ${id}`);
  return found;
}

/** Edge ids of a path, in order — what assertions actually want to compare. */
export function edgeIdsOf(graph: GeoGraph, edges: readonly number[]): readonly string[] {
  return edges.map((i) => String(graph.edges[i]?.id ?? '<out of range>'));
}

/** Node ids of a path, in order. */
export function nodeIdsOf(graph: GeoGraph, nodes: readonly number[]): readonly string[] {
  return nodes.map((i) => String(graph.nodes[i]?.id ?? '<out of range>'));
}
