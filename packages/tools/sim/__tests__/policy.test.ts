import { describe, expect, it } from 'vitest';
import {
  ALWAYS,
  choiceId,
  createRng,
  createRngCursors,
  createRunInit,
  createRunState,
  RESOURCE_KEYS,
  RESOURCE_POLARITY,
  type Choice,
  type Effect,
  type ResourceKey,
  type Rng,
  type RunState,
} from '@odyssey/engine';
import { loadCorpusPack, loadFixtureScenarios } from '../load-pack.ts';
import { POLICIES } from '../policy.ts';
import { isMeter, RESOURCE_WEIGHTS } from '../resource-weights.ts';

/**
 * THE SIGN CONVENTION, PINNED.
 *
 * `hunger` and `heat` are inverted scales — higher is worse. `policy.ts` summed raw deltas, so
 * it scored eating as a loss: `buy_a_meal_from_them` (cash -12, hunger -3) totalled **-15**
 * against `share_what_you_have` (cash -10, hunger +2, morale +1) at **-7**. `greedy-safe` and
 * `risk-taker` therefore avoided food and `adversarial-worst-case` sought it, and every hunger
 * figure the balance harness printed was an artefact of that.
 *
 * These assertions are about the ORDERING of two choices, not about a magnitude, because the
 * ordering is the whole of the fault and it survives any later rescaling of the totals.
 */

/**
 * A real `RunState` and `Rng` rather than casts.
 *
 * The three scoring policies ignore both arguments, but `Policy.choose` takes them and building
 * the real things costs one fixture route. A cast would be a lie that stops compiling honestly
 * the day a scoring policy starts reading state.
 */
const SCENARIO = loadFixtureScenarios()[0];
if (SCENARIO === undefined) throw new Error('the fixture pack generated no scenarios');

const CORPUS = loadCorpusPack().pack;

const CREATED = createRunState(createRunInit('policy-test', CORPUS.version, SCENARIO.route));
if (!CREATED.ok) throw new Error(`fixture route rejected: ${CREATED.error.code}`);
const STATE: RunState = CREATED.state;
const RNG: Rng = createRng('policy-test', createRngCursors());

function resourceDelta(choice: Choice, key: ResourceKey): number {
  const all: Effect[] = [...choice.costs, ...choice.outcomes.flatMap((o) => [...o.effects])];
  return all.reduce(
    (sum, effect) => (effect.op === 'resource' && effect.key === key ? sum + effect.delta : sum),
    0,
  );
}

function corpusChoice(eventId: string, id: string): Choice {
  const event = CORPUS.events.find((e) => String(e.id) === eventId);
  if (event === undefined) throw new Error(`no corpus event ${eventId}`);
  const choice = event.choices.find((c) => String(c.id) === id);
  if (choice === undefined) throw new Error(`no choice ${id} on ${eventId}`);
  return choice;
}

/**
 * A UNIVERSAL row wherever the splice put it, which is NOT the same lookup as the one above.
 *
 * `corpusChoice` names an (event, choice) pair, and for a universal row that pair is decided
 * by `priority`, the family cap and the 3-per-event limit — none of which this file has an
 * opinion about. Pinning one made a POLICY test fail when a registry priority moved and a row
 * landed on a different filler event: a true statement about scoring, reported as a missing
 * choice. The row's effects are identical wherever it lands, so find it by id and assert the
 * thing the test is actually about.
 */
function universalChoice(id: string): Choice {
  for (const event of CORPUS.events) {
    const choice = event.choices.find((c) => String(c.id) === id);
    if (choice !== undefined) return choice;
  }
  throw new Error(`universal row ${id} is not injected into any corpus event`);
}

