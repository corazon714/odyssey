import {
  advanceLeg,
  createRng,
  createRngCursors,
  createRunInit,
  createRunState,
  dueBeatSlot,
  moodFromState,
  resolveChoice,
  stateDigest,
  unresolvedThreads,
  type ContentPack,
  type EndingId,
  type EventId,
  type MoodId,
  type RouteState,
} from '@odyssey/engine';
import { type FixtureScenario } from './load-pack.ts';
import { UNIVERSAL_CHOICE_PREFIX } from '@odyssey/engine';
import { POLICIES, selectableChoices, type PolicyName } from './policy.ts';

/**
 * One complete run, start to ending.
 *
 * Hard-capped at `MAX_TURNS`. A cap is not paranoia: the loop is the one place where a
 * director bug can produce a run that never advances, and a 20,000-run sim that hangs on run
 * 4,000 tells you nothing about the other 16,000. Hitting the cap is REPORTED, so it reads as
 * a finding rather than as a slow sim.
 */
const MAX_TURNS = 500;

export type SimRun = {
  readonly seed: string;
  readonly routeId: string;
  readonly policy: PolicyName;
  readonly completed: boolean;
  /**
   * Did morale ever reach its floor of 0 during this run?
   *
   * The second of the three parts `docs/phase-3-closeout.md` requires of any montage fix, and
   * it is not a nice-to-have: ADR 0044 identified morale as the BINDING meter, and the
   * morale-floor share tracked every intervention cleanly where completion alone did not. Two
   * permutations reached statistically identical completion (9.32% and 8.64%, 1.7 SE apart)
   * through failure mixes of 35.9% and 51.3% on this number.
   *
   * A RUN-LEVEL flag, not a leg count. The question the criterion asks is what share of the
   * POPULATION floors, so a run that sits at 0 for thirty legs must count once, exactly as a
   * run that touches 0 and recovers does.
   *
   * Sampled after every state change rather than at the `CHECKPOINT_LEGS` snapshots: those are
   * legs 5, 15 and 25, and a run that floors on leg 14 and recovers by 15 is invisible to them.
   */
  readonly moraleFloored: boolean;
  /**
   * Legs spent in each mood — the fold `docs/phase-3-closeout.md` §6 asks for by implication.
   *
   * Its §6 argues that mood calibration depends on the state distribution: "today, on long routes,
   * energy floors by leg 5 and morale sits at 0 for most of the run — so the 'exhausted'
   * presentation would be very nearly always-on." **That is a measurable claim, and this is the
   * measurement.** It is also why `moodFromState` lives in the engine rather than in
   * `apps/mobile/`: a derivation inside a React component cannot be folded over a corpus.
   *
   * Sampled once per leg, immediately after `advanceLeg` — the state the leg's event is presented
   * against. NOT after `resolveChoice` as well: a choice can move the mood within a leg, so
   * sampling twice would count one leg as two and put this denominator out of step with every
   * other per-leg rate in this file.
   */
  readonly moodLegs: Readonly<Record<MoodId, number>>;
  /**
   * The mood the run ENDED in — the ending screen, one sample per run.
   *
   * Carried separately because `triumphant` is reachable ONLY at `status === 'ended'`, so a
   * per-leg fold reports it at ~0% and makes the palette look dead when it is merely terminal.
   * Two different screens, two different denominators.
   */
  readonly finalMood: MoodId;
  readonly legs: number;
  readonly days: number;
  readonly endings: readonly EndingId[];
  readonly firedEvents: readonly EventId[];
  /**
   * Legs on which the director actually produced a selection — THE GATE-DECISION POPULATION.
   *
   * **`legs` is not this number, and the difference is not cosmetic.** `legs` is
   * `state.route.legIndex`, a final INDEX, while `quietLegs`, `forcedFireLegs` and
   * `uneventfulLegs` are all counted once per selection. The two agree on the ordinary run,
   * which is why the gap survived review: the run normally ends on an `advanceLeg` that returns
   * `selection === null` (arrival or a failure verdict), so the last leg index is reached and
   * contributes no selection, and `selections === legs`.
   *
   * They disagree when the run ends inside `resolveChoice` — a choice whose effects cross a
   * failure threshold, or unlock a terminal ending. That leg WAS selected on, the loop then
   * exits without another `advanceLeg`, and `selections === legs + 1`. MEASURED at 2,000 runs:
   * 20 of 2,000 fixture runs and 315 of 2,000 corpus runs, i.e. a 0.06% / 0.59% error in any
   * rate that divides a per-selection count by `legs`.
   *
   * A run that ends before its first selection (legs 0, immediate arrival or failure) has zero
   * of these, correctly: it made no gate decision at all. `summarise`'s `Math.max(1, legs)` term
   * would score it as one leg.
   */
  readonly selections: number;
  readonly uneventfulLegs: number;
  readonly fallbackLegs: number;
  /**
   * Legs the quiet-leg gate silenced (ADR 0029 D4). DESIGNED silence, and its own counter
   * rather than a fold into `uneventfulLegs`: `uneventful` is the relaxation ladder coming up
   * empty, which is a CONTENT GAP, and the `Empty-pool fallbacks` / `Uneventful legs` pair is
   * the only instrument in the report that can see one. At a 30% quiet share, folding them
   * would bury a starvation signal under a number six times its size.
   *
   * It is also the term that makes three denominators honest again — see `summarise`.
   */
  readonly quietLegs: number;
  /**
   * Legs the gate never saw: a due beat slot or a due queue entry forces a fire (ADR 0029 D3).
   *
   * The realised quiet share is `(1 − P) × (1 − forcedFireShare)`, not `(1 − P)`, so this
   * number BOUNDS what any `BASE_EVENT_ODDS` can ever produce. Decision 3 estimated it from
   * the ADR 0027 schedule rather than measuring it; measuring it is a deliverable of M3.12a
   * precisely because every quiet-ratio target in Decision 7 is set against it.
   */
  readonly forcedFireLegs: number;
  readonly queueFires: number;
  /** Legs where the director attached a complication. Measures ATTACH_PERCENT against reality. */
  readonly complicatedLegs: number;
  /**
   * Modifier-pipeline instrumentation. `chipsTotal / checksRolled` is the number
   * 08-DIVERSITY-SYSTEMS D1 is actually about: "a typical check should pull 3-7". A check
   * pulling under two is drawing nothing the registry exists to provide, and it is invisible
   * without counting — the roll still happens and the report still looks healthy.
   *
   * Counted over `resolution.chips` (the collapsed render list) since M3.11, not over
   * `resolution.modifiers` (the audit trail). The band is a budget on the SCREEN.
   */
  readonly checksRolled: number;
  readonly chipsTotal: number;
  readonly checksUnderTwoChips: number;
  /** Checks pulling more chips than the 3-7 legibility band allows, and the worst one. */
  readonly checksOverBand: number;
  readonly maxChips: number;
  /**
   * Universal choices, offered vs taken. BOTH, because either alone misleads: a row offered
   * everywhere and never picked is clutter, and a row picked far more often than it is offered
   * is too strong and is flattening the hand-authored content it sits beside.
   */
  readonly choicesOffered: number;
  readonly universalOffered: number;
  readonly picks: number;
  readonly universalPicked: number;
  readonly scheduled: number;
  readonly noOutcomeChoices: number;
  readonly clamps: number;
  readonly unresolvedThreads: number;
  readonly queueDrops: number;
  readonly beatsFilled: number;
  readonly beatsExpired: number;
  /** `eventId/choiceId` for every decision taken — the input to the choices-picked report. */
  readonly choicesPicked: readonly string[];
  /** Resource snapshots at the legs engine-spec 6 asks for. */
  readonly checkpoints: readonly {
    readonly leg: number;
    readonly cash: number;
    readonly health: number;
    readonly morale: number;
    readonly energy: number;
    readonly hunger: number;
    readonly hygiene: number;
  }[];
  readonly turnCapHit: boolean;
  readonly error: string | null;
  readonly digest: string;
};

