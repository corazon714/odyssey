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
  return readSave(`save-v${String(version)}.json`);
}

function readSave(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf8')) as Record<string, unknown>;
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
    // Retargeted from v1 when SAVE_VERSION became 2: a v1 save now MIGRATES, so it is no
    // longer the already-current case this test is about.
    const result = migrateSave(loadSave(SAVE_VERSION));
    if (!result.ok) throw new Error(`unexpected failure: ${result.error.code}`);
    expect(result.fromVersion).toBe(SAVE_VERSION);
    expect(result.applied).toEqual([]);
    expect(result.state.version).toBe(SAVE_VERSION);
  });

  it('round-trips a CURRENT save without changing its digest', () => {
    const raw = loadSave(SAVE_VERSION);
    const result = migrateSave(raw);
    if (!result.ok) throw new Error('expected ok');
    expect(stateDigest(result.state)).toBe(stateDigest(raw as unknown as RunState));
  });

  it('CHANGES the digest of a v1 save, because a real migration ran', () => {
    // The other half, and the half that would otherwise be missing. Asserting only that a
    // current save round-trips unchanged would pass just as well if the ladder did nothing.
    const raw = loadSave(1);
    const result = migrateSave(raw);
    if (!result.ok) throw new Error('expected ok');
    expect(stateDigest(result.state)).not.toBe(stateDigest(raw as unknown as RunState));
    expect(result.applied).toHaveLength(MIGRATIONS.length);
  });

  it('climbs one rung at a time — v1 -> v2 alone matches the v2 fixture', () => {
    // Called on the RUNG rather than through migrateSave, because migrateSave validates its
    // output against the CURRENT shape: once v3 changed what an inventory is, stopping at v2
    // can never pass that guard. That is correct — the guard describes today's RunState, not
    // an arbitrary historical one — but it means the intermediate step has to be checked here.
    //
    // This is also what keeps save-v2-loaded.json honest now that v3 exists.
    const rung = MIGRATIONS.find((m) => m.from === 1);
    expect(rung).toBeDefined();
    if (rung === undefined) return;

    const stepped = { ...rung.migrate(readSave('save-v1-loaded.json')), version: 2 };
    expect(stepped).toEqual(readSave('save-v2-loaded.json'));
  });

  it('refuses to stop at a superseded version, because the shape guard is about TODAY', () => {
    // The consequence of the note above, asserted rather than left as a surprise.
    const result = migrateSave(readSave('save-v1-loaded.json'), MIGRATIONS, 2);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('save/shape-invalid');
  });

  it('migrates a LOADED v1 save to exactly the checked-in current fixture', () => {
    // The migration's actual golden. The plain v1 fixture has an empty inventory, no passport
    // and a null `requires`, so a test against it exercises almost nothing — including, and
    // especially, the recursive predicate rewrite.
    const loaded = readSave('save-v1-loaded.json');
    const result = migrateSave(loaded);
    if (!result.ok) throw new Error(`unexpected failure: ${result.error.code}`);
    expect(result.state).toEqual(readSave('save-v3-loaded.json'));
  });

  it('rewrites `money` inside a PERSISTED predicate tree, not just in resources', () => {
    // The part that is not a field rename, and the one most likely to be forgotten:
    // `pendingEvents[].requires` stores a canonical Predicate, and
    // `{ kind: 'resource', key: 'money' }` is a legal node in it. Left alone, every queued
    // promise would gate on a resource key that no longer exists — reading undefined,
    // comparing false, and expiring unfired. Silent, and it would look like a director bug.
    const result = migrateSave(readSave('save-v1-loaded.json'));
    if (!result.ok) throw new Error('expected ok');

    const requires = result.state.pendingEvents[0]?.requires;
    const json = JSON.stringify(requires);
    expect(json).not.toContain('"key":"money"');
    expect(json).toContain('"key":"cash"');

    // ...and a FLAG whose id happens to be `money` is a different thing entirely. Renaming it
    // would silently retarget a gate at a flag that does not exist.
    expect(json).toContain('"id":"money"');
  });

  it('v2->v3 never drops a player item, even when the person overflows', () => {
    // A migration that loses property is a bug. W3's "items are lost, never silently
    // relocated" is a rule about EFFECTS in play, not about a schema change between launches.
    const v2 = readSave('save-v2.json');
    const loaded = {
      ...v2,
      inventory: [
        { id: 'ration', count: 5, condition: null },
        { id: 'spare_tyre', count: 4, condition: 7 },
        { id: 'cash_belt', count: 1, condition: null },
      ],
    };
    const result = migrateSave(loaded);
    if (!result.ok) throw new Error(`unexpected failure: ${result.error.code}`);

    const total = (c: { items: readonly { count: number }[] } | null): number =>
      c === null ? 0 : c.items.reduce((sum, i) => sum + i.count, 0);
    expect(total(result.state.inventory.person) + total(result.state.inventory.bag)).toBe(10);

    // A bag is granted ONLY because something did not fit; the bag is allowed to overflow
    // rather than dropping the excess, which is why isRunStateShape does not check capacity.
    expect(result.state.inventory.bag).not.toBeNull();
  });

  it('v2->v3 grants NO bag when everything fits, so a light run keeps its topology', () => {
    const light = { ...readSave('save-v2.json'), inventory: [{ id: 'ration', count: 2 }] };
    const result = migrateSave(light);
    if (!result.ok) throw new Error('expected ok');
    expect(result.state.inventory.bag).toBeNull();
    expect(result.state.inventory.person.items).toHaveLength(1);
  });

  it('v2->v3 puts every document on the person', () => {
    // Any other default would retroactively change a live run's risk profile: a save that
    // survived twenty legs with a passport would suddenly be one loseContainer from losing it.
    const result = migrateSave(readSave('save-v1-loaded.json'));
    if (!result.ok) throw new Error('expected ok');
    expect(result.state.documents.passport?.container).toBe('person');
    for (const ticket of result.state.documents.tickets) {
      expect(ticket.container).toBe('person');
    }
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

    // Starts from a CURRENT-shaped save, not v1. The synthetic migrations only add `weather`
    // and `tension`, so beginning from a v1 body would leave `resources.cash` absent and the
    // post-migration shape guard would reject it — failing this test for a reason that has
    // nothing to do with the chaining it exists to prove.
    const result = migrateSave({ ...loadSave(SAVE_VERSION), version: 1 }, synthetic, 3);
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
    // SAVE_VERSION, not 1: a v1 save is genuinely no longer a valid RunState shape — it has
    // no `resources.cash` and no `resources.bank`. That it now fails here is the guard
    // working, and is exactly what stops a half-written migration reaching a player.
    expect(isRunStateShape(loadSave(SAVE_VERSION))).toBe(true);
  });

  it('REJECTS a v1 save, which is missing cash and bank', () => {
    expect(isRunStateShape(loadSave(1))).toBe(false);
  });

  it('rejects a save whose resource is NaN rather than writing it through', () => {
    // The hazard the exhaustive resource loop was added for. NaN compares false against both
    // bounds, so clampResources writes it straight through and stateDigest serialises it as
    // `null` — a meter that is not a number, and every comparison against it silently false.
    const save = loadSave(SAVE_VERSION);
    const resources = { ...(save['resources'] as Record<string, unknown>), cash: Number.NaN };
    expect(isRunStateShape({ ...save, resources })).toBe(false);
  });

  it('rejects a save missing a single resource key', () => {
    const save = loadSave(SAVE_VERSION);
    const resources = { ...(save['resources'] as Record<string, unknown>) };
    delete resources['bank'];
    expect(isRunStateShape({ ...save, resources })).toBe(false);
  });

  it('rejects a save missing a single rng cursor', () => {
    // Silently catastrophic otherwise: every draw would read undefined and produce NaN.
    const save = loadSave(SAVE_VERSION);
    const cursors = { ...(save['rngCursors'] as Record<string, number>) };
    delete cursors['chanceGate'];
    expect(isRunStateShape({ ...save, rngCursors: cursors })).toBe(false);
  });

  it('rejects each missing top-level branch', () => {
    for (const key of ['clock', 'route', 'resources', 'flags', 'history', 'pendingEvents']) {
      const save = loadSave(SAVE_VERSION);
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
