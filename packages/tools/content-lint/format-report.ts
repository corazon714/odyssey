import { countBySeverity, type LintIssue } from './issue.ts';
import { type LintRun } from './run-lint.ts';

/**
 * The report. Fixed-width and eslint-shaped so a line can be pasted straight back.
 *
 * Columns are padded to the widest entry rather than a constant, because a hard-coded width
 * truncates the moment content moves into a deeper directory — and a truncated path is not
 * something you can click.
 */
export function formatReport(run: LintRun): string {
  const { errors, warnings } = countBySeverity(run.issues);

  if (run.issues.length === 0) {
    return [
      `content:lint — ${String(run.eventCount)} events, ${String(run.ruleCount)} rules`,
      '',
      'No issues.',
      '',
    ].join('\n');
  }

  const locationWidth = Math.max(...run.issues.map((i) => location(i).length));
  const ruleWidth = Math.max(...run.issues.map((i) => i.rule.length));

  const lines = [
    `content:lint — ${String(run.eventCount)} events, ${String(run.ruleCount)} rules`,
    '',
  ];

  for (const found of run.issues) {
    lines.push(
      [
        pad(location(found), locationWidth),
        pad(found.severity, 5),
        pad(found.rule, ruleWidth),
        found.message,
      ].join('  '),
    );
  }

  lines.push('', `${String(errors)} error(s), ${String(warnings)} warning(s)`, '');
  return lines.join('\n');
}

export function location(found: LintIssue): string {
  return `${found.file}:${String(found.line)}:${String(found.column)}`;
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}
