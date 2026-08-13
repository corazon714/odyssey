import { ATTACH_PERCENT, collectFlagUsage, type ContentPack } from '@odyssey/engine';
import { ascending, percentile } from './percentile.ts';
import { type SimSummary } from './run-many.ts';
import { type SimRun } from './run-one.ts';

/**
 * The engine-spec §6 report, in the shape the spec specifies.
 *
 * The spec calls the format itself a spec, and it is right to: "produce a good report" is an
 * instruction nobody can check, while a fixed layout makes `pnpm sim:diff` a mechanical
 * comparison rather than a reading exercise.
 *
 * Every line here is chosen to make a specific class of failure visible. The never-fired list
 * and the scheduled-but-never-fired count are ADR 0001's only instruments for content bugs
 * that produce no error. The choices-picked-under-2% list finds traps and invisible options.
 * The flag analysis finds gates that can never open.
 */
const CHECKPOINT_LEGS = [5, 15, 25] as const;
const RESOURCE_KEYS = ['cash', 'health', 'morale', 'energy', 'hygiene'] as const;

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

export type ReportMeta = {
  readonly seed: string;
  readonly runs: number;
  readonly elapsedMs: number;
};

export function formatReport(summary: SimSummary, pack: ContentPack, meta: ReportMeta): string {
  const usable = summary.runs.filter((r) => r.error === null);
  const lines: string[] = [];

  /**
   * **A target only means something against a pack that could meet it.**
   *
   * These two lines used to print "target 3-7" and "each one draws nothing the registry exists
   * for" unconditionally. On `--pack=fixture` that reads as a standing failure — 0.2 against a
   * band of 3-7, with every one of 2,923 checks flagged as starved — and it is not one. The
   * fixture pack carries `registries.modifiers: []` ON PURPOSE: it is the empty-registry control
   * the golden runs are built on (`load-pack.ts` says so at length), and it has four checks and
   * four choice-local modifiers between them. It cannot reach 3-7 without ceasing to be the
   * control, so the only thing that number could ever prompt is a wasted investigation. It
   * prompted one.
   *
   * The corpus, with 137 rows, reads 6.7 and zero starved checks. That is the measurement this
   * target exists for, and it still prints exactly as before.
   */
  const hasRegistry = pack.modifiers.length > 0;

  lines.push(
    `# Sim Report — seed=${meta.seed} contentVersion=${pack.version.slice(0, 8)} runs=${String(meta.runs)}`,
    '',
    coverageLine(summary.coverage),
    `Completion rate            ${pct(summary.completionRate).padStart(6)}   (target band 30-50%)`,
    `Median legs                ${String(summary.medianLegs).padStart(6)}`,
    `Median in-game days        ${String(summary.medianDays).padStart(6)}`,
    `Never-fired events         ${String(summary.neverFired.length).padStart(6)}`,
    `Empty-pool fallbacks       ${pct(summary.fallbackRate).padStart(6)}   (target <2%)`,
    `Uneventful legs            ${pct(summary.uneventfulRate).padStart(6)}   (target <2%)`,
    `Long-range payoff rate     ${pct(summary.payoffRate).padStart(6)}   (target 80%)`,
    `Beat fill rate             ${pct(summary.beatFillRate).padStart(6)}`,
    `Repeat-event rate          ${pct(repeatRate(usable)).padStart(6)}`,
    `Complication rate          ${pct(summary.complicationRate).padStart(6)}   (target ${String(ATTACH_PERCENT)}%)`,
    `Modifier chips / check     ${summary.meanChipsPerCheck.toFixed(1).padStart(6)}   ${
      hasRegistry
        ? `(target 3-7, over ${String(summary.checksRolled)} checks)`
        : `(over ${String(summary.checksRolled)} checks; NO modifier registry in this pack)`
    }`,
    `Checks under 2 chips       ${String(summary.checksUnderTwoChips).padStart(6)}   ${
      hasRegistry
        ? '(each one draws nothing the registry exists for)'
        : '(expected — there is no registry here, so this is not a finding)'
    }`,
    // The MEAN alone cannot tell "everything crept up" from "a few late checks pull fifteen",
    // and those want opposite fixes — a band recalibration versus a tail. Pillar 2 is what the
    // band is for: a result screen the player cannot reconstruct is the failure, so the worst
    // check matters more than the average one.
    `Checks over 7 chips        ${String(summary.checksOverBand).padStart(6)}   ${
      hasRegistry
        ? `(${pct(summary.checksRolled === 0 ? 0 : summary.checksOverBand / summary.checksRolled)} of checks; worst pulls ${String(summary.maxChips)})`
        : '(no registry in this pack)'
    }`,
    `Universal choices offered  ${pct(summary.universalOfferRate).padStart(6)}   (share of choices shown)`,
    `Universal choices picked   ${pct(summary.universalPickRate).padStart(6)}   (over ~30% means they are flattening the corpus)`,
    `Unresolved threads         ${String(summary.unresolvedThreads).padStart(6)}`,
    '',
    `Wall clock                 ${String(meta.elapsedMs)} ms   (${(meta.elapsedMs / meta.runs).toFixed(2)} ms/run)`,
    `Extrapolated to 20,000     ${(((meta.elapsedMs / meta.runs) * 20000) / 1000).toFixed(1)} s   (target <30 s)`,
  );

  lines.push('', '## Endings');
  const endings = tally(usable.flatMap((r) => r.endings));
  const endingTotal = [...endings.values()].reduce((a, b) => a + b, 0);
  if (endings.size === 0) lines.push('  (none)');
  for (const [id, count] of sortedByCount(endings)) {
    lines.push(`  ${pad(id, 34)} ${pct(count / endingTotal).padStart(6)}`);
  }

  lines.push('', '## Never-fired events');
  if (summary.neverFired.length === 0) lines.push('  (none)');
  for (const id of summary.neverFired) {
    const scheduled = summary.scheduled > 0 ? ` scheduled ${String(summary.scheduled)}x` : '';
    lines.push(`  ${pad(id, 34)} never fired${scheduled}`);
  }

  lines.push('', '## Choices picked <2%');
  const picks = tally(usable.flatMap((r) => r.choicesPicked));
  const pickTotal = [...picks.values()].reduce((a, b) => a + b, 0);
  const rare = allChoiceKeys(pack)
    .map((key) => ({ key, share: pickTotal === 0 ? 0 : (picks.get(key) ?? 0) / pickTotal }))
    .filter((entry) => entry.share < 0.02)
    .sort((a, b) => a.share - b.share);
  if (rare.length === 0) lines.push('  (none)');
  for (const entry of rare) {
    lines.push(
      `  ${pad(entry.key, 50)} ${pct(entry.share).padStart(6)}${entry.share === 0 ? '   <- never picked' : ''}`,
    );
  }

  lines.push('', '## Flags');
  const flags = collectFlagUsage(pack.events);
  lines.push(
    `  written: ${String(flags.written.length)}   read: ${String(flags.read.length)}`,
    `  written but NEVER READ:   ${flags.writtenNeverRead.join(', ') || '(none)'}`,
    `  read but NEVER WRITTEN:   ${flags.readNeverWritten.join(', ') || '(none)'}   <- gate can never open`,
  );

  lines.push('', '## Resource trajectories (p10/p50/p90 by leg)');
  for (const key of RESOURCE_KEYS) {
    const cells = CHECKPOINT_LEGS.map((leg) => {
      const values = ascending(
        usable.flatMap((r) => r.checkpoints.filter((c) => c.leg === leg).map((c) => c[key])),
      );
      if (values.length === 0) return `leg${String(leg)}: —`;
      return `leg${String(leg)}: ${String(percentile(values, 10))}/${String(percentile(values, 50))}/${String(percentile(values, 90))}`;
    });
    lines.push(`  ${pad(key, 8)} ${cells.join('   ')}`);
  }

  if (pack.unfillableBeatTypes.length > 0) {
    lines.push(
      '',
      '## Beat types no event can fill',
      '  A slot for one of these can only expire, so the fill rate above is bounded below 100%.',
    );
    for (const type of pack.unfillableBeatTypes) lines.push(`  ${type}`);
  }

  if (pack.danglingRefs.length > 0) {
    lines.push('', '## Dangling content references');
    for (const ref of pack.danglingRefs) lines.push(`  ${ref.kind} ${ref.id} in ${ref.inEvent}`);
  }

  if (summary.errors.length > 0) {
    lines.push('', '## Errors');
    for (const error of summary.errors) lines.push(`  ${error}`);
  }

  return lines.join('\n');
}

