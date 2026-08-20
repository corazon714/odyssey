# 0029 — The quiet-leg gate: odds, not probabilities

- **Status:** Accepted, lands last in Phase 3 (M3.12). **M3.12a shipped 2026-08-13** — plumbing at
  `BASE_EVENT_ODDS = 1:0`, digests unchanged, the three Decision 6 instruments re-cut, and
  `forcedFireShare` measured and printed. **Decision 6's wording for `fallbackRate` is corrected by
  the addendum below**; the table row as written is wrong about which legs can fall back, and it
  omits `uneventfulRate` entirely. **Decision 6's LIST is also incomplete — it named three sites
  and there are six** (second addendum). **Addendum III RETRACTS D1's claim that `Near-repeat rate`
  is unconfounded, records the measured null baseline M3.12b must subtract, and re-cuts
  `quietRate` / `forcedFireShare` onto the per-selection population** — leaving the three fenced
  rates alone on purpose. M3.12b (the sweep) has not run.
- **Date:** 2026-08-09
- **Changes an invariant recorded in:** ADR 0013 (`beat-slots.ts:44-46`)
- **Relates to:** ADR 0005 (RNG addressing), ADR 0010 (director scoring), ADR 0026 (montage)

## Context

`advanceLeg:84` calls `selectEvent` unconditionally. **Exactly one event fires per leg**, always,
unless the entire eight-rung relaxation ladder comes up empty — which produces `uneventful`, an
instrument that measures _content starvation_, not designed silence. There is no per-leg event
probability anywhere in the repo; `grep` for `eventChance` returns nothing.

Phase 3 raises `legCount` from 10/16/24 to 22–48 and introduces montage legs, whose whole point is
that they are quiet. Both need P(event) < 1.

## Decision 1 — the gate ships, and it ships last

M3.12, after M3.10 has already measured route shape. **Route shape and loop shape both move
completion**, and completion staying inside 30–50% is this phase's pass condition — measured
together, the number is unattributable. Split into two commits so even the gate's own contribution is
separable:

- **M3.12a** lands the plumbing at `BASE_EVENT_ODDS = 1:0` (P = 1.0) and proves digests **unchanged**.
- **M3.12b** sets the odds and sweeps.

That is the same fence ADR 0022 used for the empty registries, applied to a loop change.

## Decision 2 — odds, not probabilities, and this is what makes the multipliers real

The brief gives eight multipliers: urban ×1.4, border ×1.8, night ×1.2, bad weather ×1.2, illicit
×1.3, heat ≥6 ×1.4, empty terrain ×0.6, montage ×0.3.

**Applied to a probability they do not work.** With a base P of 0.55,
`border × night × weather × illicit × heat` is 2.6 — clamped — and six of the eight become dead. Any
base high enough for montage ×0.3 to leave a playable leg is a base the positive multipliers all
clamp against.

**Applied to odds they all work, with exact integer arithmetic and no clamp anywhere.** With
`BASE_EVENT_ODDS = 7:3` (P = 70% on a plain leg):

| leg                             | odds   |       P |
| ------------------------------- | ------ | ------: |
| montage ×0.3                    | 21:30  | **41%** |
| empty terrain ×0.6              | 42:30  | **58%** |
| plain                           | 70:30  | **70%** |
| urban ×1.4                      | 98:30  | **77%** |
| border ×1.8                     | 126:30 | **81%** |
| border + night + illicit + heat |        | **90%** |
| all six positive multipliers    |        | **94%** |

Nothing clamps; worst-case `100 × numerator` is about 4.6 × 10⁹, comfortably inside 2⁵³. Constants
live in one frozen `Record`, **not** eight two-element arrays and **not** in the star-exported
`scoring-constants.ts` — an array reachable from the barrel trips conformance L2.

## Decision 3 — forced-fire is checked first, and its share is reported

A due beat slot or a due queued event is **never** gated.

This is not a detail. `isSlotOpen` keeps a _slid_ slot open across its whole window, and corpus beat
fill is 30.1%, meaning most windows run to expiry rather than filling. On a 24-leg route with the
ADR 0027 schedule, roughly 10–13 legs sit inside an open window and every one of them is forced. So
the realised quiet share is `(1 − P) × (1 − forcedShare)`, not `(1 − P)`.

**The sim must print `forcedFireShare` alongside the quiet ratios**, or a montage leg that fired
because a beat window covered it reads as a tuning failure when it is a scheduling overlap.

## Decision 4 — a fourth `SelectionResult` arm, and `Presentation` reuses `uneventful`

`SelectionResult` gains `{ kind: 'quiet'; reasonKey; params }`. **Not a reuse of `uneventful`** —
conflating designed silence with content starvation destroys the `Empty-pool fallbacks` /
`Uneventful legs` pair, which is the only instrument that can see a content gap. `SelectionResult` is
a type, invisible to conformance L2, and is not in `RunState`.

`Presentation` **does** reuse its `uneventful` arm — byte-identical shape, with the `reasonKey`
carrying the distinction — so there is **no `SAVE_VERSION` 6**.

A quiet leg is not a no-op. `world-tick.ts:15` already says so for the existing case: _"uneventful
legs run this too: a leg where nothing happened must still cost time and wear."_ The clock advances,
drift applies, and a journal entry is written — textually distinct from the starvation entry, so a
designed quiet leg and a content gap do not look identical to a player or in a run log. Note
`recordHistory` is called only from `resolveChoice`, so the entry is written in `advanceLeg`'s final
spread.

## Decision 5 — the draw is cursor-free on `chanceGate`

