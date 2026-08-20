import { RESOURCE_BOUNDS, playerGain, type ResourceKey } from '@odyssey/engine';

/**
 * WHAT A POINT OF EACH RESOURCE IS WORTH, IN CASH — the sim's common unit.
 *
 * ## Why this exists
 *
 * `playerTotal` summed `playerGain` across resources with no weighting. `cash` and `bank` are
 * unbounded and move in TENS; the six meters are 0-10 and move in ONES; `reputation` is -5..+5.
 * So a cash term swamped every meter, and the policies that read those totals stopped being the
 * players they are named after. Measured at 50,000 runs per policy on `--pack=corpus`:
 *
 * ```
 * greedy-safe 18.8%  random 21.4%  risk-taker 36.8%  adversarial 64.7%  greedy-fast 65.7%
 * ```
 *
 * The deliberate LOWER bound came out second-highest. The mechanism was visible in the state:
 * at leg 25 `greedy-safe` sat on a p50 of 2,457 cash with morale 3, while `adversarial` had 790
 * cash and morale 9. Maximising an unweighted total makes the cautious player HOARD and the
 * adversary SPEND — on food and rest, which is what survives a route. That is an instrument
 * fault of exactly the kind the sign convention was, one milestone earlier.
 *
 * ## The rates are HARVESTED, not invented
 *
 * The corpus already prices meters in cash: authors wrote rows that trade one for the other. A
 * row is a usable price only when the money moves against EXACTLY ONE meter — `pay_the_asking_price`
 * style rows that buy energy and hygiene with the same thirty cash say what the pair is worth, not
 * what either is. Over the whole corpus (13 events, 25 complications, 15 universal choices)
 * **six rows trade money against exactly one meter**, and those six are the whole basis below.
 *
 * The count of money-for-meter rows in TOTAL is deliberately not quoted: it lands anywhere from 9
 * to 17 depending on whether you net the meters, count any meter moving, or count distinct
 * choices, and an earlier version of this comment asserted 15, which is not reachable under any
 * of those definitions. The six single-meter rows are exact under all of them, which is why they
 * are the ones the weights rest on.
 *
 * | meter        | n | rates (cash per point)        | weight | basis                          |
 * | ------------ | - | ----------------------------- | ------ | ------------------------------ |
 * | `hunger`     | 1 | 4.0                           | **4**  | MEASURED                       |
 * | `energy`     | 2 | 12.5, 15.0                    | **14** | MEASURED (median 13.75)        |
 * | `morale`     | 1 | 15.0                          | **15** | MEASURED                       |
 * | `heat`       | 2 | 40.0, 40.0                    | **40** | MEASURED                       |
 * | `health`     | 0 | —                             | _15_   | ASSUMED                        |
 * | `hygiene`    | 0 | —                             | _15_   | ASSUMED                        |
 * | `reputation` | 0 | —                             | _15_   | ASSUMED                        |
 *
 * The measured rows, so the table can be checked rather than believed:
 * `encounter.the_other_traveller/buy_a_meal_from_them` cash −12 for hunger −3 (4.0);
 * `rest.the_shared_room/sleep_on_your_bag` cash −25 for energy +2 (12.5) and
 * `rest.the_shared_room/pay_for_a_private_room` outcome 1 cash −30 for energy +2 (15.0);
 * `transit.the_wrong_carriage/pay_the_difference` cash −15 for morale +1 (15.0);
 * `authority.the_file_catches_up/make_it_go_away` outcome 0 cash −80 for heat −2 (40.0) and
 * `crime.the_offer/take_the_package` outcome 1 cash +40 for heat +1 (40.0).
 *
 * **The spread is BETWEEN meters, not within them**, which is the reading that justifies a
 * per-meter vector rather than one blended rate: heat's two rows agree to the digit across two
 * unrelated events, energy's two sit 20% apart, and the 10x gap from hunger (4) to heat (40) is
 * the corpus saying food is cheap and a police file is not. Pooling them would erase the only
 * signal here.
 *
 * ## The three ASSUMED weights, said plainly
 *
 * `health`, `hygiene` and `reputation` are **never cleanly traded for money anywhere in the
 * corpus**. Their 15 is not a measurement and must not be quoted as one. It is the median of the
 * four measured rates, chosen over the obvious alternative — normalising each meter by its
 * `RESOURCE_BOUNDS` range — because range normalisation cannot set the cash weight at all:
 * `cash` and `bank` have `max: null`, so there is no range to divide by, and the whole defect is
 * cash's scale. Some cash anchor has to come from the content; once it does, and given that every
 * bounded resource here happens to share a range of exactly 10 (the meters 0-10, `reputation`
 * −5..+5), "an unpriced point is worth the median priced point" and "normalise by range" are the
 * same statement.
 *
 * One row does price health — `opportunity.work_for_a_day/take_the_day_rate` outcome 2 pays 50
 * cash for energy −5 AND health −1 — but the same 50 buys both, so 50 is an upper bound on the
 * pair, not a price for health. Attributing it to health would read 50 cash per point, which is
 * how a multi-meter row lies. `health` is the weight most likely to want revisiting: it is the
 * meter that ends runs, and the corpus is silent on it.
 *
 * ## Why this lives in `packages/tools/sim` and NOT beside `RESOURCE_POLARITY`
 *
 * Polarity went into the engine because it is a fact about the RESOURCE — hunger is a pressure
 * gauge in every pack that will ever exist. An exchange rate is a fact about a CORPUS. These
 * numbers were read off `packages/content/`; they are not true of `--pack=fixture`, whose events
 * are different and whose registries are empty, and they would move the day an author reprices a
 * meal. Putting them in the engine would also put a balance opinion in a module nothing in the
 * engine reads: `applyEffects` and `clampResources` have no use for what a point is worth, and the
 * only caller is the harness. That is the duplication trap CLAUDE.md §8 names, pointed the other
 * way — not a fact copied into two places, but a local judgement promoted to a global one.
 *
 * The engine keeps what it owns: the key set, the bounds and the polarity are all imported, so a
 * ninth resource breaks this table at the type level rather than silently scoring zero.
 *
 * ## What this still is not
 *
 * A LINEAR price, evaluated with no reference to state. A point of morale at morale 1 is worth
 * far more than at morale 9, and no weight vector can say so. Marginal valuation would mean
 * scoring against `RunState`, which the three scoring policies deliberately do not read today.
 * The weights fix the SCALE, as the previous milestone fixed the SIGN; the curvature is still
 * missing and a policy remains a coarse stand-in for a player.
 */
export const RESOURCE_WEIGHTS: Readonly<Record<ResourceKey, number>> = Object.freeze({
  // The numeraire. 1 by definition rather than by measurement — every other row is denominated
  // in it. `bank` is the same unit as `cash` (`resources.ts`: "ONE CURRENCY UNIT, THREE FORMS");
  // what separates them is liquidity and reachability, which are gates elsewhere, not value.
  cash: 1,
  bank: 1,

  // MEASURED.
  hunger: 4,
  energy: 14,
  morale: 15,
  heat: 40,

  // ASSUMED — median of the four measured rates. No corpus row prices these.
  health: 15,
  hygiene: 15,
  reputation: 15,
});

/**
 * A raw delta re-expressed as cash-equivalent value to the player. Positive is good.
 *
 * Composes `playerGain` rather than re-deriving the sign — the polarity table stays the engine's
 * one definition of which way a scale runs, and this adds only the scale factor on top.
 */
export function weightedGain(key: ResourceKey, delta: number): number {
  return playerGain(key, delta) * RESOURCE_WEIGHTS[key];
}

/** The bounded resources — everything the weights exist to rescue from cash's magnitude. */
export function isMeter(key: ResourceKey): boolean {
  return RESOURCE_BOUNDS[key].max !== null;
}
