import {
  evaluatePredicate,
  playerGain,
  presentedChoices,
  type Choice,
  type ContentPack,
  type Effect,
  type GameEvent,
  type RegistryComplication,
  type Rng,
  type RunState,
  createPredicateContext,
} from '@odyssey/engine';

/**
 * How the simulated player chooses.
 *
 * A policy is a stand-in for the choiceSequence a real player produces, and the SPREAD across
 * policies is what makes a balance report meaningful: a completion rate under `random` and
 * under `adversarial-worst-case` bound the range a real player lives in. One policy would
 * only tell you about itself.
 *
 * The policy's Rng is a SEPARATE generator from the run's. Drawing the player's decisions
 * from the engine's own cursors would make the "player" part of the world state and break the
 * (seed, choiceSequence) decomposition that replay is built on.
 */
export const POLICY_NAMES = [
  'random',
  'greedy-safe',
  'greedy-fast',
  'risk-taker',
  'adversarial-worst-case',
] as const;

export type PolicyName = (typeof POLICY_NAMES)[number];

export type Policy = {
  readonly name: PolicyName;
  choose(choices: readonly Choice[], state: RunState, rng: Rng): Choice | null;
};

/**
 * Choices the engine would actually accept, in canonical order.
 *
 * GOES THROUGH `presentedChoices`, and must. Reading `event.choices` directly was correct
 * right up until a complication could REMOVE one: the sim then offered a choice
 * `resolveChoice` refuses, and 2000 runs produced a crop of `loop/unknown-choice` errors.
 *
 * The engine refusing is the design working — CLAUDE.md 2.7 says the engine is the authority
 * on legality, not the screen, and the sim is a screen. But it means every caller that renders
 * a choice list has to derive it the same way, which is the entire reason `presentedChoices`
 * is one exported function rather than two inline expressions. The app layer will need this
 * too.
 */
export function selectableChoices(
  event: GameEvent,
  state: RunState,
  pack: ContentPack,
  complication: RegistryComplication | null = null,
): readonly Choice[] {
  const ctx = createPredicateContext(state, pack.refs, `policy:${event.id}`);
  return presentedChoices(event, complication).filter((choice) => {
    if (choice.hiddenUnless !== null && !evaluatePredicate(choice.hiddenUnless, ctx).value) {
      return false;
    }
    return evaluatePredicate(choice.requires, ctx).value;
  });
}

/**
 * Policies are scored on the DISTRIBUTION of a choice's outcomes, not on its average.
 *
 * An earlier version scored the mean and gave `risk-taker` a flat bonus for having a skill
 * check. Running it showed `greedy-safe` and `risk-taker` producing byte-identical runs on
 * every fixture seed — because the bonus only applied where a check existed, so on every
 * other event they were the same function. Two policies that always agree bound nothing.
 *
 * Maximin versus maximax is the real distinction, and it is the one a balance report needs:
 * the safe player's completion rate and the gambler's bracket the range a real player lives
 * in.
 */