```ts
deriveKey(streamKey(seed, 'chanceGate'), `gate:${route.id}:${legIndex}`);
```

Three streams were considered:

- **`routeGen`** — no. It is generation-time. Mixing generation and per-leg draws on one stream is
  the failure ADR 0005 exists to prevent.
- **`worldTick`** — the intuitive choice, and it is the per-leg world stream. But it is used
  **exclusively cursored** (three draws per leg: `world-tick.ts:114,142,143`), so a cursor-free
  derivation on its key would be the first stream in the repo addressed both ways.
- **`chanceGate`** — used **exclusively cursor-free** (`predicate-context.ts:51,58`) and is literally
  the stream for `{chance: p}` gates. A per-leg event-fire gate _is_ a chance gate.

Cursor-free matters on its own terms: a cursored draw would make the gate's position in the stream
depend on how many weather rerolls preceded it. The address is namespaced by route id because
`chanceAddress` already scopes on `${route.id}:${legIndex}` — an address omitting the route would
make the identical fire/quiet pattern apply to every route in the sim at a fixed seed.

## Decision 6 — three instruments break silently and are fixed in the same commit

Each of these is a denominator that silently stops meaning what it says the moment a leg can be
neither `event` nor `uneventful`:

| site                   | today                                                            | after                                            |
| ---------------------- | ---------------------------------------------------------------- | ------------------------------------------------ |
| `run-many.ts:107`      | `rate(complicated, totalLegs − uneventful)`                      | `presentedLegs = totalLegs − uneventful − quiet` |
| `run-many.ts:95`       | `rate(fallback, totalLegs)`                                      | same denominator                                 |
| `tag-saturation.ts:26` | `state.history.slice(-TAG_WINDOW)` — _entries_, not fired events | filter `entry.eventId !== null`                  |

The first is the only instrument validating `ATTACH_PERCENT`: at 30% quiet it would read ~41%
against a line printing `(target 60)`. The third shrinks the anti-repetition window from 8 fired
events to about 5.6 — which would make the gate _worsen_ the repeat rate it was partly meant to help.

## Decision 7 — the calibration targets, all four, together

`BASE_EVENT_ODDS` is set from a sweep, not chosen. **Completion alone is not the criterion** — a high
base would hide a content gap behind a wall of events. The full curve is reported for each of:

1. **Completion** lands in 30–50%.
2. **Quiet ratio**, reported separately for montage, empty-terrain and urban legs. Montage legs
   should be quiet _most_ of the time; if they are not, the base is too high regardless of what
   completion says.
3. **No more than ~2 consecutive quiet legs at p95.** Three in a row reads as a bug, not as pacing.
   If the tail exceeds it, the fix is a **soft pity increment**, not a global base raise.
4. **Empty-pool fallback rate does not rise**, and quiet and empty are counted separately in the
   report. A quiet leg is designed; an empty pool is a content gap; they must stay distinguishable.

Goldens and both sim baselines are regenerated **once, at the end**, after the base is fixed. The
pre-calibration goldens are void and `docs/PROGRESS.md` says so, so nobody diffs against them later.

## Consequences

- **This changes an invariant ADR 0013 relies on.** `beat-slots.ts:44-46`: _"Exactly one slot can be
  filled per leg because exactly one event fires per leg."_ Still true — a beat slot is forced-fire
  (Decision 3), so a due slot never meets the gate — but the sentence's _reason_ is now wrong and the
  comment must be rewritten to say why it survives.
- New reason keys (`director.quiet.*`, `journal.leg.quiet`) **stay out of `i18n/en/`**. There is not
  one `director.*`, `journal.*` or `loop.*` key there today and `requiredKeys()` cannot generate one,
  so adding them turns `locale.test.ts`'s orphan assertion red immediately.
- The gate is fenceable by construction: `BASE_EVENT_ODDS = 1:0` restores certainty exactly, which is
  what makes M3.12a's "digests unchanged" claim checkable rather than asserted.

## Addendum, M3.12a (2026-08-13) — `fallbackRate`'s denominator is not `presentedLegs`

Decision 6's table says `run-many.ts:95`'s `rate(fallback, totalLegs)` becomes "same denominator"
as the row above it, which reads as `presentedLegs = totalLegs − uneventful − quiet`. **That is
wrong, and it is wrong in the direction that would have hidden a content gap.**

A fallback is a leg where the relaxation ladder had to be relaxed. Only a leg that ATTEMPTED
selection can produce one:

| leg kind     | attempted selection?                | can fall back?              | in `fallbackRate`'s denominator? |
| ------------ | ----------------------------------- | --------------------------- | -------------------------------- |
| `event`      | yes                                 | yes                         | yes                              |
| `uneventful` | yes — all eight rungs came up empty | it IS the terminal fallback | **yes**                          |
| `quiet`      | **no** — the gate ran first         | no                          | **no**                           |

So the two rates take **different** denominators, and this is not a nitpick:

- `fallbackRate` = `rate(fallback, totalLegs − quiet)`. Excluding `uneventful` would delete the
  worst fallback from the measure of fallbacks — the rate would fall exactly as content got worse.
- `complicationRate` = `rate(complicated, presentedLegs)` where
  `presentedLegs = totalLegs − uneventful − quiet`, because a complication attaches to a
  PRESENTED event and neither of the other two kinds has one.
