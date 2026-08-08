/**
 * One finding, and the format it prints in.
 *
 * The format is `path:line:col  severity  RULE  message` — deliberately eslint-shaped, so it
 * is greppable, pasteable straight back into a conversation, and clickable in an editor. A
 * linter whose output has to be re-read to be understood does not get used.
 *
 * SEVERITY IS A DECISION, not a mood. `error` means the content is wrong and CI fails;
 * `warn` means a human should look. Rules that can produce false positives — the §11 safety
 * patterns above all — are warnings, because a rule that cries wolf gets silenced, and a
 * silenced §11 check is worse than none.
 */
export type Severity = 'error' | 'warn';

export type LintIssue = {
  /** Repo-relative, forward slashes on every platform, so reports diff across machines. */
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly severity: Severity;
  /** SCREAMING_SNAKE rule id. Stable — people grep and suppress by these. */
  readonly rule: string;
  readonly message: string;
};

export function issue(
  severity: Severity,
  rule: string,
  file: string,
  message: string,
  line = 1,
  column = 1,
): LintIssue {
  return { file, line, column, severity, rule, message };
}

export const error = (
  rule: string,
  file: string,
  message: string,
  line = 1,
  column = 1,
): LintIssue => issue('error', rule, file, message, line, column);

export const warn = (
  rule: string,
  file: string,
  message: string,
  line = 1,
  column = 1,
): LintIssue => issue('warn', rule, file, message, line, column);

export function countBySeverity(issues: readonly LintIssue[]): {
  readonly errors: number;
  readonly warnings: number;
} {
  let errors = 0;
  let warnings = 0;
  for (const found of issues) {
    if (found.severity === 'error') errors += 1;
    else warnings += 1;
  }
  return { errors, warnings };
}

/**
 * Sorted by location, so two runs over the same content print identically and a diff of two
 * reports is meaningful. `<` on strings, never `localeCompare` (ADR 0005 §3).
 */
export function sortIssues(issues: readonly LintIssue[]): readonly LintIssue[] {
  return [...issues].sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    if (a.line !== b.line) return a.line - b.line;
    if (a.column !== b.column) return a.column - b.column;
    if (a.rule !== b.rule) return a.rule < b.rule ? -1 : 1;
    return a.message < b.message ? -1 : 1;
  });
}
