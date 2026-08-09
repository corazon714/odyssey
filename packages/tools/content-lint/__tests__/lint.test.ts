import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { countBySeverity, sortIssues, type LintIssue } from '../issue.ts';
import { formatReport } from '../format-report.ts';
import { parseArgs } from '../parse-args.ts';
import { type ContentBundle } from '../load-content.ts';
import { regionModifiers } from '../rules-registry.ts';
import { RULES, runLint } from '../run-lint.ts';
import { findWorkspaceRoot } from '../../shared/workspace-root.ts';

const ROOT = findWorkspaceRoot(dirname(fileURLToPath(import.meta.url)));
const CONTENT = join(ROOT, 'packages', 'content');

/**
 * The linter is tested against the REAL content, not a synthetic corpus.
 *
 * A synthetic corpus proves the rules can fire; running against what actually ships proves
 * they fire on the right things and stay quiet about everything else — which is the property
 * that decides whether anyone keeps the tool switched on.
 */
const run = runLint(CONTENT);

describe('the shipped content passes', () => {
  it('has ZERO errors', () => {
    const errors = run.issues.filter((i) => i.severity === 'error');
    expect(errors.map((e) => `${e.rule} ${e.message}`)).toEqual([]);
  });

  it('ran every rule over a non-empty corpus', () => {
    // Anti-vacuous guard: zero errors over zero events is not a passing linter.
    expect(run.ruleCount).toBe(RULES.length);
    expect(run.eventCount).toBeGreaterThan(0);
  });

  it('still REPORTS the one remaining corpus gap rather than being silent', () => {
    // THIS ASSERTION HAS NOW BEEN WRONG TWICE, and the pattern is worth naming rather than
    // fixing a third time. It began as `UNUSED_TAG` + `MISSING_LOCALE` + `MISSING_IMAGE_MANIFEST`
    // — the honest state of a nine-event fixture. Filling the tag coverage broke it once;
    // writing the locale broke it again. Each time the LINTER was right and the test was
    // describing a to-do list.
    //
    // What is left is genuinely structural: no image exists, `packages/tools/imagegen/` is
    // empty, and a manifest listing thirteen keys mapped to nothing would be a stub of exactly
    // the kind CLAUDE.md §5 forbids. When imagegen lands, delete this — do not replace it.
    const rules = new Set(run.issues.map((i) => i.rule));
    expect(rules).toContain('MISSING_IMAGE_MANIFEST');
  });

  it('reports NO missing i18n key, now that the locale exists', () => {
    // The positive form, and the one that stays true. `MISSING_I18N_KEY` is an error that fires
    // PER KEY the moment `i18n/en/` holds any `.json`, so this is the assertion that says the
    // locale is complete rather than merely present.
    expect(run.issues.filter((i) => i.rule === 'MISSING_I18N_KEY')).toEqual([]);
    expect(run.issues.filter((i) => i.rule === 'MISSING_LOCALE')).toEqual([]);
  });

  it('reports NO tag-coverage gap: every check tag has 3+ events and 5+ modifiers', () => {
    // The positive form of what `UNUSED_TAG`/`THIN_TAG` used to warn about. Stated as an
    // assertion because it is the corpus's headline property and a warning is easy to stop
    // reading; if a future event narrows its tags, this fails rather than adding a line to a
    // report.
    const coverage = runLint(CONTENT, ['tag-coverage']).issues;
    expect(coverage.map((i) => `${i.rule} ${i.message}`)).toEqual([]);
  });
});

describe('REGION_MODIFIER_NOT_DOCUMENT fires on a §11 violation', () => {
  // THE RULE IS SILENT ON THE SHIPPED CORPUS, which is the correct result and also the reason
  // it needs this test: a rule that has never fired is a rule nobody has checked. Verified
  // against a deliberate violation, the way every other guard in this repo was.
  const bundle = (when: unknown): ContentBundle =>
    ({
      root: CONTENT,
      events: [],
      declarations: { flags: [], items: [], npcs: [], traits: [], endings: [] },
      modifiers: [
        {
          id: 'somewhere_is_dangerous',
          appliesTo: ['authority'],
          when,
          delta: -3,
          labelKey: 'check.modifier.somewhere_is_dangerous',
          sourceKind: 'region',
          conflictsWith: [],
          priority: 60,
          stacks: false,
        },
      ],
      universalChoices: [],
      complications: [],
      locale: null,
      images: null,
      issues: [],
    }) as unknown as ContentBundle;

  it('catches a region row that reads a PLACE rather than the papers', () => {
    // `{ locationType: [...] }` is a property of where the player is. As a `region` row that is
    // exactly what §11 forbids: difficulty attached to a place rather than to the player.
    const issues = regionModifiers(bundle({ kind: 'locationType', of: ['border_crossing'] }));

    expect(issues).toHaveLength(1);
    expect(issues[0]?.rule).toBe('REGION_MODIFIER_NOT_DOCUMENT');
    expect(issues[0]?.severity).toBe('error');
  });

  it('accepts a region row that reads the visa', () => {
    expect(regionModifiers(bundle({ kind: 'visa', region: 'transit_zone', valid: true }))).toEqual(
      [],
    );
  });

  it('finds the papers node nested inside an `all`', () => {
    // The walk has to recurse, or wrapping the visa check in a conjunction — which every real
    // row eventually does — would read as a violation.
    const nested = { kind: 'all', of: [{ kind: 'always' }, { kind: 'passport', valid: true }] };
    expect(regionModifiers(bundle(nested))).toEqual([]);
  });
});

