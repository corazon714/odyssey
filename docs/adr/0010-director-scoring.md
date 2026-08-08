# 0010 — How the director scores, and what it refuses to relax

- **Status:** Accepted
- **Date:** 2026-08-08

## Context

M6's director picked uniformly among eligible events. That was deliberate — balancing a
director before anything could measure it would have been tuning against a guess — but it
means the run had shape without pacing. M7 turns eligibility into frequency.

Everything here is subordinate to one constraint that is easy to forget while tuning: the
scoring path runs ~6M times in a 20,000-run simulation, and its output feeds an integer
accumulator whose exactness golden runs depend on.

---

## Decision 1 — Multiplicative, with every factor bounded and floored above zero

```
score = weight × contextAffinity × tensionFit × novelty × recency × tagSaturation × priorityBoost
pickWeight = clampInt(round(score), 1, 1_000_000)
```

**Why multiplicative rather than additive.** The factors are independent judgments about
fitness, and multiplication composes them without a shared scale. Addition would denominate
every modifier in the same units as the author's `weight`, so an author writing `weight: 500`
would silently defeat every penalty in the system — and penalties could go negative, needing a
clamp anyway. That is the decisive argument, not elegance.

**Why every factor is bounded with a positive floor.** An unbounded factor silently becomes
the only factor. A factor that can reach zero is a filter wearing a disguise — and design
pillar 2 cares about the difference, because a filter can explain itself ("failed requires:
money ≥ 30") and a zero weight cannot.

**Why the integer floor of 1 is an invariant, not a detail.** The product's lower bound is
about 0.000125, which rounds to zero. A zero-weight candidate is an event that passed every
filter and then could not be chosen — which would make "filters decide eligibility, scoring
decides frequency" only approximately true. `scoring.test.ts` asserts `pickWeight ≥ 1` for
every event across a spread of stressed states.

**Why the result is rounded to an integer at all.** `weightedPick` then accumulates integers,
exact to 2⁵³. Float accumulation across a few hundred candidates makes `target < acc` depend
on summation order and on the last ULP of every factor.

Every constant lives in `scoring-constants.ts` with its documented range, so balancing is a
diff to one file and a sim delta is attributable.

---

## Decision 2 — The multiplication order is part of the replay contract

Float multiplication is not associative. Reordering the six factors changes the last bits of
the product, which changes `Math.round`, which changes the integer weight, which changes the
pick — and every golden run with it.

`scoreEvent` writes the multiplication out by hand because it is the hot path. `SCORING_FACTORS`
declares the same order as data, and `scoring.test.ts` asserts that a fold over the array
equals the hand-written expression. So the order is an **asserted contract** rather than a
comment somebody will reorder while tidying imports.

All arithmetic is rational — `1/(1+4d)`, never `exp(-kd)`. `Math.pow`, `exp` and `**` are
implementation-approximated (ADR 0005 §3), so a golden run computed with them could differ
between V8 and Hermes.

---

## Decision 3 — `tagSaturation` takes the MAX, not the product

Novelty and recency stop the same event recurring. Neither does anything about three
_different_ bribe events in a row, each individually novel and collectively identical — which
is the repetition a Quality-Based Narrative actually suffers from.

Taking the product over shared tags would collapse a six-tag event in a busy window to
near-zero, converting a shading factor into a filter and violating Decision 1. The
most-saturated single tag is the honest signal: "you have had a lot of this lately" is about
one theme, not about how many labels an event happens to carry.

The window is read from `history`, which already carries tags **copied at fire time**. No
redundant field to keep consistent across save and migration, and the run's own past stays the
source of truth for its pacing even after a content update.

`category` folds in as a synthetic `cat:` tag, so one mechanism covers both axes.

---

## Decision 4 — The ladder relaxes in cost order, and two gates never relax

| Rung | Relaxes                                          |
| ---- | ------------------------------------------------ |
| 0    | nothing                                          |
| 1    | beat gate                                        |
| 2    | `exclusiveGroup`                                 |
| 3    | soft context (time, transport, weather, profile) |
| 4    | `cooldownLegs`                                   |
| 5    | `locationTypes`                                  |
| 6    | filler pool only                                 |
| 7    | `{ kind: 'uneventful' }`                         |

Ordered by what each relaxation costs the player. The **beat gate goes first** because a slot
can absorb the miss by sliding, whereas firing an event whose context is wrong is a coherence
failure that cannot be undone. **`locationTypes` goes last** of the context gates because
place is the constraint a player most obviously notices being violated.

**`requires` and `maxOccurrences` appear on no rung.** `requires` is the correctness boundary —
an event needing a passport you do not have must not fire, however desperate the ladder gets.
`maxOccurrences` is authored intent ("this happens once per run"), not a pacing hint; relaxing
it produces exactly the incoherence the ladder exists to avoid. Both are asserted across every
rung, and a third test proves the ladder _does_ relax what it should — otherwise the first two
would pass vacuously against a filter that rejected everything.

Rung 4 relaxes the cooldown _gate_ while the recency _factor_ still applies, so a repeat
becomes possible rather than likely. That split is the point of having both.

---

## Decision 5 — Tension is recomputed after the world tick, before selection

`nextTension` blends route progress with resource strain, weighting strain higher: a
comfortable run near its destination should feel calmer than a desperate one at the halfway
point.

The **breather** is the part that matters (engine-spec §4). After two consecutive high-tension
events the signal drops by a fixed amount, pushing the next leg toward a lower band. Continuous
crisis is desensitisation — if everything is an emergency, nothing is, and the sim sees it as
a collapsing completion rate with no single event being unfair.

"High tension" is read from the event's own declared `tensionBand` rather than from a separate
field, so widening a band automatically changes pacing too: one number to keep honest instead
of two. An event missing from the pack breaks the streak rather than throwing.

Placement is load-bearing: tension updates **after** `worldTick` and **before** `selectEvent`,
so the director scores against the pressure the player is under this leg rather than last leg's.

---

## Decision 6 — The complication hook draws from `encounterFlavor`

The second Phase 2 seam, shipped empty. `complications.yaml` is CLAUDE.md §9 content and out
of scope; its integration point is not, because adding it later without a seam means rewriting
the director rather than plugging into it.

It draws from **`encounterFlavor`, never `eventPick`** — the payoff of the counter-based RNG
(ADR 0005 §1). Phase 2 can add complications that consume randomness without shifting a single
`eventPick` value, so M10's golden runs survive the registries landing. A test asserts exactly
that: a stub source that draws leaves `eventPick`'s cursor untouched.

---

## Consequences

- **Completion rate moved 33.7% → ~30.5%**, stable across three seeds, so it is signal rather
  than noise. Scoring penalises fillers (`priorityBoost: 0.40`), so more consequential events
  fire and runs cost more. Still inside engine-spec §6's 30–50% band, but at its edge.
- **Fillers are still 75.7% of everything that fires.** They are the only events with no
  context constraints, so they are eligible on nearly every leg while the rest are gated — a
  0.40 boost cannot outweigh that eligibility gap. This is a CONTENT observation, not an
  engine defect: nine events, two of them universal, is not a distribution to balance against.
  Revisit with the Phase 2 seed corpus.
- **Scoring costs ~7% wall clock** (4.4 s → 4.7 s extrapolated to 20,000 runs, against a 30 s
  budget). None of the planned optimisation levers — pack pre-indexing by
  `(priority, beatType, locationType)`, keeping `explain` off — are needed yet.
- `exclusiveGroup` is derived from `history` rather than tracked in a new field, so it cannot
  drift from what actually fired. It is always empty while one event fires per leg.
