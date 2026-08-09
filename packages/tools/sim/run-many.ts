import { type ContentPack, type EventId } from '@odyssey/engine';
import { type FixtureScenario } from './load-pack.ts';
import { type PackName } from './parse-args.ts';
import { POLICY_NAMES, type PolicyName } from './policy.ts';
import { runOne, type SimRun } from './run-one.ts';

export type SimOptions = {
  readonly runs: number;
  readonly seed: string;
  readonly policies: readonly PolicyName[];
  readonly diff: boolean;
  readonly json: boolean;
  readonly pack: PackName;
};

export type SimSummary = {
  readonly runs: readonly SimRun[];
  readonly completionRate: number;
  readonly medianLegs: number;
  readonly medianDays: number;
  readonly uneventfulRate: number;
  readonly fallbackRate: number;
  readonly neverFired: readonly EventId[];
  readonly scheduled: number;
  readonly queueFires: number;
  readonly payoffRate: number;
  readonly errors: readonly string[];
  readonly turnCapHits: number;
  readonly unresolvedThreads: number;
  readonly queueDrops: number;
  readonly beatsFilled: number;
  /** Share of presented legs that got a complication. Measures ATTACH_PERCENT against play. */
  readonly complicationRate: number;
  readonly meanChipsPerCheck: number;
  readonly checksRolled: number;
  readonly checksUnderTwoChips: number;
  readonly universalOfferRate: number;
  readonly universalPickRate: number;
  readonly beatsExpired: number;
  readonly beatFillRate: number;
  readonly unfillableBeatTypes: readonly string[];
};

/**
 * Run the corpus, spreading seeds across routes and policies.
 *
 * Seeds are derived from a base string rather than drawn, so `--seed base --runs 1000` is the
 * same thousand runs on any machine. That is what makes a sim DIFF meaningful: a change in
 * the numbers is a change in the engine or the content, never in the sampling.
 */
export function runMany(
  pack: ContentPack,
  scenarios: readonly FixtureScenario[],
  opts: SimOptions,
): SimSummary {
  const results: SimRun[] = [];
  const policies = opts.policies.length > 0 ? opts.policies : POLICY_NAMES;

  for (let i = 0; i < opts.runs; i += 1) {
    const scenario = scenarios[i % scenarios.length];
    const policy = policies[i % policies.length];
    if (scenario === undefined || policy === undefined) continue;
    results.push(runOne(`${opts.seed}:${String(i)}`, scenario, pack, policy));
  }

  return summarise(results, pack);
}

export function summarise(runs: readonly SimRun[], pack: ContentPack): SimSummary {
  const usable = runs.filter((r) => r.error === null);
  const fired = new Set<EventId>();
  for (const run of usable) for (const id of run.firedEvents) fired.add(id);

  const totalLegs = usable.reduce((sum, r) => sum + Math.max(1, r.legs), 0);
  const uneventful = usable.reduce((sum, r) => sum + r.uneventfulLegs, 0);
  const fallback = usable.reduce((sum, r) => sum + r.fallbackLegs, 0);
  const scheduled = usable.reduce((sum, r) => sum + r.scheduled, 0);
  const queueFires = usable.reduce((sum, r) => sum + r.queueFires, 0);
  const filled = usable.reduce((sum, r) => sum + r.beatsFilled, 0);
  const expiredBeats = usable.reduce((sum, r) => sum + r.beatsExpired, 0);
  const complicated = usable.reduce((sum, r) => sum + r.complicatedLegs, 0);
  const checksRolled = usable.reduce((sum, r) => sum + r.checksRolled, 0);
  const chipsTotal = usable.reduce((sum, r) => sum + r.chipsTotal, 0);
  const choicesOffered = usable.reduce((sum, r) => sum + r.choicesOffered, 0);
  const universalOffered = usable.reduce((sum, r) => sum + r.universalOffered, 0);
  const picks = usable.reduce((sum, r) => sum + r.picks, 0);
  const universalPicked = usable.reduce((sum, r) => sum + r.universalPicked, 0);

  return {
    runs,
    completionRate: rate(usable.filter((r) => r.completed).length, usable.length),
    medianLegs: median(usable.map((r) => r.legs)),
    medianDays: median(usable.map((r) => r.days)),
    uneventfulRate: rate(uneventful, totalLegs),
    fallbackRate: rate(fallback, totalLegs),
    neverFired: pack.events.map((e) => e.id).filter((id) => !fired.has(id)),
    scheduled,
    queueFires,
    payoffRate: rate(queueFires, scheduled),
    errors: [...new Set(runs.filter((r) => r.error !== null).map((r) => r.error ?? ''))],
    turnCapHits: runs.filter((r) => r.turnCapHit).length,
    unresolvedThreads: usable.reduce((sum, r) => sum + r.unresolvedThreads, 0),
    queueDrops: usable.reduce((sum, r) => sum + r.queueDrops, 0),
    beatsFilled: filled,
    beatsExpired: expiredBeats,
    beatFillRate: rate(filled, filled + expiredBeats),
    complicationRate: rate(complicated, totalLegs - uneventful),
    meanChipsPerCheck: checksRolled === 0 ? 0 : chipsTotal / checksRolled,
    checksRolled,
    checksUnderTwoChips: usable.reduce((sum, r) => sum + r.checksUnderTwoChips, 0),
    universalOfferRate: rate(universalOffered, choicesOffered),
    universalPickRate: rate(universalPicked, picks),
    unfillableBeatTypes: pack.unfillableBeatTypes,
  };
}

function rate(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

/** Integer-indexed, so no float arithmetic decides a reported statistic. */
function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}
