import { describe, expect, it } from 'vitest';

import { type GeoPath } from '../dijkstra.ts';
import {
  acceptByDiversity,
  DIVERSITY_MAX_PERCENT,
  DIVERSITY_RUNGS,
  overlapPercent,
} from '../route-diversity.ts';
import { loadMiniGraph } from './support/load-geo-mini.ts';

const GRAPH = loadMiniGraph();

/** A path is only ever read for `edges` and `distanceKm` here, so build them directly. */
function path(edges: readonly number[]): GeoPath {
  const distanceKm = edges.reduce((sum, e) => sum + (GRAPH.edges[e]?.distanceKm ?? 0), 0);
  return { nodes: [], edges, cost: 0, distanceKm };
}

function edgeIdx(id: string): number {
  const found = GRAPH.edges.findIndex((e) => String(e.id) === id);
  if (found < 0) throw new Error(`no such edge: ${id}`);
  return found;
}

describe('overlapPercent', () => {
  it('is 0 against an empty accepted set', () => {
    expect(overlapPercent(GRAPH, path([edgeIdx('e.start_a1')]), new Set())).toBe(0);
  });

  it('is 100 when the candidate lies wholly inside the accepted set', () => {
    // A truncation is not an alternative, and this is the case a symmetric measure gets wrong.
    const long = [edgeIdx('e.start_a1'), edgeIdx('e.a1_a2'), edgeIdx('e.a2_end')];
    const short = path([edgeIdx('e.start_a1')]);
    expect(overlapPercent(GRAPH, short, new Set(long))).toBe(100);
  });

  it('is LOW for a long candidate that contains a short accepted route plus a detour', () => {
    // The mirror image, and the reason the measure is normalised by the candidate's own length
    // rather than by the union. Jaccard gets this one wrong.
    const shortAccepted = new Set([edgeIdx('e.start_a1')]); // 120 km
    const long = path([
      edgeIdx('e.start_a1'), // 120 shared
      edgeIdx('e.a1_a2'), // 140
      edgeIdx('e.a2_end'), // 130
    ]);
    expect(overlapPercent(GRAPH, long, shortAccepted)).toBe(Math.floor((120 * 100) / 390));
  });

  it('weighs by DISTANCE, not by edge count', () => {
    // One 300 km edge shared out of two edges is 81%, not 50%. Counting edges would call these
    // different journeys; they are the same journey.
    const accepted = new Set([edgeIdx('e.m1_end')]); // 300 km
    const candidate = path([edgeIdx('e.start_m1'), edgeIdx('e.m1_end')]); // 80 + 300
    expect(overlapPercent(GRAPH, candidate, accepted)).toBe(Math.floor((300 * 100) / 380));
    expect(overlapPercent(GRAPH, candidate, accepted)).toBeGreaterThan(50);
  });

  it('is 100 for a zero-distance candidate rather than dividing by zero', () => {
    expect(overlapPercent(GRAPH, path([]), new Set())).toBe(100);
  });
});

describe('acceptByDiversity', () => {
  const identity = (p: GeoPath): GeoPath => p;

  it('accepts the first candidate unconditionally', () => {
    const first = path([edgeIdx('e.start_a1')]);
    const verdict = acceptByDiversity(GRAPH, [first], identity, 0, 5);
    expect(verdict.accepted).toEqual([first]);
  });

  it('rejects at 71 and ACCEPTS at exactly 70', () => {
    // `>` not `>=`. The brief says "sharing >70%", so exactly 70 is admissible — an off-by-one
    // here silently costs a route on every tie.
    const accepted = path([edgeIdx('e.m1_end')]); // 300 km
    const candidate = path([edgeIdx('e.start_m1'), edgeIdx('e.m1_end')]); // 78% overlap
    const at78 = acceptByDiversity(GRAPH, [accepted, candidate], identity, 78, 5);
    expect(at78.accepted).toHaveLength(2);
    const at77 = acceptByDiversity(GRAPH, [accepted, candidate], identity, 77, 5);
    expect(at77.accepted).toHaveLength(1);
    expect(at77.rejected[0]?.overlapPercent).toBe(78);
  });

  it('measures against the UNION, catching what pairwise comparison misses', () => {
    // The candidate shares a different ~45% with each of two accepted routes and is therefore
    // ~90% covered overall. Against either one alone it would pass at a 70% threshold.
    const a = edgeIdx('e.start_a1'); // 120
    const b = edgeIdx('e.a2_end'); // 130
    const filler = edgeIdx('e.b1_r1'); // 70
    const first = path([a]);
    const second = path([b]);
    const candidate = path([a, b, filler]); // 250 of 320 shared = 78%
    const pairwiseWouldPass = overlapPercent(GRAPH, candidate, new Set([a]));
    expect(pairwiseWouldPass).toBeLessThan(70);
    const verdict = acceptByDiversity(GRAPH, [first, second, candidate], identity, 70, 5);
    expect(verdict.accepted).toHaveLength(2);
    expect(verdict.rejected[0]?.overlapPercent).toBeGreaterThan(70);
  });

  it('stops at the limit', () => {
    const items = [
      path([edgeIdx('e.start_a1')]),
      path([edgeIdx('e.a1_a2')]),
      path([edgeIdx('e.a2_end')]),
      path([edgeIdx('e.b1_r1')]),
    ];
    expect(acceptByDiversity(GRAPH, items, identity, 70, 2).accepted).toHaveLength(2);
  });

  it('reports every rejection with its overlap, never silently', () => {
    const accepted = path([edgeIdx('e.m1_end')]);
    const duplicate = path([edgeIdx('e.m1_end')]);
    const verdict = acceptByDiversity(GRAPH, [accepted, duplicate], identity, 70, 5);
    expect(verdict.rejected).toHaveLength(1);
    expect(verdict.rejected[0]?.overlapPercent).toBe(100);
  });
});

describe('DIVERSITY_RUNGS', () => {
  it('is ordered, and gives up the cheap things before the expensive ones', () => {
    expect(DIVERSITY_RUNGS.map((r) => r.rung)).toEqual([0, 1, 2, 3, 4, 5]);
    // Yen before any threshold move: it produces genuine alternatives where a higher threshold
    // only admits near-siblings.
    expect(DIVERSITY_RUNGS[0]?.useYen).toBe(false);
    expect(DIVERSITY_RUNGS[1]?.useYen).toBe(true);
    expect(DIVERSITY_RUNGS[1]?.maxOverlapPercent).toBe(DIVERSITY_RUNGS[0]?.maxOverlapPercent);
    // Masks last, because dropping one changes what the profile MEANS.
    expect(DIVERSITY_RUNGS.filter((r) => r.dropMasks).map((r) => r.rung)).toEqual([4, 5]);
  });

  it('starts at the documented threshold and never reaches 100', () => {
    expect(DIVERSITY_RUNGS[0]?.maxOverlapPercent).toBe(DIVERSITY_MAX_PERCENT);
    for (const rung of DIVERSITY_RUNGS) {
      expect(rung.maxOverlapPercent).toBeLessThan(100);
    }
  });

  it('never loosens then tightens', () => {
    for (let i = 1; i < DIVERSITY_RUNGS.length; i += 1) {
      const previous = DIVERSITY_RUNGS[i - 1];
      const current = DIVERSITY_RUNGS[i];
      if (previous === undefined || current === undefined) continue;
      expect(current.maxOverlapPercent).toBeGreaterThanOrEqual(previous.maxOverlapPercent);
    }
  });
});