/**
 * Resource deltas summed by their EFFECT ON THE PLAYER, never by their arithmetic sign.
 *
 * ## Why the naive `total += effect.delta` was wrong
 *
 * `hunger` and `heat` are inverted scales — higher is worse — and a bare sum scores them
 * backwards, so EATING READ AS A LOSS. Measured on the corpus before the fix:
 * `encounter.the_other_traveller/buy_a_meal_from_them` (cash -12, hunger -3) scored **-15**,
 * while the universal row `share_what_you_have` (cash -10, hunger +2, morale +1) scored
 * **-7**. Buying food was therefore the worse option by more than twice, on every policy that
 * reads these totals: `greedy-safe` and `risk-taker` actively AVOIDED eating and
 * `adversarial-worst-case` actively SOUGHT it.
 *
 * That is not a balance finding, it is an instrument fault, and it inverted the one axis a
 * recovery mechanic has to be sized against. Hunger removed per 100 in-game hours ran
 * `greedy-fast` 5.98 / `adversarial` 5.20 / `greedy-safe` 2.72 / `random` 2.25 /
 * `risk-taker` 0.70 — an 8.5x spread across policies that was **entirely** an artefact of the
 * sign convention, with the adversary out-eating the cautious player two to one.
 *
 * `RESOURCE_POLARITY` is the ENGINE's, deliberately: a copy here would be a second definition
 * of a fact about the resource, and it would drift the moment a resource is added. Do not
 * "simplify" this back to a bare sum.
 *
 * ## What is still crude, so nobody mistakes this for correct scoring
 *
 * The totals remain unweighted across resources — `cash` moves in tens and the 0-10 meters
 * move in ones, so cash dominates any comparison. That was true before this fix and is
 * unchanged by it. The fix is the SIGN, which decided the ordering; the SCALE decides only how
 * far apart two options sit, and a policy is a coarse stand-in for a player either way.
 */
function playerTotal(effects: readonly Effect[]): number {
  let total = 0;
  for (const effect of effects) {
    if (effect.op === 'resource') total += playerGain(effect.key, effect.delta);
  }
  return total;
}

function costTotal(choice: Choice): number {
  return playerTotal(choice.costs);
}

function outcomeTotals(choice: Choice): readonly number[] {
  const base = costTotal(choice);
  return choice.outcomes.map((outcome) => base + playerTotal(outcome.effects));
}

/** The outcome that hurts most. `greedy-safe` maximises it; `adversarial` minimises it. */
function worstCase(choice: Choice): number {
  const totals = outcomeTotals(choice);
  return totals.length === 0 ? 0 : Math.min(...totals);
}

/** The outcome that pays best. `risk-taker` chases it regardless of the downside. */
function bestCase(choice: Choice): number {
  const totals = outcomeTotals(choice);
  return totals.length === 0 ? 0 : Math.max(...totals);
}

function timeCost(choice: Choice): number {
  let hours = 0;
  for (const outcome of choice.outcomes) {
    for (const effect of outcome.effects) {
      if (effect.op === 'advanceTime') hours += effect.hours / choice.outcomes.length;
    }
  }
  return hours;
}

/** Deterministic tie-break by id keeps every policy replayable (`<`, never localeCompare). */
function best(choices: readonly Choice[], score: (c: Choice) => number): Choice | null {
  let winner: Choice | null = null;
  let winningScore = Number.NEGATIVE_INFINITY;

  for (const choice of choices) {
    const value = score(choice);
    if (
      value > winningScore ||
      (value === winningScore && winner !== null && choice.id < winner.id)
    ) {
      winner = choice;
      winningScore = value;
    }
  }
  return winner;
}

export const POLICIES: Readonly<Record<PolicyName, Policy>> = Object.freeze({
  random: {
    name: 'random',
    choose: (choices, _state, rng) => rng.pick(choices, 'eventPick'),
  },
  'greedy-safe': {
    name: 'greedy-safe',
    // Maximin: takes the option whose worst outcome is least bad. The cautious player.
    choose: (choices) => best(choices, worstCase),
  },
  'greedy-fast': {
    name: 'greedy-fast',
    choose: (choices) => best(choices, (c) => -timeCost(c)),
  },
  'risk-taker': {
    name: 'risk-taker',
    // Maximax: chases the best available outcome and ignores the downside. The upper bound.
    choose: (choices) => best(choices, bestCase),
  },
  'adversarial-worst-case': {
    name: 'adversarial-worst-case',
    // Minimin: deliberately walks into the worst branch. The lower bound on survivability,
    // and the policy that finds the dead ends design pillar 4 forbids.
    choose: (choices) => best(choices, (c) => -worstCase(c)),
  },
});

export function isPolicyName(value: string): value is PolicyName {
  return (POLICY_NAMES as readonly string[]).includes(value);
}
