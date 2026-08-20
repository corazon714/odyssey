import {
  ATTACH_PERCENT,
  collectFlagUsage,
  RECENCY_WINDOW,
  type ContentPack,
  type EventId,
} from '@odyssey/engine';
import { ascending, percentile } from './percentile.ts';
import { type SimSummary } from './run-many.ts';

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

/**
 * The meters the trajectory table plots — a DISPLAY SUBSET, deliberately not all nine.
 *
 * Renamed off `RESOURCE_KEYS` because it shadowed the engine export of that name with a shorter
 * list, and a five-element array wearing the nine-element vocabulary's name is the same shape of
 * defect as the sign bug this file was edited alongside: a private copy of engine knowledge that
 * silently disagrees with it.
 *
 * `hunger` is here as of the recovery milestone's step 1. It was absent, which meant the report
 * could not plot the meter that drives the health drain — `world-tick.ts` charges health only
 * once hunger passes `HUNGER_HURTS`, so a run's whole starvation story was happening off-camera.
 * `heat`, `bank` and `reputation` stay out: they are decision inputs rather than survival meters,
 * and the table is already three columns wide per row.
 */
const TRAJECTORY_KEYS = ['cash', 'health', 'morale', 'energy', 'hunger', 'hygiene'] as const;

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
    // ADR 0029 D7 item 4: quiet and empty must stay DISTINGUISHABLE. They sit adjacent rather
    // than apart because that is what makes the distinction readable — the two lines above are
    // content gaps and want fixing, this one is the design working and wants leaving alone.
    // Sharing a target band with them would be the fold the fourth `SelectionResult` arm exists
    // to prevent, so it prints no target at all until M3.12b sets one.
    `Quiet legs (designed)      ${pct(summary.quietRate).padStart(6)}   (odds gate — designed silence, NOT the two gaps above)`,
    // The CEILING, printed as a ceiling. Decision 3's identity is realised quiet share =
    // (1 − P) × (1 − forcedFireShare), so this line alone decides whether a quiet-ratio target
    // is reachable at ANY base — and doing that arithmetic here means the next person to read
    // the report does not have to know the identity to see the bound.
    `Forced-fire legs           ${pct(summary.forcedFireShare).padStart(6)}   (beat slot or queue due — never gated; caps quiet at ${pct(1 - summary.forcedFireShare)})`,
    `Long-range payoff rate     ${pct(summary.payoffRate).padStart(6)}   (target 80%)`,
    `Beat fill rate             ${pct(summary.beatFillRate).padStart(6)}`,
    `Repeat-event rate          ${pct(repeatRate(usable)).padStart(6)}`,
    // THE LESS CONFOUNDED OF THE TWO — NOT AN UNCONFOUNDED ONE. Sharing units on both sides
    // removes the SCALING confound behind the line above (`unique` is pool-capped, `fired` is
    // not); it does NOT remove SEQUENCE COMPRESSION, which is what deleting draws actually is.
    // Measured null at a 30% quiet share, director untouched: corpus +7.6pp, fixture −5.7pp.
    // THE SIGN IS PACK-DEPENDENT, so M3.12b must subtract a null baseline before attributing
    // any movement here to the director. `draws/run` is printed beside it because it is the
    // scale of the compression, and because a line that already prints cannot gain text without
    // moving under `sim:diff`.
    `Near-repeat rate           ${pct(nearRepeatRate(usable)).padStart(6)}   (a redraw inside recency's own ${String(RECENCY_WINDOW)}-event window; ${drawsPerRun(usable).toFixed(2)} draws/run — LESS confounded than the line above, NOT unconfounded: subtract a null baseline before reading it)`,
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
  for (const key of TRAJECTORY_KEYS) {
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

/**
 * The two runs these read are narrowed to the one field they use, so a test can hand them
 * sequences without building a 35-field `SimRun` that would be 34 fields of noise.
 */
type FiredSequence = { readonly firedEvents: readonly EventId[] };

/**
 * Share of fired events that the same run had already seen — TRUE, AND LENGTH-SENSITIVE.
 *
 * `1 - unique/fired` over a whole run. It is not wrong: the player really was shown that share
 * of re-runs. But it is not comparable across a change that changes HOW MANY events a route
 * draws, and the quiet-leg gate is exactly such a change. `unique` is bounded by the pool (13
 * events on the corpus) while `fired` is not, so deleting draws raises `unique/fired` and the
 * rate falls with the director untouched. MEASURED by deleting fired events from real corpus
 * sequences and changing nothing else: 26.88 fired/run reads 67.5%, 17.64 fired/run reads 56.9%.
 *
 * IT IS KEPT, AND KEPT EXACTLY. Three reasons, in order. It is a true measurement and deleting
 * a true measurement to fix a reading problem is a worse trade. No redefinition can be both
 * unconfounded at a positive quiet share and arithmetically identical at `BASE_EVENT_ODDS =
 * 1:0` — the two properties are jointly unsatisfiable, so a replacement would have to move a
 * number the M3.12a fence exists to hold still. And the M3.12a precedent is that the report
 * GAINS lines rather than changing them, for the same reason.
 *
 * So `Near-repeat rate` sits under it as the BETTER of the two, and the ADR 0029 addendum
 * records that this line must not be read as a repetition signal across a base change.
 *
 * "Better" is the whole claim, and it was briefly overstated as "unconfounded" — see
 * `nearRepeatRate`. Both lines move under a quiet share with the director untouched; the one
 * below moves LESS and for a reason a null baseline can subtract.
 */
export function repeatRate(runs: readonly FiredSequence[]): number {
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

/**
 * Share of draws that redrew an event the director's own `recency` factor was still penalising.
 *
 * ## RETRACTION (M3.12a follow-up). THIS IS NOT AN UNCONFOUNDED METRIC
 *
 * It shipped advertised as one — "the quiet share cancels, so what is left is a property of the
 * DIRECTOR rather than of how often it was asked". **That is false, and it was measured false
 * with the director LITERALLY UNCHANGED**: deleting draws from real 1:0 sequences with a
 * non-periodic mask, at a 30% quiet share, over 2,000 runs and ten mask seeds —
 *
 * | pack    |    at 1:0 | compressed 30% |    null delta |
 * | ------- | --------: | -------------: | ------------: |
 * | corpus  | **25.99%** |     **33.57%** | **+7.6pp**    |
 * | fixture | **62.29%** |     **56.63%** | **−5.7pp**    |
 *
 * Comparable in magnitude to `repeatRate`'s confound (−9.1pp corpus, −6.9pp fixture on the same
 * sequences), and **THE SIGN IS PACK-DEPENDENT**.
 *
 * ## What it does and does not remove
 *
 * Denominating both sides in fired events removes the SCALING confound — `unique` is capped by
 * the pool while `fired` is not, which is what makes `repeatRate` fall mechanically. It does NOT
 * remove SEQUENCE COMPRESSION, and a quiet share is exactly a compression: deleting a draw pulls
 * the draws on either side of it closer together in window terms. That cuts two ways at once and
 * which one dominates depends on the baseline repeat density —
 *
 * - **sparse repeats (corpus, 13 events over 26.9 draws):** most repeat pairs sit OUTSIDE the
 *   5-draw window; compression pulls them IN and the rate RISES.
 * - **dense repeats (fixture, 62% of draws already near-repeats):** most pairs are already
 *   inside the window; deleting a member DESTROYS the pair and the rate FALLS.
 *
 * ## The requirement this puts on M3.12b
 *
 * **Subtract a null baseline before attributing any movement to the director.** Re-run this
 * compression against the 1:0 sequences at the realised quiet share, and read the residual. On
 * the corpus a rise of up to ~8pp at a 30% quiet share is the NULL EXPECTATION, not a finding.
 *
 * The transferable lesson, and why it is in the ADR: the same review that proved **no metric can
 * be both unconfounded at `q > 0` and arithmetically identical at 1:0** — the two properties are
 * jointly unsatisfiable, which is D1's reason for adding a line rather than fixing one — then
 * advertised the added line as unconfounded. An impossibility proof constrains the replacement
 * as much as the thing replaced.
 *
 * IT IS STILL KEPT AND STILL THE BETTER LINE: it moves less, it moves for a reason that is
 * measurable and subtractable, and `repeatRate`'s scaling confound is genuinely gone from it.
 *
 * The window is `RECENCY_WINDOW - 1` draws back, not `RECENCY_WINDOW`, and the off-by-one is
 * load-bearing rather than sloppy: `recency` returns 1 at `gap >= RECENCY_WINDOW` and `gap` is
 * inclusive of the current draw, so the penalty is still live for gaps 1 through
 * `RECENCY_WINDOW - 1`. Measuring one draw wider would count redraws the factor had already
 * forgiven and the number would stop meaning "the director overrode its own penalty".
 */
export function nearRepeatRate(runs: readonly FiredSequence[]): number {
  const window = RECENCY_WINDOW - 1;
  let near = 0;
  let total = 0;

  for (const run of runs) {
    const fired = run.firedEvents;
    for (let i = 0; i < fired.length; i += 1) {
      total += 1;
      const from = i - window < 0 ? 0 : i - window;
      for (let j = from; j < i; j += 1) {
        if (fired[j] === fired[i]) {
          near += 1;
          break;
        }
      }
    }
  }

  return total === 0 ? 0 : near / total;
}

/**
 * Draws per run — the confounder behind BOTH repetition lines, printed so it cannot hide.
 *
 * It was added as "the confounder behind `Repeat-event rate`". It is the confounder behind
 * `Near-repeat rate` too: a fall in draws/run is a compressed sequence, and compression moves
 * the near-repeat rate on its own (see `nearRepeatRate`). Read this figure BEFORE either rate —
 * it is the size of the null effect both of them carry.
 *
 * Over ALL runs rather than usable ones would divide by a different population than the rates
 * above it; the caller already passes the usable set.
 */
function drawsPerRun(runs: readonly FiredSequence[]): number {
  if (runs.length === 0) return 0;
  return runs.reduce((sum, run) => sum + run.firedEvents.length, 0) / runs.length;
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
