import { type ContentPack } from '../content/content-pack.ts';
import { type RunState } from '../state/run-state.ts';
import {
  TENSION_BREATHER,
  TENSION_CONSECUTIVE_HIGH,
  TENSION_HIGH_BAND,
  TENSION_STRAIN_SHARE,
} from './scoring-constants.ts';

/**
 * The director's pacing signal, 0–1.
 *
 * Two inputs. **Progress** rises monotonically along the route, so a run naturally tightens
 * toward its destination. **Strain** is how badly the player is doing — hurt, demoralised,
 * hunted, hungry — and is weighted more heavily, because a comfortable run near the end
 * should feel calmer than a desperate one at the halfway point.
 *
 * THE BREATHER IS THE PART THAT MATTERS. engine-spec 4: after two consecutive high-tension
 * events the next leg is pushed toward a lower band. Continuous crisis is desensitisation —
 * if everything is an emergency, nothing is, and the sim will show it as a completion rate
 * that collapses without any single event being unfair.
 *
 * All arithmetic is rational (ADR 0005 §3): no `Math.pow`, no `exp`.
 */
export function nextTension(state: RunState, pack: ContentPack): number {
  const route = state.route;
  const progress = route.legCount > 0 ? route.legIndex / route.legCount : 0;

  const resources = state.resources;
  const strain =
    ((10 - resources.health) / 10 +
      (10 - resources.morale) / 10 +
      resources.heat / 10 +
      resources.hunger / 10) /
    4;

  const base = (progress + strain * TENSION_STRAIN_SHARE) / (1 + TENSION_STRAIN_SHARE);
  const eased =
    consecutiveHighTension(state, pack) >= TENSION_CONSECUTIVE_HIGH
      ? base - TENSION_BREATHER
      : base;

  return eased < 0 ? 0 : eased > 1 ? 1 : eased;
}

/**
 * How many high-tension events fired in a row, most recent first.
 *
 * "High tension" is read from the event's own declared band rather than from a separate
 * field, so an author who widens a band automatically changes the pacing too — one number to
 * keep honest instead of two. An event missing from the pack (content changed under a save)
 * breaks the streak rather than throwing.
 *
 * A QUIET LEG BREAKS THE STREAK, and that is the decision, not a fall-through (ADR 0029
 * addendum). The `eventId === null` line below was written for a case that could not happen —
 * `advanceLeg` had never put an entry in `history`, so every entry carried an id — and the
 * quiet-leg gate made it live without anyone choosing what it should mean.
 *
 * It should break, because THE BREATHER IS A REMEDY AND A QUIET LEG IS ALREADY THAT REMEDY.
 * The mechanism exists against continuous crisis: two emergencies back to back, so push the
 * third down. After `[high] [high] [nothing]` the player has had the leg off the mechanism was
 * going to buy them, and easing the next leg as well spends the remedy twice — `high, high,
 * nothing, low` is a pacing sag, not a breather. Making the quiet leg TRANSPARENT is worse the
 * longer the silence runs: a streak from five legs back would still be suppressing tension now,
 * and on a montage stretch (quiet by design, ADR 0026) it would suppress it for the whole
 * stretch. Design pillar 3 wants the world to react to where the run IS, and after a quiet leg
 * the run is not in continuous crisis.
 *
 * `select-event.ts`'s `claimedGroups` answers the same question the opposite way and is also
 * right: it `continue`s past a null entry because an exclusive group is a fact about what fired
 * THIS leg, and a leg that fired nothing claims nothing. One reads a streak, the other reads a
 * set; a quiet leg ends the first and is invisible to the second.
 */
export function consecutiveHighTension(state: RunState, pack: ContentPack): number {
  let streak = 0;

  for (let i = state.history.length - 1; i >= 0; i -= 1) {
    const entry = state.history[i];
    if (entry === undefined) break;
    // Designed silence ends the streak — see the docstring. Not a guard, a rule.
    if (entry.eventId === null) break;

    const event = pack.byId.get(entry.eventId);
    const band = event?.tensionBand;
    if (band === undefined || band === null || band[0] < TENSION_HIGH_BAND) break;

    streak += 1;
  }

  return streak;
}
