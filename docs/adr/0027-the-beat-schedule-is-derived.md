# 0027 — The beat schedule is derived from the route

- **Status:** Accepted
- **Date:** 2026-08-09
- **Implements:** ADR 0013 (beat-slot lifecycle) — the generator it was written for
- **Relates to:** ADR 0010 (director scoring), ADR 0026 (the leg model)

## Context

`BeatSlot` has existed since Phase 1 with a concrete `legIndex`, and `beat-slot.ts:5-9` says
explicitly that the fractional placement is _"a statement about the GENERATOR"_ which did not yet
exist. It exists now. This ADR is what it emits and, more importantly, the four invariants it has to
enforce itself — because `validateRoute` checks none of them.

## Decision 1 — one allocator, two consumers, and it is cumulative-floor

`planLegs` produces `arrivalLegOfEdge[]`; both `deriveLegLocations` and `deriveBeatSchedule` read
it. Deriving them separately is how a border slot and a `border_crossing` leg drift apart.

```
arrivalLegOfEdge[i] = floor(cumKm[i+1] × legCount / totalKm) − 1     // −1 if merged forward
```

**Cumulative-floor, not largest-remainder.** Largest-remainder is a different algorithm that
requires ranking fractional remainders — floats, with exact ties on any equal-length run, which is a
fresh ordering-nondeterminism surface in a design whose whole selling point is that it has none. It
is also wrong against the specification by example: on `fixture.scenic` (three equal edges, 16 legs)
it gives arrivals 5/10/15 where the fixture has **4/9/15**. Cumulative-floor gives 4/9/15.

Two floors are applied before allocation: every `viaCrossingNode` edge gets **≥2 legs** (Decision 3c),
every ferry edge exactly **1**.

## Decision 2 — the placement table

| #   | beat              | leg                                                                     | slack                    | source        |
| --- | ----------------- | ----------------------------------------------------------------------- | ------------------------ | ------------- |
| 1   | `departure`       | `0`                                                                     | 0                        | fixed         |
| 2   | `finale`          | `legCount − 1`                                                          | 0                        | fixed         |
| 3   | `border_crossing` | first leg of the crossing edge's span, capped at `MAX_BORDER_BEATS = 4` | 1                        | route-derived |
| 4   | `ferry_boarding`  | the ferry edge's single leg                                             | 0                        | route-derived |
| 5   | `midpoint_crisis` | `mulDivRound(legCount, 50, 100)` ± 2 jitter                             | `legCount >= 20 ? 3 : 2` | curve         |
| 6   | `approach`        | `mulDivRound(legCount, 83, 100)` ± 1 jitter, only if `legCount >= 14`   | 2                        | curve         |

Slack 0 on the two anchored beats matches all three fixtures and is right: `slackLegs: 0` expires on
its own leg, which is what an anchor wants.

**The 50/100 and 83/100 fractions are a decision consistent with the fixtures, not a constant
recovered from them.** They reproduce all five curve beats exactly under `mulDivRound` — but so do
48–52/100 and 82–84/100. Pinning them here is what makes them stable.

The `approach` presence threshold is **14**, not 16, deliberately: 16 is the short-trip ceiling, and
a threshold sitting on a mode boundary invites an off-by-one that only surfaces on
exactly-16-leg routes.

## Decision 3 — four invariants the generator enforces itself

`validateRoute` checks slot range and duplicate `legIndex` and nothing else. These four are the gap.

**(a) Slots are emitted in ascending `legIndex`.** `dueBeatSlot` returns the **first open slot in
array order** (`beat-slots.ts:27-32`), not the lowest `legIndex`. An out-of-order schedule silently
lets a later beat win, with no error anywhere. Named test.

**(b) Windows do not overlap:** `slot[i].legIndex + slot[i].slackLegs < slot[i+1].legIndex`.

> **This is already violated in the shipped fixture and nobody had noticed.** `fixture.illicit` has
> `border_crossing@17 slack 3` (window 17–20) and `approach@20 slack 2`. At leg 20 the border slot
> masks `approach` — `advanceBeatSchedule` (`:60-77`) slides or expires _every_ open slot each leg
> while `dueBeatSlot` offers only the first, so the approach slot is marked `slid` without ever being
> attempted, and then expires. **Every such collision reports as a beat expiry, which reads as
> content starvation, for what is a scheduling bug.**
>
> **Do not add this check to `validateRoute`.** It would invalidate `fixture.illicit`, break the 13
> test files that route through `make-route.ts`, and force a `routes.json` edit that moves the
> fixture baseline — and the fixture baseline is the control. It is a generator invariant with its
> own test, plus a documented known issue on the fixture.

**Separately recommended and free:** change `dueBeatSlot` to return the open slot with the lowest
`legIndex` rather than the first in array order. It is **provably digest-neutral on the current
fixtures**, because all three schedules are already ascending, so lowest-index _is_ first-in-array.
It lands as an isolated commit before route generation so any future digest movement is attributable.

**(c) A slot's whole window must lie on legs where its beat's events are location-eligible.** A
border slot with slack 3 on a route where only leg L is typed `border_crossing` has three dead legs:
the beat gate (filter 3, `hard-filters.ts:78-86`) passes, but the location filter (filter 4) rejects
every border event — and `locationTypes` relaxes **last**, at rung 5, while `beatGate` goes at rung 1,
so by the time location relaxes the slot no longer gates anything. The slot reports `slid` for three
legs and then `expired`, pushing beat fill _down_.

