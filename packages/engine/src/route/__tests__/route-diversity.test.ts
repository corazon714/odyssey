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
    //
    // The accepted route is deliberately LONGER than the candidate (500 km against 380), so the
    // reverse check reads 60% and the boundary being probed is the forward one. Swap the lengths
    // and the reverse check decides instead, which would make this a test of something else.
    const accepted = path([edgeIdx('e.m1_end'), edgeIdx('e.start_d1')]); // 300 + 200 = 500 km
    const candidate = path([edgeIdx('e.start_m1'), edgeIdx('e.m1_end')]); // 300 of 380 = 78%
    expect(overlapPercent(GRAPH, accepted, new Set(candidate.edges))).toBe(60);

    const at78 = acceptByDiversity(GRAPH, [accepted, candidate], identity, 78, 5);
    expect(at78.accepted).toHaveLength(2);
    const at77 = acceptByDiversity(GRAPH, [accepted, candidate], identity, 77, 5);
    expect(at77.accepted).toHaveLength(1);
    expect(at77.rejected[0]?.overlapPercent).toBe(78);
  });

  it('measures FORWARD against the UNION, catching what pairwise comparison misses', () => {
    // The candidate shares a different ~40% with each of two accepted routes and is therefore
    // 78% covered overall. Against either one alone it would pass at a 70% threshold.
    //
    // Both accepted routes carry an edge the candidate does not, so neither is swallowed and the
    // reverse check stays silent: the union is the only thing that can reject here.
    const a = edgeIdx('e.start_a1'); // 120
    const b = edgeIdx('e.a2_end'); // 130
    const filler = edgeIdx('e.b1_r1'); // 70
    const first = path([a, edgeIdx('e.start_b1')]); // 210
    const second = path([b, edgeIdx('e.b1_b2')]); // 240
    const candidate = path([a, b, filler]); // 250 of 320 shared with the union = 78%

    expect(overlapPercent(GRAPH, candidate, new Set(first.edges))).toBeLessThan(70);
    expect(overlapPercent(GRAPH, candidate, new Set(second.edges))).toBeLessThan(70);
    const candidateEdges = new Set(candidate.edges);
    expect(overlapPercent(GRAPH, first, candidateEdges)).toBeLessThan(70);
    expect(overlapPercent(GRAPH, second, candidateEdges)).toBeLessThan(70);

    const verdict = acceptByDiversity(GRAPH, [first, second, candidate], identity, 70, 5);
    expect(verdict.accepted).toHaveLength(2);
    expect(verdict.rejected[0]?.overlapPercent).toBe(78);
  });

  it('measures REVERSE too — a later candidate may not swallow an earlier route', () => {
    // THE REGRESSION CASE. Before the fix the filter only ever asked "how much of the CANDIDATE
    // is already covered", normalised by the candidate's own length, so a long candidate could
    // engulf a short accepted route and read low doing it. That is the Chongjin-Jeju City shape
    // in miniature: `safest` was 80% inside a backfill accepted after it, and the only number
    // ever computed between the two was the backfill's 53% against `safest`.
    const shared = [edgeIdx('e.m1_end'), edgeIdx('e.d1_d2')]; // 300 + 260 = 560
    const accepted = path([...shared, edgeIdx('e.start_b1')]); // 650
    const candidate = path([
      ...shared,
      edgeIdx('e.d2_end'), // 240
      edgeIdx('e.p1_p2'), // 200
      edgeIdx('e.a1_a2'), // 140
    ]); // 1140

    // Forward it looks like a comfortable pass; only the reverse direction sees the problem.
    expect(overlapPercent(GRAPH, candidate, new Set(accepted.edges))).toBe(49);
    expect(overlapPercent(GRAPH, accepted, new Set(candidate.edges))).toBe(86);

    const verdict = acceptByDiversity(GRAPH, [accepted, candidate], identity, 70, 5);
    expect(verdict.accepted).toHaveLength(1);
    // The number REPORTED is the worst seen in either direction, not whichever was tested first.
    expect(verdict.rejected[0]?.overlapPercent).toBe(86);
  });

  it('keeps the reverse check PAIRWISE, never a second union', () => {
    // A union in reverse would be a strictly stronger claim than the one `verifyPair` measures,
    // and would reject this candidate: `first` is 58% inside the candidate and the remaining 42%
    // sits inside `second`, so "covered by everything else together" reads 100%. Nothing asks for
    // that guarantee, and buying it costs rung escalation into Yen backfill on every pair.
    const x = edgeIdx('e.start_c1'); // 100
    const y = edgeIdx('e.c1_c2'); // 70
    const first = path([x, y]); // 170
    const second = path([y, edgeIdx('e.d1_d2'), edgeIdx('e.d2_end')]); // 570
    const candidate = path([x, edgeIdx('e.p1_p2'), edgeIdx('e.a1_a2')]); // 440

    const verdict = acceptByDiversity(GRAPH, [first, second, candidate], identity, 70, 5);
    expect(verdict.accepted).toHaveLength(3);

    // Pairwise in reverse: 58% — inside budget. As a union with `second`'s edges: 100%.
    expect(overlapPercent(GRAPH, first, new Set(candidate.edges))).toBe(58);
    expect(overlapPercent(GRAPH, first, new Set([...candidate.edges, ...second.edges]))).toBe(100);
  });

  it('POST-CONDITION: every accepted pair is within budget in BOTH directions', () => {
    // The acceptance criterion for the fix, stated as the property rather than as a list of
    // pairs: `max(overlap(a,b), overlap(b,a)) <= threshold` for every accepted pair. This is
    // exactly the quantity `verifyPair` maximises over ordered pairs, so a filter that holds this
    // and a report that measures it can no longer disagree.
    const pool = [
      path([edgeIdx('e.start_a1'), edgeIdx('e.a1_a2'), edgeIdx('e.a2_end')]),
      path([edgeIdx('e.start_b1'), edgeIdx('e.b1_b2'), edgeIdx('e.b2_end')]),
      path([edgeIdx('e.start_c1'), edgeIdx('e.c1_c2'), edgeIdx('e.c2_end')]),
      path([
        edgeIdx('e.start_c1'),
        edgeIdx('e.c1_cross'),
        edgeIdx('e.cross_c2'),
        edgeIdx('e.c2_end'),
      ]),
      path([edgeIdx('e.start_p1'), edgeIdx('e.p1_p2'), edgeIdx('e.p2_end')]),
      path([edgeIdx('e.start_m1'), edgeIdx('e.m1_end')]),
      path([edgeIdx('e.start_d1'), edgeIdx('e.d1_d2'), edgeIdx('e.d2_end')]),
      path([edgeIdx('e.start_a1'), edgeIdx('e.a1_a2')]),
      path([edgeIdx('e.m1_end')]),
      path([edgeIdx('e.start_b1'), edgeIdx('e.b1_r1'), edgeIdx('e.r1_c1'), edgeIdx('e.c1_c2')]),
    ];

    for (const threshold of [0, 25, 40, 55, 70, 80, 90, 99]) {
      for (let limit = 1; limit <= pool.length; limit += 1) {
        // Every rotation of the pool, because a greedy filter's guarantee must not depend on the
        // order it happens to consume — and the bug being fixed was exactly an order artefact.
        for (let rotation = 0; rotation < pool.length; rotation += 1) {
          const ordered = [...pool.slice(rotation), ...pool.slice(0, rotation)];
          const { accepted } = acceptByDiversity(GRAPH, ordered, identity, threshold, limit);
          expect(accepted.length).toBeLessThanOrEqual(limit);
          for (const a of accepted) {
            for (const b of accepted) {
              if (a === b) continue;
              const worst = Math.max(
                overlapPercent(GRAPH, a, new Set(b.edges)),
                overlapPercent(GRAPH, b, new Set(a.edges)),
              );
              expect(worst).toBeLessThanOrEqual(threshold);
            }
          }
        }
      }
    }
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