- `uneventfulRate` = `rate(uneventful, totalLegs − quiet)`. **Decision 6 does not name this rate
  at all**, and it breaks in the same way for the same reason: a quiet leg never ran the ladder,
  so it cannot have found the ladder empty. Leaving it in the denominator dilutes a starvation
  signal by the quiet share, and a content gap would then read as having IMPROVED because the
  gate got quieter. It is deliberately not `presentedLegs`, which subtracts `uneventful` from its
  own denominator and would inflate the rate against a line printing a `<2%` target. Sharing
  `fallbackRate`'s denominator is also what keeps the report's `Empty-pool fallbacks` /
  `Uneventful legs` PAIR comparable to each other — which is the only reason the pair is an
  instrument rather than two numbers.

Only two of the four rates are over the whole route: `quietRate` and `forcedFireShare`, because
Decision 3's identity `realised quiet = (1 − P) × (1 − forcedFireShare)` holds only if both of
its terms count the same population.

**Both are numerically identical at `BASE_EVENT_ODDS = 1:0`**, where `quiet` is 0 by construction,
and they diverge the moment M3.12b sets a real base. That is why this is recorded now rather than
discovered later against a number that had already moved.

### Three further calls made at M3.12a

1. **The gate ALWAYS DRAWS; it never short-circuits at P = 1.** `evaluateChance` returns early at
   `percent >= 100`; `eventGate` deliberately does not. A cursor-free draw advances nothing, so
   digests are identical either way — but short-circuiting would mean the branch M3.12b runs was
   never executed at M3.12a and the fence would prove the wrong thing. Certainty is exact without
   a special case: at P = 1 the threshold is 2³² and `drawWord` returns a uint32.
   Forced-fire legs still skip the draw entirely, which is Decision 3's semantics at both
   milestones rather than an M3.12a shortcut.
2. **`forcedFireShare` is measured at M3.12a**, not deferred to the sweep. Decision 3 predicts
   10–13 forced legs on a 24-leg route; if that is materially off, every quiet-ratio target in
   Decision 7 is set against the wrong denominator, and it is cheaper to learn that before the
   sweep than during it.
3. **Which multipliers a leg earns is PLUMBING and landed now** (`director/quiet-gate.ts`,
   `legOddsFactors`), so M3.12b is a one-constant change rather than a change plus a new
   detection path. Five of the eight needed a definition the brief did not give, and each is a
   judgement M3.12b should confirm rather than inherit silently:
   - `urban` = location type `city` or `town`; `border` = `border_crossing` or `checkpoint`;
     `emptyTerrain` = `wilderness`. Types of place, never places (CLAUDE.md 11).
   - `night` = `timeOfDayFor(clock.hour) === 'night'`.
   - `badWeather` = anything that is not `clear`, written as the absence so a new member of
     `WEATHERS` cannot default to harmless. **Deliberately NOT `world-tick.ts`'s `HARSH_WEATHER`**
     (`rain`/`wind`/`heat`), which answers a different question — which weather TIRES you on a
     long leg. Fog does not drain energy and very much raises the odds that something happens.
   - `heat` is the RESOURCE at ≥ 6, never the `heat` member of `WEATHERS`. The two names collide
     in this codebase and a leg can carry both at once.

### `forcedFireShare`, measured at M3.12a — Decision 3's estimate is high

Decision 3 estimated "roughly 10–13 legs" of a 24-leg route inside an open beat window, i.e. a
forced share of ~42–54% **of LEGS**. First measured over 400 runs per pack at
`BASE_EVENT_ODDS = 1:0`, with a one-off script written before the sim had its own counter:

| pack    | legs — the denominator | `forcedFireShare` **over LEGS** | beat-driven | queue-driven |
| ------- | ---------------------: | ------------------------------: | ----------: | -----------: |
| fixture |                  6,234 |                       **33.5%** |       33.5% |         0.1% |
| corpus  |                 11,025 |                       **29.0%** |       29.0% |         0.1% |

**This table is denominated in LEGS** — that is what its first column counts and what its share
divides by. It is left as it was measured rather than restated, because it is not reproducible:
the shipped harness at 400 runs and the same seed gives 6,242 and 10,708 legs, not 6,234 and
11,025, so this row came from a sample the repo can no longer reconstruct (its prose also claims
"the sim's own three policies", while `POLICY_NAMES` has had five since the walking skeleton, and
no three-policy subset reproduces these totals either). Treat it as a first look, not as evidence
for anything below, and read the unit note under the 2,000-run table before comparing it to a
selections figure.

Two findings, both of which change how Decision 7's targets should be read:

1. **The share is ~29%, not ~48%.** So a given `(1 − P)` yields materially MORE quiet legs than
   Decision 3 assumed — about 1.4× more on the corpus. A base picked against the ADR's estimate
   would overshoot the quiet ratio, and Decision 7's "no more than ~2 consecutive quiet legs at
   p95" is the target most exposed to that. The estimate is leg-denominated and the shipped figure
   is selection-denominated, but the finding does not rest on that: the corpus reads 29.2% over
   legs too, so the gap to ~48% is 19pp against a unit difference of 0.2pp.
2. **The consequence queue forces essentially nothing** (0.1%). Decision 3 names a due beat slot
   and a due queued event together; only the first is load-bearing. The queue is not a reason to
   keep the forced-fire check cheap, but the beat schedule very much is.

The share is reconstructible from outside `advanceLeg` without instrumenting it, which is how it
was measured before the sim's own counter exists: `dueBeatSlot` reads only `route.beatSchedule`,
which nothing mutates between the caller's state and the gate, and a due queued event is exactly
`selection.fromQueue` (`choose` picks from `due` first, and `rng.pick` returns null only on an
empty array).

**That reconstruction is now the sim's permanent counter** (`run-one.ts`, `forcedFireLegs`) rather
than a one-off script. Re-measured at the mandated 2,000 runs, and printed here over BOTH
denominators so that no comparison in this ADR has to cross a unit:

| pack    | runs  | over LEGS (`totalLegs`) | over SELECTIONS (`totalSelections`) — what ships |
| ------- | ----- | ----------------------: | -----------------------------------------------: |
| fixture | 2,000 |                   33.5% |                                        **33.5%** |
| corpus  | 2,000 |               **29.2%** |                                        **29.0%** |

**The earlier claim that these "agree with the 400-run figures above" is WITHDRAWN, because it
compared across denominators.** 29.0% over legs at 400 runs against 29.0% over selections at 2,000
is a coincidence of rounding, not a replication — the two numbers are not measuring over the same
population, and after addendum III's re-cut they never were. Compared within a unit the corpus
reads **29.2% over legs and 29.0% over selections** at 2,000 runs, and the shipped harness at 400
runs reads **29.2% over legs and 28.9% over selections**. So the honest statement is: the corpus
share is stable near 29% at both run counts and under both denominators, and the ~0.2pp legs-minus-
selections gap is systematic rather than noise — it is the same 315-run effect D9 quantifies below.
On the fixture the gap is below the printed precision (33.5% every way, at both counts), which is
why nothing looked wrong on the pack most people run.

The shipped corpus report read 29.2% until addendum III re-cut its denominator off `totalLegs`,
which is a leg INDEX and not the population the gate decided on.

So the finding stands at the sample size the baselines are cut at, and it is the corpus number
that binds: **the gate can reach at most 71.0% of corpus selections, so the realised quiet share
caps at `0.710 × (1 − P)`.** Decision 7 item 2 wants montage legs quiet _most_ of the time; montage legs
carry the ×0.3 multiplier, so on a 7:3 base they sit at P = 41% and a montage leg that no beat
window covers is quiet 59% of the time — reachable. What is NOT reachable from a base alone is a
quiet target above ~70% on any leg class, and Decision 7 item 3's "no more than ~2 consecutive
quiet legs at p95" is the constraint that will bind first, because the forced legs are clustered
inside beat windows rather than spread evenly. The report now prints the ceiling on its own line
so this does not have to be rederived each sweep.

### The report gained two lines, and no others (M3.12a, sim half)

`Quiet legs (designed)` and `Forced-fire legs`, directly under `Uneventful legs`. Decision 7 item 4
requires designed silence and a content gap to stay distinguishable, and adjacency is what makes
that readable — the two lines above are bugs to fix, the third is the design working. The quiet
line prints **no target**: M3.12b sets one, and implying one now would be the fold the fourth
`SelectionResult` arm exists to prevent.

Both baselines were regenerated, and the diff is **additive only**: 59 pre-existing lines in
`docs/sim-baseline.md` and 115 in `docs/sim-baseline-corpus.md` compared byte-for-byte against the
pre-change reports, every one identical. At `1:0` that is the fence — a single moved number would
mean the gate is not fenced — and it is checkable precisely because all three re-cut denominators
reduce to the old ones when `quiet` is 0.

## Addendum II, M3.12a follow-up (2026-08-13) — Decision 6's list of three was six

Decision 6 is titled _"three instruments break silently and are fixed in the same commit"_. Two
independent adversarial reviews of the M3.12a tree, each finding sites the other had missed, put
the real count at **six**. Three were closed at M3.12a; three are closed here. Nothing about the
gate itself changed, and the fence held throughout.

| #   | site                               | denominated in  | verdict                                         |
| --- | ---------------------------------- | --------------- | ----------------------------------------------- |
| 1   | `run-many.ts` `fallbackRate`       | legs            | fixed M3.12a — `attemptedLegs`                  |
| 2   | `run-many.ts` `complicationRate`   | legs            | fixed M3.12a — `presentedLegs`                  |
| 3   | `run-many.ts` `uneventfulRate`     | legs            | **not in D6 at all** — fixed M3.12a, addendum I |
| 4   | `tag-saturation.ts` `TAG_WINDOW`   | history entries | fixed M3.12a — filter `eventId !== null`        |
| 5   | `format-report.ts` `repeatRate()`  | draws per run   | **D1 below** — companion instrument added       |
| 6   | `scoring-factors.ts` `recency`     | legs            | **D2 below** — now draws                        |
| 7   | `hard-filters.ts` cooldown         | legs            | **D2 below** — stays legs, deliberately         |
| 8   | `tension.ts:60` `eventId === null` | history entries | **D3 below** — `break` is now a decision        |

**The "denominated in" column is the unit BEFORE the fix, and rows 1–3 are still LEGS after it.**
"Fixed M3.12a" there means the quiet subtraction was added, not that the population changed:
`attemptedLegs` and `presentedLegs` remain leg-index sums with per-selection counts subtracted from
them, which is the mixed-unit defect D9 quantifies and defers. Only rows 5–8 changed unit or were
decided to keep one. Do not read a row as settled because it says "fixed".

### Why the list was short, which is the part worth carrying forward

**Decision 6 was written while reading `run-many.ts`.** Three of its four rows are lines in that
one file; the fourth, `tag-saturation.ts`, is the one engine site whoever wrote it happened to
know about. A list built by reading a file finds what is in that file, and it finds it in that
file's vocabulary — the heading says "instruments", so it looked for _reported numbers_ and
stopped. Half the real population is not a reported number at all: `recency`, `cooldownLegs` and
the `tension.ts` break are **behaviour**, and they change what the run does rather than what the
report says about it. `uneventfulRate` was missed in the opposite direction — a reported number
sitting three lines from two that were caught.