Fix: every crossing edge gets ≥2 legs, the leg before the crossing is typed `checkpoint` and the
crossing leg `border_crossing`, and the slot sits at the first with `slackLegs: 1`. Both types are in
`LOCATION_TYPES` and border events typically list both. Ferry slots get `slackLegs: 0` — one leg, one
type.

**(d) No slot's _window_ may intersect a montage leg** — the whole `[legIndex, legIndex+slackLegs]`
range, not just the index. Collision repair pushes past the entire window.

## Decision 4 — jitter is cursor-free on `routeGen`

```ts
const key = deriveKey(streamKey(seed, 'routeGen'), `${startId}>${endId}:${profile}:beat:${type}`);
const jitter = Math.floor((drawWord(key, 0) / 4294967296) * (2 * span + 1)) - span; // never modulo
```

**Cursor-free is mandatory here, not stylistic.** The _number_ of jitter draws depends on how many
beats a route has, which depends on the graph. A cursored draw would make `routeGen`'s cursor a
function of geography, so a geography edit would move every save fixture — the exact failure
`chanceGate` was invented to prevent (`rng-stream.ts:4-11`, ADR 0005). Cursor-free keeps
`routeGen: 0` in all eight save fixtures and preserves `create-run-state.test.ts:40-44`.

Note `drawWord` is **not** barrel-exported (`index.ts:247` exports `deriveKey` and `streamKey` only).
Engine code imports it from `../rng/draw-word.ts`; any tool-side draw needs a barrel export added in
the same commit.

All slots are emitted `status: 'pending'` — `createRunState:47-51` normalises only `legIndex` and
`progressKm`, so a schedule arriving `'filled'` would start a run with beats already consumed.

## Decision 5 — unfillable slots are still scheduled, and here is the measured ceiling

The tempting optimisation is to pass `pack.unfillableBeatTypes` into the generator and drop those
slots. **That is gaming the metric.** `run-many.ts:106` is `rate(filled, filled + expiredBeats)`, so
an unfillable slot can only ever land in the _denominator_ — removing it raises the ratio
mechanically with zero change to what a player experiences, against a milestone whose acceptance
test is beat fill. Where a route-aware check is wanted, use `unfillableBeats(route, pack)`
(`beat-slots.ts:89-95`), not the route-blind `pack.unfillableBeatTypes`.

**Measured at M3.0 against the shipped packs**, so the target is a number rather than a hope:

| beat type         | slots across the 3 fixture routes | corpus event?                                |
| ----------------- | --------------------------------: | -------------------------------------------- |
| `departure`       |                                 3 | —                                            |
| `border_crossing` |                                 2 | `border.night_crossing`                      |
| `ferry_boarding`  |                             **0** | —                                            |
| `midpoint_crisis` |                                 3 | `weather.the_storm_you_cannot_drive_through` |
| `approach`        |                                 2 | —                                            |
| `finale`          |                                 3 | —                                            |
| **total**         |                            **13** | 2 of 6 types fillable                        |

Corpus ceiling **5/13 = 38.5%**, observed **30.1%** ⇒ **fill-of-fillable = 78%**. Projecting that
rate onto a generated schedule (`departure + finale + midpoint + approach + B` borders):

| borders | slots | fillable | ceiling |   × 78% |
| ------: | ----: | -------: | ------: | ------: |
|       2 |     6 |        3 |   50.0% | **39%** |
|       3 |     7 |        4 |   57.1% | **45%** |
|       4 |     8 |        5 |   62.5% | **49%** |

> **Route generation alone honestly buys ~30% → ~40–49% beat fill. The rest needs
> `departure`, `approach` and `finale` events, which is content work and not this phase.** Write
> that into the milestone acceptance criteria so nobody reads 40% as a failure or omits slots to
> reach 60%.

Two corrections fall out of the same measurement:

- **No fixture route schedules `ferry_boarding`.** `docs/sim-baseline-corpus.md:32` and
  `docs/PROGRESS.md:472` both say they do. Both are wrong and are fixed at M3.1.
- **`finale` regressed from fillable to unfillable when the corpus replaced the fixtures.** The
  fixture pack has `arrival.final_stretch`; the corpus has no `finale` event at all. That is the
  single highest-value beat event to author, because `finale` is scheduled on every route.

**And the measurement-validity trap:** specify the corpus route set's beat mix as an explicitly
reviewed property — "≥2 crossing edges per route; no ferry edges until a `ferry_boarding` event
exists" — and assert it in a test over `corpus-routes.json`. Otherwise the headline metric moves
whenever somebody re-picks endpoints.

## Consequences

- `deriveLegLocations` shares the allocator, so `border_crossing` legs and border slots cannot
  disagree. Its one honest limitation: it reproduces the fixtures' _arrivals_ and their
  `border_crossing` placement (verified — `fixture.illicit` arrivals 5, 11, 17, 23 with borders at 5
  and 17) but **not** their mid-edge texture, where `rest_stop` appears at legs 3, 11 and 22. Narrow
  the claim; do not write a test pinning arbitrary numbers.
- `LOCATION_TYPES` has no at-sea member, so a ferry leg is typed `port` (both endpoints are ports).
  Adding `sea` is a vocabulary change touching L2, a schema and the locale. Deferred, noted.
- The `fixture.illicit` window overlap is left in place on purpose and documented, because the
  fixture is the control. Fixing it would move the baseline this phase is measured against.
