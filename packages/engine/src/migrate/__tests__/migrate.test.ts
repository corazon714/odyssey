import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createContentPack } from '../../content/content-pack.ts';
import { eventId } from '../../ids/content-ids.ts';
import { SAVE_VERSION } from '../../state/create-run-state.ts';
import { type RunState } from '../../state/run-state.ts';
import { stateDigest } from '../../state/state-digest.ts';
import { loadMiniPack } from '../../__tests__/support/load-fixtures.ts';
import { migrateSave } from '../migrate-save.ts';
import { type Migration } from '../migration.ts';
import { MIGRATIONS } from '../migrations.ts';
import { reconcileContent } from '../reconcile-content.ts';
import { isRunStateShape } from '../run-state-shape.ts';

const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '__tests__',
  '__fixtures__',
);

const { events, registries } = loadMiniPack();
const PACK = createContentPack(events, registries);

function loadSave(version: number): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(FIXTURE_DIR, `save-v${String(version)}.json`), 'utf8'),
  ) as Record<string, unknown>;
}

describe('fixture completeness — the meta-test', () => {
  it('has a save fixture for every version up to SAVE_VERSION', () => {
    // THE TEST THAT MAKES THE LADDER ENFORCEABLE. It is the only thing that makes writing a
    // migration without a fixture impossible, and it fails the moment someone bumps
    // SAVE_VERSION and forgets — in CI, rather than on a player's device.
    const present = new Set(
      readdirSync(FIXTURE_DIR)
        .map((name) => /^save-v(\d+)\.json$/.exec(name)?.[1])
        .filter((v): v is string => v !== undefined)
        .map(Number),
    );

    for (let version = 1; version <= SAVE_VERSION; version += 1) {
      expect(present.has(version), `missing __fixtures__/save-v${String(version)}.json`).toBe(true);
    }
  });

  it('has a migration for every gap below SAVE_VERSION', () => {
    for (let version = 1; version < SAVE_VERSION; version += 1) {
      expect(
        MIGRATIONS.some((m) => m.from === version),
        `no migration from version ${String(version)}`,
      ).toBe(true);
    }
  });

  it('keeps the migration list ordered and gap-free', () => {
    MIGRATIONS.forEach((migration, i) => {
      expect(migration.from).toBe(i + 1);
    });
  });
});

