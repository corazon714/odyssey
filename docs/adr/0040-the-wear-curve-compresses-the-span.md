# 0040 — The wear curve compresses the span, not the base

- **Status:** Accepted. **`FULL_UNTIL` was swept at THE KNEE SWEEP and is 200, not the 160 placed
  here.** The ADR was written so the sweep would only have to change one number and re-run; it
  did, and every other decision below is unchanged by the result. ADR 0041 records the sweep and
  the registry row that shipped beside it.
- **Also in this change:** **`SAVE_VERSION` 5 → 6.** The run records its TRAVEL clock, which is
  the quantity the wear curve charges against; `worn` cannot be recomputed from a v5 save because
  a v5 save never stored it. The migration is `v5->v6` in
  `packages/engine/src/migrate/migrations.ts`, the checked-in fixtures are
  `__fixtures__/save-v6.json` and `save-v6-loaded.json`, and
  `packages/engine/src/migrate/__tests__/migrate.test.ts` enforces both — that the clock is
  WRITTEN rather than left absent, and that it starts at zero, which is what makes the migration
  unable to make a live run harsher than the build it was saved from.
- **Date:** 2026-08-13
- **Relates to:** ADR 0014 (world-tick drift), ADR 0026 (a leg is a session), ADR 0029 (the quiet
  gate's legibility precedent), ADR 0032 (a baseline belongs to its run count), ADR 0035 (morale
  is a per-hour drain, and the conservation result)

## Context

The drain economy was **stationary**: every meter fell at a constant rate per travel hour for the
whole run, so total route hours predicted completion almost deterministically. Measured over the
corpus route set — 112 to 510 total hours since the M3.11 geo widening — routes under ~150 h
completed 55–85% and routes over ~250 h completed 0.0%, with nothing in between.

The originally specified curve (`FULL_UNTIL = 240`, 50% mid rate over 120 h) was **measured and
refuted** before this milestone: any route past 360 h has `worn(R) >= 300` at any tail band
including zero, and `P(S > 300)` on the doomed routes is capped at 8–17%. Reaching the target
needed `worn(R)` between 267 and 278 h, which is below that floor and therefore unreachable. The
refutation also established the two facts that constrain everything below.

## Decision 1 — the knee moves, and it is ONE exported constant

`FULL_UNTIL` lives in `packages/engine/src/loop/wear-curve.ts` and is exported from the barrel.
It is the only dial. `MID_SPAN` stays at 120 and the tail stays at 25%, because the refutation
measured the tail band as worth ±0.5pp against the knee's much larger contribution — moving both
at once is exactly how ADR 0035's conservation result had to be measured three times before
anyone noticed the levers were deleting each other's failure mode.

**The value landed here (160) was the midpoint of the model's predicted 143–178 band — the
sweep's first sample, not a result. The sweep chose 200**, above the model's whole band, because
the model was a lower bound: it held survival invariant in drain-hours, and the real engine
delivers more than that. `wear-curve.ts` carries the table. `MID_SPAN` and the tail did not move.

## Decision 2 — compress the SPAN, keep the wall-clock PHASE

Every drain is `spanPoints(before, hours, per)` = `floor((before + hours) / per) − floor(before / per)`.
The obvious change is to swap `before` from `elapsedHours(state)` to the travel accumulator.
**That is wrong.** `elapsedHours` is the wall clock (`clock.day * 24 + clock.hour`) and includes
the hours events charge through `advanceTime`; measured, it runs at roughly twice travel time — a
144-travel-hour fixture route reaches day 12, about 288 wall hours. Swapping the base changes the
PHASE of every `spanPoints` call on every route, including the fixtures that sit below the knee
and must not move.

So the base stays and only the span length is compressed:

```ts
spanPoints(elapsed, worn(travel + hours) - worn(travel), per);
```

Below the knee `worn` is the identity, so the span is `hours` and the sub-knee case is genuinely
bit-identical rather than approximately so. That is what makes the fence checkable, on ADR 0029
M3.12a's precedent.

**The cost, stated rather than discovered:** once compression bites, the spans no longer TILE the
wall-clock axis, so `spanPoints`' remainder-carry stops being exact past the knee. It was already
inexact inside `worldTick` for a different reason — event hours advance `elapsed` without any span
being charged — and the carry property is a fact about `spanPoints` itself, which still holds.
Past the knee the drain is a rate, not a ledger.

All arithmetic is `mulDivRound`. A float here reaches a resource delta, therefore the digest,
therefore every golden run — the least visible and most damaging place for a V8/Hermes rounding
difference (CLAUDE.md 2.3).

## Decision 3 — the travel clock is a new field, because it cannot be derived

`RunState.wear.hours`, with `SAVE_VERSION` 6 and `migrate_5_to_6`. The derivation was checked
before the field was added:

| candidate                  | why it fails                                                            |
| -------------------------- | ----------------------------------------------------------------------- |
| `clock`                    | wall time; includes event hours, ~2× travel                             |
| `route.progressKm`         | kilometres, and hours are not a function of distance alone              |
| recompute from `legKm`     | needs the transport MODE AT EACH PAST LEG; only the current one is kept |
| recompute including jitter | an RNG draw sharing the `worldTick` cursor with the weather reroll      |

