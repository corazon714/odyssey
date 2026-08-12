/**
 * Compare two sim reports line by line.
 *
 * Textual rather than structural, deliberately. A structural diff would need the report to be
 * a serialised object, and then the baseline stops being something a human reads in a pull
 * request — which is most of its value. The format is fixed (engine-spec §6), so a line-level
 * diff is stable, and the headline numbers all live on their own lines.
 *
 * The comparison ignores the two lines that legitimately change on every run — the wall clock
 * and its extrapolation — so a diff shows engine and content changes only.
 *
 * The HEADER is normalised rather than ignored. It used to be volatile in full, which meant a
 * changed `contentVersion` was invisible: the pack could move under the baseline and
 * `sim:diff` would still say "no change". That is the one thing on that line worth diffing —
 * it is the value `replayRun` refuses a mismatch on — so `seed=` and `runs=` are blanked and
 * the version is compared. Found in Phase 2A M2A.3, when a real version change reported clean.
 */
const VOLATILE = [/^Wall clock/, /^Extrapolated to 20,000/];

function normalise(line: string): string {
  return line.replace(/seed=\S+/, 'seed=*').replace(/runs=\d+/, 'runs=*');
}

/**
 * The run count a report was generated at, or null if the header does not say.
 *
 * **`normalise` blanks `runs=`, and that is exactly why a mismatched count was invisible.**
 * Blanking it is right for the diff itself — the count is not a balance property — but it hides
 * the one input that changes every sampled number underneath. Diffing a 2,000-run baseline
 * against a 5,000-run report showed endings moved ~0.7pp and the check count going 2,923 to
 * 7,325, with nothing anywhere saying the samples were different sizes. It read as a balance
 * regression and was bisected across twenty commits.
 *
 * So the count is checked BEFORE the diff and the comparison is refused, rather than being
 * folded into the diff where it would be one more line to overlook.
 */
export function runCountOf(report: string): number | null {
  const found = /\bruns=(\d+)/.exec(report)?.[1];
  return found === undefined ? null : Number(found);
}

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
    const a = normalise(before[i] ?? '');
    const b = normalise(after[i] ?? '');
    if (a === b) continue;
    if (VOLATILE.some((re) => re.test(a) || re.test(b))) continue;

    if (a !== '') lines.push(`- ${a}`);
    if (b !== '') lines.push(`+ ${b}`);
  }

  return { changed: lines.length > 0, lines };
}
