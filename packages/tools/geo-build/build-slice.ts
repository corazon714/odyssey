import { edgeId, modeMask, nodeId, type GeoEdge, type GeoNode } from '@odyssey/engine';

import { buildEdges, type EdgeNode } from './build-edges.ts';
import {
  buildCoastIndex,
  classifyTerrain,
  distanceToCoastKm,
  readTerrainRings,
  COASTAL_KM,
  type TerrainRing,
} from './classify-terrain.ts';
import {
  buildNode,
  modesFor,
  populationBandOf,
  scenicOf,
  seasonalityOf,
  settlementTypeOf,
  terrainDifficultyOf,
} from './compute-attributes.ts';
import { analyseConnectivity, degreeHistogram } from './connectivity.ts';
import { haversineKm, type EpsilonLedger } from './geodesy.ts';
import { cellNeighbourhood } from './grid.ts';
import { type BoxedRing, type Region, regionIndexAt } from './read-natural-earth.ts';
import { type Candidate } from './read-geonames.ts';
import { scoreCandidates } from './score-candidates.ts';
import { selectNodes, type SelectionResult } from './select-nodes.ts';
import { writeArtifacts, type Artifacts, type NodeRecordExtras } from './write-artifacts.ts';
import { type Continent } from './continent.ts';

/**
 * The whole derivation, end to end: candidates in, `nodes.gen.json` and `edges.gen.json` out.
 *
 * ## Node ids come from `geonameid`, never from a selection ordinal
 *
 * ADR 0024 Decision 2, and it is the reason scaling this slice to 1,200 nodes later is a data
 * commit rather than a re-author: a score-weight tweak adds and removes nodes but never renames
 * one, so every hand-authored overlay row still points at the same real place.
 *
 * ## `isolation` is not scored, and that is deliberate
 *
 * ADR 0024 lists six score terms. Five are computed here. `isolation` — a bonus for candidates
 * far from anything already accepted — was a nudge toward spreading the node set out, and the
 * Poisson disk in `select-nodes.ts` already guarantees exactly that, at a radius that scales
 * with local density. Scoring it as well would double-count the same property while forcing the
 * greedy pass into a lazy-max-heap because the term mutates on every acceptance. Recorded here
 * rather than silently dropped.
 */

export type SliceInput = {
  readonly candidates: readonly Candidate[];
  readonly regions: readonly Region[];
  readonly land: readonly BoxedRing[];
  readonly terrainGeoJson: string;
  readonly railLines: readonly BoxedRing[];
  readonly quota: Readonly<Record<Continent, number>>;
  readonly ledger: EpsilonLedger;
};

export type SliceResult = {
  readonly nodes: readonly GeoNode[];
  readonly edges: readonly GeoEdge[];
  readonly artifacts: Artifacts;
  readonly selection: SelectionResult;
  readonly connectivity: ReturnType<typeof analyseConnectivity>;
  readonly degrees: readonly number[];
  readonly terrainTally: ReadonlyMap<string, number>;
  readonly rejectedForWater: number;
  readonly prunedTwoHop: number;
  readonly boundaryEdges: number;
};

/** Score bonus for a coastal place. A port town is a different proposition to an inland one. */
const COASTAL_SCORE = 10;

