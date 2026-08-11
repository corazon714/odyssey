import { type CandidateEdge } from './build-edges.ts';
import { distanceKm, type LatLng } from './geodesy.ts';

/**
 * Apply the hand-authored overlay to a freshly generated candidate graph.
 *
 * **Declared intent, never a patch.** Every entry names node ids and is re-applied on every
 * build against whatever the generator just produced. A patch file rots the moment the
 * generator is retuned; a declaration cannot, because a row that no longer applies is a loud
 * failure rather than a silent no-op.
 *
 * Four failure modes, all reported:
 *
 * - an endpoint that does not exist in the node set (typo, or a node the selector dropped);
 * - a forced corridor the generator ALREADY produced — harmless but stale, and worth removing
 *   so the file stays a record of what the generator gets wrong;
 * - a forbidden corridor the generator never produced, which is the same staleness in reverse
 *   and is the one that silently accumulates;
 * - a ferry between two nodes already joined by road, which usually means the crossing is
 *   redundant or the endpoints are wrong.
 */

export type OverlayLink = {
  readonly from: string;
  readonly to: string;
  readonly reason: string;
  readonly seasonality?: string;
};

export type Overlay = {
  readonly forcedCorridors?: readonly OverlayLink[];
  readonly ferries?: readonly OverlayLink[];
  readonly forbiddenCorridors?: readonly OverlayLink[];
  readonly tolled?: readonly { readonly edge: string }[];
  readonly criticalEdges?: readonly { readonly edge: string; readonly reason: string }[];
};

/** An edge the overlay added, so the caller can give it ferry modes rather than road ones. */
export type OverlayEdge = CandidateEdge & {
  readonly kind: 'forced' | 'ferry';
  readonly seasonality: string;
};

export type OverlayResult = {
  readonly edges: readonly CandidateEdge[];
  readonly added: readonly OverlayEdge[];
  readonly removed: number;
  readonly issues: readonly string[];
};

export function applyOverlay(
  overlay: Overlay,
  nodeIds: readonly string[],
  points: readonly LatLng[],
  edges: readonly CandidateEdge[],
): OverlayResult {
  const indexOf = new Map(nodeIds.map((id, i) => [id, i]));
  const issues: string[] = [];
  const present = new Set(edges.map((e) => `${String(e.a)}:${String(e.b)}`));
  const key = (a: number, b: number): string =>
    a < b ? `${String(a)}:${String(b)}` : `${String(b)}:${String(a)}`;

  const resolve = (link: OverlayLink, what: string): readonly [number, number] | null => {
    const a = indexOf.get(link.from);
    const b = indexOf.get(link.to);
    if (a === undefined || b === undefined) {
      issues.push(
        `${what}: ${a === undefined ? link.from : link.to} is not in the node set — ` +
          `"${link.reason}"`,
      );
      return null;
    }
    if (a === b) {
      issues.push(`${what}: both ends are the same node — "${link.reason}"`);
      return null;
    }
    return [Math.min(a, b), Math.max(a, b)];
  };

  const added: OverlayEdge[] = [];

  for (const link of overlay.forcedCorridors ?? []) {
    const pair = resolve(link, 'forced corridor');
    if (pair === null) continue;
    if (present.has(key(pair[0], pair[1]))) {
      issues.push(`forced corridor is STALE — the generator already produces it: "${link.reason}"`);
      continue;
    }
    const from = points[pair[0]];
    const to = points[pair[1]];
    if (from === undefined || to === undefined) continue;
    added.push({
      a: pair[0],
      b: pair[1],
      distanceKm: distanceKm(from, to),
      kind: 'forced',
      seasonality: link.seasonality ?? 'all_year',
    });
    present.add(key(pair[0], pair[1]));
  }

  for (const link of overlay.ferries ?? []) {
    const pair = resolve(link, 'ferry');
    if (pair === null) continue;
    if (present.has(key(pair[0], pair[1]))) {
      issues.push(`ferry duplicates a road corridor: "${link.reason}"`);
      continue;
    }
    const from = points[pair[0]];
    const to = points[pair[1]];
    if (from === undefined || to === undefined) continue;
    added.push({
      a: pair[0],
      b: pair[1],
      distanceKm: distanceKm(from, to),
      kind: 'ferry',
      seasonality: link.seasonality ?? 'all_year',
    });
    present.add(key(pair[0], pair[1]));
  }

  const forbidden = new Set<string>();
  for (const link of overlay.forbiddenCorridors ?? []) {
    const pair = resolve(link, 'forbidden corridor');
    if (pair === null) continue;
    const k = key(pair[0], pair[1]);
    if (!present.has(k)) {
      // The staleness that accumulates unnoticed: a corridor the generator stopped producing,
      // whose ban now bans nothing and reads as protection that is not there.
      issues.push(`forbidden corridor is STALE — nothing produces it: "${link.reason}"`);
      continue;
    }
    forbidden.add(k);
  }

  const kept = edges.filter((e) => !forbidden.has(key(e.a, e.b)));

  return {
    edges: [...kept, ...added].sort((x, y) => x.a - y.a || x.b - y.b),
    added,
    removed: edges.length - kept.length,
    issues,
  };
}