describe('policy scoring reads a resource by its effect on the player', () => {
  /**
   * THE MEASURED CASE, on the corpus rows that measured it.
   *
   * The meal costs strictly MORE cash than sharing does, so no policy can prefer it except by
   * valuing the hunger it removes. That is what makes this an assertion about the sign rather
   * than about which row happens to be cheaper.
   */
  it('prefers buying a meal to sharing one, on the real corpus rows', () => {
    const meal = corpusChoice('encounter.the_other_traveller', 'buy_a_meal_from_them');
    const share = universalChoice('u:share_what_you_have');

    // The rows still say what the finding said. If content moves these, this test should fail
    // loudly here rather than quietly stop testing anything.
    expect(resourceDelta(meal, 'hunger')).toBeLessThan(0);
    expect(resourceDelta(share, 'hunger')).toBeGreaterThan(0);
    expect(resourceDelta(meal, 'cash')).toBeLessThan(resourceDelta(share, 'cash'));

    expect(POLICIES['greedy-safe'].choose([share, meal], STATE, RNG)?.id).toBe(meal.id);
    expect(POLICIES['risk-taker'].choose([share, meal], STATE, RNG)?.id).toBe(meal.id);
    // The lower bound must flip with it, or the bracket the report is built on is one-sided.
    expect(POLICIES['adversarial-worst-case'].choose([share, meal], STATE, RNG)?.id).toBe(share.id);
  });

  /**
   * THE PROPERTY, over every inverted key `RESOURCE_POLARITY` declares.
   *
   * Derived from the constant rather than written out, so a resource added as higher-is-worse
   * is covered the day it is added instead of the day somebody remembers this file.
   */
  const INVERTED = RESOURCE_KEYS.filter((key) => RESOURCE_POLARITY[key] === -1);
  const ORDINARY = RESOURCE_KEYS.filter((key) => RESOURCE_POLARITY[key] === 1 && key !== 'cash');

  it('has inverted resources to check', () => {
    // Anti-vacuous: an empty filter would make every `it.each` below pass by not running.
    expect(INVERTED.length).toBeGreaterThan(0);
    expect(ORDINARY.length).toBeGreaterThan(0);
  });

  /**
   * Ids are chosen so the WRONG answer sorts first. `best` breaks an exact tie by preferring
   * the smaller id, so a scoring bug that collapsed both options to the same total would pick
   * `a_...` and fail here, instead of passing on the tie-break.
   */
  const CASH_COST = 5;
  function meterChoice(id: string, key: ResourceKey, delta: number): Choice {
    return {
      id: choiceId(id),
      labelKey: `test.${id}`,
      requires: ALWAYS,
      hiddenUnless: null,
      costs: [{ op: 'resource', key: 'cash', delta: -CASH_COST }],
      skillCheck: null,
      search: null,
      outcomes: [
        {
          weight: 1,
          onCheck: null,
          requires: ALWAYS,
          textKey: `test.${id}.outcome`,
          textVariants: [],
          effects: [{ op: 'resource', key, delta }],
        },
      ],
    };
  }

  it.each(INVERTED)('relieving %s beats worsening it at the same cash cost', (key) => {
    const worsen = meterChoice('a_worsens', key, 1);
    const relieve = meterChoice('b_relieves', key, -1);
    const pair = [worsen, relieve];

    expect(POLICIES['greedy-safe'].choose(pair, STATE, RNG)?.id).toBe(relieve.id);
    expect(POLICIES['risk-taker'].choose(pair, STATE, RNG)?.id).toBe(relieve.id);
    expect(POLICIES['adversarial-worst-case'].choose(pair, STATE, RNG)?.id).toBe(worsen.id);
  });

  it.each(ORDINARY)(
    'gaining %s still beats losing it — the fix inverts two keys, not nine',
    (key) => {
      // The mirror image, and the reason it is here: a fix applied to every key would satisfy
      // every assertion above and break the seven resources that were never wrong.
      const lose = meterChoice('a_loses', key, -1);
      const gain = meterChoice('b_gains', key, 1);
      const pair = [lose, gain];

      expect(POLICIES['greedy-safe'].choose(pair, STATE, RNG)?.id).toBe(gain.id);
      expect(POLICIES['adversarial-worst-case'].choose(pair, STATE, RNG)?.id).toBe(lose.id);
    },
  );
});

/**
 * THE SCALE CONVENTION, PINNED — the sign's successor fault.
 *
 * `playerTotal` summed `playerGain` across resources UNWEIGHTED. `cash` and `bank` are unbounded
 * and move in tens, the six meters are 0-10 and move in ones, `reputation` is -5..+5 — so any
 * cash term swamped any meter term and the policies stopped modelling players. Measured at
 * 50,000 runs per policy on `--pack=corpus`: `greedy-safe` 18.8%, `random` 21.4%, `risk-taker`
 * 36.8%, `adversarial-worst-case` 64.7%, `greedy-fast` 65.7%. The deliberate lower bound came
 * out second-highest, because maximising an unweighted total makes the cautious player hoard
 * cash and the adversary spend it on food and rest.
 *
 * The property below is the PRICE, not any one weight: a cash sum smaller than what a meter
 * point is worth must not beat that point, and a larger one must. Both halves are derived from
 * `RESOURCE_WEIGHTS` rather than written out, so repricing a meal moves the fixtures with the
 * table instead of turning this file red for the wrong reason.
 */