**The migration writes ZERO, and that is the honest value rather than a placeholder** — the
opposite call from `migrate_4_to_5`, which could reconstruct v4's distances because the old
engine's rule was a closed form. There is no closed form here, so the choice is between guesses,
and zero is the only guess that cannot make a live run HARSHER than the build it was saved from:
a v5 save was produced by an engine with no curve at all, so a migrated run continues at exactly
the rate it has had and the curve simply begins from the upgrade. Seeding the wall clock instead
would drop a mid-journey run straight into the tail band and hand it a subsidy it never earned.

`isRunStateShape` checks `wear.hours` is a NUMBER rather than checking `wear` is present. The
branch loop would accept `wear: {}`, and that is the silent-NaN case in its third instance after
the rng cursors and the resource keys: `worn(undefined + hours)` is NaN, `clampResources`
compares false against both bounds and writes it straight through.

## Decision 4 — legibility is mandatory, and it cost a director fix

A non-stationary drain economy the player cannot see is an invisible subsidy (design pillar 2).
Each band transition emits a `HistoryEntry` (`journal.wear.<band>`) and a presentation chip
(`world.wear.<band>` on `state.wear.chipKey`), on `journal.leg.quiet`'s precedent. Both key
families stay OUT of `i18n/en/` for ADR 0029's reason: `requiredKeys()` cannot generate a
`journal.*` or `world.*` key, so adding them turns `locale.test.ts`'s orphan assertion red.

**The note broke `consecutiveHighTension`, and finding that is the reason this decision has its
own section.** `eventId === null` used to mean exactly one thing — no event fired this leg — and
`tension.ts` reads it as a rule, not a guard: designed silence ends the streak. A wear note also
carries a null id but says nothing about what fired, and a band change can land on the same leg as
a high-tension event. Left alone it would have ended the streak on a leg where an emergency
demonstrably fired: a director behaviour change smuggled in under a legibility feature.
`isWearNote` is what the walk now steps over. The other three history walkers were already correct
— `tag-saturation` and `drawsSince` filter on a non-null id, and `claimedGroups` `continue`s.

`chipKey` is cleared in `advanceLeg`'s opening spread alongside `presentation`, not only in
`worldTick`, because the arrival check runs BEFORE the tick and an ended run would otherwise carry
the previous leg's chip onto the ending screen.

## Consequences

- **`world-tick.ts`'s header claim that "there is no hidden accumulator" is now false and has been
  rewritten.** There is one; what survives is that the PHASE is still the clock.
- **The golden fixtures split three ways, and the split is the evidence.** Measured travel hours
  across the nine golden runs: `fixture.short` 54/54/55 h and `fixture.illicit` 83/155/155 h stay
  in the `full` band and are bit-identical apart from the new field; `fixture.scenic` 161/181/187 h
  crosses into `mid`. **The widely-repeated "the fixtures are 50/80/144 h" is a STATIC route
  total** — `sum(legHours(legKm[i], startMode, montage))` — and a run accumulates more than that,
  because `legHours` reads the mode it is actually travelling in and a `transport` effect can
  change it mid-run, plus the leg jitter's mean is +0.5 h.
- **The refutation's magnitude is understated by the real engine, and its direction is confirmed.**
  At `FULL_UNTIL = 160`, corpus completion moves 36.0% → 47.9% and fixture completion 74.0% →
  75.3%. **At the chosen 200 the corpus lands 42.7% and the fixture returns to 74.0% exactly**,
  every fixture route being under the knee. `failure_collapsed` falls 12.3% → 5.3% while `failure_gave_up` stays the majority failure
  at 46.7%, which is ADR 0035's conservation and the refutation's "morale binds on every doomed
  route" measured again — **the curve buys hours; it does not redirect the failure.** Any registry
  graft shipping with it wants to be a MORALE row.
- **47.9% sits near the ceiling of the 30–50% band, so the sweep should search UPWARD from 160**
  (a higher knee is less relief), not downward. **It did, and that is where the answer was.**
- **The golden split this ADR valued is GONE at 200 and that is a real cost.** "Six of nine
  bit-identical, three exercising the bend" was true at 160; at 200 all nine are sub-knee, so the
  goldens prove the identity and no longer prove the bend. Recorded in `wear-curve.ts` rather than
  quietly absorbed.
- Baselines regenerated at the knee sweep, corpus only — the fixture pack produced a
  byte-identical report, so there was nothing to write (ADR 0032, 2,000 runs).

> **On the label.** This ADR originally called the knee sweep "M3.12b". That label was **already
> taken**: ADR 0029 reserved it on 2026-08-09 for the quiet-leg ODDS sweep — setting a real
> `BASE_EVENT_ODDS` and meeting Decision 7's four calibration targets — and **that milestone has
> not run.** Two different sweeps under one label is how a reader concludes the quiet-leg work
> shipped when it did not. The knee sweep is un-numbered and is referred to here and in ADR 0041
> as **the knee sweep**; M3.12b remains ADR 0029's, unspent.
>
> `packages/engine/src/loop/wear-curve.ts` still carries the old label in its `FULL_UNTIL`
> docstring. That file is code and this commit is docs-only, so it is left for a later commit.
