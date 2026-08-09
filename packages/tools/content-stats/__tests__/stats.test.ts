import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadEvents, loadModifiers } from '@odyssey/content/loader';
import { EMPTY_MODIFIER_REGISTRY, eventId, type GameEvent } from '@odyssey/engine';
import { findWorkspaceRoot } from '../../shared/workspace-root.ts';
import { formatStats } from '../format-stats.ts';
import { coverage, countBy, eligibleAt, locationByTime, ranked } from '../tally.ts';

const ROOT = findWorkspaceRoot(dirname(fileURLToPath(import.meta.url)));
const CONTENT = join(ROOT, 'packages', 'content');
const EVENTS = loadEvents(join(CONTENT, 'events'), CONTENT).events;
const MODIFIERS = loadModifiers(CONTENT).modifiers;

/** A minimal event, narrowed by whatever the caller constrains. */
function event(over: Omit<Partial<GameEvent>, 'id'> & { id: string }): GameEvent {
  const base = EVENTS[0];
  if (base === undefined) throw new Error('no fixture events');
  // Through the engine's own constructor, not a cast: it is the one place a plain string
  // becomes a branded id, and tests have no licence to skip it.
  return { ...base, ...over, id: eventId(over.id) };
}

describe('the empty-means-everything rule', () => {
  it('treats an empty constraint as matching every value on that axis', () => {
    // ADR 0009 §2. Getting this backwards inverts the whole report: the events that fit
    // everywhere would read as fitting nothing.
    const anywhere = event({
      id: 'test.anywhere',
      priority: 'normal',
      context: {
        locationTypes: [],
        timeOfDay: [],
        transportModes: [],
        weather: [],
        routeProfiles: [],
      },
    });
    const cell = eligibleAt([anywhere], {
      locationType: 'wilderness',
      timeOfDay: 'night',
      transportMode: 'ferry',
      routeProfile: 'illicit',
    });
    expect(cell.total).toBe(1);
    expect(cell.substantive).toBe(1);
  });

  it('respects a constraint when one is declared', () => {
    const border = event({
      id: 'test.border',
      priority: 'normal',
      context: {
        locationTypes: ['border_crossing'],
        timeOfDay: [],
        transportModes: [],
        weather: [],
        routeProfiles: [],
      },
    });
    const at = { timeOfDay: 'night', transportMode: 'car', routeProfile: 'fastest' } as const;
    expect(eligibleAt([border], { ...at, locationType: 'border_crossing' }).total).toBe(1);
    expect(eligibleAt([border], { ...at, locationType: 'wilderness' }).total).toBe(0);
  });
});

describe('coverage FINDS holes — guarding the guard', () => {
  it('reports zero holes for the shipped corpus, which is the honest result', () => {
    // Nine events, most with loose context, so every cell has something. That is a true
    // statement about a small fixture, not the tool failing — which is why the next two
    // tests exist.
    const cover = coverage(EVENTS);
    expect(cover.cells).toBe(1400);
    expect(cover.empty).toEqual([]);
  });

  it('finds EMPTY cells when nothing can reach them', () => {
    const narrow = event({
      id: 'test.narrow',
      priority: 'normal',
      context: {
        locationTypes: ['port'],
        timeOfDay: ['night'],
        transportModes: ['ferry'],
        weather: [],
        routeProfiles: ['illicit'],
      },
    });
    const cover = coverage([narrow]);
    // Exactly one of 1,400 combinations is reachable.
    expect(cover.empty.length).toBe(1399);
    expect(cover.fillerOnly).toEqual([]);
  });

  it('distinguishes a FILLER-ONLY cell from a covered one', () => {
    // The number worth reading: a cell covered only because a universal filler can fire there
    // is a hole with a rug over it, and the sim's 75%-filler finding is what it looks like
    // from the other end.
    const filler = event({
      id: 'test.filler',
      priority: 'filler',
      context: {
        locationTypes: [],
        timeOfDay: [],
        transportModes: [],
        weather: [],
        routeProfiles: [],
      },
    });
    const real = event({
      id: 'test.real',
      priority: 'normal',
      context: {
        locationTypes: ['city'],
        timeOfDay: [],
        transportModes: [],
        weather: [],
        routeProfiles: [],
      },
    });

    const cover = coverage([filler, real]);
    expect(cover.empty).toEqual([]);
    // Everything except the `city` row is filler-only: 1400 - (4 x 7 x 5).
    expect(cover.fillerOnly.length).toBe(1400 - 4 * 7 * 5);
  });
});

describe('the grid and the tallies', () => {
  it('excludes fillers from the location x time grid', () => {
    const filler = event({ id: 'test.f', priority: 'filler' });
    const table = locationByTime([filler]);
    expect(table.get('city')?.get('night')).toBe(0);
  });

  it('ranks descending by count, then by key, so two runs agree', () => {
    const counts = new Map([
      ['b', 2],
      ['a', 2],
      ['c', 5],
    ]);
    expect(ranked(counts)).toEqual([
      ['c', 5],
      ['a', 2],
      ['b', 2],
    ]);
  });

  it('counts a tag once per event, not once per occurrence', () => {
    expect(countBy(EVENTS, (e) => e.tags).get('authority')).toBe(
      EVENTS.filter((e) => e.tags.includes('authority')).length,
    );
  });
});

describe('the report', () => {
  const report = formatStats(EVENTS, MODIFIERS);

  it('contains every section', () => {
    for (const heading of [
      '## Events by priority',
      '## Events by category',
      '## Events by beat type',
      '## Events by tag',
      '## Events by location type',
      '## Check tags, by how many choices use them',
      '## Modifiers by source kind',
      '## Substantive events by location x time of day',
      '## Coverage over location x timeOfDay x transportMode x routeProfile',
    ]) {
      expect(report, `missing: ${heading}`).toContain(heading);
    }
  });

  it('has NO region axis, and the reason is not an oversight', () => {
    // EventContext has no region field, geo/ is empty so there are no region ids to bucket by,
    // and region-gating events is what §11 warns against unless the regions are abstract
    // terrain bands. A region column would read as coverage data and be nothing of the kind.
    //
    // ASSERTS ON HEADINGS, not on the bare word. This used to be `not.toContain('region')`,
    // which passed only because no modifier used `sourceKind: region` — the moment the seed
    // corpus added four, the word appeared under "Modifiers by source kind" and the test
    // failed while the property it names was still perfectly true. A substring match on a
    // vocabulary member was never testing what the comment above it claims.
    expect(report).not.toContain('## Events by region');
    expect(report).not.toContain('x region');
    expect(report).not.toContain('region x');
  });

  it('is deterministic', () => {
    expect(formatStats(EVENTS, MODIFIERS)).toBe(report);
  });

  it('NAMES what it truncated rather than silently capping', () => {
    const narrow = event({
      id: 'test.narrow',
      priority: 'normal',
      context: {
        locationTypes: ['port'],
        timeOfDay: ['night'],
        transportModes: ['ferry'],
        weather: [],
        routeProfiles: ['illicit'],
      },
    });
    const truncated = formatStats([narrow], EMPTY_MODIFIER_REGISTRY);
    // A report showing 12 holes while hiding 1,387 would be worse than no report.
    expect(truncated).toContain('1399 with NO eligible event');
    expect(truncated).toMatch(/and \d+ more \(showing 12 of 1399\)/);
  });
});