The general question the ADR should have asked, and the one this addendum answers: **enumerate
every quantity denominated in legs or in history entries, and for each one say which unit it
MEANS.** That is a mechanical sweep with a definite end, and it took one `rg` over
`legIndex|Legs|history\.` to run. Decision 6 instead enumerated instances, which has no end and no
way to know it has reached one. The count going 3 → 6 is the evidence.

Two further transferable notes. **The unit question has no default answer** — of the two windows
in D2, one changed unit and one did not, and both calls are defensible, so a sweep that
mechanically "fixes" everything it finds is as wrong as one that finds nothing. And **a line
written for an unreachable case is a decision nobody made**: `tension.ts:60` was dead code that
became live behaviour in a commit whose diff does not contain the file.

### D1 — `Repeat-event rate` is length-sensitive, and cannot be fixed in place

`repeatRate()` is `1 - unique/fired` pooled over runs. `fired` shrinks with the quiet share while
`unique` is capped by the pool (13 events on the corpus, against 26.8 draws in an average corpus
run), so the rate falls as the gate silences legs **with the director untouched**. Measured by
deleting fired events from real corpus sequences and changing nothing else: 26.88 draws/run reads
67.5%, 17.64 draws/run reads 56.9%. `fallbackRate` and `uneventfulRate` both read 0.0% on both
packs, which made this the report's only non-zero leg-sensitive number and its only repetition
instrument.

**It is kept exactly, and a companion is added instead.** The argument is not sentiment:

1. It is not FALSE. The player really was shown that share of re-runs. It is length-sensitive,
   which makes it incomparable across a change in how many events a route draws — a different
   defect from being wrong, and one a note can fix where deletion cannot.
2. **No redefinition can be both unconfounded at a positive quiet share and arithmetically
   identical at `BASE_EVENT_ODDS = 1:0`**, which is what the fence requires of every printed
   number. Take the general linear correction `(repeats + b·q) / (fired + a·q)`: matching the
   measured pair above forces `9.24b − 6.237a = 1.867`, which has no principled `(a, b)` —
   `a = b = 1` still moves the number by 4.2pp, and `a = 1, b = 0` by 30pp. The two properties
   are jointly unsatisfiable, so an in-place fix would have had to move a fenced number.
3. The M3.12a precedent already settled the shape: the report GAINS lines rather than changing
   them, because `diff-report.ts` compares by line index, and a changed line is a `-` in the
   baseline diff while an inserted one is not.

**`Near-repeat rate`** now sits directly under it: the share of draws that redrew an event
`recency` was **still penalising** — a window of `RECENCY_WINDOW - 1` draws back, because `gap` is
inclusive of the draw being scored. Both sides are denominated in fired events, which removes the
SCALING confound above. **It does not remove sequence compression, and the sentence that stood
here — "the quiet share cancels and what is left is a property of the director rather than of how
often it was asked" — is RETRACTED in addendum III below, with the measured null figures.** The
line also prints `draws/run` beside it; that figure could not be appended to the line above
without moving it.

Measured at 2,000 runs at 1:0: fixture **62.3%** at 15.58 draws/run, corpus **26.0%** at 26.88.

`tag-saturation.ts`'s comment closed by arguing that slicing entries "would make the gate WORSEN
the repeat rate it was partly meant to help: the two changes would have cancelled". **That was
reasoning from the confounded figure** — the line falls ~10pp regardless, so a wash was never
available to be mistaken for one. The comment now argues from the constant instead: a window that
promises eight fired events and delivers 5.6 is a defect measured against `TAG_WINDOW`, and
`Near-repeat rate` is the instrument that can see it. The fix was right; only its evidence was
borrowed from a number that could not supply it.

### D2 — one anti-repetition job, and it really is two units

`scoring-constants.ts` said "over `RECENCY_WINDOW` **legs**" four lines above "over the last
`TAG_WINDOW` **fired events**". That was not a decision; it was an accident that could not show
itself while every leg fired exactly one event.

**`recency` now counts DRAWS** — legs since, minus every leg that showed the player nothing —
because the unit is what the player READ. `[bribe] [nothing] [nothing] [nothing] [bribe]` is five
screens with the repeat plainly visible; `[bribe] [storm] [theft] [breakdown] [bribe]` is five
screens with three real ones buffering it. A leg that showed nothing buffers nothing. Both scoring
windows now count the same thing, which is what the contradiction above was asking for.

**`cooldownLegs` stays WALL-CLOCK, and that is the more interesting half.** Three reasons, in
order of weight:

- **The montage case settles it.** Montage legs are quiet by design (ADR 0026). Under a draws
  unit every cooldown freezes across one, and the player emerges from days of summarised travel
  into the same border event they left, because "nothing fired in between". The fiction says a
  week passed.
- **It is AUTHORED content, in a field named for its unit.** Twelve values in the pack were
  written by a human against the name `cooldownLegs` — 2 on the fillers, 10 on the storm, 12 on
  `authority.the_file_catches_up`. Those are world statements about recurrence, not presentation
  statements about freshness. Reinterpreting them without renaming the field is exactly the
  content-semantics drift `packages/content/schema/` owns (ADR 0009).
- A quiet leg still costs time, distance and wear — `world-tick.ts:22` already says so for the
  existing case — so it burns a world cooldown exactly as a loud leg does.

So the split is **engine-owned presentation shading in draws, authored world pacing in legs**, and
it is stated in three places (`scoring-constants.ts`, `hard-filters.ts`, `scoring-factors.ts`)
with a test on each side.