describe('migrateSave', () => {
  it('accepts a current save unchanged', () => {
    const result = migrateSave(loadSave(1));
    if (!result.ok) throw new Error(`unexpected failure: ${result.error.code}`);
    expect(result.fromVersion).toBe(1);
    expect(result.applied).toEqual([]);
    expect(result.state.version).toBe(SAVE_VERSION);
  });

  it('round-trips a real save without changing its digest', () => {
    const raw = loadSave(1);
    const result = migrateSave(raw);
    if (!result.ok) throw new Error('expected ok');
    expect(stateDigest(result.state)).toBe(stateDigest(raw as unknown as RunState));
  });

  it('REFUSES a future version rather than guessing', () => {
    // Someone installed a newer build, played, and rolled back. Attempting the save would
    // silently discard whatever the newer fields meant.
    const result = migrateSave({ ...loadSave(1), version: SAVE_VERSION + 5 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('save/version-too-new');
  });

  it('returns a typed error, never a throw, for junk input', () => {
    for (const junk of [null, undefined, 42, 'a save', [], {}, { version: 'one' }]) {
      expect(() => migrateSave(junk)).not.toThrow();
      expect(migrateSave(junk).ok).toBe(false);
    }
  });

  it('reports a GAP in the ladder distinctly from a corrupt save', () => {
    // A build defect, not a bad save — and the two need different fixes.
    const result = migrateSave({ ...loadSave(1), version: 1 }, [], 3);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('save/version-unsupported');
    expect(result.error.params['missing']).toBe(1);
  });

  it('chains synthetic migrations in order', () => {
    // MIGRATIONS is empty today because no save format has been superseded. Inventing a fake
    // schema change to exercise the machinery would put a lie in the ladder, so the machinery
    // is proven against a synthetic list instead.
    const order: string[] = [];
    const synthetic: Migration[] = [
      {
        from: 1,
        describe: 'add weather',
        migrate: (save) => {
          order.push('1->2');
          return { ...save, weather: 'fog' };
        },
      },
      {
        from: 2,
        describe: 'rename tension',
        migrate: (save) => {
          order.push('2->3');
          return { ...save, tension: 0.5 };
        },
      },
    ];

    const result = migrateSave({ ...loadSave(1), version: 1 }, synthetic, 3);
    if (!result.ok) throw new Error(`unexpected failure: ${result.error.code}`);

    expect(order).toEqual(['1->2', '2->3']);
    expect(result.applied).toEqual(['add weather', 'rename tension']);
    expect(result.state.version).toBe(3);
    expect(result.state.weather).toBe('fog');
  });

  it('rejects a migration that produces something that is not a RunState', () => {
    const destructive: Migration[] = [
      { from: 1, describe: 'break it', migrate: () => ({ version: 1 }) },
    ];
    const result = migrateSave({ ...loadSave(1), version: 1 }, destructive, 2);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('save/shape-invalid');
  });
});

describe('isRunStateShape', () => {
  it('accepts a real save', () => {
    expect(isRunStateShape(loadSave(1))).toBe(true);
  });

  it('rejects a save missing a single rng cursor', () => {
    // Silently catastrophic otherwise: every draw would read undefined and produce NaN.
    const save = loadSave(1);
    const cursors = { ...(save['rngCursors'] as Record<string, number>) };
    delete cursors['chanceGate'];
    expect(isRunStateShape({ ...save, rngCursors: cursors })).toBe(false);
  });

  it('rejects each missing top-level branch', () => {
    for (const key of ['clock', 'route', 'resources', 'flags', 'history', 'pendingEvents']) {
      const save = loadSave(1);
      delete save[key];
      expect(isRunStateShape(save), `accepted a save with no ${key}`).toBe(false);
    }
  });

  it('rejects an array where an object belongs', () => {
    expect(isRunStateShape({ ...loadSave(1), flags: [] })).toBe(false);
  });
});

describe('reconcileContent — the OPPOSITE policy to replay', () => {
  const save = migrateSave(loadSave(1));
  if (!save.ok) throw new Error('fixture save does not migrate');
  const state = save.state;

  it('is a no-op against the pack the save was written for', () => {
    const result = reconcileContent({ ...state, contentVersion: PACK.version }, PACK);
    expect(result.changed).toBe(false);
    expect(result.droppedPending).toEqual([]);
  });

  it('TOLERATES a contentVersion mismatch, where replay refuses one', () => {
    // Content ships in every app update. Refusing would delete every in-progress 30-leg run
    // the moment a player updates — the opposite trade from golden-run replay, and both are
    // right for their own question.
    const result = reconcileContent({ ...state, contentVersion: 'from-an-older-build' }, PACK);
    expect(result.changed).toBe(true);
    expect(result.state.contentVersion).toBe(PACK.version);
  });

  it('drops a pending event whose target no longer exists, and names it', () => {
    const ghost = eventId('was.deleted.in.an.update');
    const withGhost: RunState = {
      ...state,
      pendingEvents: [
        ...state.pendingEvents,
        {
          eventId: ghost,
          earliestLeg: 1,
          latestLeg: 9,
          scheduledAtLeg: 0,
          source: eventId('border.bribe_attempt'),
          requires: null,
          payload: null,
        },
      ],
    };

    const result = reconcileContent(withGhost, PACK);
    expect(result.droppedPending).toEqual([ghost]);
    expect(result.state.pendingEvents.some((p) => p.eventId === ghost)).toBe(false);
  });

  it('KEEPS eventMemory for a removed event, and reports it', () => {
    // Dropping would lose "you have seen this" if the event ever returns, and the entry costs
    // nothing to keep.
    const ghost = eventId('retired.event');
    const withMemory: RunState = {
      ...state,
      eventMemory: { ...state.eventMemory, [ghost]: { count: 2, lastLeg: 3, lastChoiceId: null } },
    };

    const result = reconcileContent(withMemory, PACK);
    expect(result.unknownEventMemory).toContain(ghost);
    expect(result.state.eventMemory[ghost]).toBeDefined();
  });

  it('KEEPS history verbatim', () => {
    // Rewriting a run's own past to match today's content is the worse failure. The keys
    // degrade to missing-key at render, which i18n-check catches.
    const result = reconcileContent({ ...state, contentVersion: 'older' }, PACK);
    expect(result.state.history).toEqual(state.history);
  });

  it('KEEPS flags and unlocked endings', () => {
    const result = reconcileContent({ ...state, contentVersion: 'older' }, PACK);
    expect(result.state.flags).toEqual(state.flags);
    expect(result.state.unlockedEndings).toEqual(state.unlockedEndings);
  });

  it('reports beat slots the new pack cannot fill', () => {
    const result = reconcileContent(state, PACK);
    // The fixture routes schedule departure/approach, which the nine-event pack cannot fill.
    expect(result.unfillableBeats.length).toBeGreaterThan(0);
  });

  it('leaves the state JSON-serialisable', () => {
    const result = reconcileContent({ ...state, contentVersion: 'older' }, PACK);
    expect(JSON.parse(JSON.stringify(result.state))).toEqual(result.state);
  });
});