export function runOne(
  seed: string,
  scenario: FixtureScenario,
  pack: ContentPack,
  policyName: PolicyName,
): SimRun {
  const route = scenario.route;
  const policy = POLICIES[policyName];
  // A separate generator: the player's decisions are an INPUT to the run, not part of its
  // world state. Sharing the engine's cursors would break (seed, choiceSequence) replay.
  const policyRng = createRng(`${seed}:policy`, createRngCursors());

  const created = createRunState({
    ...createRunInit(seed, pack.version, route),
    transport: scenario.transport,
    resources: scenario.resources,
    startHour: scenario.startHour,
    weather: scenario.weather,
  });
  if (!created.ok) {
    return blank(seed, route, policyName, `route rejected: ${created.error.code}`);
  }

  let state = created.state;
  // `morale` is clamped at a minimum of 0 by `clampResources`, so `<= 0` and `=== 0` are the
  // same test; `<=` is written because it stays correct if that bound ever moves.
  let moraleFloored = state.resources.morale <= 0;
  // A plain object rather than a Map: it stays JSON-shaped like the rest of `SimRun`, and ten
  // integer keys is small beside the `firedEvents` and `choicesPicked` arrays already carried.
  const moodLegs = {} as Record<MoodId, number>;
  const firedEvents: EventId[] = [];
  let selections = 0;
  let uneventfulLegs = 0;
  let fallbackLegs = 0;
  let quietLegs = 0;
  let forcedFireLegs = 0;
  let queueFires = 0;
  let complicatedLegs = 0;
  let checksRolled = 0;
  let chipsTotal = 0;
  let checksUnderTwoChips = 0;
  let checksOverBand = 0;
  let maxChips = 0;
  let choicesOffered = 0;
  let universalOffered = 0;
  let picks = 0;
  let universalPicked = 0;
  let scheduled = 0;
  let noOutcomeChoices = 0;
  let clamps = created.clamps.length;
  let queueDrops = 0;
  let beatsFilled = 0;
  let beatsExpired = 0;
  const choicesPicked: string[] = [];
  const checkpoints: {
    leg: number;
    cash: number;
    health: number;
    morale: number;
    energy: number;
    hunger: number;
    hygiene: number;
  }[] = [];
  const CHECKPOINT_LEGS = new Set([5, 15, 25]);
  let turns = 0;

  while (state.status !== 'ended' && turns < MAX_TURNS) {
    turns += 1;

    // Captured BEFORE the call. `advanceLeg` rewrites `beatSchedule` on its way out, and the
    // forced-fire reconstruction below needs the schedule the GATE saw, not the one the leg
    // left behind. Cheap: a `RouteState` is deeply readonly, so this is an alias, not a copy.
    const routeBefore: RouteState = state.route;

    const advanced = advanceLeg(state, pack);
    if (!advanced.ok) return blank(seed, route, policyName, `advanceLeg: ${advanced.error.code}`);
    state = advanced.state;
    if (state.resources.morale <= 0) moraleFloored = true;
    const mood = moodFromState(state);
    moodLegs[mood] = (moodLegs[mood] ?? 0) + 1;
    queueDrops += advanced.queueDrops.length;
    beatsFilled += advanced.beatsFilled;
    beatsExpired += advanced.beatsExpired;

    if (CHECKPOINT_LEGS.has(state.route.legIndex)) {
      checkpoints.push({
        leg: state.route.legIndex,
        cash: state.resources.cash,
        health: state.resources.health,
        morale: state.resources.morale,
        energy: state.resources.energy,
        hunger: state.resources.hunger,
        hygiene: state.resources.hygiene,
      });
    }

    const selection = advanced.selection;
    // A null selection is a leg that ENDED the run — arrival or a failure verdict, both checked
    // before the gate. It never reached the gate, so it is neither forced nor gateable and is
    // counted in neither instrument below.
    if (selection === null) continue;

    // Counted HERE — after the null guard and before either instrument below — so it is the
    // exact population `forcedFireLegs` and `quietLegs` partition, by construction rather than
    // by an argument that has to stay true as this loop changes.
    selections += 1;

    // FORCED FIRE, RECONSTRUCTED FROM OUTSIDE THE LOOP (ADR 0029 D3).
    //
    // `advanceLeg` does not report it, and adding a field to `AdvanceLegResult` is an engine
    // change this milestone does not get to make. Both halves of its disjunction are visible
    // from here, exactly:
    //
    //   BEAT — `dueBeatSlot` reads `route.beatSchedule` and the leg index and nothing else, and
    //   nothing mutates the schedule between the caller's state and the gate (`advanceBeatSchedule`
    //   runs AFTER selection). So the pre-call route with the post-call leg index is the same
    //   input the gate was handed.
    //
    //   QUEUE — `due.length > 0` iff `selection.fromQueue`: `choose` tries the queue first and
    //   `rng.pick` returns null only on an empty array, so a non-empty `due` always yields a
    //   queue fire. Reading the outcome is cheaper than rebuilding a predicate context here and
    //   it cannot disagree with what actually happened.
    //
    // Still exact once M3.12b sets a real base: a quiet leg is by definition NOT forced, so its
    // `due` was empty and the `fromQueue` this cannot read is a false already known.
    const legIndex = state.route.legIndex;
    const forced =
      dueBeatSlot(routeBefore, legIndex) !== null ||
      (selection.kind === 'event' && selection.fromQueue);
    if (forced) forcedFireLegs += 1;

    // `quiet` (ADR 0029 D4) is DESIGNED silence and is deliberately NOT counted as uneventful:
    // folding it in destroys the one instrument that can see a content gap.
    if (selection.kind !== 'event') {
      if (selection.kind === 'uneventful') uneventfulLegs += 1;
      if (selection.kind === 'quiet') quietLegs += 1;
      continue;
    }

    if (selection.rung > 0) fallbackLegs += 1;
    if (selection.fromQueue) queueFires += 1;
    if (selection.complication !== null) complicatedLegs += 1;
    firedEvents.push(selection.event.id);

    const choices = selectableChoices(selection.event, state, pack, selection.complication);
    const choice = policy.choose(choices, state, policyRng);
    if (choice === null) {
      // Every event must offer at least one selectable choice. If none does, the run cannot
      // proceed — report it rather than looping.
      return blank(seed, route, policyName, `no selectable choice in ${selection.event.id}`);
    }

    choicesOffered += choices.length;
    universalOffered += choices.filter((c) =>
      String(c.id).startsWith(UNIVERSAL_CHOICE_PREFIX),
    ).length;
    picks += 1;
    if (String(choice.id).startsWith(UNIVERSAL_CHOICE_PREFIX)) universalPicked += 1;

    choicesPicked.push(`${selection.event.id}/${choice.id}`);

    const resolved = resolveChoice(state, pack, choice.id);
    if (!resolved.ok) {
      return blank(seed, route, policyName, `resolveChoice: ${resolved.error.code}`);
    }
    if (resolved.resolution !== null) {
      checksRolled += 1;
      // `chips`, not `modifiers`: the band is a PILLAR-2 budget on what the result screen asks
      // the player to hold at once, and since M3.11 that is the collapsed list. Counting the
      // audit trail here would measure a number no screen shows.
      const chips = resolved.resolution.chips.length;
      chipsTotal += chips;
      if (chips < 2) checksUnderTwoChips += 1;
      if (chips > 7) checksOverBand += 1;
      maxChips = Math.max(maxChips, chips);
    }
    if (resolved.outcome === null) noOutcomeChoices += 1;
    for (const applied of resolved.applied) {
      clamps += applied.clamps.length;
      if (applied.op === 'scheduleEvent' && applied.changed) scheduled += 1;
    }
    state = resolved.state;
    if (state.resources.morale <= 0) moraleFloored = true;
  }

  return {
    seed,
    routeId: route.id,
    policy: policyName,
    completed: state.route.legIndex >= state.route.legCount,
    moraleFloored,
    moodLegs,
    finalMood: moodFromState(state),
    legs: state.route.legIndex,
    days: state.clock.day,
    endings: state.unlockedEndings,
    firedEvents,
    selections,
    uneventfulLegs,
    fallbackLegs,
    quietLegs,
    forcedFireLegs,
    queueFires,
    complicatedLegs,
    checksRolled,
    chipsTotal,
    checksUnderTwoChips,
    checksOverBand,
    maxChips,
    choicesOffered,
    universalOffered,
    picks,
    universalPicked,
    scheduled,
    noOutcomeChoices,
    clamps,
    unresolvedThreads: unresolvedThreads(state, pack).length,
    queueDrops,
    beatsFilled,
    beatsExpired,
    choicesPicked,
    checkpoints,
    turnCapHit: turns >= MAX_TURNS,
    error: null,
    digest: stateDigest(state),
  };
}