**Why the goldens did not move.** The new `recency` gap is `1 + (fired history entries after
lastLeg)`. At 1:0 `quiet` is 0 by construction, and `uneventful` — the only other leg kind that
leaves no fired entry — measures **exactly 0** across 2,000 runs on both packs and in 9 of 9
golden runs, so every leg in between contributes exactly one entry and the expression reduces to
`legIndex − lastLeg` term for term. That dependency is stated rather than assumed: if `uneventful`
ever became non-zero the golden digests would move loudly, which is the opposite of the silent
drift this sweep is about.

One test fixture had to be corrected, and it is a small finding in its own right.
`scoring.test.ts`'s "lifts a would-be-zero score to 1" set `lastLeg: 0` while putting the same
event in `history` at legs 0..7 — an incoherent state no run can reach. It survived because
`recency` never opened `history`. Now that the two windows share a source of truth, the fixture has
to be a state the engine could actually produce.

### D3 — a quiet leg breaks the tension streak

`tension.ts:60`'s `if (entry.eventId === null) break` was **dead** before M3.12a — `advanceLeg` had
never written a history entry, so every entry carried an id — and the quiet-leg gate made it live
in a commit whose diff does not contain `tension.ts`, with no test constructing a null-`eventId`
entry against it.

**`break` is right, and it is now a decision rather than an accident.** The breather exists against
continuous crisis: after two high-tension events the next leg is pushed down, because if everything
is an emergency nothing is. **A quiet leg is already that remedy.** After `[high] [high] [nothing]`
the player has had the leg off the mechanism was going to buy them, and easing the next leg as well
spends the remedy twice — `high, high, nothing, low` is a pacing sag, not a breather. Making the
quiet leg transparent gets worse the longer the silence runs: a streak from five legs back would
still be suppressing tension now, and across a montage stretch it would suppress it for the whole
stretch. Design pillar 3 wants the world to react to where the run IS, and after a quiet leg it is
not in continuous crisis.

`select-event.ts`'s `claimedGroups` answers the same question the opposite way and is also right:
it `continue`s past a null entry, because an exclusive group is a fact about what fired THIS leg
and a leg that fired nothing claims nothing. One reads a streak, the other a set.

### Swept and deliberately left alone

Every remaining quantity denominated in legs or history entries, with the reason it is safe.
Recorded because "we looked and it was fine" is a finding: the next sweep should not have to
re-derive these, and two of them are safe only because of Decision 3.

| site                                                                          | why the gate cannot skew it                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `beat-schedule.ts` `slackLegs`, `isSlotOpen`                                  | A leg inside an open slot is FORCED-FIRE (D3), so a beat window can never contain a quiet leg. This is also what protects `beatFillRate` — without it the gate would convert beat MISSES into beat EXPIRIES at whatever rate it silenced legs.                                                                                                                                |
| `scheduleEvent` `inLegs` → `earliestLeg`/`latestLeg`, and `expire-pending.ts` | Same mechanism: a due queue entry is forced. A leg inside the window that goes quiet is one where the pending event was ineligible anyway, so it could not have fired there. `payoffRate` is structurally protected.                                                                                                                                                          |
| `flag-access.ts` `ttlLegs` / `expiresAtLeg`                                   | **Leg-denominated, and stays that way** for `cooldownLegs`' reasons: authored content, field named for its unit, world state rather than presentation. `bribed_this_border` at `ttlLegs: 1` is about this crossing; `stash_used` at 6 is a resource cooldown. Named here because it is the site most likely to be "fixed" by a later sweep that has forgotten this paragraph. |
| `world-tick.ts`                                                               | Already denominated in HOURS and KM rather than legs since M3.10b — every drain is `spanPoints(elapsed, hours, N)`. A quiet leg costs exactly what a loud one does, correctly, and nothing in the file is a rate.                                                                                                                                                             |
| `eventMemory.lastLeg` and `world.leg` predicates                              | Absolute leg comparisons, not windows. A leg index is a leg index. If a RELATIVE form is ever added it inherits this whole question and must pick a unit explicitly.                                                                                                                                                                                                          |
| `run-one.ts` `MAX_TURNS`                                                      | Counts `advanceLeg` calls, which the gate does not change.                                                                                                                                                                                                                                                                                                                    |
| sim checkpoints at legs 5/15/25, `neverFired`, `checksRolled`                 | Correct in unit, SENSITIVE in sample. Fewer draws per run at M3.12b means thinner resource trajectories, more events plausibly never-fired at a fixed run count, and a smaller check population behind the 3-7 chip band. That is the measurement responding to a real change rather than a broken denominator — but read the counts, not only the rates.                     |

### What moves at M3.12b, per instrument

