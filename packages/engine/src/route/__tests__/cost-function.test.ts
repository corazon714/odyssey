import { describe, expect, it } from 'vitest';

import { ROUTE_PROFILES, type RouteProfile } from '../../state/route-state.ts';
import { costFor, RELAX_ALL_MASKS } from '../cost-function.ts';
import { edgeIdsOf, loadMiniGraph } from './support/load-geo-mini.ts';

const GRAPH = loadMiniGraph();

function edgeIndex(id: string): number {
  const found = GRAPH.edges.findIndex((e) => String(e.id) === id);
  if (found < 0) throw new Error(`no such edge in geo-mini.json: ${id}`);
  return found;
}

function costOf(profile: RouteProfile, id: string): number | null {
  return costFor(profile)(GRAPH, edgeIndex(id));
}

describe('the five cost functions', () => {
  it('has edges and profiles to check', () => {
    expect(GRAPH.edges.length).toBeGreaterThan(15);
    expect(ROUTE_PROFILES.length).toBe(5);
  });

  it('EVERY unmasked cost is an integer >= 1', () => {
    // >= 1 rather than >= 0, and that is the load-bearing bound. A zero-weight edge is
    // reachable — mulDivRound(2, 1, 5) is 0 — and with one present, a node can be finalised
    // before an equal-cost lower-edge-index relaxation arrives, making the retained
    // predecessor depend on pop order. ADR 0025 Decision 3.
    let checked = 0;
    for (const profile of ROUTE_PROFILES) {
      const cost = costFor(profile);
      for (let i = 0; i < GRAPH.edges.length; i += 1) {
        const value = cost(GRAPH, i);
        if (value === null) continue;
        checked += 1;
        expect(Number.isInteger(value), `${profile} on ${String(GRAPH.edges[i]?.id)}`).toBe(true);
        expect(value, `${profile} on ${String(GRAPH.edges[i]?.id)}`).toBeGreaterThanOrEqual(1);
      }
    }
    expect(checked).toBeGreaterThan(80);
  });

  it('costs the same in either direction', () => {
    // Every term reads the edge and both endpoints symmetrically, so a route costs the same
    // reversed. Pinned because an asymmetric term added later would break path reversal
    // silently, and reversal is how the determinism test is written.
    for (const profile of ROUTE_PROFILES) {
      const cost = costFor(profile);
      for (let i = 0; i < GRAPH.edges.length; i += 1) {
        expect(cost(GRAPH, i)).toBe(cost(GRAPH, i));
      }
    }
  });

  it('returns null for an edge index out of range rather than a number', () => {
    for (const profile of ROUTE_PROFILES) {
      expect(costFor(profile)(GRAPH, GRAPH.edges.length + 5)).toBeNull();
    }
  });

  describe('rung-0 masks — the mechanism that makes profiles topologically different', () => {
    it('only `illicit` will cross an administrative boundary away from a crossing node', () => {
      // e.c1_c2 has adminBoundary and neither endpoint is a border_crossing node.
      for (const profile of ['fastest', 'cheapest', 'safest', 'scenic'] as const) {
        expect(costOf(profile, 'e.c1_c2'), profile).toBeNull();
      }
      expect(costOf('illicit', 'e.c1_c2')).not.toBeNull();
    });

    it('a CONTROLLED crossing is open to everyone — the mask is about control, not about borders', () => {
      // e.c1_cross has adminBoundary AND a border_crossing endpoint. The distinction between
      // this and e.c1_c2 is the whole of CLAUDE.md 11 in the router: the graph records where a
      // boundary is and where a controlled crossing is, and nothing about what happens there.
      for (const profile of ROUTE_PROFILES) {
        expect(costOf(profile, 'e.c1_cross'), profile).not.toBeNull();
      }
    });

    it('`illicit` refuses ticketed modes, so a rail-only or ferry-only edge is unavailable to it', () => {
      expect(costOf('illicit', 'e.m1_end')).toBeNull();
      expect(costOf('illicit', 'e.p1_p2')).toBeNull();
      expect(costOf('fastest', 'e.m1_end')).not.toBeNull();
      expect(costOf('fastest', 'e.p1_p2')).not.toBeNull();
    });

    it('`safest` refuses hard ground and any seasonal doubt; `scenic` seeks the same edge', () => {
      // e.b1_b2 is terrainDifficulty 3 AND summer_only.
      expect(costOf('safest', 'e.b1_b2')).toBeNull();
      expect(costOf('scenic', 'e.b1_b2')).not.toBeNull();
      // e.b2_end is terrainDifficulty 3 but all_year — still refused, on terrain alone.
      expect(costOf('safest', 'e.b2_end')).toBeNull();
    });

    it('a seasonally closed corridor is refused by `fastest` and `cheapest`', () => {
      expect(costOf('fastest', 'e.d1_d2')).toBeNull();
      expect(costOf('cheapest', 'e.d1_d2')).toBeNull();
      // `scenic` and `illicit` do not apply the season mask.
      expect(costOf('scenic', 'e.d1_d2')).not.toBeNull();
      expect(costOf('illicit', 'e.d1_d2')).not.toBeNull();
    });

    it('relaxation opens every masked edge — and the masks were doing something', () => {
      // Guards the guard. If the rung-0 run masked nothing, the assertions above would be
      // vacuous and this count would be zero.
      let maskedAtRungZero = 0;
      for (const profile of ROUTE_PROFILES) {
        const strict = costFor(profile);
        const relaxed = costFor(profile, RELAX_ALL_MASKS);
        for (let i = 0; i < GRAPH.edges.length; i += 1) {
          if (strict(GRAPH, i) === null) {
            maskedAtRungZero += 1;
            expect(relaxed(GRAPH, i), `${profile} on ${String(GRAPH.edges[i]?.id)}`).not.toBeNull();
          }
        }
      }
      expect(maskedAtRungZero).toBeGreaterThan(5);
    });
  });

  it('the tolled motorway is dearer than the untolled road it parallels, per km', () => {
    // One of the four structural breakers that stop `cheapest` collapsing into `fastest`.
    const tolled = costOf('cheapest', 'e.start_a1');
    const untolled = costOf('cheapest', 'e.start_c1');
    expect(tolled).not.toBeNull();
    expect(untolled).not.toBeNull();
    if (tolled === null || untolled === null) return;
    // 120 km tolled vs 100 km untolled: the toll makes the SHORTER edge the dearer one per km.
    expect(tolled / 120).toBeGreaterThan(untolled / 100);
  });

  it('a ferry is charged per crossing, not per kilometre', () => {
    // Non-affine in distance, which is why it breaks the collapse rather than softening it.
    const ferry = costOf('cheapest', 'e.p1_p2');
    expect(ferry).not.toBeNull();
    if (ferry === null) return;
    expect(ferry).toBeGreaterThan(90);
  });

  it('names the edges it masked, so a fixture change that silences a case is visible', () => {
    const masked = new Map<RouteProfile, readonly string[]>();
    for (const profile of ROUTE_PROFILES) {
      const cost = costFor(profile);
      const indices: number[] = [];
      for (let i = 0; i < GRAPH.edges.length; i += 1) if (cost(GRAPH, i) === null) indices.push(i);
      masked.set(profile, edgeIdsOf(GRAPH, indices));
    }
    // `e.b1_b2` is summer_only as well as terrainDifficulty 3, so it is refused by the season
    // mask before `safest`'s terrain mask ever sees it. `e.b2_end` is all_year, which is why
    // only `safest` refuses that one — the two edges separate the two masks.
    expect(masked.get('fastest')).toEqual(['e.b1_b2', 'e.c1_c2', 'e.d1_d2']);
    expect(masked.get('cheapest')).toEqual(['e.b1_b2', 'e.c1_c2', 'e.d1_d2']);
    expect(masked.get('safest')).toEqual(['e.b1_b2', 'e.b2_end', 'e.c1_c2', 'e.d1_d2']);
    expect(masked.get('scenic')).toEqual(['e.c1_c2']);
    expect(masked.get('illicit')).toEqual(['e.m1_end', 'e.p1_p2']);
  });
});