export function buildSlice(input: SliceInput): SliceResult {
  const terrainRings: readonly TerrainRing[] = readTerrainRings(input.terrainGeoJson);
  const coastIndex = buildCoastIndex(input.land);

  // ── score ────────────────────────────────────────────────────────────────────────────────
  const partial = scoreCandidates(input.candidates);
  const coastKmOf = new Map<number, number>();
  const scoreOf = new Map<number, number>();
  for (const entry of partial) {
    const km = distanceToCoastKm(coastIndex, entry.candidate);
    coastKmOf.set(entry.candidate.geonameid, km);
    scoreOf.set(entry.candidate.geonameid, entry.total + (km <= COASTAL_KM ? COASTAL_SCORE : 0));
  }

  const selection = selectNodes({
    candidates: input.candidates,
    scoreOf,
    quota: input.quota,
    ledger: input.ledger,
  });

  // ── node attributes ──────────────────────────────────────────────────────────────────────
  const byCell = new Map<number, Candidate[]>();
  for (const candidate of input.candidates) {
    const bucket = byCell.get(candidate.cell);
    if (bucket === undefined) byCell.set(candidate.cell, [candidate]);
    else bucket.push(candidate);
  }

  const localMedianDem = (candidate: Candidate): number => {
    const near: Candidate[] = [];
    for (const cell of cellNeighbourhood(candidate.cell)) {
      for (const other of byCell.get(cell) ?? []) {
        if (other.geonameid !== candidate.geonameid) near.push(other);
      }
    }
    const dems = near
      .sort((a, b) => haversineKm(candidate, a) - haversineKm(candidate, b))
      .slice(0, 8)
      .map((n) => n.dem)
      .sort((a, b) => a - b);
    return dems[Math.floor(dems.length / 2)] ?? candidate.dem;
  };

  const terrainTally = new Map<string, number>();
  const nodes: GeoNode[] = [];
  const extras = new Map<string, NodeRecordExtras>();
  const sourceOf = new Map<string, Candidate>();

  for (const candidate of selection.accepted) {
    const band = populationBandOf(candidate.population);
    const type = settlementTypeOf(band);
    const terrain = classifyTerrain(
      {
        point: candidate,
        dem: candidate.dem,
        localMedianDem: localMedianDem(candidate),
        isUrban: band === 'metro' || band === 'large',
        coastKm: coastKmOf.get(candidate.geonameid) ?? Number.POSITIVE_INFINITY,
      },
      terrainRings,
    );
    terrainTally.set(terrain, (terrainTally.get(terrain) ?? 0) + 1);

    const id = nodeId(`n.city.g${String(candidate.geonameid)}`);
    nodes.push(
      buildNode({
        id,
        type,
        terrain,
        elevationM: candidate.dem,
        population: band,
        closedMonths: [],
      }),
    );
    // ADR 0028: the Latin-script local form where there is one, GeoNames `asciiname` otherwise.
    // `name` is the ONE user-visible literal content data may carry.
    extras.set(String(id), { name: candidate.asciiname, lat: candidate.lat, lng: candidate.lng });
    sourceOf.set(String(id), candidate);
  }

  // ── edges ────────────────────────────────────────────────────────────────────────────────
  const edgeNodes: EdgeNode[] = nodes.map((node) => {
    const source = sourceOf.get(String(node.id));
    return { lat: source?.lat ?? 0, lng: source?.lng ?? 0, key: source?.geonameid ?? 0 };
  });

  const built = buildEdges({ nodes: edgeNodes, land: input.land, ledger: input.ledger });

  const railNear = (point: { lat: number; lng: number }): boolean => {
    for (const line of input.railLines) {
      if (
        point.lat < line.minLat - 0.25 ||
        point.lat > line.maxLat + 0.25 ||
        point.lng < line.minLng - 0.25 ||
        point.lng > line.maxLng + 0.25
      ) {
        continue;
      }
      for (const position of line.ring) {
        const dLng = (position[0] ?? 0) - point.lng;
        const dLat = (position[1] ?? 0) - point.lat;
        if (dLng * dLng + dLat * dLat < 0.0625) return true;
      }
    }
    return false;
  };

  const railAt = edgeNodes.map(railNear);
  const regionAt = edgeNodes.map((point) => regionIndexAt(input.regions, point));

  let boundaryEdges = 0;
  const edges: GeoEdge[] = built.edges.map((candidate) => {
    const a = nodes[candidate.a];
    const b = nodes[candidate.b];
    const terrainA = a?.terrain ?? 'plain';
    const terrainB = b?.terrain ?? 'plain';
    // GEOMETRIC: the two ends sit in different admin polygons. Says nothing about what is there.
    const adminBoundary =
      regionAt[candidate.a] !== null &&
      regionAt[candidate.b] !== null &&
      regionAt[candidate.a] !== regionAt[candidate.b];
    if (adminBoundary) boundaryEdges += 1;
    return {
      id: edgeId(
        `e.g${String(edgeNodes[candidate.a]?.key ?? 0)}__g${String(edgeNodes[candidate.b]?.key ?? 0)}`,
      ),
      from: a?.id ?? nodeId('n.missing'),
      to: b?.id ?? nodeId('n.missing'),
      distanceKm: candidate.distanceKm,
      modes: modeMask(modesFor((railAt[candidate.a] ?? false) && (railAt[candidate.b] ?? false))),
      terrainDifficulty: terrainDifficultyOf(terrainA, terrainB),
      scenic: scenicOf(terrainA, terrainB),
      seasonality: seasonalityOf(Math.max(a?.elevationM ?? 0, b?.elevationM ?? 0)),
      tolled: false,
      adminBoundary,
    };
  });

  const connectivity = analyseConnectivity(
    nodes.length,
    built.edges.map((e) => ({ a: e.a, b: e.b })),
  );

  return {
    nodes,
    edges,
    artifacts: writeArtifacts(
      nodes,
      (node) => extras.get(String(node.id)) ?? { name: null, lat: 0, lng: 0 },
      edges,
    ),
    selection,
    connectivity,
    degrees: degreeHistogram(connectivity.degreeOf),
    terrainTally,
    rejectedForWater: built.rejectedForWater,
    prunedTwoHop: built.prunedTwoHop,
    boundaryEdges,
  };
}
