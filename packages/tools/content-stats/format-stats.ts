import {
  LOCATION_TYPES,
  TIMES_OF_DAY,
  type GameEvent,
  type ModifierRegistry,
} from '@odyssey/engine';
import {
  checkTagUse,
  countBy,
  coverage,
  locationByTime,
  modifierSourceKinds,
  ranked,
  type Axis,
} from './tally.ts';

/**
 * The report. Fixed-width, like the sim's, so it diffs cleanly in a pull request.
 *
 * WHAT IT DELIBERATELY DOES NOT HAVE: a region axis. `EventContext` has no region field,
 * `packages/content/geo/` is empty so there are no region ids to bucket by, and adding region
 * gating to events is what CLAUDE.md §11 warns against unless the regions are abstract terrain
 * bands rather than places. A region column now would render as coverage data and be nothing
 * of the kind. It lands with `geo/`.
 */

/** Cap on listed thin cells: the space is 1,400 combinations and a wall of them is not a report. */
const MAX_LISTED = 12;

export function formatStats(events: readonly GameEvent[], registry: ModifierRegistry): string {
  const lines: string[] = [];
  const push = (...text: string[]): void => {
    lines.push(...text);
  };

  push(
    `# Content Stats — ${String(events.length)} events, ${String(registry.length)} modifiers`,
    '',
  );

  push('## Events by priority');
  section(push, ranked(countBy(events, (e) => [e.priority])));

  push('', '## Events by category');
  section(push, ranked(countBy(events, (e) => [e.category])));

  push('', '## Events by beat type');
  const beats = ranked(countBy(events, (e) => (e.beatType === null ? [] : [e.beatType])));
  section(push, beats);

  push('', '## Events by tag');
  section(push, ranked(countBy(events, (e) => e.tags)));

  push('', '## Events by location type   (empty context = every location)');
  section(push, ranked(countBy(events, (e) => e.context.locationTypes)));

  push('', '## Check tags, by how many choices use them');
  section(push, ranked(checkTagUse(events)));

  push('', '## Modifiers by source kind');
  section(push, ranked(modifierSourceKinds(registry)));

  push('', '## Substantive events by location x time of day');
  push('   Fillers excluded — counting them paints every cell green and hides the holes.');
  push('');
  push(grid(events));

  const cover = coverage(events);
  push(
    '',
    '## Coverage over location x timeOfDay x transportMode x routeProfile',
    `   ${String(cover.cells)} combinations`,
    `   ${String(cover.empty.length)} with NO eligible event`,
    `   ${String(cover.fillerOnly.length)} covered ONLY by fillers  <- a hole with a rug over it`,
    '',
  );

  if (cover.empty.length > 0) {
    push('### Thinnest: no event at all');
    push(...listAxes(cover.empty));
    push('');
  }
  if (cover.fillerOnly.length > 0) {
    push('### Filler-only');
    push(...listAxes(cover.fillerOnly));
    push('');
  }

  return lines.join('\n');
}

function section(push: (...text: string[]) => void, entries: readonly [string, number][]): void {
  if (entries.length === 0) {
    push('  (none)');
    return;
  }
  const width = Math.max(...entries.map(([key]) => key.length));
  for (const [key, count] of entries) {
    push(`  ${pad(key, width)}  ${String(count).padStart(4)}`);
  }
}

function grid(events: readonly GameEvent[]): string {
  const table = locationByTime(events);
  const labelWidth = Math.max(...LOCATION_TYPES.map((l) => l.length));
  const cols = TIMES_OF_DAY.map((t) => t.slice(0, 5));

  const out = [`  ${pad('', labelWidth)}  ${cols.map((c) => c.padStart(5)).join(' ')}`];
  for (const location of LOCATION_TYPES) {
    const row = table.get(location);
    const cells = TIMES_OF_DAY.map((time) => String(row?.get(time) ?? 0).padStart(5));
    out.push(`  ${pad(location, labelWidth)}  ${cells.join(' ')}`);
  }
  return out.join('\n');
}

/**
 * Thin cells, grouped so the list stays readable.
 *
 * A NAMED CAP, and it says what it dropped. Silently truncating to twelve would let a report
 * showing "12 holes" hide four hundred — the exact "no silent caps" failure the report format
 * exists to avoid.
 */
function listAxes(axes: readonly Axis[]): readonly string[] {
  const rendered = axes.map(
    (a) => `  ${a.locationType} / ${a.timeOfDay} / ${a.transportMode} / ${a.routeProfile}`,
  );
  if (rendered.length <= MAX_LISTED) return rendered;
  return [
    ...rendered.slice(0, MAX_LISTED),
    `  ... and ${String(rendered.length - MAX_LISTED)} more (showing ${String(MAX_LISTED)} of ${String(rendered.length)})`,
  ];
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}
