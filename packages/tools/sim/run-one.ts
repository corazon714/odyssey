import {
  advanceLeg,
  createRng,
  createRngCursors,
  createRunInit,
  createRunState,
  resolveChoice,
  stateDigest,
  unresolvedThreads,
  type ContentPack,
  type EndingId,
  type EventId,
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
  readonly legs: number;
  readonly days: number;
  readonly endings: readonly EndingId[];
  readonly firedEvents: readonly EventId[];
  readonly uneventfulLegs: number;
  readonly fallbackLegs: number;
  readonly queueFires: number;
  /** Legs where the director attached a complication. Measures ATTACH_PERCENT against reality. */
  readonly complicatedLegs: number;
  /**
   * Modifier-pipeline instrumentation. `chipsTotal / checksRolled` is the number
   * 08-DIVERSITY-SYSTEMS D1 is actually about: "a typical check should pull 3-7". A check
   * pulling under two is drawing nothing the registry exists to provide, and it is invisible
   * without counting — the roll still happens and the report still looks healthy.
   */
  readonly checksRolled: number;
  readonly chipsTotal: number;
  readonly checksUnderTwoChips: number;
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
  const firedEvents: EventId[] = [];
  let uneventfulLegs = 0;
  let fallbackLegs = 0;
  let queueFires = 0;
  let complicatedLegs = 0;
  let checksRolled = 0;
  let chipsTotal = 0;
  let checksUnderTwoChips = 0;
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
  }[] = [];
  const CHECKPOINT_LEGS = new Set([5, 15, 25]);
  let turns = 0;

  while (state.status !== 'ended' && turns < MAX_TURNS) {
    turns += 1;

    const advanced = advanceLeg(state, pack);
    if (!advanced.ok) return blank(seed, route, policyName, `advanceLeg: ${advanced.error.code}`);
    state = advanced.state;
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
      });
    }

    const selection = advanced.selection;
    if (selection === null) continue;

    if (selection.kind === 'uneventful') {
      uneventfulLegs += 1;
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
      chipsTotal += resolved.resolution.modifiers.length;
      if (resolved.resolution.modifiers.length < 2) checksUnderTwoChips += 1;
    }
    if (resolved.outcome === null) noOutcomeChoices += 1;
    for (const applied of resolved.applied) {
      clamps += applied.clamps.length;
      if (applied.op === 'scheduleEvent' && applied.changed) scheduled += 1;
    }
    state = resolved.state;
  }

  return {
    seed,
    routeId: route.id,
    policy: policyName,
    completed: state.route.legIndex >= state.route.legCount,
    legs: state.route.legIndex,
    days: state.clock.day,
    endings: state.unlockedEndings,
    firedEvents,
    uneventfulLegs,
    fallbackLegs,
    queueFires,
    complicatedLegs,
    checksRolled,
    chipsTotal,
    checksUnderTwoChips,
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
    legs: 0,
    days: 0,
    endings: [],
    firedEvents: [],
    uneventfulLegs: 0,
    fallbackLegs: 0,
    queueFires: 0,
    complicatedLegs: 0,
    checksRolled: 0,
    chipsTotal: 0,
    checksUnderTwoChips: 0,
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
