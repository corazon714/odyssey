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
    const share = corpusChoice('filler.the_hours_between', 'u:share_what_you_have');

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
