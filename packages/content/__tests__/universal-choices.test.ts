import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { UNIVERSAL_CHOICE_PREFIX } from '@odyssey/engine';
import { loadUniversalChoices } from '../loader/load-universal-choices.ts';
import { formatIssue } from '../loader/locate.ts';
import { universalChoiceSchema } from '../schema/universal-choice.ts';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** A row that satisfies every rule, so each test below breaks exactly one thing. */
const VALID = {
  id: 'walk_away',
  appliesTo: ['cat:border', 'authority'],
  family: 'retreat',
  priority: 20,
  costs: [{ op: 'resource', key: 'morale', delta: -1 }],
  outcomes: [{ id: 'left', weight: 1, effects: [] }],
} as const;

describe('universal-choices.yaml as it ships', () => {
  const loaded = loadUniversalChoices(PACKAGE_ROOT);

  it('loads without an issue', () => {
    expect(loaded.issues.map((i) => `${formatIssue(i)} ${i.message}`)).toEqual([]);
  });

  it('is populated, and every row is reachable', () => {
    // It shipped EMPTY at M-B, deliberately: an empty registry makes `injectUniversalChoices`
    // the identity, which is what let that milestone prove it changed no golden run. M-F filled
    // it, so the assertion inverts — the interesting property is no longer "nothing is injected"
    // but "nothing is DEAD".
    //
    // `UNIVERSAL_NEVER_INJECTED` in content:lint is the running check; this pins the count so a
    // row cannot be quietly dropped. Reachability itself is asserted there, over the real splice.
    expect(loaded.universalChoices.length).toBe(15);
    expect(new Set(loaded.universalChoices.map((row) => row.family)).size).toBeGreaterThan(1);
  });

  it('reports a MISSING file as an issue rather than an empty registry', () => {
    // "The registry vanished" and "there is nothing to inject" look identical downstream, and
    // only one of them is a bug.
    const absent = loadUniversalChoices(join(PACKAGE_ROOT, '__does_not_exist__'));
    expect(absent.universalChoices).toEqual([]);
    expect(absent.issues).toHaveLength(1);
    expect(absent.issues[0]?.message).toContain('missing universal-choice registry');
  });
});

describe('the universal choice schema', () => {
  it('mints a choice id an author cannot forge, and derives keys from the ROW', () => {
    const parsed = universalChoiceSchema.parse(VALID);

    expect(String(parsed.choice.id)).toBe(`${UNIVERSAL_CHOICE_PREFIX}walk_away`);
    // Row-scoped, not event-scoped: one key however many events it lands in.
    expect(parsed.choice.labelKey).toBe('universal.walk_away.label');
    expect(parsed.choice.outcomes[0]?.textKey).toBe('universal.walk_away.out.left');
  });

  it('defaults requires, hiddenUnless and the roll the way a choice does', () => {
    const parsed = universalChoiceSchema.parse(VALID);

    expect(parsed.choice.requires).toEqual({ kind: 'always' });
    expect(parsed.choice.hiddenUnless).toBeNull();
    expect(parsed.choice.skillCheck).toBeNull();
    expect(parsed.choice.search).toBeNull();
  });

  it('rejects a row with both a check and a search', () => {
    const result = universalChoiceSchema.safeParse({
      ...VALID,
      check: { skill: 'negotiation', dc: 10, tags: ['social'] },
      search: { container: 'bag', dc: 10, tags: ['stealth', 'search'] },
    });

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('a choice rolls one thing');
  });

  it('rejects a row that costs nothing — the design rule, as far as a schema reaches', () => {
    // A free option is strictly better than doing what the event asked, which makes every
    // hand-authored choice in every matching event pointless.
    const result = universalChoiceSchema.safeParse({
      ...VALID,
      costs: [],
      outcomes: [{ id: 'left', weight: 1, effects: [] }],
    });

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('must never be strictly the best');
  });

  it('accepts a row whose cost is a roll rather than an effect', () => {
    // Risk IS a cost. A row that can fail is not free even with empty `costs`.
    const result = universalChoiceSchema.safeParse({
      ...VALID,
      costs: [],
      check: { skill: 'negotiation', dc: 14, tags: ['social', 'deception'] },
      outcomes: [
        { id: 'worked', weight: 1, onCheck: 'success', effects: [] },
        { id: 'failed', weight: 1, onCheck: 'failure', effects: [] },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('rejects an empty appliesTo, which could never be injected', () => {
    expect(universalChoiceSchema.safeParse({ ...VALID, appliesTo: [] }).success).toBe(false);
  });

  it('rejects onCheck with nothing to branch on', () => {
    const result = universalChoiceSchema.safeParse({
      ...VALID,
      outcomes: [{ id: 'left', weight: 1, onCheck: 'success', effects: [] }],
    });

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('`onCheck` can never match');
  });

  it('is sealed, so a misspelled key fails the file rather than defaulting', () => {
    expect(universalChoiceSchema.safeParse({ ...VALID, prioritie: 5 }).success).toBe(false);
  });
});
