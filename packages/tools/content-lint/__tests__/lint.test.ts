import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { countBySeverity, sortIssues, type LintIssue } from '../issue.ts';
import { formatReport } from '../format-report.ts';
import { parseArgs } from '../parse-args.ts';
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

  it('still REPORTS the known fixture gaps rather than being silent', () => {
    // The warnings are the honest state of a nine-event fixture with no locale and no image
    // manifest. If they ever vanish, either the corpus grew or a rule stopped working, and
    // both deserve a look.
    const rules = new Set(run.issues.map((i) => i.rule));
    expect(rules).toContain('MISSING_LOCALE');
    expect(rules).toContain('MISSING_IMAGE_MANIFEST');
    // ADR 0017 named this gap; the linter finds it independently.
    expect(rules).toContain('UNUSED_TAG');
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
    const subset = runLint(CONTENT, ['tag-coverage']);
    expect(subset.ruleCount).toBe(1);
    expect(new Set(subset.issues.map((i) => i.rule))).toEqual(new Set(['THIN_TAG', 'UNUSED_TAG']));
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