| instrument          |                          at 1:0 | at a real base                                                                                                                                                                                                                                                             |
| ------------------- | ------------------------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Repeat-event rate` |     67.5% corpus, 67.8% fixture | **falls ~10pp as an artifact.** Do not read it as a repetition signal across the base change; read the line below it.                                                                                                                                                      |
| `Near-repeat rate`  |     26.0% corpus, 62.3% fixture | **moves on its own too — subtract the null baseline in addendum III first.** At a 30% quiet share the null is **+7.6pp corpus / −5.7pp fixture**, sign pack-dependent. Only the RESIDUAL is a finding about the director.                                                  |
| `draws/run`         |     26.88 corpus, 15.58 fixture | falls by roughly the realised quiet share `(1 − P) × (1 − forcedFireShare)`. It is the explanation for the line above it.                                                                                                                                                  |
| `recency`           |                       identical | recovers over 6 DRAWS however many legs those span, so it fires later in leg terms and identically in draw terms.                                                                                                                                                          |
| `cooldownLegs`      |                       identical | unchanged in legs, so it clears after FEWER intervening events. This is the one place the gate genuinely makes a repeat easier, and it is accepted: the ladder relaxes cooldown anyway, and `recency`, `novelty` and `tagSaturation` all still shade what it lets through. |
| `TENSION_BREATHER`  | never applied after a quiet leg | applies LESS often, because a quiet leg now ends streaks that would otherwise have reached two. Expect tension slightly higher on average, with the breather concentrated on genuinely back-to-back crises.                                                                |

## Addendum III, M3.12a adversarial review (2026-08-13) — a retraction and a denominator

Two defects, from a third adversarial pass over the same tree. Neither is blocking, both are real,
and **the gate itself is again untouched**: `golden-runs.json` is byte-identical at
`e26770a7…dae3a09`, both `sim:diff`s report "No change", and both report bodies are still exactly
three inserted lines against `git show HEAD:` with nothing else moved.

### D8 — `Near-repeat rate` is NOT unconfounded, and the claim is retracted

D1 above added it to replace `Repeat-event rate`'s length confound, and advertised it as a property
of the director: _"both sides are denominated in fired events, so the quiet share cancels and what
is left is a property of the director rather than of how often it was asked"_, with the report
telling the reader to _"diff THIS across a base change, not the line above"_.

**Re-measured with the director LITERALLY UNCHANGED** — draws deleted from the real 1:0 sequences
with a non-periodic mask, 2,000 runs per pack, ten mask seeds, nothing else altered:

| pack    |     at 1:0 | at a 30% quiet share | null delta | `Repeat-event rate` null, same runs |
| ------- | ---------: | -------------------: | ---------: | ----------------------------------: |
| corpus  | **25.99%** |           **33.57%** | **+7.6pp** |                              −9.1pp |
| fixture | **62.29%** |           **56.63%** | **−5.7pp** |                              −6.9pp |

Across quiet shares — corpus: +3.4pp at 10%, +5.9pp at 20%, +7.6pp at 30%, +8.4pp at 40%. Fixture:
−1.6pp, −3.5pp, −5.7pp, −8.2pp. **Mask-seed spread across the ten seeds is under 0.9pp at every
point, and the effect is not mask luck**: the null deltas run 1.6–8.4pp in magnitude, so the
smallest of them clears the widest spread by roughly 2×, and the four largest by 6–9×.

That bound is deliberately looser than the "under 0.6pp" this paragraph first claimed, and the
reason is worth recording rather than quietly patching. **The original figure did not name its
statistic** — range, standard deviation and half-range differ by a factor of ~3 over ten samples
and the number is meaningless without one — and an independent ten-seed sweep afterwards reached
**0.80pp at fixture q = 30%**, which the original bound excludes. The two are not necessarily in
conflict: 0.80pp as a range is entirely consistent with 0.6pp as a standard deviation, and a
different PRNG family for the mask would move it again. **So this is UNRESOLVED, not refuted**, and
the response is to quote a bound that holds under either reading rather than to pick a winner. What
must not happen is the bound being re-tightened by a later pass without re-measuring: if you need a
number below 0.9pp, re-run the sweep and write down which statistic you computed and over how many
seeds.

**The conclusion is unaffected and is not being hedged.** Whether the spread is 0.6pp or 0.9pp, it
is smaller than every delta in the table by a wide margin, and D8's finding — that `Near-repeat
rate` moves on its own with the director unchanged, and that the SIGN is pack-dependent — rests on
deltas of ±5.7pp to ±8.4pp with opposite signs on the two packs. No spread of this order can
manufacture a sign flip between packs.

**Comparable in magnitude to the confound it replaces, and THE SIGN IS PACK-DEPENDENT.**

#### Why — and it is not a fixable bug in the metric

Sharing units on both sides removes the **scaling** confound: `unique` is capped by the pool while
`fired` is not, which is what makes `repeatRate` fall mechanically. It does **not** remove
**sequence compression**, and a quiet share is exactly a compression — deleting a draw pulls the
draws on either side of it closer together in window terms. That cuts both ways at once:

- **sparse repeats (corpus, 13 events over 26.88 draws):** most repeat pairs sit OUTSIDE the
  5-draw window; compression pulls them IN and the rate RISES.
- **dense repeats (fixture, 62% of draws already near-repeats):** most pairs are already inside;
  deleting a member DESTROYS the pair and the rate FALLS.

Which dominates is a property of baseline repeat density, i.e. of the pack. There is no window
width or denominator that fixes this, which is why the response is a retraction rather than a
patch: **the metric is not changed at all here, only the claim made for it.** It is still the
better of the two lines — it moves less, and it moves for a reason that can be measured and
subtracted — and it is now sold that way, in the report string itself.

#### THE REQUIREMENT THIS PUTS ON M3.12b

**Subtract a null baseline before attributing any movement in either repetition line to the
director.** Concretely: take the 1:0 fired sequences, delete draws at the realised quiet share with
a non-periodic mask, recompute, and read only the RESIDUAL. The figures above are that baseline,
recorded here so nobody has to rediscover them. **On the corpus a rise of up to ~8pp at a 30% quiet
share is the NULL EXPECTATION, not a finding.**

The row in _"What moves at M3.12b, per instrument"_ that said `Near-repeat rate` _"should HOLD if
the director is unchanged. A rise is the real finding"_ is corrected above. It was exactly backwards
on the corpus.

#### The transferable lesson

D1 point 2 proves that **no metric can be both unconfounded at `q > 0` and arithmetically identical
at 1:0** — the two properties are jointly unsatisfiable, and that impossibility is the entire reason
D1 added a line rather than fixing one. The same document then advertised the added line as
unconfounded. **An impossibility proof constrains the replacement exactly as much as the thing
replaced**, and the author of the proof is the last person who will notice they have violated it,
because the scepticism has already been spent. The general form: when you prove a property
unattainable, write the next paragraph as if a reviewer will check the replacement against your own
theorem — because that is the only check that will catch it.

### D9 — `totalLegs` is not the gate-decision population

`run-one.ts` sets `legs: state.route.legIndex` — a final **INDEX** — while `quietLegs`,
`forcedFireLegs` and `uneventfulLegs` are counted once per **SELECTION**. The two agree on the
ordinary run, which is why this survived M3.12a and two earlier reviews: a run normally ends on an
`advanceLeg` that returns `selection === null` (arrival or a failure verdict), so the final index is
reached and contributes no selection. A run that ends inside `resolveChoice` does not make that
final call, and yields `selections = legs + 1`.

| pack    | runs affected | denominator error |
| ------- | ------------: | ----------------: |
| fixture |   20 of 2,000 |         **0.06%** |
| corpus  |  315 of 2,000 |         **0.59%** |

So D3's identity `realised quiet = (1 − P) × (1 − forcedFireShare)` was stated over a population
that is not the one the gate decided on.

#### The split, and why it is a split rather than a sweep

**A new per-selection count (`SimRun.selections`) is added, and used ONLY by `quietRate` and
`forcedFireShare`.** Those are the two lines M3.12a ADDED — they were never in a baseline, so their
values are not fenced — and they are the two the correction is load-bearing for, because D3's
identity holds only if both sides count the same population. The corpus `Forced-fire legs` line
moves 29.2% → 29.0% and its printed ceiling 70.8% → 71.0%; the fixture line is unchanged at 33.5%,
the gap being below the printed precision there. `Quiet legs` is 0.0% either way at 1:0.

**`complicationRate`, `uneventfulRate` and `fallbackRate` STAY on `attemptedLegs` / `presentedLegs`,
deliberately.** `complicationRate` is a PRE-EXISTING baseline number: re-cutting its denominator
moves it by ~0.59% on the corpus, which puts a `-` line in the baseline diff and **breaks the
additive-only fence that is M3.12a's entire claim**. That trade — a fourth-decimal correction
against the one property this milestone exists to demonstrate — is not worth taking, and the
question is not lost by deferring it:

> **M3.12b deliverable.** Decide which population `complicationRate`, `uneventfulRate` and
> `fallbackRate` belong over, and move them in the same commit that sets a real `BASE_EVENT_ODDS`
> — where the fence is coming down anyway and all three are expected to move. The question is
> **separable** (it does not interact with the gate), **pre-existing** (legs-vs-selections has been
> wrong since the sim had a `legs` field, gate or no gate), and **invisible today**: `uneventful`
> and `fallback` both measure exactly 0 on both packs, so only `complicationRate` carries any error
> at all, and at `1:0` it carries 0.59%.

#### The 0.59% is the value AT `1:0`, and it GROWS at exactly the milestone this defers to

That number is exact today and wrong to carry forward, because the deferral lands at M3.12b, where
a positive quiet share is the whole point. `attemptedLegs` and `presentedLegs` are **mixed-unit
subtractions** — a leg-INDEX sum (`totalLegs`) minus per-SELECTION counts (`quiet`, `uneventful`) —
so the absolute error stays pinned at the 315 selections D9 counts while the remainder it sits in
shrinks with the quiet share. The relative error therefore concentrates:

| corpus quiet share `q`               |     0% |    10% |    20% |    30% |    40% |
| ------------------------------------ | -----: | -----: | -----: | -----: | -----: |
| `complicationRate` denominator error | 0.589% | 0.655% | 0.738% | 0.844% | 0.986% |

It is `315 / (53,451 − q × 53,766)`, and it is a lower bound on the damage rather than the whole of
it: `uneventful` measures exactly 0 today, so `presentedLegs` currently loses only the `totalLegs`
term. **By q = 40% the error has nearly doubled, and `fallbackRate` and `uneventfulRate` — free
today only because their numerators are 0 — inherit the same denominator the moment either becomes
non-zero.** Defer it once more and it is a third-decimal problem, not a fourth.

**The fix is to count the SUBTRAHENDS and the MINUEND over one population — NOT to "divide by
selections".** This is the reading the paragraph above invites and it is wrong: `rate(complicated,
totalSelections)` throws away the subtraction that gives these three rates their meaning (only a leg
that ATTEMPTED selection can fall back; only one that PRESENTED an event can carry a complication),
and it would move `complicationRate` far more than 0.6–1.0%. The defect is _inside_ the subtraction,
not in the choice of final divisor. Concretely: `attemptedLegs` should be
`totalSelections − quiet` and `presentedLegs` `attemptedLegs − uneventful`, so that the minuend and
both subtrahends are all per-selection — which is also what makes the numerators (`complicated`,
`fallback`, `uneventful`, all counted per selection) match their own denominators. Whether the
answer is to lift the minuend to selections or to push the subtrahends down to legs is the call
M3.12b owes; what is NOT open is leaving the two sides on different populations.

A regression test pins both halves — that the two new lines divide by selections, and that the
three old ones do NOT — because "finish the job" is precisely how a later sweep would kill the
fence without noticing. That is the same failure mode as Decision 6's own list of three: a
mechanical sweep that fixes everything it finds is as wrong as one that finds nothing, and **the
unit question still has no default answer.**