function blank(
  seed: string,
  route: { readonly id: string },
  policy: PolicyName,
  error: string,
): SimRun {
  return {
    seed,
    routeId: route.id,
    policy,
    completed: false,
    // An errored run produced no verdict, so it produced no morale trajectory either. `false`
    // here is "not observed", and `statOf` divides by the ERROR-FREE population so it never
    // enters a share.
    moraleFloored: false,
    // An errored run reached no legs and produced no screens. `moodStats` folds over the
    // error-free population, so these never enter a share.
    moodLegs: {} as Record<MoodId, number>,
    finalMood: 'default',
    legs: 0,
    days: 0,
    endings: [],
    firedEvents: [],
    selections: 0,
    uneventfulLegs: 0,
    fallbackLegs: 0,
    quietLegs: 0,
    forcedFireLegs: 0,
    queueFires: 0,
    complicatedLegs: 0,
    checksRolled: 0,
    chipsTotal: 0,
    checksUnderTwoChips: 0,
    checksOverBand: 0,
    maxChips: 0,
    choicesOffered: 0,
    universalOffered: 0,
    picks: 0,
    universalPicked: 0,
    scheduled: 0,
    noOutcomeChoices: 0,
    clamps: 0,
    unresolvedThreads: 0,
    queueDrops: 0,
    beatsFilled: 0,
    beatsExpired: 0,
    choicesPicked: [],
    checkpoints: [],
    turnCapHit: false,
    error,
    digest: '',
  };
}
