import { edgeId, modeMask, nodeId, type GeoEdge, type GeoNode } from '@odyssey/engine';

import { applyOverlay, type Overlay } from './apply-overlay.ts';
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
import { placeBorders, type BorderResult } from './place-borders.ts';
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
  readonly overlay: Overlay;
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
  readonly borders: BorderResult;
  readonly overlayIssues: readonly string[];
  readonly overlayAdded: number;
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

  // The overlay is applied to a FRESHLY generated graph every build — declared intent, never a
  // diff against a previous output, so retuning the generator cannot rot it.
  const overlaid = applyOverlay(
    input.overlay,
    nodes.map((n) => String(n.id)),
    edgeNodes,
    built.edges,
  );
  const ferryPairs = new Set(
    overlaid.added.filter((e) => e.kind === 'ferry').map((e) => `${String(e.a)}:${String(e.b)}`),
  );

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

  const modesOfEdge = overlaid.edges.map((candidate) =>
    ferryPairs.has(`${String(candidate.a)}:${String(candidate.b)}`)
      ? modeMask(['ferry'])
      : modeMask(modesFor((railAt[candidate.a] ?? false) && (railAt[candidate.b] ?? false))),
  );

  // ── controlled crossings, then the surgery ───────────────────────────────────────────────
  //
  // Without this step four of five profiles cannot use a boundary edge at all, and the slice
  // measured 43 components once those are removed. `place-borders.ts` says why at length.
  const borders = placeBorders({
    points: edgeNodes,
    ids: nodes.map((node) => String(node.id)),
    populations: nodes.map((node) => node.population),
    edges: overlaid.edges,
    regionAt,
    regions: input.regions,
  });

  // Crossings are APPENDED, so every settlement index computed above stays valid.
  const allNodes: GeoNode[] = [...nodes];
  const tokenOf: string[] = edgeNodes.map((node) => `g${String(node.key)}`);
  const splitOf = new Map<number, number>();

  for (const crossing of borders.crossings) {
    const parent = overlaid.edges[crossing.parentEdge];
    if (parent === undefined) continue;
    const a = nodes[parent.a];
    const b = nodes[parent.b];
    if (a === undefined || b === undefined) continue;

    // Physical facts interpolated from the two ends. A crossing has no population, which is why
    // `servicesFor` gives it fuel and nothing else (ADR 0024 Decision 4).
    const nearer = crossing.distanceFromA * 2 <= parent.distanceKm ? a : b;
    const span = parent.distanceKm === 0 ? 0 : crossing.distanceFromA / parent.distanceKm;
    splitOf.set(crossing.parentEdge, allNodes.length);
    tokenOf.push(`b${crossing.id.slice(crossing.id.lastIndexOf('.') + 2)}`);
    allNodes.push(
      buildNode({
        id: nodeId(crossing.id),
        type: 'border_crossing',
        terrain: nearer.terrain,
        elevationM: Math.round(a.elevationM + (b.elevationM - a.elevationM) * span),
        population: 'none',
        closedMonths: [],
      }),
    );
    // `name: null` — GEO_NAMED_BORDER. The UI composes "a border crossing, 40 km past X".
    extras.set(crossing.id, { name: null, lat: crossing.point.lat, lng: crossing.point.lng });
  }

  let boundaryEdges = 0;
  const linked: { readonly a: number; readonly b: number; readonly distanceKm: number }[] = [];
  const edges: GeoEdge[] = [];

  const emit = (
    a: number,
    b: number,
    distanceKm: number,
    modes: number,
    crosses: boolean,
  ): void => {
    const from = allNodes[a];
    const to = allNodes[b];
    if (from === undefined || to === undefined) return;
    if (crosses) boundaryEdges += 1;
    linked.push({ a, b, distanceKm });
    edges.push({
      id: edgeId(`e.${tokenOf[a] ?? '?'}__${tokenOf[b] ?? '?'}`),
      from: from.id,
      to: to.id,
      distanceKm,
      modes,
      terrainDifficulty: terrainDifficultyOf(from.terrain, to.terrain),
      scenic: scenicOf(from.terrain, to.terrain),
      seasonality: seasonalityOf(Math.max(from.elevationM, to.elevationM)),
      tolled: false,
      adminBoundary: crosses,
    });
  };

  for (let i = 0; i < overlaid.edges.length; i += 1) {
    const candidate = overlaid.edges[i];
    if (candidate === undefined) continue;
    // GEOMETRIC: the two ends sit in different admin polygons. Says nothing about what is there.
    const adminBoundary =
      regionAt[candidate.a] !== null &&
      regionAt[candidate.b] !== null &&
      regionAt[candidate.a] !== regionAt[candidate.b];
    const modes = modesOfEdge[i] ?? 0;
    const via = splitOf.get(i);

    if (via === undefined) {
      emit(candidate.a, candidate.b, candidate.distanceKm, modes, adminBoundary);
      continue;
    }
    // BOTH halves keep `adminBoundary`. Neither one crosses the line on its own any more, but
    // the flag is what records that a boundary is crossed here at all — and if a later filter
    // ever drops the crossing node, `uncontrolledBoundary` must go back to being true rather
    // than silently letting four profiles through a border for free. Fail-safe, not precise.
    const crossing = borders.crossings.find((c) => c.parentEdge === i);
    const near = crossing?.distanceFromA ?? Math.max(1, Math.floor(candidate.distanceKm / 2));
    emit(candidate.a, via, near, modes, true);
    emit(via, candidate.b, candidate.distanceKm - near, modes, true);
  }

  const connectivity = analyseConnectivity(allNodes.length, linked);

  return {
    nodes: allNodes,
    edges,
    artifacts: writeArtifacts(
      allNodes,
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
    borders,
    overlayIssues: overlaid.issues,
    overlayAdded: overlaid.added.length,
  };
}