/**
 * THE SAMPLE, printed before the first rate that is computed over it.
 *
 * Until M3.11g this file contained the string "route" zero times. Two pairing bugs in a row
 * therefore ran, shipped and were argued from with nothing in the artifact people read saying
 * which part of the space had been measured: the old stride reported an average over 25 of 125
 * cells, and the odometer that replaced it reported an average over the 20 SHORTEST of 25 routes
 * at the documented default run count. Both reports looked healthy. That is the same failure the
 * pairing itself had — a collapsed space with a confident number on top of it — so the fix is not
 * only a better stride, it is a report that cannot hide the next one.
 *
 * `cells` short of the grid is ordinary: `--runs` stopped mid-grid and every cell it did reach is
 * still weighted fairly. A MARGINAL short of its total is the finding, because a route or a
 * policy that never ran is a hole in the average rather than a smaller sample of it.
 */
function coverageLine(coverage: SimSummary['coverage']): string {
  const missingRoutes = coverage.routesAvailable - coverage.routes;
  const missingPolicies = coverage.policiesAvailable - coverage.policies;
  // Singular matters here because the one-short case is the COMMON one — a grid is usually
  // missing its last cell, not half its axis — and "1 routes NEVER RUN" in the line whose whole
  // job is to be read carefully reads as a bug in the harness rather than a finding about it.
  // Both forms are passed rather than derived: appending "s" gives "policys", which the
  // regression test caught on its first run. English pluralisation is not a one-liner and this
  // is not the file to attempt one in.
  const count = (n: number, one: string, many: string): string =>
    `${String(n)} ${n === 1 ? one : many}`;
  const gaps = [
    missingRoutes > 0 ? count(missingRoutes, 'route', 'routes') : null,
    missingPolicies > 0 ? count(missingPolicies, 'policy', 'policies') : null,
  ].filter((gap) => gap !== null);

  const warning = gaps.length === 0 ? '' : `   <- ${gaps.join(' and ')} NEVER RUN`;
  const grid =
    `(of ${String(coverage.cellsAvailable)} — ` +
    `${String(coverage.routes)}/${String(coverage.routesAvailable)} routes ` +
    `x ${String(coverage.policies)}/${String(coverage.policiesAvailable)} policies)`;

  return `${pad('Grid cells sampled', 27)}${String(coverage.cells).padStart(6)}   ${grid}${warning}`;
}

/** Share of fired events that the same run had already seen — the repetition signal. */
function repeatRate(runs: readonly SimRun[]): number {
  let repeats = 0;
  let total = 0;
  for (const run of runs) {
    const seen = new Set<string>();
    for (const id of run.firedEvents) {
      total += 1;
      if (seen.has(id)) repeats += 1;
      seen.add(id);
    }
  }
  return total === 0 ? 0 : repeats / total;
}

function tally(items: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return counts;
}

/** Descending by count, then by key — `<` on strings, never localeCompare. */
function sortedByCount(counts: ReadonlyMap<string, number>): [string, number][] {
  return [...counts].sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0] < b[0] ? -1 : 1));
}

function allChoiceKeys(pack: ContentPack): string[] {
  const keys: string[] = [];
  for (const event of pack.events) {
    for (const choice of event.choices) keys.push(`${event.id}/${choice.id}`);
  }
  return keys;
}
