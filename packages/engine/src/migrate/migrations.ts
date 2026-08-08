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

export const MIGRATIONS: readonly Migration[] = [migrate_1_to_2];