describe('a resource is scored at its cash-equivalent worth, not at its raw magnitude', () => {
  // Every bounded resource — the six 0-10 meters plus `reputation`. Derived, so a resource added
  // with a ceiling is covered the day it is added.
  const BOUNDED = RESOURCE_KEYS.filter(isMeter);

  it('covers every resource, and keeps money as the unit the others are priced in', () => {
    // Anti-vacuous, and anti-degenerate: a table of all-1s is the unweighted sum this fixes.
    expect(BOUNDED.length).toBeGreaterThan(0);
    for (const key of RESOURCE_KEYS) expect(RESOURCE_WEIGHTS[key]).toBeGreaterThan(0);
    expect(RESOURCE_WEIGHTS.cash).toBe(1);
    expect(RESOURCE_WEIGHTS.bank).toBe(1);
    expect(BOUNDED.some((key) => RESOURCE_WEIGHTS[key] > 1)).toBe(true);
  });

  /**
   * One outcome each, so maximin, maximax and minimin all read the same number and the
   * assertion is about the SCORE rather than about which tail a policy looks at.
   *
   * `delta` is written through `RESOURCE_POLARITY` so "+1 point" means one point BETTER OFF on
   * an inverted meter too — otherwise this would silently test the sign fix again on `hunger`
   * and `heat` instead of the scale.
   */
  function payout(id: string, effects: readonly Effect[]): Choice {
    return {
      id: choiceId(id),
      labelKey: `test.${id}`,
      requires: ALWAYS,
      hiddenUnless: null,
      costs: [],
      skillCheck: null,
      search: null,
      outcomes: [
        {
          weight: 1,
          onCheck: null,
          requires: ALWAYS,
          textKey: `test.${id}.outcome`,
          textVariants: [],
          effects: [...effects],
        },
      ],
    };
  }

  function onePointBetter(id: string, key: ResourceKey): Choice {
    return payout(id, [{ op: 'resource', key, delta: RESOURCE_POLARITY[key] }]);
  }

  function cashGain(id: string, amount: number): Choice {
    return payout(id, [{ op: 'resource', key: 'cash', delta: amount }]);
  }

  /**
   * THE REGRESSION. Fails on the unweighted sum for every bounded resource, because there every
   * meter point is worth exactly 1 and any cash sum above 1 beats it.
   *
   * Ids sort the WRONG answer first, matching this file's existing idiom: `best` breaks an exact
   * tie by preferring the smaller id, so a scoring bug that collapsed the pair to one number
   * would pick `a_` and fail here rather than pass on the tie-break.
   */
  it.each(BOUNDED)('a cash sum under the price of one %s point does not beat it', (key) => {
    const price = RESOURCE_WEIGHTS[key];
    const cheapCash = cashGain('a_cash_under_the_price', price - 1);
    const point = onePointBetter('b_one_point', key);
    const pair = [cheapCash, point];

    expect(POLICIES['greedy-safe'].choose(pair, STATE, RNG)?.id).toBe(point.id);
    expect(POLICIES['risk-taker'].choose(pair, STATE, RNG)?.id).toBe(point.id);
    // The floor has to agree, or the bracket the report is built on is one-sided again.
    expect(POLICIES['adversarial-worst-case'].choose(pair, STATE, RNG)?.id).toBe(cheapCash.id);
  });

  /**
   * The mirror: a cash sum ABOVE the price does beat a meter point, so the scorer is not simply
   * "meters always win".
   *
   * WHAT THIS DOES NOT DO, because an earlier version of this comment claimed it did: constrain
   * the harvested rates. Both halves derive `price` from the same table under test, so they can
   * only ever be self-consistent — set every meter weight to 1e9 and all seven keys still pass
   * both halves. There is no independent oracle for a rate read off the corpus, and a
   * self-derived assertion presented as a check is a thing this repo has now shipped twice in
   * one day. The guard against a bad weight is the HARVEST being reproducible from
   * `packages/content/`, not this suite.
   */
  it.each(BOUNDED)('a cash sum over the price of one %s point does beat it', (key) => {
    const price = RESOURCE_WEIGHTS[key];
    const point = onePointBetter('a_one_point', key);
    const richCash = cashGain('b_cash_over_the_price', price + 1);
    const pair = [point, richCash];

    expect(POLICIES['greedy-safe'].choose(pair, STATE, RNG)?.id).toBe(richCash.id);
    expect(POLICIES['adversarial-worst-case'].choose(pair, STATE, RNG)?.id).toBe(point.id);
  });
});