describe('rules fire on content that is actually wrong', () => {
  // Each of these would be caught in CI. Verified by construction rather than by trusting
  // that a rule which is quiet today would speak up tomorrow.
  const only = (name: string): readonly LintIssue[] => runLint(CONTENT, [name]).issues;

  it('every rule is selectable by name', () => {
    for (const rule of RULES) {
      expect(() => only(rule.name)).not.toThrow();
    }
  });

  it('selecting one rule runs only that rule', () => {
    // KEYED TO NO PARTICULAR FINDING, deliberately. Two earlier versions of this named the
    // rules they expected to fire — first `{THIN_TAG, UNUSED_TAG}`, then `{MISSING_LOCALE}` —
    // and both broke when the corpus improved, for reasons with nothing to do with rule
    // selection. Selection is a property of `runLint`, so it is testable without knowing
    // anything about what the content currently says.
    //
    // Every single-rule run must be a SUBSET of the full run, and the union of all of them must
    // be the whole of it. That is the entire contract, and it holds on a clean corpus and a
    // broken one alike.
    const full = runLint(CONTENT).issues;
    const signature = (i: LintIssue): string => `${i.rule}|${i.file}|${i.message}`;
    const everything = new Set(full.map(signature));

    const union = new Set<string>();
    for (const rule of RULES) {
      const subset = runLint(CONTENT, [rule.name]);
      expect(subset.ruleCount, `${rule.name} ran the wrong number of rules`).toBe(1);
      for (const issue of subset.issues) {
        expect(everything, `${rule.name} emitted an issue the full run did not`).toContain(
          signature(issue),
        );
        union.add(signature(issue));
      }
    }

    expect(union, 'the rules together do not account for the full run').toEqual(everything);
  });
});

describe('parseArgs', () => {
  it('accepts the documented forms', () => {
    expect(parseArgs([])).toEqual({ ok: true, options: { fix: false, only: [] } });
    expect(parseArgs(['--', '--fix'])).toEqual({ ok: true, options: { fix: true, only: [] } });
    expect(parseArgs(['--rules=references,safety'])).toEqual({
      ok: true,
      options: { fix: false, only: ['references', 'safety'] },
    });
  });

  it('refuses an unknown flag rather than ignoring it', () => {
    // A linter that silently skips the rule you asked for is worse than one that will not
    // start.
    expect(parseArgs(['--rulez=safety']).ok).toBe(false);
    expect(parseArgs(['--rules=not-a-rule']).ok).toBe(false);
    expect(parseArgs(['references']).ok).toBe(false);
  });

  it('names the known rules when a rule name is wrong', () => {
    const result = parseArgs(['--rules=nope']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('references');
  });
});

describe('the report', () => {
  it('is pasteable: path:line:col, severity, RULE, message', () => {
    const report = formatReport({
      eventCount: 1,
      ruleCount: 1,
      issues: [
        {
          file: 'events/border/bribe_attempt.yaml',
          line: 34,
          column: 7,
          severity: 'error',
          rule: 'UNDECLARED_FLAG',
          message: 'flag `x` is used but not declared',
        },
      ],
    });
    expect(report).toContain('events/border/bribe_attempt.yaml:34:7');
    expect(report).toContain('error');
    expect(report).toContain('UNDECLARED_FLAG');
    expect(report).toContain('1 error(s), 0 warning(s)');
  });

  it('says so plainly when there is nothing to report', () => {
    expect(formatReport({ eventCount: 9, ruleCount: 13, issues: [] })).toContain('No issues.');
  });

  it('sorts by location so two runs diff cleanly', () => {
    const sorted = sortIssues([
      { file: 'b.yaml', line: 1, column: 1, severity: 'warn', rule: 'B', message: 'b' },
      { file: 'a.yaml', line: 9, column: 1, severity: 'error', rule: 'A', message: 'a' },
      { file: 'a.yaml', line: 2, column: 1, severity: 'error', rule: 'A', message: 'a' },
    ]);
    expect(sorted.map((i) => `${i.file}:${String(i.line)}`)).toEqual([
      'a.yaml:2',
      'a.yaml:9',
      'b.yaml:1',
    ]);
  });

  it('counts severities separately, which is what the exit code turns on', () => {
    expect(countBySeverity(run.issues).errors).toBe(0);
    expect(countBySeverity(run.issues).warnings).toBeGreaterThan(0);
  });
});
