# 0029 — The quiet-leg gate: odds, not probabilities

- **Status:** Accepted, lands last in Phase 3 (M3.12)
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
