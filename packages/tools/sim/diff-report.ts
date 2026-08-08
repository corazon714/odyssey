/**
 * Compare two sim reports line by line.
 *
 * Textual rather than structural, deliberately. A structural diff would need the report to be
 * a serialised object, and then the baseline stops being something a human reads in a pull
 * request — which is most of its value. The format is fixed (engine-spec §6), so a line-level
 * diff is stable, and the headline numbers all live on their own lines.
 *
 * The comparison ignores the two lines that legitimately change on every run — the wall clock
 * and the header's seed/run count — so a diff shows engine and content changes only.
 */
const VOLATILE = [/^Wall clock/, /^Extrapolated to 20,000/, /^# Sim Report/];

export type ReportDiff = {
  readonly changed: boolean;
  readonly lines: readonly string[];
};

/**
 * Drop a leading HTML comment block and any blank lines before the first heading.
 *
 * The committed baseline carries a header explaining how to regenerate it — which is worth
 * having, and which offsets every line against a freshly generated report. A line-index diff
 * cannot absorb that, so the header comes off both sides first. Caught by the diff reporting
 * a change when nothing had changed.
 */
function stripHeader(report: string): string[] {
  const lines = report.split('\n');
  let start = 0;

  if (lines[0]?.trimStart().startsWith('<!--') === true) {
    const end = lines.findIndex((line) => line.includes('-->'));
    if (end >= 0) start = end + 1;
  }
  while (lines[start]?.trim() === '') start += 1;

  return lines.slice(start);
}

export function diffReports(baseline: string, latest: string): ReportDiff {
  const before = stripHeader(baseline);
  const after = stripHeader(latest);
  const lines: string[] = [];
  const length = Math.max(before.length, after.length);

  for (let i = 0; i < length; i += 1) {
    const a = before[i] ?? '';
    const b = after[i] ?? '';
    if (a === b) continue;
    if (VOLATILE.some((re) => re.test(a) || re.test(b))) continue;

    if (a !== '') lines.push(`- ${a}`);
    if (b !== '') lines.push(`+ ${b}`);
  }

  return { changed: lines.length > 0, lines };
}
