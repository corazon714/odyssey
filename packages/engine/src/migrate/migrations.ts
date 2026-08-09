import { type Migration } from './migration.ts';

/**
 * Every migration, in ascending order of `from`.
 *
 * NEVER EDIT A SHIPPED MIGRATION. Its input is a save format that exists in the wild; changing
 * what it reads changes what an old save becomes. Every new `SAVE_VERSION` appends one
 * function AND one checked-in fixture, and the fixture-completeness meta-test is what makes
 * that enforceable rather than aspirational.
 */

/**
 * v1 -> v2: `resources.money` becomes `resources.cash`, and `resources.bank` appears.
 *
 * THE PART THAT IS NOT A FIELD RENAME. `key: 'money'` is not only a property of
 * `state.resources` — it is also persisted INSIDE `pendingEvents[].requires`, which stores a
 * canonical `Predicate` tree, and `{ kind: 'resource', key: 'money' }` is a legal node there.
 * A migration that renamed the resource and stopped would leave every queued promise gated on
 * a resource key that no longer exists, so the gate would read `undefined`, compare false, and
 * the promise would expire unfired. Silent, and it would look like a director bug.
 *
 * So the tree is rewritten recursively, and the walk's `default` RECURSES rather than
 * returning — the same discipline `collect-refs.ts` uses (ADR 0009 §4). A future predicate
 * kind that nests children must not silently drop a rename on the way through.
 *
 * `history` is deliberately NOT rewritten. It carries `ClampEvent` and `AppliedEffect` params
 * that may name `money`, but `reconcileContent`'s policy is history-verbatim: a run's past is
 * what happened, and rewriting it to match today's vocabulary is exactly what that policy
 * forbids. An i18n alias keeps the retired key renderable.
 */
const migrate_1_to_2: Migration = {
  from: 1,
  describe: 'v1->v2: resources.money renamed to cash; bank added; predicate trees rewritten',
  migrate(save) {
    const resources = asRecord(save['resources']);
    const { money, ...rest } = resources;

    return {
      ...save,
      resources: {
        ...rest,
        cash: typeof money === 'number' ? money : 0,
        // A v1 save predates banking entirely, so nobody had an account. Starting anyone at
        // a non-zero balance would hand a live run money it never earned.
        bank: 0,
      },
      pendingEvents: asArray(save['pendingEvents']).map((entry) => {
        const pending = asRecord(entry);
        const requires = pending['requires'];
        return requires === null || requires === undefined
          ? pending
          : { ...pending, requires: renameResourceKey(requires) };
      }),
    };
  },
};

/** Recursively rewrite `{ kind: 'resource', key: 'money' }` to `key: 'cash'`. */
function renameResourceKey(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(renameResourceKey);
  if (node === null || typeof node !== 'object') return node;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    out[key] = renameResourceKey(value);
  }

  // Only a resource node's `key` is renamed. A flag or item whose id happens to be `money`
  // is a different thing entirely and must survive untouched.
  if (out['kind'] === 'resource' && out['key'] === 'money') out['key'] = 'cash';
  return out;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value === null || typeof value !== 'object' || Array.isArray(value)
    ? {}
    : { ...(value as Record<string, unknown>) };
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * v2 -> v3: the flat inventory array becomes four containers, and documents record which
 * container carries them.
 *
 * NEVER DROP, NEVER ERROR. A migration that loses a player's property is a bug, and W3's
 * "items are lost, never silently relocated" is a rule about EFFECTS in play, not about a
 * schema change that happens between one launch and the next.
 *
 * Entries are sorted by id first. A v1/v2 inventory's order is `applyItem` push order —
 * deterministic within a run but arbitrary as data — and sorting makes the migration a pure
 * function of the SET, so the same save always produces the same containers.
 *
 * A bag is granted only if the person cannot hold everything, so a light run keeps the
 * container topology it had. The bag is allowed to OVERFLOW rather than dropping the excess;
 * `isRunStateShape` deliberately does not check capacity for exactly this reason.
 *
 * Every document defaults to `person`. Any other default would retroactively change a live
 * run's risk profile — a save that survived twenty legs with a passport would suddenly be one
 * `loseContainer` away from losing it, for a reason that predates the mechanic.
 */
const migrate_2_to_3: Migration = {
  from: 2,
  describe: 'v2->v3: flat inventory becomes containers; documents record their container',
  migrate(save) {
    const flat = asArray(save['inventory'])
      .map(asRecord)
      .filter((entry) => typeof entry['id'] === 'string')
      .sort((a, b) => (String(a['id']) < String(b['id']) ? -1 : 1));

    const PERSON_SLOTS = 6;
    const person: Record<string, unknown>[] = [];
    const bag: Record<string, unknown>[] = [];
    let used = 0;

    for (const entry of flat) {
      const count = typeof entry['count'] === 'number' ? entry['count'] : 1;
      if (used + count <= PERSON_SLOTS) {
        person.push(entry);
        used += count;
      } else {
        bag.push(entry);
      }
    }

    const documents = asRecord(save['documents']);
    const passport = documents['passport'];

    return {
      ...save,
      inventory: {
        person: { slots: PERSON_SLOTS, searchDC: 2, items: person },
        // Granted ONLY if something did not fit, so a light run's topology is unchanged.
        bag: bag.length > 0 ? { slots: 10, searchDC: 4, items: bag } : null,
        vehicle: null,
        stash: null,
      },
      documents: {
        ...documents,
        passport:
          passport === null || passport === undefined
            ? null
            : { ...asRecord(passport), container: 'person' },
        tickets: asArray(documents['tickets']).map((ticket) => ({
          ...asRecord(ticket),
          container: 'person',
        })),
      },
    };
  },
};

/**
 * v3 -> v4: a presented event records the complication attached to it.
 *
 * A v3 save cannot have had one, so `null` is the only correct value — and it must be WRITTEN
 * rather than left absent. `isRunStateShape` does not inspect `presentation` (it checks what
 * BREAKS, and a missing complication breaks nothing structural), so an absent key would load
 * clean and read `undefined`. That compares `!== null` at every guard site, which would send
 * `resolveChoice` to `registry.byId.get(undefined)` — silent, and it would present as a
 * content bug rather than a migration one.
 *
 * Only the `event` branch is touched. `none` and `uneventful` have no complication to record,
 * and adding the key to them would put a field in the union arm that does not carry it.
 */
const migrate_3_to_4: Migration = {
  from: 3,
  describe: 'v3->v4: a presented event records its complication id',
  migrate(save) {
    const presentation = asRecord(save['presentation']);
    if (presentation['kind'] !== 'event') return save;
    return { ...save, presentation: { ...presentation, complicationId: null } };
  },
};

export const MIGRATIONS: readonly Migration[] = [migrate_1_to_2, migrate_2_to_3, migrate_3_to_4];
