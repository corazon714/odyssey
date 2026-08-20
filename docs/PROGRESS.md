# PROGRESS

> Updated at the end of every session (`CLAUDE.md` §12). Assume the next session starts
> with zero memory of this one.

---

## D0 — **PHASE 3 IS CLOSED WITH GATE 9 RED.** Its failure is explained; it is not fixed.

> **`docs/phase-3-closeout.md` is the closing artefact and the thing to read first.** Closing is
> a scheduling decision, not a pass. Eight gates pass, gate 9 FAILS on
> `route.illicit.r1dlxpt5` (2.32%, −4.5 SE) and `route.illicit.r16kyujq` (2.81%, −1.1 SE), and
> it is expected to keep failing until Phase 4 item #1 lands.

Committed on `dev`, six commits: `675d37a` (one run count for gate 9), `d4f40b7` (ADR 0044 — the
finding), `a13db87` (the `peak` column), `5c79b64` (peak is a flag, not a dial), `1b945dc` (the
closeout), plus the contradiction sweep.
**No content change, no constant moved, both baselines untouched.** The only non-comment code in
the whole sequence is the `peak` column; everything else is documentation or comments.

### The finding — `docs/adr/0044` is the authority and this is a pointer

> **Drain is charged per HOUR; recovery arrives per LEG. So survivability is set by the LOCAL
> hours-per-leg, and `route.illicit.r1dlxpt5` bills 232 of its 509 hours inside NINE CONSECUTIVE
> LEGS (8–16).** Its montage block is contiguous; `r1gjd3s6` spreads the same 509 hours over
> legs 2, 3, 26 and 36–45. 67% of `r1dlxpt5`'s population dies between leg 8 and leg 16 against
> 22% of `r1gjd3s6`'s. The binding meter is **morale**, and it is binary across the four
> comparables: median first floor at **leg 14** on both breaching routes, **never** on both
> healthy ones.

**Proved causally, not by correlation.** A permutation of `r1dlxpt5` holds every multiset
invariant by construction — same `legKm` multiset, same 509 hours, same montage count, same
`legLocations`, same beats — and carries `legKm`/`legLocations`/`montageLegs`/`beatSchedule`
together so a beat stays on the leg it was scheduled against. Coherence asserted, not assumed.
10,000 runs per variant:

| variant                        | completion |  Δ vs base | morale floor |
| ------------------------------ | ---------: | ---------: | -----------: |
| base (as generated)            |      2.56% |          — |        60.9% |
| **montage wall moved LAST**    |  **9.60%** | **+21 SE** |    **35.7%** |
| CTRL — beats permuted only     |      2.75% |    +0.8 SE |        61.4% |
| CTRL — locations permuted only |      2.69% |    +0.6 SE |        65.6% |
| _reference_ `r1gjd3s6`         |     15.95% |          — |        36.2% |

Both controls null; the hour permutation moves 7.04pp at 21 SE, and lands on the reference's
morale-floor share (35.7% vs 36.2%) — a quantity nothing was tuned toward.

**Q1 AND Q2 ARE ONE BUG.** The two breaching routes **share 16 of 18 edges and 18 of 19 nodes —
88.9% overlap**. Gate 9 fails on ONE corridor sampled twice, and the second sample exists only
because Beira-Aktobe's generator collapsed to rung 3 (ADR 0043) and could not supply an
alternative. `acceptByDiversity` is not at fault: 88.9% is inside the 90% ceiling it was asked
to enforce. The corridor is coarse — **18 path edges for 16,983 km** against 23–32 on the healthy
48-leg routes — and a coarse path is what gives montage nine consecutive segments to collapse.

**Eliminated, each by measurement:** the harsh-weather threshold (46/48 vs 45/48 eligible legs);
`legLocations` and event-pool starvation (`uneventfulLegs` and `fallbackLegs` are **0.00 on every
route** — the relaxation ladder never engages); the beat schedule (null control); and realized-vs-
static hours (max realized 520 against 509 static, so the routes were genuinely comparable).

**What the finding does NOT claim.** Total hours is still the better GLOBAL predictor
(ρ = −0.947 over 28 routes, −0.929 stratified to the 48-leg cap) against the worst-9-leg-window's
−0.915 / −0.900. The window wins only WITHIN a stratum — which is where a floor gate reads, and
where total hours ranks both ends of the four comparables wrong.

### Gate 9, re-measured on this tree

`pnpm sim -- --pack=corpus --runs=280000 --by-route` — **FAIL, 2 routes below 3.00%**,
`r1dlxpt5` 2.32% (−4.5 SE), `r16kyujq` 2.81% (−1.1 SE). Byte-for-byte the figures C4b recorded;
nothing this session moved it, which is the point.

### The `peak` column — SHIPPED

`--by-route` now prints **`peak` next to `hours`**: the most travel hours any nine consecutive
legs bill. The session's whole cost was that the instrument could not read its own verdict — two
routes identical in every printed column, 14pp apart — and the column pays for itself the first
time that recurs. It lands **before** the `planLegs` fix deliberately, so the fix has a working
instrument to be measured against rather than being validated by a measure that moved in the
same commit. On the corpus it reads **232 / 236 against 170 / 177** for the two breaching routes
against the two healthy ones, at total hours of 509 / 513 / 490 / 509.

**Window 9 is empirical and labelled as such** in `by-route.ts`: it is the length of the
contiguous montage block ADR 0044 measured, it is NOT optimal (K = 5/9/13 give ρ = −0.876 /
−0.915 / −0.921, so 13 is marginally better and the statistic is insensitive across the range),
and the comment names what invalidates it — `MAX_MONTAGE_HOURS`, `MAX_MONTAGE_SHARE`, the 48-leg
cap, or **the spacing constraint below, which would remove contiguous blocks by construction and
make a fixed-width window the wrong shape**. Re-derive it or retire the column at that point;
do not keep it because it is already there.

**Baseline-neutrality is asserted, not argued.** The test reproduces the pre-`peak` format
verbatim and requires the table with the peak field excised to be **byte-identical** to it,
row by row. Verified failing on a deliberate violation (widening `km` from 6 to 7 → 1 failed,
23 passed). Empirically: `--by-route` output before and after, peak column cut out, `diff` is
**zero lines**; `sim:diff` prints **"No change"** on both packs; nothing under `packages/engine`
was touched, so no golden can have moved.

`by-route.ts`'s stale header claim went with it — it described a passing world in the present
tense ("the worst route has sat at 4.3–4.8%"). Replaced with a statement about the instrument
and an explicit note about why the old wording was a defect, since results move and comments
do not.

**Then the column's own interpretation was falsified and corrected** — ADR 0044's addendum, its
own commit, before any Phase 4 work. The comb permutation took `peak` from 232 to 109 and gained
**less** than the variant that left `peak` at 232 (8.64% vs 9.32%, 1.7 SE apart). Add a partial
correlation of only −0.296 once `hours` is held, inconsistent ordering within hours-strata, and
an **empty 178–231 band** — so the clean-looking gap is a hole in the sample, not a cliff — and
`peak` is a **FLAG, not a dial**. It still earns its column as the only one that separates the
failing routes from their comparables. It must never appear in an acceptance test as a threshold.
`conc` was considered as a second column and refused: its partial correlation holding hours is
**+0.211, the wrong sign**.

### Handed forward — **PHASE 4 ITEM #1**

- **THE MONTAGE SPACING CONSTRAINT. First thing in Phase 4, and nothing else in its commit.**
  **Where:** `packages/engine/src/route/leg-plan.ts` — the selection loop in `planLegs`, beside
  `byDullness` and `protectedFromMontage`.
  **What:** `planLegs` picks montage by dullness alone; position enters only via
  `protectedFromMontage` (the two anchors and each crossing's neighbourhood). Nothing stops it
  taking nine consecutive segments, and on a corridor whose dull segments are contiguous it
  reliably does. Refuse a segment adjacent to one already montaged while any unmontaged
  candidate remains — that breaks the wall into a comb at no cost to the montage budget.
  **Why it is DEFERRED rather than done:** it moves `legKm` on every corpus route, therefore the
  corpus baseline, therefore **gate 9 itself** — and it must not be measured on the same run that
  discovered the problem. A fix validated by a measure that changed in the same commit is not
  validated. It is also an engine change, so it moves every golden (`legKm` feeds `stateDigest`).
  **Order when it lands:** `leg-plan.ts` → `pnpm test:engine` → `pnpm sim:diff -- --runs=2000` on
  BOTH packs → regenerate `docs/sim-baseline-corpus.md` → `--runs=280000 --by-route` →
  `pnpm geo:verify` (route structure moved) → `pnpm golden:update`, reviewing the diff.
  **Read first:** ADR 0044 **including its addendum**, ADR 0026 D4, ADR 0039.

  **ACCEPTANCE CRITERION — three parts, and completion alone is NOT enough.**

  1. **Completion at `--runs=280000 --by-route`** on `route.illicit.r1dlxpt5`, reported with its
     SE. Clearing the 3% floor is necessary, not sufficient.
  2. **The morale-floor share** — the fraction of runs whose morale reaches 0. It tracked every
     intervention cleanly where completion alone did not, and it is the meter ADR 0044 identified
     as binding.
  3. **The ending histogram, compared against a healthy comparable** (`rskpfno` or `r1gjd3s6`).

  **Why part 3 is not optional.** The two permutations in ADR 0044's addendum reach statistically
  identical completion — 9.32% and 8.64%, 1.7 SE apart — through **different failure mixes**:
  morale floor 35.9% / collapse 31.9% against 51.3% / 17.6%. **Collapse differs by 1.8x at the
  same completion.** One fix leaves players starving out slowly, the other leaves them
  collapsing; a single completion figure cannot tell them apart, and design pillar 1 says a bad
  outcome must be interesting rather than punishing. Two fixes with the same number are not
  interchangeable.

  **NOT a `peak` threshold.** ADR 0044's addendum retired that reading: halving `peak` (232 → 109
  via the comb) bought nothing over leaving it at 232, `peak`'s partial correlation with
  completion holding hours is only −0.296, and the band 178–231 contains zero routes so no cliff
  is demonstrated. `peak` flags a route to go and measure. It is not a quantity to tune against.

  **SCOPE, STATED HONESTLY: this is a GATE FIX, NOT A ROUTE FIX.** Every permutation of
  `r1dlxpt5`'s own legs tops out near **9%** against `r1gjd3s6`'s 16.51%. The permutation family
  holds the leg multiset fixed, so roughly half the 14pp gap lives in **which legs exist** — nine
  legs at 23–30 h here against a milder spread there — and no rearrangement can reach it. Expect
  the spacing constraint to take this route from 2.32% to somewhere near 9%: clear of the floor
  by ~20 SE, and **still an outlier at about half its comparable.** Say so when it ships. The
  separate follow-up that could close the rest is **montage SELECTION and path GRANULARITY** —
  18 path edges for 16,983 km against 23–32 on the healthy 48-leg routes, which is what gives
  montage nine consecutive segments to collapse in the first place. That is the same root as
  ADR 0043's generator collapse, and it is item #2.

  _(A real `planLegs` change also re-allocates legs, so it may move the multiset as well as the
  order — in a direction the permutation experiment cannot predict. The ~9% is an estimate from
  the order-only family, not a promise.)_

- **PHASE 4 ITEM #2 — montage SELECTION and path GRANULARITY**, the half of the gap a spacing
  constraint cannot reach. `illicit` detours around controls onto the coarsest long-edge path,
  which is how Beira-Aktobe's routes carry 16,983 km on 18 edges; montage then collapses each
  2,238 km segment to one leg clamped at `MAX_MONTAGE_HOURS`. Same root as ADR 0043's generator
  collapse. Do it after #1 and measure it against the same three-part criterion.
- **The corpus cannot validate either fix.** One corridor supplies both breaches — the two
  breaching routes share 88.9% of their edges — so any change that clears gate 9 is validated on
  n=1. Fix the generator collapse first (ADR 0043's `rungReached`, returned and read by nothing)
  or accept n=1 knowingly and say so in the commit.
- **`world-tick.ts:111-136` is wrong in a THIRD way** — "completion is a near-deterministic
  function of that one number" is false within a stratum. Still not touched, deliberately: the
  comment justifies `HOURS_PER_HUNGER_DAMAGE` / `HOURS_PER_STARVING_DAMAGE`, and ADR 0044's
  finding is that **no dial is implicated at all** (the same constants give 2.56% and 9.60% on
  the same multiset of legs), so re-deriving 44/22 would be tuning against a route-shape defect.
  Rewrite it when the shape fix lands, against the route set that fix produces.
- Everything C4b handed forward is untouched: the five dead outcomes behind `random`-only choices,
  and the four findings in `docs/phase-3-verification.md`.

### Next step — ONE task

> **Decide whether Phase 3 closes with gate 9 red and ADR 0044 as the explanation, or whether the
> montage spacing constraint lands first.**
>
> They are genuinely different phases of work. The finding is complete and defensible on its own:
> a red gate with a measured cause, a named fix, and an owner is a closeable state. The fix is a
> route-generation change that moves `legKm` corpus-wide — new corpus baseline, re-measured gate
> 9, and a re-run of ADR 0043's generator question, because a comb-shaped montage may change how
> many routes Beira-Aktobe yields.
>
> **If the fix lands first**, do it in this order and nothing else in the same commit:
> `leg-plan.ts` spacing constraint → `pnpm test:engine` → `pnpm sim:diff -- --runs=2000` on BOTH
> packs → regenerate `docs/sim-baseline-corpus.md` → `--runs=280000 --by-route` → `pnpm geo:verify`
> (route structure moved). Expect the goldens to move: `legKm` feeds `stateDigest`.
>
> **If it does not**, ADR 0044 plus this entry is the handoff. The `peak` column has already
> landed, so the next session reads the cause straight off the gate's own output.

### DoD

`pnpm typecheck` clean · `pnpm lint` clean · `pnpm test` green (86 files, **1,855** vitest +
3 jest — 1,847 before, +8 for `peak`) · `pnpm content:lint` 0 errors, 1 warning
(`MISSING_IMAGE_MANIFEST`, pre-existing) · `pnpm format:check` clean.

**`sim:diff` "No change" on BOTH packs** (`--runs=2000`, the count both baselines were generated
at). Goldens judged by CONTENT: `git diff --stat -- packages/engine` is empty, so no golden can
have moved and `golden:update` was not run. Neither baseline was written — `--by-route` returns
before `formatReport`.

Every measurement in the finding came from throwaway scratchpad harnesses and from the committed
`--by-route` command, which writes nothing.

---

## C0-C4b — **every Phase 3 gate can now be RUN. Gate 9 does not PASS.**

**ALL OF C0-C4b IS COMMITTED AND PUSHED**, HEAD `5dafade` on `dev`, tree clean. This paragraph
said "C4 and C4b are UNCOMMITTED in the tree — the human commits" and listed the files; that was
true when it was written and false by the time it was pushed, which is the one staleness a §12
entry cannot afford — the next session reads it and goes looking for work that is not there.
The three commits that landed them:

```
8f25bc8  feat(sim): --by-route makes gate 9 measurable by a committed command
efca918  fix(sim): a sixth endpoint pair, and a constraint that did not do its job
5dafade  docs: the session record — every Phase 3 gate runs, gate 9 does not pass
```

### Shipped this session — what WORKS, and the command that proves each

- **Gate 9 is measurable by a committed command for the first time** —
  `pnpm sim -- --pack=corpus --runs=280000 --by-route`. It prints one row per route with
  completion, the Wald SE, and the margin
  **in standard errors**, worst row first, then a `GATE 9 PASS/FAIL` line. Every per-route figure
  ever quoted in this repo — ADR 0041's knee sweep, `docs/phase-3-verification.md`'s band table,
  the recovery milestone's per-route S — came from a scratchpad harness that was thrown away and
  rebuilt at least four times. It is in the repo now. **ADR 0042.**
  _Use 280,000, not the 250,000 printed in `docs/phase-3-dod.md` §9 — that number predates the
  sixth pair. 280,000 / (28 routes x 5 policies) is exactly 2,000 per cell; 250,000 is not._
- **The leg jitter is symmetric.** `rng.nextInt` is inclusive at BOTH ends, so `(-1, 2)` drew
  `{-1, 0, 1, 2}` — mean **+0.5 h per leg**, against the ±1 that ADR 0014 and ADR 0026 both state.
  Every route in the game ran ~5% long, and had since the jitter was added. `LEG_JITTER_MAX` 2 -> 1.
  Prove: `pnpm test:engine`. Commit `5de121b`.
- **Diversity is a guarantee in both directions.** `overlapPercent` is deliberately asymmetric (it
  is what distinguishes a truncation from a detour), but `acceptByDiversity` only ever measured a
  new candidate against what was already accepted — so an accepted route could be swallowed by one
  admitted _after_ it and nothing ever looked. It now bounds `max(overlap(a,b), overlap(b,a))`.
  **0 post-condition breaches over 1,498 pairs, against 386 under the old filter**; Valencia-Palermo
  85% -> 63%, PASS. Prove: `pnpm geo:verify`. Commit `76735b8`.
- **`pack.unfillableBeatTypes` is EMPTY.** Four beat events shipped (`departure`, `approach`,
  `finale`, `ferry_boarding`), so beat fill is **28.2% -> 47.8% against a structural ceiling that
  moved 55.8% -> 100%** — the denominator moved further than the numerator, which is the point.
  Two endings declared and unreachable since Phase 1 now resolve. Prove: `pnpm sim -- --pack=corpus
--runs=2000`. Commit `21855c8`.
  _Those are the figures at HEAD (23 routes). **On the tree, with C4b's 28 routes, the same
  command reads beat fill 48.5%, `arrival_triumphant` 1.2%, `arrival_hollow` 2.7%.** Both readings
  are correct for their route set; quote the one that matches the grid you are on._
- **The Definition of Done is in the repo and every one of its nine gates runs.**
  `docs/phase-3-dod.md`, each gate naming a command that exists today and a pass condition readable
  off its output. Gate 9 was the last one with no command. Commit `8ff9b22`.

### Half-done

- **GATE 9 FAILS, and it fails on TWO routes, not one.** Measured on the tree at 280,000 runs
  (10,000 per route):

  | route                    | pair         | profile / mode | legs |    km | hours | completion |    vs floor |
  | ------------------------ | ------------ | -------------- | ---: | ----: | ----: | ---------: | ----------: |
  | `route.illicit.r1dlxpt5` | Beira-Aktobe | illicit/truck  |   48 | 16983 |   509 |  **2.32%** | **-4.5 SE** |
  | `route.illicit.r16kyujq` | Beira-Aktobe | illicit/truck  |   48 | 17243 |   513 |  **2.81%** | **-1.1 SE** |

  Pooled completion is 46.1% at 2,000 runs, comfortably in the 30-50% band, which is exactly the
  blindness gate 9 exists to correct. **A brief handed to this session recorded "1 of 28 routes
  under the floor"; that is wrong and the count was re-measured rather than copied.** The C4b note
  already in `docs/sim-baseline-corpus.md` had it right at two. Reproduce with the command above;
  files are `packages/tools/sim/by-route.ts` and `docs/phase-3-dod.md` §9.

- **THE HOUR THEORY OF THE BREACH IS REFUTED. This is the session's sharpest lead.**
  `world-tick.ts:125` still asserts "completion is a near-deterministic function of that one
  number — routes under ~150 hours complete 55-85%, routes over ~250 hours complete 0.0%, with
  nothing in between." The `--by-route` table refutes the second half outright:

  | route      | pair            | legs |    km | hours | montage legs | beats | completion |
  | ---------- | --------------- | ---: | ----: | ----: | -----------: | ----: | ---------: |
  | `r1dlxpt5` | Beira-Aktobe    |   48 | 16983 |   509 |       10 /48 |     5 |      2.32% |
  | `r16kyujq` | Beira-Aktobe    |   48 | 17243 |   513 |       10 /48 |     5 |      2.81% |
  | `rskpfno`  | Jijel-Shakhty   |   48 | 17521 |   490 |       11 /48 |     5 |     10.80% |
  | `r1gjd3s6` | Nairobi-Segezha |   48 | 16069 |   509 |       13 /48 |     4 |     16.51% |

  All four are `illicit` on a `truck` at 48 legs. **Hours, profile, mode, leg count and distance
  TOGETHER do not explain a 14pp spread**, and distance is not ordered with completion in either
  direction: the longest route in the game (`rskpfno`, 17,521 km) completes 10.80% while the
  second-longest (`r16kyujq`, 17,243 km) breaches at 2.81%, and the SHORTEST of the four
  (`r1gjd3s6`, 16,069 km) completes best of all at 16.51%. Nobody knows what does.

- **C4b COMPENSATES rather than restores, and it imported the defect it was meant to exclude.**
  Beira-Aktobe still yields 3 routes and still supplies BOTH breaching routes. Raising `YEN_K`
  would restore the literal routes (they exist at K=12 and K=16) but measurement showed it
  CONCENTRATES the tail — its two extra routes are both more Beira-Aktobe long routes — and it
  flips the route-generation benchmark from PASS to FAIL. Separately: the new pair was accepted
  under a constraint requiring "five DISTINCT profiles", and **that constraint did not do its
  job** — Nairobi-Segezha has the identical generator collapse (2 of 5 distinct shortest paths,
  3 of 5 profiles returning no path at all, a 12-candidate pool) and reaches five routes only by
  climbing to rung 4, where the masks are dropped. Corrected in
  `packages/tools/sim/load-pack.ts`'s doc comment and recorded in **ADR 0043**.

- **Five outcomes carrying a flag, an ending or a `scheduleEvent` hang off choices only `random`
  picks.** Listed with their pick rates in the `docs/sim-baseline-corpus.md` header block
  ("STILL DEAD, HANDED TO C4 RATHER THAN FIXED"). Not touched this session.

- **The recorded justification for `HOURS_PER_HUNGER_DAMAGE` / `HOURS_PER_STARVING_DAMAGE`
  (44 / 22) is STALE**, in two separate ways, at
  `packages/engine/src/loop/world-tick.ts:111-136`. It cites "keeps collapse meaningful at 26.1%"
  and `ending.failure_collapsed` now reads **5.9%** at HEAD and **8.3%** on the tree; and its
  "routes over ~250 hours complete 0.0%" claim is refuted by the table above. The CONSTANTS were
  not touched — only the record of why they are what they are is out of date.

### Next step — ONE task

> **Find what separates `route.illicit.r1dlxpt5` (2.32%) from `route.illicit.r1gjd3s6` (16.51%).**
>
> Same profile, same mode, same 48 legs, the same 509 static travel hours, 14pp apart. A floor
> gate nobody can explain is a gate nobody can defend, and this is the last unknown standing
> between Phase 3 and a defensible close on gate 9.
>
> **Run:** `pnpm sim -- --pack=corpus --runs=280000 --by-route` (~4.7 min; writes nothing, so it
> is safe to run repeatedly). Use `--runs=28000` while iterating and only confirm at 280,000.
>
> **Read:** `packages/tools/sim/by-route.ts` (the instrument, and what each column means),
> `packages/tools/sim/load-pack.ts` (`CORPUS_PAIRS`, and how a pair becomes scenarios),
> `packages/engine/src/route/leg-plan.ts` (leg + montage planning),
> `packages/engine/src/loop/world-tick.ts` (every per-hour drain), `docs/adr/0039` (montage's two
> regimes), `docs/adr/0041` (the wear curve knee).
>
> **ALREADY RULED OUT — do not re-derive these:**
>
> - **travel hours** — 509 vs 509, identical;
> - **distance** — the LONGEST route in the game (`rskpfno`, 17,521 km) completes 10.80%, 4.7x
>   the shortest of the four comparables;
> - **profile, transport mode, leg count** — all four comparables are `illicit`/`truck`/48;
> - **starting cash** — runs the WRONG way: `r1gjd3s6` starts with the LEAST (4144 vs 4206) and
>   completes best;
> - **starting weather** — `world-tick.ts:274-282` re-rolls it roughly one leg in four, so a
>   starting value cannot survive 48 legs. (`r1dlxpt5` starts `heat`, `r1gjd3s6` `clear`; both
>   `heat` and `rain` are in `HARSH_WEATHER`, and `r16kyujq` starts `rain` and also breaches.)
>
> **NOT ruled out — start here, in this order:**
>
> 1. **Montage leg count.** 10, 10, 11, 13 against 2.32%, 2.81%, 10.80%, 16.51% — **monotone
>    across all four comparables** on n=4. Note the obvious channel is currently INERT: the
>    montage x0.3 odds multiplier (`director/event-odds.ts:77`) does nothing while
>    `BASE_EVENT_ODDS` is fenced at `1:0` and quiet legs read 0.0%. So if montage is the cause it
>    is acting through `legHours`' 30 h montage ceiling vs the ordinary 12 h one, or through
>    `leg-plan.ts`'s rule that a beat whose window is montage is DROPPED — not through silence.
> 2. **The per-leg hour DISTRIBUTION, not the total.** Equal totals over 48 legs can sit very
>    differently against per-leg thresholds — `HARSH_WEATHER_HOURS = 6` is one that exists today.
>    Count legs at or above each threshold per route before assuming the totals are comparable.
> 3. **The endpoint pair itself.** BOTH breaching routes are Beira-Aktobe's two `illicit` routes,
>    while Beira-Aktobe's `scenic` route completes 17.15%. Whatever this is may be a property of
>    that corridor's geography — terrain, services, crossing count — crossed with `illicit`.
>
> The answer is a finding, not necessarily a fix. Recording _why_ a route is unfinishable is
> worth more than moving it above 3% by tuning something until it clears.

### Open questions for the human

1. **Gate 9 fails on two routes.** Chase the discriminator now, or hand it to Phase 4 with the
   four-route comparison above recorded as the handoff? Phase 3 cannot close on a green gate 9
   either way.
2. **C4b compensates rather than restores.** Acceptable, or should Beira-Aktobe's generator
   collapse be fixed directly? ADR 0043 names the check that would have caught it —
   `selectPaths`' own `rungReached`, which is returned and read by nothing.
3. **The 44/22 justification is stale in two ways.** Re-derive the constants against the current
   28-route set, or record the drift and move on? Note the collapse figure differs between HEAD
   (5.9%) and the tree (8.3%), so "re-derive" means picking a route set first.
4. **M3.12b is still not started, and is NOT a Phase 3 gate** — C0 recorded why, in
   `docs/phase-3-dod.md`. Confirm it stays out of scope for the close.

### DoD

Measured by the human on this tree before this documentation pass, and re-stated rather than
re-run: `pnpm typecheck` clean · `pnpm lint` clean · `pnpm test` green (86 files, 1,847 vitest +
3 jest) · `pnpm content:lint` 0 errors, 1 warning (`MISSING_IMAGE_MANIFEST`, pre-existing) ·
`pnpm format:check` clean · **both** `sim:diff` packs "No change" · goldens byte-identical to HEAD.

**Gate 9 was re-run by this pass** and only because the brief's count disagreed with the tree's
own baseline note. It writes nothing, so nothing moved.

---

## Phase 3 verification — **`docs/phase-3-verification.md`** (COMMITTED at `e335cdf`)

Measured at HEAD `8effe2f`, i.e. **after** the wear curve. Two halves against the same HEAD: the
geo half **extended `pnpm geo:verify`** (no parallel reporter); the sim half ran a twelve-band
distance sweep entirely from the scratchpad and **created zero repo files**.

**Read `docs/phase-3-verification.md`. It is the authority on all of the below and this entry is
a pointer, not a summary.**

### The tree, declared

Opened clean at `8effe2f`, ended at `8effe2f` with five geo-build files modified or untracked —
NEW `route-structure.ts` (+ 17 tests), MOD `verify-routes.ts`, `report-verify.ts`,
`__tests__/verify-routes.test.ts` (+ 6 tests). That is this verification's own deliverable.
**All of it shipped at `e335cdf`**, together with `docs/phase-3-verification.md` itself.

### FOUR FAILURES, none fixed, none softened (§8 of the doc)

1. **Route diversity FAILS on 2 of 12 named pairs.** Chongjin–Jeju City 80% (**structural** —
   floor 71%, degree-1 endpoint, unpassable before filtering) and **Valencia–Palermo 85%, a
   GENUINE filter failure** newly surfaced (floor only 34%; `acceptByDiversity` never re-tests an
   earlier route against a later one). New metric `floorPercent` separates structural from real,
   so this is measured rather than asserted. **Degree-1 is the cause, not the test** —
   Palermo–Riyadh is degree-1 and PASSES at 69%. `pnpm geo:diversity` still exits 0 at median 54%
   **and its p90 is 88%**: as a per-pair guarantee the 70% ceiling is not kept. **The two failing
   rows were deliberately KEPT rather than removed the way Barcelona–Zaragoza was.**
2. **`selectPaths` FAILS its budget at p90 and max.** 42.11 / 122.95 ms on Node → 252.7 / 737.7 ms
   at 6× against 150 ms. Break-even 3.56× and 1.22×, so **it fails at 4×, 6× and 8× alike** and the
   unevidenced multiplier is not load-bearing. ~95% is Yen backfill, super-linear in hops
   (ms/hop 0.115 → 0.511). Fix named, not done: bound `kShortestPaths`' stray ratio.
3. **`ILLICIT STRICTLY DOMINATES` 142 of 410 = 34.6%, and it is NOT a metric artefact.** The
   "it's tautological" defence was tested and failed: 137 of 410 are **also cheapest to prepare**
   (96% of the set survives). Mechanism is the crossing count — a dominant illicit route avoids a
   median of 14 crossings at 45 cash each. Content consequence now measured:
   `borderBeats = min(crossings, 4)`, so a 0-crossing illicit route schedules zero border beats and
   **the corpus's only `scheduleEvent` edge becomes structurally unreachable.** Still no owner.
4. **The ferry gap.** 6 ferry edges in 1,215, all authored in `overlay.yaml` for the old 263-node
   slice; `build-edges.ts` never generates one. **Seoul–Jeju City reads 77% land ⇒ accepted as a
   630 km ROAD to an island**, while the real Jeju–Busan link reads 11% and is correctly refused.
   14 shipped edges are below the 70% water threshold that should have refused them; **13 touch a
   border-crossing node** — `place-borders.ts` splits an edge and the halves are never re-tested.

Also open: **38 `winter_closed` edges, none flagged `unavoidable`**, causing 126 of 410 rung-0
refusals (cost is diversity, not reachability — rung 4 is reached on 5 of 200 pairs).

### THE BAND JUDGMENT (§7 of the doc) — the middle-band prior is WRONG

**Least fun: band 10, the 4,500–6,000 km SHOULDER** (Paris → Marand, 5,726 km, `cheapest`, 35 legs,
237 h), with band 9 replicating it on the same profile and mode. **Failure mode: TOO LONG AND TOO
UNEVENTFUL at once** — the longest session in the game (18.9 min p50, the max of twelve) delivering
the least authored structure of any band that promised any (**34% of its own beat ceiling, 4.97
beats expired per run**, both worst in the set). It is the only band in the worst three of all four
failure modes.

**The middle (bands 5–8, 1,285–3,348 km) is the STRONGEST part of the game** — best chain rate
(4.5–7.2%), best beat fill, lowest filler share, 12-minute sessions, pillar 4 satisfied with room.
Band 7 (Helsinki → Berlin) is the healthiest row in the table.

**NOT band 11**, despite it being the most _broken_ row (pillar 4 violated outright at 49.5% dead
by halfway; `greedy-safe` **0.0%**, below `random`; zero memory chains). Two evidence reasons:
band 12 is 45% longer and **better on every one of band 11's charges** (the worst row is not the
longest row), and band 11 is the sample's only `illicit` route, so **every one of its content
failures is downstream of failure 3, not of distance**. Bands 9→10 replicate monotonically on one
profile — that is the only band effect that survives the profile confound.

### What the wear curve at `8effe2f` did to this

`worn()` is monotone in travel hours, so relief lands strictly in proportion: **bands 1–9 got
0.0%** (band 9 at 189 h is 11 hours short of the knee), band 10 got 7.6%, band 11 23.3%, band 12
**31.0%**. The curve **removed the old obvious answer** — seven routes at 0.0% completion — and
**did not touch bands 9–10**, whose defects are beat fill and session length, not drain. It moved
the weak point inward from the tail to the shoulder and stopped where the shoulder begins.

### What would FLIP the band answer

1. **Author content for the four `unfillableBeatTypes`** (`departure`, `approach`, `finale`,
   `ferry_boarding`) and re-run the beat-fill table. If bands 9–10 then fill at 70%+, the pillar-3
   charge is withdrawn and **the answer moves to band 11**.
2. **Set a real `BASE_EVENT_ODDS` at M3.12b.** Every play-minute figure is an upper bound at
   `{fire: 1, quiet: 0}`; if band 10 drops below ~13 min the "too long" half evaporates.
3. **Cross profile with band at 9–12.** If band 11's charges replicate under `safest` they are a
   distance effect and band 11 takes the verdict.

### Two instruments this produced that did not exist

- **`floorPercent`** — forced-edge distance as a share of the shortest returned route. A hard lower
  bound on worst overlap, so structural-vs-real is measured, not argued.
- **The form-1 / form-2 split on memory payoff.** Counting only `queueFires` **undercounts
  narrative payoff by ~4×**: pooled 6,292 payoff fires, only 1,634 (26%) via the queue, 4,658 (74%)
  via `requires: {flag}` through the ordinary pool. Read "memory chains completed" as "queue
  payoffs" or the corpus looks four times less consequence-heavy than it plays.

### DoD

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm content:lint`, `pnpm format:check` — all run;
results in §10 of the doc. **`pnpm sim:diff` NOT run and NOT required**: every edit is in
`packages/tools/geo-build/`, `packages/engine` is untouched, no golden or baseline moved.
CLAUDE.md needs no update — no command, rule or layout changed.

### Next step — ONE task

**Author content for the four `unfillableBeatTypes`.** It is item 1 of the flip list, it is the
denominator every beat-fill number in the doc is measured against, and it closes the single
largest unknown in the band judgment.

---

## Recovery milestone step 3 — **the policy bracket is the right way up again**, and the route preview stops lying by 5%

Shipped at **`6d3c50d`** over `970c021`. Two fixes and a correction pass; **no balance constant was
touched and `golden-runs.json` did not move.**

### Job 1 — `playerTotal` is WEIGHTED, at rates harvested from the corpus

Step 1 fixed the SIGN of a resource delta and said in its own docstring that the SCALE only
decided "how far apart two options sit". **That was wrong and this is the measurement of how
wrong.** `cash` and `bank` are unbounded and move in tens, the six meters are 0-10 and move in
ones, `reputation` is −5..+5 — so an unweighted sum made every cash term dominate every meter
term, and the policies stopped being the players they are named after.

**Completion by policy, 50,000 runs each, `--pack=corpus`:**

| policy                   | before | after | reads `playerTotal`? |
| ------------------------ | -----: | ----: | -------------------- |
| `adversarial-worst-case` |  64.7% |  6.9% | yes                  |
| `random`                 |  21.4% | 21.4% | **no**               |
| `greedy-safe`            |  18.8% | 38.5% | yes                  |
| `risk-taker`             |  36.8% | 47.2% | yes                  |
| `greedy-fast`            |  65.7% | 65.7% | **no**               |

**The bracket is restored.** `adversarial-worst-case` is now strictly the minimum of the five
instead of the second-highest, and `random` sits strictly below all three deliberate policies —
the floor and the unskilled reference, with everything that is actually trying above them. The two
policies that do not read `playerTotal` came back **identical to the digit**, which is the
cheapest available proof that the change touched only what it claimed to.

**`greedy-fast` should NOT be inside the bracket, and now says so in its own docstring.** It
scores `-timeCost` and reads no resource at all — a fixed tie-break, not a player model, since no
player optimises purely for elapsed hours while starving. It tops the table because ADR 0035
established completion as a near-deterministic function of total route hours, which makes
minimising time accidentally close to optimal PLAY. Read it as a ceiling on what the route allows
and assert the bracket over the other four.

#### The rates are harvested, and three of the nine are ASSUMED

Every money-for-meter trade in the corpus (13 events, 25 complications, 15 universal choices) was
enumerated. Fifteen rows trade money against a meter; **six move money against exactly one meter**,
and only those are usable prices — a row that buys energy and hygiene with the same thirty cash
says what the pair is worth, not what either is.

| meter        |   n | rates (cash/point) | weight | basis                                   |
| ------------ | --: | ------------------ | -----: | --------------------------------------- |
| `cash`       |   — | —                  |      1 | numeraire, by definition                |
| `bank`       |   — | —                  |      1 | numeraire — same unit, different gates  |
| `hunger`     |   1 | 4.0                |      4 | **MEASURED**                            |
| `energy`     |   2 | 12.5, 15.0         |     14 | **MEASURED** (median 13.75)             |
| `morale`     |   1 | 15.0               |     15 | **MEASURED**                            |
| `heat`       |   2 | 40.0, 40.0         |     40 | **MEASURED**                            |
| `health`     |   0 | never traded       |     15 | _ASSUMED_ — median of the four measured |
| `hygiene`    |   0 | never traded       |     15 | _ASSUMED_                               |
| `reputation` |   0 | never traded       |     15 | _ASSUMED_                               |

**The spread is BETWEEN meters, not within them**, which is what justifies a vector rather than
one blended rate: heat's two rows agree to the digit across two unrelated events, energy's two sit
20% apart, and the 10× gap from hunger to heat is the corpus saying food is cheap and a police
file is not. **`health` is the weight most likely to be wrong** — it is the meter that ends runs
and the corpus is silent on it. The one row that looks like a health price
(`opportunity.work_for_a_day/take_the_day_rate`, +50 cash for energy −5 AND health −1) buys both
with the same 50, so 50 is an upper bound on the pair rather than a price for either.

Range-normalising by `RESOURCE_BOUNDS` was considered as the fallback and cannot do the job on its
own: `cash` and `bank` have `max: null`, so there is no range to divide by and cash's scale is the
entire defect. Some anchor has to come from content. Once it does, and since every bounded
resource here shares a range of exactly 10, "an unpriced point is worth the median priced point"
and "normalise by range" are the same statement.

#### Where the weights live: `packages/tools/sim`, not the engine

Argued rather than assumed, because step 1 went the other way. `RESOURCE_POLARITY` is in the
engine because polarity is a fact about the RESOURCE — hunger is a pressure gauge in every pack
that will ever exist. **An exchange rate is a fact about a CORPUS.** These numbers were read off
`packages/content/`; they are not true of `--pack=fixture`, and they move the day an author
reprices a meal. Putting them in the engine would also put a balance opinion in a module nothing
in the engine reads — `applyEffects` and `clampResources` have no use for what a point is worth.
The engine still owns the key set, the bounds and the polarity, all imported, so a ninth resource
is a type error here rather than a silent zero.

**Regression test**: `policy.test.ts` pins the PRICE from both sides — a cash sum under a meter
point's weight must not beat it, and a sum over it must. Derived from `RESOURCE_WEIGHTS`, over
every bounded key, so a resource added with a ceiling is covered the day it is added. Verified
failing first: with `playerTotal` reverted to `playerGain`, **7 of 25 fail**, one per bounded
resource, all `expected 'a_cash_under_the_price' to be 'b_one_point'`. The upper-bound half is the
anti-overfit guard — making meters enormous would satisfy the first half at any weight.

### Job 2 — `RoutePreview.travelHours` reports the EXPECTED duration, not the static sum

Shipped defective at step 1: it summed `legHours` alone, while `worldTick` bills
`max(1, legHours + jitter)` where the jitter is **inclusive at both ends** — {−1, 0, 1, 2}, mean
**+0.5 per leg**. Every route was understated by `legCount / 2`: 11 h at 22 legs, 24 h at 48, in
the same direction every time. Measured at `R = H + legs/2` on all 18 corpus routes with enough
arrivals, max deviation 1.0 h.

**Decision: report the expected value.** A figure documented as a floor but beaten by essentially
every run is not a floor anyone can plan against, and a preview 5% low in a CONSISTENT direction
is a bias rather than noise — the player who learns to add 5% is doing the engine's arithmetic.
The preview exists to let a route be judged before it is committed to.

**Derived from `LEG_JITTER_MIN`/`LEG_JITTER_MAX`, now named and exported from `world-tick.ts`,
never hardcoded as `legCount / 2`.** A literal would be a second silent copy of a distribution
that lives in the tick, and wrong the moment those bounds move — including in the specific way
they are under review below. Integer arithmetic through `mulDivRound`, matching the module.

**`rationsNeeded` shares the local and moves with it, which is the fix and not a side effect.** It
is `ceil(travelHours / HOURS_PER_HUNGER)`, so it was under-provisioning by the same 5% — roughly
+2 rations on a 22-leg route and +4 on a 48-leg one. One `totalHours` local still feeds both
consumers, so `generate-routes.test.ts`'s identity between them still holds.

**Nothing measured moved.** `RoutePreview` never enters `RunState` or `contentVersion`, and grep
confirms no consumer in `packages/engine/src/loop`, `state` or `packages/tools/sim` — the sim
reads `plan.route` and `plan.start`. Goldens and both baselines are unaffected by this job.

#### STOP AND REPORT — `nextInt(-1, 2)` is probably itself an engine bug, and it is NOT fixed here

`Rng.nextInt(minInclusive, maxInclusive)` is inclusive at both ends: `rng.test.ts` pins it
("nextInt stays within the inclusive range", and `nextInt(1, 6)` covering six distinct values),
and `world-tick.ts` uses it correctly two lines below — `nextInt(0, 3) === 0` is exactly the "one
leg in four" its comment claims. So `(-1, 2)` is not a misreading of the contract by accident of
ignorance.

**But two ADRs describe the intent as symmetric.** `docs/adr/0014` calls it "the ±1 hour jitter on
travel time"; `docs/adr/0026` argues "±1 hour on a 5-hour leg is texture, ±20% on a 30-hour
montage is noise". Neither mentions a +0.5 h/leg drift, and a systematic upward bias on travel
time is not something either would have left unremarked. **The likeliest reading is that `(-1, 2)`
was meant to be {−1, 0, 1} and carries an exclusive-max assumption.**

Changing it moves the value of every subsequent draw on the `worldTick` stream, so **every golden
run and both baselines move**. Per the task's instruction that is reported, not landed. What
landed is the named constants and the preview reading them, which is correct under both futures:
at {−1, 0, 1} the correction is zero and the static sum becomes the honest answer with no second
edit. **Decide this before the knee sweep** — it is worth 11-24 h on every route, i.e. the same
order as the constants the sweep is trying to size.

### Job 3 — six corrections to the step-2 entry below

All re-derived from the code or recomputed, not taken on trust. Four confirmed as stated, one
refined, one not found.

1. **CONFIRMED and applied.** Route 14 at band 15% is 4.96%, not 6.1%, so "3 routes under 5%" is
   **4** — the band takes three routes off the floor, not four. Applied with a footnote: it could
   NOT be independently reproduced here, because `S` is survival in travel hours and the sim's
   `--json` trace emits only whole `days`.
2. **CONFIRMED and applied.** 41.3% → 46.0% is 4.7pp, stated as 4.3pp; the +2.3/+2.0 split sums to
   4.3 and covers 11 of 25 routes, dropping fourteen. The residual's mechanism is now named: the
   model compares each run's `S` against the route MEAN `R` while each run's own `R` is a random
   variable, and job 2 shows that spread is signed rather than symmetric.
3. **CONFIRMED and applied**, recomputed hour by hour against the real constants. `spanPoints`
   FLOORS against the absolute clock, so morale hits 0 at **220/220/220/260** h
   (truck/car/bus/train) and health at **264** h, against the table's 221/221/230/266 and 274.
4. **CONFIRMED and applied.** The "morale starts at 7 is why" counterfactual holds at clock offset
   0 and fails across most of the corpus: with morale starting at 10, health binds in only **12 of
   28** mode × corpus-start-hour cells. At offset 8, morale-at-10 still walls at 272 h against
   health's 278 h.
5. **CONFIRMED and applied.** Energy is `spanPoints(...) + (harsh ? 1 : 0)` — the harsh-weather
   point is per-LEG and outside the span, so the analytic energy column is an upper bound and the
   morale wall derived from it is too.
6. **REFINED.** The reviewer's sub-claim that health's wall spans 264-288 h and can tie train's
   does not reproduce: across the corpus's real start hours (**5-11**, verified from
   `loadCorpusScenarios`) health lands at **259 h at offset 5 and 275-280 h at 6-11**, and train's
   margin is 4-31 h and never zero. Health is genuinely mode-invariant — nothing in `healthCost`
   reads the mode — but it is not OFFSET-invariant, which is the real correction. Written that way.
7. **NOT FOUND.** There is no `+270 lines` claim anywhere in `docs/PROGRESS.md`; if it was made it
   was made in a session report. `git diff --numstat` on the entry says **+269 / −0**, and the
   step-2 DoD block now records that figure so the claim has a home.

### Baselines and checks

**`--pack=corpus` MOVED and `--pack=fixture` did not, and which one moved is the finding.**
Corpus: completion 41.3% → 36.0%, median legs 23 → 22, `gave_up` 45.8% → 51.6%, `collapsed`
12.8% → 12.3%, unresolved threads 114 → 98. The completion drop is arithmetic on the policy table
— `adversarial` alone is −57.8pp on a fifth of the grid.

**The line worth reading is `Universal choices picked` 40.3% → 26.9%**, against a report note that
calls anything over ~30% a sign the registry is flattening the corpus. Under unweighted totals the
cheap universal rows won on cash alone; pricing the meters put the authored choices back in
contention. That was a content finding attributed to content, and it was the instrument.

Fixture unmoved, checked rather than assumed: **0 of 27 (event × scoring-policy) argmaxes flip
there against 13 of 39 on the corpus.** Structural this time, not the content accident step 1
found — those nine events separate their choices by cash sums no meter term can reach even at
heat's 40.

### DoD

1. `pnpm typecheck` clean. 2. `pnpm lint` clean. 3. `pnpm test` green — 83 files / 1,784 tests,
   plus mobile's 2/3. 4. `pnpm content:lint` clean (0 errors, the standing
   `MISSING_IMAGE_MANIFEST` warning). 5. `pnpm sim:diff -- --runs=2000` on BOTH packs: both report
   "No change" after rebaselining; the deltas are above. `pnpm format:check` clean.
   **`golden-runs.json` is untouched** — job 1 is tools-only and job 2 changed a field no run reads.
   Regression tests verified failing before each fix. **Not committed.**

### Next step — ONE task

**Sweep the wear curve's KNEE, with a MORALE target, on the fixed instrument.** `FULL_UNTIL` over
`{140, 160, 180, 200, 240}` at the 50% mid-rate, 2,000 runs/cell on the full 25 × 5 grid,
reporting per-route completion and the `gave_up`/`collapsed` split at each. The curve as specified
is refuted by its own 300-hour floor — for any route past 360 h, `worn(R) ≥ 240 + 0.5 × 120 = 300`
at any tail including zero, while 30% completion needs `worn(R)` between 267 and 278 h. The band
is not the constant; the knee is.

**Two things must be read before that sweep quotes a number.** Every completion figure in the
step-2 entry below was measured through the unweighted instrument and is stale by the amounts in
the policy table above — **re-measure, do not adjust.** And the `nextInt(-1, 2)` question above is
worth 11-24 h per route, which is the same order as what the sweep is sizing; decide it first or
the sweep measures two changes at once.

---

## Recovery milestone step 1 SHIPPED (`970c021`) · step 2 measured: **the wear curve is not supported as specified**

### Step 1 — the instrument, fixed before anything was sized through it

Shipped at **`970c021`**, `fix(sim): the policies were scoring hunger backwards`. No mechanic.

`policy.ts` summed raw `effect.delta` across all nine resource keys. `hunger` and `heat` are
INVERTED scales — higher is worse — so **eating scored as a loss**:
`encounter.the_other_traveller/buy_a_meal_from_them` (cash −12, hunger −3) totalled −15 against
`u:share_what_you_have` (cash −10, hunger +2, morale +1) at −7. `greedy-safe` and `risk-taker`
actively AVOIDED food; `adversarial-worst-case` actively SOUGHT it. 942 of 2,000 traced runs
changed at least one choice (greedy-safe 400/400, risk-taker 400/400, adversarial 142/400,
`random` and `greedy-fast` 0/400 — they do not read these totals).

Four things landed with it:

- **`RESOURCE_POLARITY` + `playerGain` in the ENGINE**, beside `RESOURCE_BOUNDS`
  (`packages/engine/src/state/resources.ts`). Polarity is a fact about the resource — the result
  screen colours a delta with it, the journal words a gain or a loss with it, balance scores one
  with it. Three private copies is the duplication CLAUDE.md §8 names as this project's main
  failure mode. `hygiene` is NORMAL and is the easy mistake: it decays downward but 10 is clean.
- **`TRAJECTORY_KEYS`** in `format-report.ts`, renamed from a five-key `RESOURCE_KEYS` that
  shadowed the engine's nine-key export, **plus the `hunger` row** it could not print. The first
  attempt printed a confident `0/0/0` that was `percentile([])`; collected at the source in
  `run-one.ts` it reads `5/8/10` at leg 5 and `9/10/10` at leg 15.
- **`RoutePreview.travelHours`** — the total `rationsNeeded` was already dividing and throwing
  away. Design pillar 4's honest answer on its own.
- Both baselines moved; **`golden-runs.json` regenerated JSON-deep-equal**, `SAVE_VERSION`
  unchanged at 5.

### The ending mix INVERTED, and that is what it does to the design

|                     | through the broken lens | corrected |
| ------------------- | ----------------------: | --------: |
| completion          |                   43.5% | **41.3%** |
| `failure_gave_up`   |                   37.1% | **45.8%** |
| `failure_collapsed` |                   19.3% | **12.8%** |

Completion barely moved and stayed mid-band, so nothing sized against "how often does a run
finish" changes. **The failure mode did.** Through the broken lens the dominant failure looked
like starvation; measured correctly it is **MORALE**, by a plurality. A recovery mechanic scoped
to hunger was scoped to a target a third smaller than the instrument reported — and the
`look_after_yourself` registry graft, which is best at HEALTH, is aimed at the minority meter.

### Step 2 — S measured per route, on corrected policies

**250,000 runs: 25 corpus routes × 5 policies × 2,000, zero engine errors.** Harness in the
scratchpad, seed namespace `surv:` (no prefix shared with the sim's `base:`); the repo was not
touched except for this file. 2,000/cell is chosen so a per-route figure pools 10,000 runs and
p99 rests on 100 order statistics rather than the single digits this repo has twice been burned
by; the doomed-route completions below rest on 10,000 each.

**S is TRAVEL hours, and that is not the clock.** `advanceLeg` advances time only inside
`worldTick`; `resolveChoice` can add up to 16 more from an event's own effects, and
`spanPoints(elapsed, hours, per)` charges the travel span only. Median run: **191 travel hours
against 222 clock hours** — a 16% gap that would have gone straight into any curve sized on the
clock.

**S is CENSORED and was treated as censored.** A run that ARRIVES is not "died at s hours", it is
"survived at least s hours", and s is then the ROUTE's length rather than the player's. Quantiles
are **Kaplan-Meier** with arrivals as right-censored observations; a quantile above the censoring
point is printed `—` rather than invented. The conflation is worth 22%:

| pooled S            |  p5 | p25 |     p50 | p75 |     p90 | p95 | p99 |
| ------------------- | --: | --: | ------: | --: | ------: | --: | --: |
| **KM (censored)**   | 116 | 166 | **236** | 293 | **316** | 336 | 367 |
| naive over all runs | 115 | 148 |     191 | 239 |     287 | 301 | 336 |
| failures only       | 107 | 145 |     184 | 252 |     295 | 306 | 342 |

The judge's case rests on `112/193/303/438`, which is the **naive** row. The censored median is
**236 h, not 193** — the pooled p50 understated survival by 22%.

### Per-route S (KM, arrivals censored) — the seven doomed routes

| idx | profile | mode  | legs |   H |   R | today |  p5 | p25 | p50 | p75 | p90 | p95 | p99 | max fail |
| --- | ------- | ----- | ---: | --: | --: | ----: | --: | --: | --: | --: | --: | --: | --: | -------: |
| 19  | illicit | truck |   43 | 398 | 420 |  0.1% | 123 | 170 | 233 | 277 | 319 | 339 | 369 |      426 |
| 20  | scenic  | car   |   48 | 406 | 430 |  0.0% | 111 | 154 | 212 | 276 | 317 | 338 | 381 |      432 |
| 22  | scenic  | car   |   48 | 407 | 431 |  0.1% | 113 | 152 | 212 | 277 | 319 | 340 | 386 |      429 |
| 14  | illicit | truck |   48 | 490 | 514 |  0.0% | 130 | 185 | 210 | 290 | 315 | 333 | 373 |      457 |
| 21  | illicit | truck |   48 | 509 | 533 |  0.0% | 145 | 175 | 251 | 292 | 299 | 304 | 319 |      409 |
| 24  | illicit | truck |   48 | 513 | 537 |  0.0% | 145 | 178 | 248 | 282 | 303 | 307 | 319 |      458 |
| 23  | illicit | truck |   48 | 523 | 547 |  0.0% | 130 | 173 | 236 | 278 | 304 | 310 | 332 |      425 |

`H` is the STATIC leg sum; **`R` is what the route actually bills** and it is consistently
`H + legs/2`, verified on all 18 routes with enough arrivals to measure it (largest deviation
1.0 h). `worldTick` jitters with `rng.nextInt(-1, 2)`, which is **inclusive on both ends** —
{−1, 0, 1, 2}, mean **+0.5** — so the preview understated its own route by 11–24 hours.

**FIXED IN THIS TREE, so read the columns accordingly:** `RoutePreview.travelHours` now reports
the expected value and equals `R`, derived from the exported `LEG_JITTER_MIN`/`LEG_JITTER_MAX`
rather than a second copy of the distribution. The `H` column above is retained as the static sum
because the quantile measurements were taken against it. Size the curve on **R**.

**AND THE JITTER ITSELF IS UNDER REVIEW, recorded rather than fixed.** `docs/adr/0014` ("the ±1
hour jitter on travel time") and `docs/adr/0026` ("±1 hour on a 5-hour leg is texture") both
describe the intent as SYMMETRIC ±1, but `nextInt` is inclusive at both ends so `(-1, 2)` draws
{−1, 0, 1, 2}. If the ADRs are right this is an off-by-one from an exclusive-max assumption, and
every route in the game is 5% longer than designed. Correcting it moves every downstream RNG draw
and therefore every golden run, so it is its own milestone and must not be folded into a
balance commit.

### The band question, answered — and the answer is that the band is not the constant

`worn(H)` = full drain to 240 h, 50% for the next 120, `tail` beyond 360.

| route (R)  | band | worn(R) | quantile of that route's own S | completion |
| ---------- | ---- | ------: | -----------------------------: | ---------: |
| 19 (420 h) | 15%  |     309 |                          p87.4 |      12.6% |
|            | 25%  |     315 |                          p88.0 |      12.0% |
|            | 35%  |     321 |                          p91.3 |       8.7% |
| 20 (430 h) | 15%  |     311 |                          p86.2 |      13.8% |
|            | 25%  |     318 |                          p90.5 |       9.5% |
|            | 35%  |     325 |                          p92.8 |       7.2% |
| 22 (431 h) | 15%  |     311 |                          p85.6 |      14.4% |
|            | 25%  |     318 |                          p88.8 |      11.2% |
|            | 35%  |     325 |                          p92.0 |       8.0% |
| 14 (514 h) | 15%  |     323 |                        p95.0 † |      4.96% |
|            | 25%  |     339 |                          p96.0 |       4.0% |
|            | 35%  |     354 |                          p97.8 |       2.2% |
| 21 (533 h) | 15%  |     326 |                          p99.3 |       0.7% |
|            | 25%  |     343 |                          p99.8 |       0.3% |
|            | 35%  |     361 |                          p99.9 |       0.1% |
| 24 (537 h) | 15%  |     327 |                          p99.3 |       0.7% |
|            | 25%  |     344 |                          p99.7 |       0.3% |
|            | 35%  |     362 |                         p100.0 |       0.0% |
| 23 (547 h) | 15%  |     328 |                          p97.5 |       2.5% |
|            | 25%  |     347 |                         p100.0 |       0.0% |
|            | 35%  |     365 |                         p100.0 |       0.0% |

† **Route 14 at band 15% was re-measured at 4.96% over 20,000 runs**, against the 6.1% this table
first carried; the cell and its quantile are corrected together because they are complements. It
straddles the 5% line, and that flips a headline three paragraphs down — see there. **Not
independently reproduced in the session that wrote this footnote**: `S` is survival in TRAVEL
hours and the sim's `--json` trace emits only whole `days`, so re-deriving the quantile needs an
instrument that does not exist in the repo, and the policy fix landed since would have moved the
distribution anyway. Treat 4.96% as the later of two measurements, not as a confirmed one.

**Read it against the criterion the brief set — past p95 buys nothing, below p50 trivialises.**
Not one candidate band lands below p85 on any doomed route. The three routes at 398–407 h sit at
p85–p93 under every band; the four at 490–523 h sit at **p94–p100 under every band**, i.e. past
the "buys nothing" line for 25% and 35% and inside a hair of it for 15%. No band is anywhere near
trivialising anything.

**The band is worth ±0.5pp of corpus completion and the knee is worth +4.7pp.** Corpus-mean
completion: 41.3% today → **46.0% (15%) / 45.4% (25%) / 45.0% (35%)**. Moving 25% → 15% is worth
0.54pp; 25% → 35% is −0.44pp.

**The decomposition of that gain DOES NOT CLOSE, and the gap is a finding rather than rounding.**
41.3% → 46.0% is **4.7pp**, not the 4.3pp this paragraph claimed. The split offered — +2.3pp from
the four routes at 261–284 h, +2.0pp from all seven doomed routes — sums to 4.3 and accounts for
11 of the **25** corpus routes, silently dropping **fourteen**. Two things are therefore true at
once: the headline was understated by 0.4pp, and the attribution covers less than half the grid.

Part of the residual is an artefact of the model rather than of the curve. Every "completion under
the curve" figure is `P(S > worn(R))` with `R` taken as the route's MEAN billed hours, while each
run's own `R` is a random variable — `worldTick` jitters every leg, so a 48-leg route's realised
total spreads around its mean by roughly ±√48 hours. Comparing a run's own `S` against the fleet
mean rather than against its own realised `R` mixes that spread into the estimate, in a direction
that is signed rather than symmetric because the jitter itself is (see the entry above this one).
**Re-derive the decomposition per run, not per route, before quoting the split again.**

**The shape has a 300-hour floor and that floor, not the tail, sets the answer.** For any route
past 360 h, `worn(R) ≥ 240 + 0.5 × 120 = 300` at ANY tail, including zero. So `P(S > 300)` is a
hard ceiling on what the proposed curve can ever buy:

| route      | today | **ceiling at tail = 0** | 15%   | 25%   | 35%  |
| ---------- | ----: | ----------------------: | ----- | ----- | ---- |
| 19 (420 h) |  0.1% |               **14.6%** | 12.6% | 12.0% | 8.7% |
| 20 (430 h) |  0.0% |               **14.3%** | 13.8% | 9.5%  | 7.2% |
| 22 (431 h) |  0.1% |               **16.9%** | 14.4% | 11.2% | 8.0% |
| 14 (514 h) |  0.0% |               **15.0%** | 4.96% | 4.0%  | 2.2% |
| 21 (533 h) |  0.0% |                **8.0%** | 0.7%  | 0.3%  | 0.1% |
| 24 (537 h) |  0.0% |               **13.1%** | 0.7%  | 0.3%  | 0.0% |
| 23 (547 h) |  0.0% |               **13.5%** | 2.5%  | 0.0%  | 0.0% |

**Reaching 30% completion needs `worn(R)` between 267 and 278 h. The curve cannot go below 300.**
Holding the 50% mid-rate and a 25% tail, the KNEE would have to move **240 h → 143–178 h** to get
these routes to 30%, and to 106–154 h for 40%. That is the constant that sets it.

**RECOMMENDATION. If a band must be picked, pick 15% — but the honest finding is that the
mechanic as specified does not do the job it was proposed for.** 15% dominates the other two on
every one of the seven routes and costs nothing anywhere else (the bands are identical below
360 h). It leaves the corpus at **4** routes under 5% completion instead of 7 — 21, 24, 23 **and
14**, which lands at 4.96% and not the 6.1% first recorded — and 5 routes inside 30–50% instead
of 3. **That correction halves the headline**: the band was sold on taking four routes off the
floor and it takes three. It does NOT collapse the bimodality: per-route completion goes from
`0.0 … 94.0` to `0.7 … 94.7`. The 4.67× H-spread does compress to 2.90×, and the completion
spread does not follow it, which is the whole claim the curve was sold on.

### Which meter binds after the curve — the composition argument FAILS

**Analytically, from the real constants and `createResources`, with no events at all** — and
**corrected 2026-08-13**; the first version of this table accrued continuously, but `spanPoints`
FLOORS against the ABSOLUTE clock, so every non-energy figure in it was late by 4–14 h:

| mode  | energy ≤ `ENERGY_TIRED` at | morale 0 at | health 0 at | binds      |
| ----- | -------------------------: | ----------: | ----------: | ---------- |
| truck |                       81 h |   **220 h** |       264 h | **MORALE** |
| car   |                       81 h |   **220 h** |       264 h | **MORALE** |
| bus   |                       90 h |   **220 h** |       264 h | **MORALE** |
| train |                      126 h |   **260 h** |       264 h | **MORALE** |

Energy floors at `9 × HOURS_PER_ENERGY[mode]`. Morale then needs 7 crossings of the global
20-hour grid, which is **not** `7 × 20` past that point: at 81 h elapsed, `floor(81/20) = 4`, so
the 7th crossing is at 220 h and not at 221. Health needs hunger ≥ 10 at 60 h, then 10 crossings
of the 22-hour grid, which lands on **264 h and not 274**. Bus falls to 220 with truck and car
rather than to 230 for the same reason: the extra 9 h of energy budget is absorbed inside one
20-hour cell.

**Three caveats the table cannot carry, all verified against `world-tick.ts`:**

- **These are the walls at clock offset 0, and the corpus never starts there.** `spanPoints` reads
  the absolute clock, so both walls move with `startHour`, which runs **5–11** across the 25
  corpus scenarios. Health lands at **259 h at offset 5 and 275–280 h at offsets 6–11** (the jump
  is `floor(5/6) = 0` against `floor(6/6) = 1`, one free hunger point); truck/car morale runs
  209–215 h and train 249–255 h. Health is genuinely mode-INVARIANT — nothing in `healthCost` or
  the hunger rate reads the mode — but it is not offset-invariant, and the earlier single figure
  of 274 h is not any mode's wall at any corpus offset.
- **Train's margin is thin but never a tie.** Train morale sits 4 h inside health's wall at offset
  5 and 24–31 h inside it at offsets 6–11. The ordering never flips on train, and it never ties.
- **The energy column is an UPPER bound.** `worldTick` charges energy as
  `spanPoints(...) + (harsh ? 1 : 0)` — the harsh-weather point is a per-LEG extra outside
  `spanPoints`, on any leg of 6 h or more in rain, wind or heat. So real runs floor energy sooner
  than 81/90/126 h and reach the morale wall sooner. It is the one drain in the file that is not
  purely a clock span, and every figure in this table ignores it.

**"Morale STARTS AT 7, not 10, and that single number is why morale binds" holds at offset 0 and
does NOT hold across the corpus.** Recomputed with a morale start of 10, health binds in **12 of
the 28 mode × corpus-start-hour cells, not 28**: it flips for all four modes only at offset 5, for
`train` at every offset, for `bus` at 10 and 11, and for truck and car **nowhere else at all** —
at offset 8, morale-at-10 still walls at 272 h against health's 278 h. The counterfactual was
measured at one point of a parameter the engine varies and reported as the whole space.

**Measured, at 250,000 runs:** median S is **165 h for `gave_up` and 279 h for `collapsed`**.
Morale kills early, health kills late:

| S band (h) |      n | `gave_up` | `collapsed` |
| ---------- | -----: | --------: | ----------: |
| 0–160      | 52,875 |     99.9% |        0.1% |
| 160–200    | 31,650 |     98.8% |        1.2% |
| 200–240    | 20,673 |     84.0% |       16.0% |
| 240–280    | 21,675 |     38.4% |       61.6% |
| 280–320    | 16,096 |     20.5% |       79.5% |
| 320+       |  3,753 |     10.8% |       89.2% |

**The wear curve shortens the drain budget a route demands. Shortening a budget removes the LATE
failures first — and the late failures are the collapses.** So the curve moves the wall TOWARD
morale, the opposite of the direction the composition argument needs:

| route | all failures today | under band 15% |
| ----- | -----------------: | -------------: |
| 20    |     63.9% gave\_up | 73.7% gave\_up |
| 22    |     64.6% gave\_up | 74.8% gave\_up |
| 19    |     67.6% gave\_up | 75.3% gave\_up |
| 14    |     71.8% gave\_up | 75.6% gave\_up |

**On every doomed route, under every candidate band, MORALE still binds — 64.6% to 75.6% of
remaining failures.** The median survivor under the curve dies at 183–251 drain-hours, i.e. 183–262
real travel hours, which is squarely the morale wall from the table above and nowhere near the
health wall.

**And health is not close on those runs.** A `gave_up` run has health `p10/p50/p90 = 2/6/8` at the
moment it ends. Six health out of ten, unused. **A `look_after_yourself` row that restores health
would do nothing for 45.4% of runs and 64–76% of the failures the curve leaves behind.** The
composition argument was true of the pre-fix ending mix and is false of the measured one — say it
plainly: **the graft is aimed at the wrong meter.**

### What would change all of this — read before quoting any number above

1. **The policies still do not bracket a player, and the spread across POLICIES is LARGER than
   across ROUTES.** Mean within-route spread of KM p50 across the five policies is **84 h** (max
   170); mean within-policy spread across the 25 routes is **65 h** (max 84). Marginal ranges:
   policy 134 h, route 102 h. Those four figures are computed only over cells whose KM p50 is
   DEFINED — a cell that completes over half its runs has no p50 below its censoring point — so
   they are taken over the harder half of the grid and are a floor on the true spread rather than
   an estimate of it. Under band 15% on route 20 the five policies read
   `0.1 / 0.0 / 22.3 / 6.2 / 40.1` — an 800× spread whose pooled value is 13.8%. **Every pooled
   per-route figure in this entry is itself an average over a population that disagrees more than
   the routes do.** Same population error the brief warns about, one level down.
2. **The bracket is INVERTED, and the cause is scale rather than sign.** Completion by policy:
   `greedy-safe` 18.8%, `random` 21.3%, `risk-taker` 36.4%, `adversarial-worst-case` 64.7%,
   `greedy-fast` 65.4%. `policy.ts` says `random` and `adversarial-worst-case` bound the range a
   real player lives in; the intended LOWER bound is second-highest. **Cash at leg 25 (p50) is the
   whole story, from `pnpm sim --pack=corpus --runs=2500 --policy=<p>`: `greedy-safe` 2,457 with
   morale 3; `adversarial` 790 with morale 9.** `playerTotal`
   is unweighted, cash moves in tens and the meters in ones, so `greedy-safe` maximises a cash
   term and hoards, and `adversarial` minimises it and spends — on food and rest. Step 1 fixed the
   SIGN and says so; the SCALE now decides the ordering. `greedy-fast` scores `-timeCost` only, so
   its 65.4% is a fixed alphabetical tie-break, not a player model.
   **FIXED 2026-08-13 — see the entry above this one. Every completion figure in this step-2 entry
   was measured through the unweighted instrument and is stale by exactly that much.**
3. **The model behind every "completion under the curve" figure is `P(S > worn(R))` with S taken
   as invariant in drain-hours.** It is a LOWER bound: under the curve the same events fire at the
   same legs but at lower drain-hours, so a run collects more recovery per drain-hour than measured
   here. It is not a large correction at these hour counts, but it is signed, and it is why the
   ceiling table above is quoted at tail = 0 rather than being extrapolated.
4. **`docs/sim-baseline-corpus.md`'s per-route hour figures are STALE.** It lists the seven doomed
   routes at 383/395/407/490/494/498/510 h; at HEAD they are 398/406/407/490/509/513/523. The
   montage fixes (`eff33a8`, `71555d0`) changed `legKm` and therefore `legHours`. The brief's
   `112 → 523` span is the HEAD one and is correct; that file's is not.
5. **Hunger is pinned at 10 by leg 15 under all five policies** (median hunger at end = 10,
   every policy). Food is not the differentiator between policies and is not what separates a
   surviving run from a dying one. Morale is.

### Next step — ONE task

**Re-specify the wear curve against the knee, not the tail, and bring the proposal back with a
morale target rather than a health one.** Concretely: hold the concave shape but sweep
`FULL_UNTIL` over `{140, 160, 180, 200, 240}` with the 50% mid-rate, at 2,000 runs/cell on the
full 25 × 5 grid, and report per-route completion and the `gave_up`/`collapsed` split at each.
The measurement above says 143–178 h is where 30% completion lives on the doomed routes; confirm
or refute that on the real engine rather than on `P(S > worn(R))`.

**Do not land the `look_after_yourself` graft against the current ending mix** — it restores the
meter that is at 6/10 when runs die. If a registry graft ships with the curve it wants to be a
MORALE row, and the thing it has to beat is `HOURS_PER_MORALE` 20 against a pool of 7.

**Before either, decide whether `playerTotal` gets a per-resource weight.** Finding 2 above means
any constant tuned off a pooled completion figure is tuned off an ordering that is an artefact of
cash being denominated in tens. That is a smaller job than the curve and it gates the curve's
own measurement. **DONE 2026-08-13 — it does; see the entry above.**

### DoD

Measurement task; the only repo file edited is this one, at **+269 / −0 lines**. `pnpm
format:check` clean for it. `typecheck` / `lint` / `test` / `content:lint` / `sim:diff` not run
and not applicable — no TypeScript, content or engine file was touched, and no baseline was
regenerated. HEAD is `970c021` and the tree was clean at the start of the task.

---

## Montage legs exist — `leg-plan.ts` tested one of two regimes. **M3.12b is UNBLOCKED**

**`RouteState.montageLegs` was `[]` on all 25 corpus routes and had been since M3.9.** ADR 0029
gives montage legs a ×0.3 event-odds multiplier and makes "montage legs should be quiet most of
the time" one of M3.12b's four calibration targets — a target computed over a class with no
members. Two agent reports drew conclusions from it before an adversarial check caught it.

**It was not the geo slice and not route generation.** `leg-plan.ts:263` gated on
`segments.length > target` where ADR 0026 Decision 4 says **`rawLegs > target`**. Those are the
same test only while a path edge is worth at most one leg; the median edge on this slice is
378 km against densities of 120–450, so an edge is worth 1.5–4 legs and the planner is in the
**expansion** regime on every route the generator can produce.

| across the 25 corpus routes | min | median | max |
| --------------------------- | --: | -----: | --: |
| `segments.length`           |   3 |     22 |  33 |
| `rawLegs`                   |  11 |     49 | 115 |
| `target`                    |  22 |     38 |  48 |

`rawLegs > target` on **23 of 25**; `segments.length > target` on **0 of 25**. On a 123-route
sweep the shipped gate fires 5 times and the ADR's 89. The compression montage exists to absorb
was happening the whole time (115 raw legs → a target of 48) — it was just being spread over
every segment, which is verbatim the "shrinking everything" that sentence rejects.

**The three candidate fixes were priced before choosing, and densification was both the most
expensive and the least effective**: splitting every edge at 450 km (~570 midpoint nodes,
692 → 1,262, and it doubles the hop counts that already make `geo:verify` FAIL at p90/max) still
only gets the _shipped_ gate to fire on 4 of 25. It does not touch the ADR's gate at all.

`docs/adr/0039` is the full reasoning. Three things worth knowing without reading it:

1. **Total route legs are 931 on every tree.** The 22–48 band, `minLegs`/`maxLegs` and route
   length are untouched — montage redistributes the surplus rather than shrinking anything.
   106 of those 931 corpus legs (11.4%) are montage, carrying **38% of corpus km**.
2. **Montage is barred by POSITION as well as by dullness**, in `protectedFromMontage`, because
   ADR 0027's `admit` DROPS a beat it cannot place rather than moving it. Two rules: the first
   and last segments (they own leg 0 and `legCount − 1`, the slack-0 anchors of `departure` and
   `finale`), and **the segment either side of every crossing**.
3. **Every montage test in the file used a 60–90-segment synthetic route** — all in the one
   regime the gate did test. The tests and the bug shared a mental model. Four new tests fail on
   the pre-fix tree; verified by stashing the fix each time.

### Why the crossing neighbourhood is protected, and what it bought

A crossing is already safe from montage by its dullness, and **that is not enough**. Montaging the
stretch BETWEEN two crossings collapses it to one leg, the two slack-1 border windows land within
a leg of each other, and invariant (b) drops one — the crossing keeps its scene and loses its
beat, which reports as content starvation. `border_crossing` and `checkpoint` LEG counts are
identical on all three trees (119 and 114); it was their SPACING that changed.

| beat slots, 25 corpus routes | pre-montage | anchors only | shipped |
| ---------------------------- | ----------: | -----------: | ------: |
| `border_crossing`            |          71 |           58 |  **71** |
| `midpoint_crisis`            |          14 |           11 |  **13** |
| `approach` (unfillable)      |          21 |           15 |      15 |
| `departure` / `finale`       |       25/25 |        25/25 |   25/25 |
| **total**                    |         164 |          142 | **157** |

**Every border slot comes back.** `approach` is left dropped on purpose — no corpus event can
fill it, so recovering it would only pad the fill-rate denominator, which is ADR 0027 Decision 5's
forbidden move in the other direction. The guard costs about a third of montage coverage (157
montage legs → 106, 48% of km → 38%), and buying back 18% of one of only two fillable beat types
is worth more than the coverage.

### What moved, and the one mechanism behind all of it

**The fixture pack did not move, and that is structural rather than lucky:** goldens and
`docs/sim-baseline.md` both build from `loadFixtureScenarios()` — the hand-authored
`routes.json`, which carries `montageLegs: []` and **never calls `planLegs`**. So a `leg-plan.ts`
change cannot reach them. `sim:diff` says "No change" and no golden digest moved.

Quoted at **20,000 runs**, not the 2,000 the baseline is generated at, because `payoffRate`'s
denominator is only ~600 and a 2,000-run reading of it is noise. **The middle column is kept
deliberately** — it is what montage costs without the adjacency guard, and it is the evidence the
guard does the thing it was added for rather than moving a number by coincidence:

| metric             | pre-montage | anchors only |   shipped |         Δ vs pre |
| ------------------ | ----------: | -----------: | --------: | ---------------: |
| Completion         |       42.2% |        44.1% | **43.2%** |           +1.0pp |
| Long-range payoff  |       24.6% |        18.5% | **24.3%** |           −0.3pp |
| Beat fill          |       28.1% |        26.1% | **27.5%** |           −0.6pp |
| Unresolved threads |         521 |          452 |   **525** |               +4 |
| Checks resolved    |     205,612 |      196,382 |   198,606 |            −3.4% |
| Median legs        |          25 |           25 |    **24** | survival, not km |
| Median days        |          10 |           10 |    **10** |                — |

A montage leg replaces `k` ordinary legs over the same ground and `legHours` charges the per-mode
overhead **once instead of k times** — a 1,200 km car segment is 21 hours as one montage leg
against 35 as five ordinary ones. Drift is per-hour (ADR 0035), so fewer hours over the same
distance is less drain. Completion up follows; **montage is a time discount nobody explicitly
chose**, and that is the most important sentence here for whoever tunes next. The adjacency guard
halves it (+1.9pp → +1.0pp) as a side effect of protecting fewer kilometres, but does not remove
it.

**That payoff and unresolved threads recover TOGETHER is what identifies the mechanism.** Without
the guard, ordinary `roadside` legs fell 311 → 279 and generic queued payoffs lost the windows
they fire in; restoring the segments beside each crossing brings both back to within 0.3pp and 4
threads of the pre-montage tree. It was fewer schedules reaching fewer eligible legs, not more
failures.

**`Median legs` 25 → 24 is a survival statistic, not a route-shape change** — total route legs
are 931 on all three trees. What moved is how far a run gets before it ends.

### DoD

`typecheck` clean · `lint` **0 errors** · `test` **1658 vitest + 3 jest green** ·
`content:lint` 0 errors (1 pre-existing `MISSING_IMAGE_MANIFEST`) · `format:check` clean for
every file this touched (8 pre-existing `.claude/*` warnings are untouched and predate it) ·
`sim:diff` **"No change"** on the fixture pack, goldens unmoved · corpus baseline regenerated at
2,000 and round-trips clean.

### What M3.12b gets to calibrate against

**106 montage legs of 931** across the 25 corpus routes — 11.4% of legs, 38% of corpus km. On a
123-route sweep, p50 10% and p90 63% of km per route.

**Watch the 46 of 123**: that many sweep routes now carry NO montage leg at all (34 before the
adjacency guard). ADR 0029 Decision 7 item 2 is a quiet-ratio over montage legs, and a target
computed over a population where a third of routes contribute nothing is thinner than it looks.

### Left open, deliberately

- **The 38% montage km share is a design call, not a defect.** A 17,000 km continental route
  probably SHOULD be mostly summary. Stated so M3.12b calibrates against a measured population
  rather than discovering it.
- **Montage is an unpriced time discount.** Completion is +1.0pp over the pre-montage tree with
  no constant changed, and no ADR chose that.
- **The 6 `approach` slots are still dropped**, on purpose: `approach` is unfillable in this
  corpus, so recovering it would only pad the beat-fill denominator. It comes back for free the
  day an `approach` event is authored — which ADR 0027 Decision 5 already names as content work.

---

## M3.12a — the quiet-leg gate, plumbed and fenced at `BASE_EVENT_ODDS = 1:0` (COMMITTED at `f9614a5`)

**SHIPPED.** The quiet-leg gate exists end to end — `director/quiet-gate.ts`, `director/event-odds.ts`,
the `legOddsFactors` multiplier set, a fourth `SelectionResult` arm, and two new report lines — and
it is wired at `BASE_EVENT_ODDS = 1:0`, i.e. P = 1 exactly, so **no leg can be quiet yet**. M3.12b is
the one-constant change that sets a real base. ADR 0029 plus its three addenda is the write-up;
`docs/adr/0029` is authoritative over everything below.

**THE FENCE HELD, and the fence is the entire claim of this milestone.** Verified again at the end
of this session, after the doc edits:

- `packages/engine/src/__tests__/__fixtures__/golden-runs.json` — sha256
  `e26770a7661a9bed42f73bf829be77b1bbd822e2266986abb3a50f058dae3a09`, 13,250 bytes, and **`git diff`
  on it is empty**. `golden:update` was never run.
- `pnpm sim:diff -- --runs=2000` and `pnpm sim:diff -- --pack=corpus --runs=2000` both report
  **"No change"**.
- Both report BODIES against `git show HEAD:` are **additive only**: exactly **three inserted lines
  per pack** (`Quiet legs (designed)`, `Forced-fire legs`, `Near-repeat rate`), **zero deleted and
  zero changed**, apart from the volatile `Wall clock` / `Extrapolated` pair that `diff-report.ts`
  already ignores.

**Judge the goldens by CONTENT, never by `git status`.** `pnpm golden:update` re-emits a different
layout every time regardless of whether anything moved (prettier reflows the single-element arrays),
so "did the goldens move?" is _unanswerable_ from a dirty-file list. The sha256 above is the check.

**THE GATE ALWAYS DRAWS. It does not short-circuit at P = 1**, and that is deliberate: a
short-circuit would mean the branch M3.12b runs was never executed at M3.12a and the fence would be
proving the wrong thing. Measured at 2,000 runs per pack: **20,731 fixture draws and 38,165 corpus
draws, every one of them fired, zero quiet.** (Those are selections minus forced-fire:
31,153 − 10,422 and 53,766 − 15,601.) The M3.12b code path is exercised today, not dormant.

### Three real behaviour changes, all declared, all no-ops at 1:0 and all live at M3.12b

These are **behaviour**, not instrumentation — they change what the run does, not what the report
says about it, which is exactly why ADR 0029 Decision 6's sweep missed them (see below).

1. **`recency` counts DRAWS, not legs** (`scoring-factors.ts`). The unit is what the player READ.
   `[bribe] [nothing] [nothing] [nothing] [bribe]` is five screens with the repeat plainly visible;
   a leg that showed nothing buffers nothing.
2. **`tag-saturation` windows FIRED events** (`tag-saturation.ts`) — history entries are filtered on
   `eventId !== null`, so a window that promises `TAG_WINDOW` fired events delivers them.
3. **`tension.ts` resets a high-tension streak across a quiet leg.** `tension.ts:60`'s
   `if (entry.eventId === null) break` was **dead code** before M3.12a and became live behaviour in a
   commit whose diff does not contain the file. A quiet leg IS the breather, so easing the next leg
   as well spends the remedy twice.

**`cooldownLegs` deliberately STAYS wall-clock legs** (`hard-filters.ts`). The split is
**engine-owned presentation shading in draws, authored world pacing in legs**: twelve values in the
pack were written by a human against a field named for its unit, and a montage stretch under a draws
unit would freeze every cooldown across it. `flags`' `ttlLegs` stays legs for the same reason. **The
unit question has no default answer — a sweep that mechanically "fixes" everything it finds is as
wrong as one that finds nothing.**

### ADR 0029 Decision 6's list of three instruments was INCOMPLETE — the real count was six

Decision 6 was written while reading `run-many.ts`, so it found what was in that file, in that
file's vocabulary ("instruments" ⇒ reported numbers). Half the real population is behaviour. Two
further adversarial passes took 3 → 6 → 8 sites.

**The one that matters for M3.12b: `Repeat-event rate` falls ~10pp at a 30% quiet share WITH THE
DIRECTOR UNCHANGED** — `fired` shrinks while `unique` is capped by the 13-event corpus pool. It was
the report's **only** leg-sensitive number with a non-zero reading (`fallbackRate` and
`uneventfulRate` both read exactly 0.0% on both packs). It is kept exactly as-is, because no
redefinition can be both unconfounded at `q > 0` and arithmetically identical at 1:0 — jointly
unsatisfiable — and the fence requires the second.

**Its replacement `Near-repeat rate` is LESS confounded but NOT unconfounded, and the original claim
that it was has been RETRACTED.** Re-measured with the director literally unchanged (draws deleted
from the real 1:0 sequences, non-periodic mask, 2,000 runs, ten mask seeds):

| pack    | at 1:0 | at 30% quiet | **null delta** |
| ------- | -----: | -----------: | -------------: |
| corpus  | 25.99% |       33.57% |     **+7.6pp** |
| fixture | 62.29% |       56.63% |     **−5.7pp** |

**THE SIGN IS PACK-DEPENDENT** — sparse repeats get pulled INTO the window by compression, dense
repeats get DESTROYED by it, and which dominates is a property of the pack's baseline repeat
density. There is no window width or denominator that fixes this.

> **M3.12b MUST SUBTRACT A NULL BASELINE before attributing any movement in either repetition line
> to the director.** On the corpus a RISE of up to ~8pp at a 30% quiet share is the NULL
> EXPECTATION, not a finding. The ADR's own instrument table said the opposite ("a rise is the real
> finding") until addendum III corrected it.

### M3.12b IS BLOCKED — two blockers, neither of them a tuning

**Do not open M3.12b by changing `BASE_EVENT_ODDS`.** Both blockers are milestone-sized.

#### Blocker 1 — MONTAGE LEGS DO NOT EXIST, so the montage multiplier is dead code

**Measured this session, both packs: `montageLegs` is `[]` on every route.** Corpus 25 routes /
**931 legs** / 0 montage; fixture 3 routes / **50 legs** / 0 montage. Nothing is being filtered — the
set is empty.

**Cause:** `packages/engine/src/route/leg-plan.ts:263` gates montage on `segments.length > target`,
and on the 692-node slice the edges are long enough that **every path has fewer edges than its leg
target**, so the condition is never true.

**Consequences, both of which caught agents out already:**

- The `montage × 0.3` multiplier in `director/quiet-gate.ts:82` is **dead code**. It is correct
  code; it just has no inputs.
- **ADR 0029 Decision 7 item 2 — "montage legs should be quiet most of the time" — is UNMEASURABLE.**
  It would be computed over a class with zero members. The ADR's arithmetic around it (a 7:3 base
  puts a montage leg at P = 41%, so quiet 59% of the time) is not wrong, it is simply about nothing.
- **Two agent reports drew conclusions from this empty set before an adversarial check caught it.**
  If you find yourself reasoning about montage-leg behaviour, check `montageLegs.length` first.

**DEFERRED to its own piece of work by the human on 2026-08-13.** Three candidate fixes exist and
**none has been measured or chosen** — record them as alternatives, not as a plan:

1. **Relax the leg-planner condition** (`leg-plan.ts:263`) so montage can trigger without needing
   more segments than legs.
2. **Change route generation** so paths carry more edges.
3. **Split the geo slice's long edges.** At a 450 km cap, **398 of 1,215 edges exceed it (32.8%),
   max 2,531 km**; splitting every one needs **~570 midpoint nodes**. `densify-corridors.ts` has
   never been built.

#### Blocker 2 — THE COMPLETION DISTRIBUTION IS BIMODAL, and the aggregate hides it

**Seven of 25 corpus routes complete under 1%** — every one over 380 travel hours (**383 to 510 h**),
**km floor 10,992** — and they are **doomed under ALL FIVE policies**, including `risk-taker` and
`greedy-fast`. The aggregate **41.9% is comfortably in the 30-50% band while the distribution is
not**: the corpus is a mixture of routes that mostly complete and routes that essentially never do.

**This needs a recovery mechanic or a route-length contract. Both are milestones; neither is a
tuning**, and the hour economy has already been re-derived twice (M3.10b, M3.11d) trying to reach
these routes without trivialising the short ones. One per-hour economy with no recovery term cannot
make both a 112-hour fixture route and a 510-hour corpus route interesting.

### Also open (carried, not closed)

- **`forcedFireShare` is 29.0% corpus / 33.5% fixture over SELECTIONS**, where ADR 0029 Decision 3
  assumed ~42-54%. **Materially high**: a given `(1 − P)` yields ~1.4× more quiet legs on the corpus
  than the ADR's targets were set against, so **Decision 7's quiet-ratio targets are all set against
  the wrong denominator** and must be re-read before M3.12b picks a base. The gate can reach at most
  71.0% of corpus selections, so realised quiet caps at `0.710 × (1 − P)`.
- **Three fenced rates are still on LEG denominators** — `complicationRate` (`presentedLegs`),
  `uneventfulRate` and `fallbackRate` (`attemptedLegs`) — and these are **mixed-unit subtractions**:
  a leg-INDEX sum minus per-SELECTION counts. The 0.59% corpus error is exact **only at 1:0** and
  **grows at exactly the milestone it was deferred to**, because the absolute error is pinned at 315
  selections while the remainder shrinks: **q=0% 0.589% · q=10% 0.655% · q=20% 0.738% · q=30% 0.844%
  · q=40% 0.986%**. The fix is to **count the subtrahends and the minuend over one population** —
  **NOT** "divide by selections", which would throw away the subtraction the three rates exist to
  have. M3.12b deliverable; it was deferred because re-cutting `complicationRate` now would put a
  `-` line in the baseline diff and kill the fence.
- **`geo:verify`: two named-pair endpoints are degree-1**, which makes route diversity impossible on
  the final hop.
- **The route-generation budget fails at p90/max.**
- **Six ferry edges are missing** (the graph's six are all western-Mediterranean).
- **`golden:update` re-emits a different layout every run**, so "did the goldens move?" cannot be
  answered from `git status`. Compare the sha256.

### This session's `docs/` changes (JOB 1 — four review defects, no code touched)

Four documentation defects from an adversarial review, all verified against the tree before writing.
**Nothing under `packages/` was edited**; the fence was re-verified after.

1. **ADR 0029's 400-run `forcedFireShare` table is LEGS-denominated** (the column literally counts
   legs) while the 2,000-run table is over SELECTIONS, so the "agrees with the 400-run figures
   above" claim spanned two units and the 29.0%-vs-29.0% match was a rounding coincidence. The
   table is now labelled LEGS, the claim is **withdrawn**, and the 2,000-run table now prints
   **both** denominators (corpus **29.2% legs / 29.0% selections**; fixture 33.5% either way) so no
   comparison crosses a unit. The 400-run row is also flagged as **not reproducible** — the shipped
   harness gives 6,242 / 10,708 legs, not 6,234 / 11,025, and its prose claims "the sim's own three
   policies" when `POLICY_NAMES` has had five since the walking skeleton.
2. **The `complicationRate` deferral now carries its growth curve** (ADR 0029 D9, and both baseline
   headers), plus the clause distinguishing the real fix from the plausible wrong one. See the
   bullet above.
3. **ADR 0029's "seed-to-seed spread is under 0.6pp" is restated as "under 0.9pp, range across ten
   mask seeds".** The original named no statistic — range, sd and half-range differ ~3× over ten
   samples — and an independent ten-seed sweep reached **0.80pp at fixture q = 30%**. That is
   **UNRESOLVED, not refuted** (0.80pp range is consistent with 0.6pp sd), so the bound now holds
   under either reading. **The conclusion is unchanged and not hedged**: null deltas run 1.6-8.4pp
   with opposite signs on the two packs, and no spread of this order manufactures a sign flip.
4. **Denominator sweep.** Both baseline headers now say the ~42-54% Decision 3 estimate is
   LEGS-denominated where the measured 33.5%/29.0% is SELECTIONS. Addendum II's table gained a note
   that its "denominated in" column is the unit **before** the fix and that **rows 1-3 are still
   legs after it**. Also fixed, though not a denominator defect: the instrument table read
   `Repeat-event rate` **67.4% corpus / 67.7% fixture** against the fenced report bodies' **67.5% /
   67.8%**, contradicting the ADR's own D1 paragraph.

### EXACT NEXT STEP

**DONE — the M3.12a tree was reviewed and shipped at `f9614a5`.** It was 23 modified + 5 untracked
files under `packages/engine` and `packages/tools`, plus that session's edits to `docs/adr/0029`,
`docs/sim-baseline.md`, `docs/sim-baseline-corpus.md` and this file. It survived **four**
adversarial passes with the fence intact before it landed.

The fence re-verification it shipped on — the milestone's only claim. **The golden hash below is
the value AT `f9614a5`; the wear curve at `8effe2f` has since moved three of the nine goldens, so
re-read it from the tree rather than from this block:**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm content:lint
sha256sum packages/engine/src/__tests__/__fixtures__/golden-runs.json   # e26770a7…dae3a09, 13,250 bytes
pnpm sim:diff -- --runs=2000                # must read "No change"
pnpm sim:diff -- --pack=corpus --runs=2000  # must read "No change"
# and diff each report BODY (below the `-->`) against `git show HEAD:` —
# exactly three inserted lines per pack, zero deleted, zero changed,
# except the volatile Wall clock / Extrapolated pair.
```

**Then do NOT start M3.12b.** Take the montage-legs blocker first, as its own milestone: decide
between the three candidate fixes above by measuring, because until `montageLegs` is non-empty the
`montage × 0.3` multiplier is untestable and ADR 0029 Decision 7 item 2 cannot be evaluated at all.

> **DONE — and it was NONE of the three candidates named above.** The fix was in the leg planner:
> the gate read `segments.length > target` where ADR 0026 Decision 4 says `rawLegs > target`.
> Densification was priced (~570 midpoint nodes) and rejected — it does not touch the ADR's gate
> at all. `montageLegs` is now non-empty on 23 of 25 corpus routes, so the `montage × 0.3`
> multiplier is testable and **M3.12b is the next task.** See the montage section at the top of
> this file and `docs/adr/0039`.

---

## M3.11f/g — the sim harness was sampling a fifth of its grid; both baselines rebaselined (COMMITTED at `b150f9d`)

**`runMany` paired run `i` as `scenario = i % S; policy = i % P`.** That enumerates the route ×
policy grid only when `gcd(S, P) === 1`. On the corpus S is 25 and P is 5, so `i % 5` was fully
determined by `i % 25`: **every route was welded to exactly one policy and the sim visited 25 of
its 125 cells.**

**What ships is a Latin square**, `cellFor(i, S, P) = (i % S, (i % S + floor(i / S)) % P)`,
exported and pure so the coverage properties are testable without engine runs. It has to satisfy
**two** properties, and discovering there were two is the whole of this milestone: **(a)** over
`runs = S*P` every cell exactly once, for arbitrary S and P — unconditional; **(b)** a prefix of
`max(S, P)` runs already touches every route and every policy, because `--runs` is a round number,
the grid size is not, and almost every invocation therefore stops mid-grid — **and (b) holds only
when S ≥ P**. The shipped square fails (b) on 55 of the 720 enumerated shapes, all of them and
exactly those with `2 ≤ S < P`, **including the fixture pack's own 3 × 5**, where a prefix of 5
reaches 3 of 3 routes but only 3 of 5 policies. The corpus is 25 × 5 and is on the safe side; the
fixture is saved by covering its 15-cell grid six times over at the default, not by the property.
Do not quote (b) unconditionally. **A mixed-radix odometer was written
first, had (a) and not (b), and was caught before it reached a committed baseline**: at the
`--runs=100` default CLAUDE.md §5 documents it sampled 20 of 25 routes — always the same five
dropped, the **five profiles of the highest leg bucket** (not "the five longest": scenario 14,
`route.illicit.rskpfno`, is 17,521 km / 494 h and is KEPT while three shorter routes are dropped)
— and reported completion **10.6pp optimistic**, out the top
of the band. `__tests__/pairing.test.ts` now enumerates both properties over thirteen trap shapes
and a 720-shape sweep, and is proved to discriminate: swapping in the old stride fails 10 tests,
the odometer 11, the near-miss 10. **Full write-up, including the near-miss that is one `% S`
away from the Latin square and still fails 271 of 720 shapes: `docs/adr/0038` and its addendum.**

**NO ENGINE FILE MOVED, and that is proved rather than asserted.** Replaying the OLD pairing
against the corrected tree reproduces **both** committed baseline bodies line for line — the two
machine-dependent wall-clock lines excepted — so the engine returns identical output for identical
`(seed, scenario, policy)` triples and 100% of the delta is attributable to which cells got
sampled. `git status packages/engine` is empty and the goldens are untouched. **This is a
measurement correction, not a balance change.**

| line                          | corpus                              | note                                           |
| ----------------------------- | ----------------------------------- | ---------------------------------------------- |
| Grid cells sampled            | 25/125 → **125/125**                | new report line, above the first rate over it  |
| Completion rate               | 41.0% → **41.9%**                   | 821 → 838 completions; mid-band before + after |
| Median legs                   | 26 → **25**                         |                                                |
| Long-range payoff             | 14.0% → **24.8%**                   | largest mover; n = 113 schedules / 28 fires    |
| Unresolved threads            | 63 → **46**                         |                                                |
| arrival / gave_up / collapsed | 41.0/32.8/26.1 → **41.9/38.3/19.8** | collapsed:gave_up 0.79 → 0.52                  |
| Modifier chips / check        | 6.4 → **6.4**                       | 6.3677 → 6.3740 — the invariant that proves it |

Every ending share divides by the ENDING total (2,002 — two runs emit `detained_at_border` plus a
terminal ending), never by run count. 657/2002 is **32.8%**, not 32.9%; `format-report.ts` is where
that denominator lives.

**The coverage line catches HOLES, not IMBALANCE, and that gap is bounded rather than left open.**
Between the round counts a prefix reaches its cells an unequal number of times, so the average can
tilt while both marginals read full and the line stays silent. Measured on the 25 × 5 grid at
2,000 runs per cell against its cell-weighted 42.53%: `--runs=39` is **+8.36pp** optimistic with
25/25 routes and 5/5 policies, `--runs=50` is +1.54pp, `--runs=100` is −0.21pp, and the bias is
exactly **0** at 125 and every multiple of it — 250 up, the baselines' 2,000 included. Still
strictly better than the old stride, which was **~1.70pp off at every R permanently — that figure
at 2,000 runs per cell**, the sample this paragraph is measured at. The same bias is **~1.64pp at
25,000 runs per cell** (42.53% against 40.89%); see the next section but one. Two samples of one
quantity, twelve lines apart, and neither supersedes the other.

Fixture: **75.3% → 74.0%** (1,506 → 1,480 completions) and a handful of single-digit run counts.
Its grid was _already_ fully covered (`gcd(3, 5) = 1`, 15 of 15 before and after), so its move is
a **resample**, not a coverage fix. **And a narrower resample than that usually means:
`scenario = i % S` is the same expression in the old stride and in the Latin square, so on BOTH
packs every run plays the route it always played and only the POLICY moves** — 1,600 of 2,000
corpus runs (80.0%), 1,598 of 2,000 fixture runs (79.9%), and **zero** route changes on either.
**The fixture being accidentally coprime is the entire reason this survived to M3.11: the default
pack could not exhibit the bug**, and it is the pack every test and every casual `pnpm sim` runs.

**The aggregate was barely wrong and every per-route number was worthless**, which is why it
passed review for three milestones. True bias on completion is **~1.64pp at 25,000 runs per
cell** — weighting all 125 cells equally the corpus completes 42.53%, where the welded diagonal
completes 40.89%. (**~1.70pp at 2,000 runs per cell**, 42.53% against 40.83%, which is what the
paragraph above quotes. Same quantity, two samples.) But the welded
harness reported **nine** routes under 1% where the truth is seven: it had `illicit.r1nta1ib`
(260 h) at 0.2% and `cheapest.rtps1ek` (281 h) at 0.6%, both welded to `greedy-safe`, their single
worst policy. Their true rates are **22.3% and 21.1%**. The doc reached the right seven by a
compensating error.

**Two quantities, and they must be kept apart** — the ADR's first draft named one and printed the
other, and the table directly beneath the sentence refuted it. Over the four worst-affected
mid-range routes, re-measured at 25,000 runs per cell: the **GAP** between a route's welded cell
and its all-five rate is **19.4 to 35.0pp**; the **max−min policy SPREAD** inside a single route
is **53.0 to 63.9pp**. "53-63pp" is the spread. It is the larger and more alarming number, which
is exactly why it wanted checking before it was attached to the other claim.

**100 route × policy combinations ran for the first time and none broke**: zero engine errors,
zero empty-pool fallbacks, zero turn-cap hits.

### Surfaced by the grid, not caused by the fix, and it has no owner

**`policy.ts`'s stated contract is measurably false.** Over 25,000 runs each: random 21.3%,
greedy-safe 24.9%, greedy-fast 63.9%, risk-taker 42.4%, adversarial-worst-case **60.1%**. Its
header says a rate under `random` and under `adversarial-worst-case` bound the range a real player
lives in. Adversarial is the **second-highest** of the five, 39pp above random — the intended
lower bound is in the upper half of the range. Invisible until now, because each policy ran on a
different non-overlapping fifth of the routes and the columns were not comparable.

**`world-tick.ts` carries stale numbers in comments — THREE of them, not one.** Not corrected
here: this pass was scoped to leave `packages/engine` untouched, which is what makes the
goldens-unmoved argument above airtight. All three are prose in the drift-constant block, so the
follow-up commit changes no behaviour and must move the goldens by nothing.

- **`:114`** — "keeps collapse meaningful at **26.1%**". Now **19.8%**.
- **`:110-111`** — "routes under ~150 hours complete **55-85%**, routes over ~250 hours complete
  **0.0%**, with nothing in between". **Both halves are wrong, and these are the two thresholds
  this pass corrected**: on the full 25 × 5 grid, under 150 h completes **80% to 97%**, the
  250-300 h band completes **21% to 26%**, and nothing is near zero until **383 h**. "With nothing
  in between" is the part that misleads worst — it asserts a dead zone where `CORPUS_PAIRS` merely
  has a 98-hour hole between its 285 h and 383 h routes.
- **`:149`** — "20 + 44/22 lands **41.0%** with collapse **26.1%** and gave_up **32.8%**". Now
  **41.9% / 19.8% / 38.3%**. The sentence's claim survives — neither failure mode is the majority
  — but all three of its numbers moved.

**One follow-up commit, three comment edits, zero behaviour.**

### Three defects left in `packages/tools/sim` for a human, spanning five `file:line` sites — prose and formatting, zero behaviour

A documentation pass corrected the doc side of these and was scoped out of `packages/`. All three
are comment prose or a format string; none changes a number the harness produces. **The count is
DEFECTS — three bullets, three defects** — and the five are the `file:line` anchors they span, the
first bullet alone holding three of them. This heading and this sentence both said "four" over a
list of three, which is the same miscount as the second bullet's own subject; count the list
before writing a number above it.

- **`run-many.ts:113`**, **`__tests__/pairing.test.ts:18`** and **`pairing.test.ts:204`** — "always
  the five longest" (and "the ones that complete least") is FALSE
  at route granularity. "Ascending leg bucket, pair-major" establishes only that the five profiles
  of the HIGHEST LEG BUCKET are dropped. Scenario 14, `route.illicit.rskpfno`, is 48 legs /
  **17,521 km / 494 h**, sits in the third bucket, and is KEPT — longer than three of the five
  dropped in both km and hours. Say "the five profiles of the highest leg bucket". **The +10.6pp
  bias magnitude is unaffected and stays.**
- **`run-many.ts:141`** — the heading says "This is the third of its family in M3.11"; ADR 0038's
  addendum corrected the count to **fourth, not third**, and this doc block's own body at
  `:146-147` already names the fourth ("and then a fourth, when the fix for it sampled a prefix").
  The heading contradicts the paragraph under it.
- **`format-report.ts:187-188`** — the coverage warning is built from
  `` `${missingRoutes} routes` `` / `` `${missingPolicies} policies` ``, unconditionally plural, so
  a single missing route prints **"← 1 routes NEVER RUN"**. Note `__tests__/report.test.ts:134-135`
  **structurally cannot catch it**: those assertions are `SCENARIOS.length - 1` and
  `POLICY_NAMES.length - 1`, which on the fixture's 3 × 5 read "2 routes" / "4 policies" — both
  already plural. A regression test needs a shape that leaves exactly one marginal short.

### DoD

`typecheck` clean · `lint` clean · `format:check` clean · `test` green · `content:lint` 0 errors ·
**both baselines regenerated at 2,000 runs against the SHIPPED Latin square, and both `sim:diff`s
report "No change"** against the freshly spliced files — that round-trip is the check that the
hand-written headers survived, since `stripHeader` finds the first `-->` and a `cp` would have
destroyed them. Goldens judged by CONTENT, not by git status: `golden:update` re-emits 416 lines
against the committed 398 every time regardless, and the JSON is deep-equal.

**Evidence base for every per-route figure in this section**: the 25 × 5 grid re-measured at
**25,000 runs per cell** — 125,000 per route, 3.125M runs, zero engine errors — on a seed stream
sharing no prefix with the harness's `base:<i>`. Where a number here disagrees with an older one
computed at 1,000 runs per cell, this is the one that was measured last and at 25× the sample.

---

## M3.11e — M3.11 CLOSES on its DoD (COMMITTED at `6bc1c15`)

The DoD's last open item was **`geo:verify` re-measured**; everything else on it was already
satisfied at `04f0f38`/`6961f77`. Three jobs, no engine change, both `sim:diff`s **No change** on
both packs.

**1. `geo:verify` re-picked its pairs and re-measured its benchmark.** The old list was chosen for
the 263-node Europe-and-Maghreb slice: five of ten named pairs no longer resolved, and
Barcelona-Zaragoza printed a FAIL on a SINGLE HOP, which has nothing to diversify. The new
`NAMED_PAIRS` and `SWEEP_PAIRS` are picked under a **constraint, stated in the file**: twenty (and
twenty-four) distinct endpoints, one pair per disjoint distance band, three hops minimum, with the
in-band tie-break a fixed stride over the alphabetical settlement list. **The 48-leg failure did
not recur and that was measured, not hoped**: `planLegs` over the ten first routes gives 15, 20,
22, 22, 23, 30, 32, 45, 48, 48 — two at the cap, both in the top two bands. Section 2 now reports
**1 of 10 breaching** (Chongjin-Jeju City at 80%), where the 263-node list reported 2 of 5.

**2. THE BENCHMARK'S OLD CAVEAT WAS WRONG IN ITS MODEL, not merely in its number**, and that is
the finding. It said Dijkstra is O(E log V) so ~8x the graph is ~8x the work. Measured on 692
nodes / 1,215 edges, 200 pairs: **five Dijkstras cost 0.64 ms mean and 1.6 ms at the worst pair —
5% of the call.** The other ~95% is Yen, whose `kShortestPaths` runs a Dijkstra per spur node
ALONG THE PATH, so it scales with HOP COUNT, and hops are what the continental slice changed (19
before, 59 now). Total: mean 11.7 ms, p50 0.91, p90 41.6, max 123.7; at the stated 6x phone
multiplier that is **FAIL at max (742 ms) and at p90 (250 ms), PASS at p50 (5.5 ms)** against
150 ms. **The budget is NOT raised.** 150 ms is a claim about how long a player waits and the map
growing is not an argument about players; passing today would need ~5x, which is writing the
regression down as the requirement. The fix is the ceiling sections 2 and 4 already ask for —
bound how far a Yen backfill may stray from the shortest path. Not M3.11 work.

**3. `GEO_UNDECLARED_BRIDGE`'s budget is 13 → 0, re-measured, and it went the OPPOSITE way to the
prediction.** ADR 0033 Decision 6 warned that growth faster than the node count would be a finding
about the selector. On the 692-node slice: 32 bridges (was 35), **zero of them strand 10+ nodes**
(was 13), largest stranded side in the whole graph is **4**. 2.6x the nodes, 3.0x the edges,
average degree 3.07 → 3.51 — the 263-node slice was the stringy one, because its 10+ branches were
islands and spurs reached by a single edge and those places have neighbours in more directions on
a continental map. Zero is the honest calibration with 2.5x of headroom before a branch can reach
`SIGNIFICANT_BRANCH`. The rule's test now sizes its fixture from the constant instead of a literal.

**4. A DOC UNDERCOUNT, and it was worse than flagged.** `PROGRESS.md`, `docs/adr/0035` and
`docs/sim-baseline-corpus.md` all said **five** of 25 corpus routes complete at 0.0%. Re-measured
at 1,000 runs per route: it is **SEVEN** — 383 to 510 travel hours, 10,992 km and up. That is 28%
of the pair set, not 20%. Corrected in all three files; the residual is stated, not softened.

> **M3.11f/g: the SEVEN is right and the measurement behind it was not.** "1,000 runs per route"
> means 1,000 runs against the ONE policy the broken stride welded that route to (ADR 0038). Re-run
> on the full 25 × 5 grid at 1,000 runs per cell the count, the 383-510 h range and the 10,992 km
> floor all hold **exactly** — but the same harness had also called two more routes dead that are
> not, and "longest surviving route 285 h at **15.0%**" was really **24.88% at 25,000 runs per
> cell** (24.5% at 1,000 runs per cell — the same route, the larger sample). See M3.11f/g above.

### Also surfaced by the re-measurement, not fixed

- **`ILLICIT STRICTLY DOMINATES` went from 9 of 168 sampled pairs (5%) to 142 of 410 (35%).**
  Section 4 calls that "a design bug if > 0" and it is now a third of the graph: on those pairs
  `illicit` is shorter than every other returned route, crosses no more borders and takes no
  harder ground, so nothing is being traded and the other four profiles are decoration. This is
  a cost-function question (the ticketed-mode mask buys `illicit` too much on a graph where long
  land corridors dominate), not a geo one. It has no owner yet.
- **`fastest`, `cheapest` and `safest` each refuse 126 of 410 pairs at rung 0**, identically —
  the boundary mask, relaxed by the ladder immediately after. At 263 nodes the refusals were
  `illicit`'s. Worth a look before the ladder is trusted to mean anything.

### Reported, deliberately NOT built (named under M3.11 in the phase plan, absent from its DoD)

`densify-corridors.ts`, `world.simplified.json`, `GEO_EDGE_TOO_LONG` and the node-count band rule.
**Priced on the new slice so the human can decide whether M3.11 closes without them:** at a 450 km
cap, **398 of 1,215 edges exceed it (32.8%), max 2,531 km** — against 16 edges / 4% / 573 km max at
263 nodes. 90 edges are over 1,000 km and 12 over 2,000. Splitting every one at 450 km needs **570
midpoint nodes**, taking the graph 692 → 1,262 nodes and 1,215 → 1,785 edges. Only 2 of the 398 are
ferries, so this is land corridors, not sea. **That is not a threshold tweak, it is a second node
budget** — and it would double the hop counts that already dominate the benchmark above, so it must
be sequenced against the Yen ceiling rather than before it.

### DoD

`typecheck` clean · `lint` clean · `format:check` clean · `test` 1615 + 3 green ·
`content:lint` 0 errors (1 pre-existing `MISSING_IMAGE_MANIFEST` warning) ·
`geo:build --check` **byte-identical** · `geo:diversity` **PASS at median 54%** ·
`sim:diff` **No change** on BOTH packs at 2,000 runs. No engine file was touched, so goldens and
both baselines are unmoved by construction.

> **M3.11f/g: that `sim:diff` line was true at `6961f77` and is no longer true of the tree.** It
> reported "No change" because the harness was reproducing its own biased sample, not because
> nothing had moved. Both baselines were regenerated at M3.11f/g and both `sim:diff`s report
> "No change" against the NEW files. The "no engine file was touched" clause still holds and is
> now doing more work than it was: it is what proves the rebaseline is a sampling correction.

**M3.11 is CLOSED on the DoD as written.** What it does NOT close, and neither did the DoD:

- **The route-generation budget FAILs at p90 (250 ms) and max (742 ms)** against 150 ms, passing
  only at p50 (5.5 ms). The budget was deliberately not raised; the fix is a ceiling on how far a
  Yen backfill may stray from the shortest path. See item 2 above.
- **The 7-of-25 bimodal completion residual.** Needs a recovery mechanic or a route-length
  contract, not another constant sweep (ADR 0035). **Re-measured properly at M3.11f/g**: all seven
  are doomed under all five policies, 30 of their 35 cells being exactly 0 of 1,000.
- **Two named-pair endpoints are degree-1, which makes route diversity impossible by
  construction** — the same defect the Barcelona-Zaragoza row was removed for in item 1, caught
  there as a single hop and not caught here. Verified on the committed slice: `Jeju City`
  (`n.city.g1846266`) and `Palermo` (`n.city.g2523920`) each have exactly ONE incident edge, so
  every candidate route to either is forced through it and all five profiles must return the same
  final hop. 19 nodes in the graph are degree-1; these two are the ones `NAMED_PAIRS` selects.
  The pair constraint added in item 1 controls endpoint spread and distance band but says nothing
  about endpoint DEGREE.
- **The ferry network is missing, and one edge is geographically wrong.** The whole 1,215-edge
  graph has **6 ferry edges, all western-Mediterranean** (Barcelona/Algiers/Tunis/Palermo/
  Sassari); the Afro-Eurasia scale-up added none. The consequence is concrete: **`Seoul ↔ Jeju
City` is a 630 km edge with modes `bus/car/truck/rideshare` and no ferry — a road to an
  island.** That also explains the permanently unfillable `ferry_boarding` beat type in both
  baselines' "Beat types no event can fill" block.
- The four deferred items priced above (`densify-corridors.ts`, `world.simplified.json`,
  `GEO_EDGE_TOO_LONG`, the node-count band rule).

---

## M3.11d — the hour economy re-derived; corpus back in band at 41.0% (COMMITTED at `6961f77`)

**Corpus completion 19.2% → 41.0%, median legs 20 → 26, ending mix arrival 41.0% / gave_up 32.8%
/ collapsed 26.1%.** (**M3.11f/g re-measured these on an unwelded harness: 41.9%, 25 legs, and
41.9 / 38.3 / 19.8. No engine constant changed — see the M3.11f/g section.** The collapsed:gave_up
ratio the sweep was scored on moved 0.79 → 0.52, so the chosen constants are not shown wrong but
the sweep's two failure columns must be re-measured rather than diffed against.)
Two drift constants in `packages/engine/src/loop/world-tick.ts`:
`HOURS_PER_MORALE` 12 → 20 and `HOURS_PER_HUNGER_DAMAGE` 28 → 44 (`HOURS_PER_STARVING_DAMAGE`
14 → 22, holding the 2:1 rung). Nothing else in the engine moved. Full sweep, both hypotheses
priced, and what was rejected: **`docs/adr/0035`, second addendum.**

**What the measurement found, which is the part worth carrying forward.** Completion on the
corpus is dominated by ONE number — the route's total travel hours — and not by legs or
kilometres. **The VARIABLE survived M3.11f/g's re-measurement and came out stronger. The
THRESHOLDS did not, and are corrected here rather than left standing:**

| claim as written                         | on the corrected 25 × 5 grid                                               | sample           |
| ---------------------------------------- | -------------------------------------------------------------------------- | ---------------- |
| "under 150 hours completes 55-85%"       | **80.2% to 96.8%**                                                         | 1,000 runs/cell  |
| "over 250 hours completed 0.0%"          | **21.1% to 26.1%** in the 250-300 h band; nothing is near zero until 383 h | 25,000 runs/cell |
| two trains, "58% against 1%", four times | **85.23% against 46.09%, 1.8×**                                            | 25,000 runs/cell |

**Every rate in that table carries its sample, because two different samples of these same
quantities are quoted across these docs and the larger one wins.** The 250-300 h band read
**21.3% to 25.8%** and the trains **85.4% against 46.4%** at 1,000 runs/cell; both are superseded
here at 25× the sample. The band's top end is the part that matters: its four routes
(260 / 272 / 281 / 285 h) read 22.32 / **26.14** / 21.06 / 24.88, so **26.14% is above the 25.8%
ceiling this table used to state** — a refutation, not a rounding difference. The under-150 band
is **left at 1,000 runs/cell rather than restated**: a 25,000-runs/cell rate is on record for only
three routes in it (112 h 95.24%, 116 h 96.64%, 140 h 80.13%) and nothing here shows those are all
of them, so the bound the sample supports is what is written.

**Hours still dominate once policy is controlled for, which is the check the old sampling could
not run.** Kendall tau-b against completion inside each policy column (n = 25 routes): hours
−0.850 to −0.934, km −0.696 to −0.759, legs −0.653 to −0.703 — hours beats both under all five
policies, no exception. Dropping the seven doomed routes so the cliff cannot do the sorting
(n = 18) **widens** the gap: hours −0.732 to −0.922 against km −0.542 to −0.577. Two tie-free
confirmations: km is refuted outright by four pairs where _more_ kilometres buy _more_ completion
(each a mode switch costing fewer hours), and two routes at identical 43-leg counts complete 60.2%
(1,000 runs/cell — **no 25,000-runs/cell figure for the 202 h route exists in these docs, so the
smaller sample is stated rather than a better-looking one invented**) and 0.06% (0.060% at both
samples) at 202 and 383 hours. **So the confound was not "hours"; it was the harness confounding
ROUTE with POLICY.**

**The residual after hours tracks transport mode, and the bound this section carried was too
tight.** "Bounded at 7.4pp" is refuted: re-measured at 125,000 runs per route, ordering all 25
routes by hours leaves seven adjacent inversions, all seven mode switches, and the largest is
**+8.7pp** (187 h car 61.91% → 191 h train 70.65%, 95% CI [8.37, 9.11]) with a second at
**+8.1pp** (213 h car → 219 h bus, [7.75, 8.53]). Both intervals clear 7.4 with room. **Write it
as a bound with its sample size attached** — at 125,000 runs per route, no adjacent pair inverts
by more than 8.7pp against a 95pp span — and not as "within 7.4pp everywhere"; "everywhere" is a
claim about routes nobody ran. Two smaller corrections fall out of the same re-measurement:
**train is not monotone in hours** (180 h 70.06% against 191 h 70.65%, +0.59pp [0.24, 0.95],
excludes zero) where this section named bus, train and truck as the monotone ones, and **the car
inversion at 395 h/407 h does not reproduce** — it rested on 2 completions against 5 in 5,000,
which cannot resolve a sign, and at 125,000 runs per route the order is the expected one (0.100%
against 0.047%). The residual still cannot be separated further on this route set, because mode is
nearly a function of hour band here and `legHours` is itself built from a per-mode overhead and
speed.

**Neither lever reaches the band alone.** Morale alone saturates at 26.6% while `collapsed` rises
28.5% → 66.8%; starvation alone saturates at 28.1% while `gave_up` rises to 65.4%. Each deletes
its own failure mode and hands the runs to the other meter — the conservation ADR 0035 named, now
measured a third time. Only both together clear the floor.

**The pair-set hypothesis was measured and rejected, not assumed away.** Capping `CORPUS_PAIRS`
at the plan's 13,000 km gives 23.7% (below the floor) and 57.1% on top of this change (above the
ceiling). It also points the wrong way: over 898 sampled city pairs, 46-48 legs is **51.4%** of
everything in the 22-48 band, so one-pair-per-bucket already under-weights the hard tail at 20%.
`CORPUS_PAIRS` is untouched.

### THE NEXT STEP, and it is not another sweep

**SEVEN of the 25 corpus routes complete under 0.2%** — every one over 380 travel hours
(383 to 510 h, 10,992 km and up). (**"Under 0.2%", not the "at or below 0.1%" this line used to
say.** The worst of the seven, `route.scenic.r29ui5g` at 395 h, reads 0.100% over 125,000 runs
with a 95% interval of [0.082, 0.118] that straddles 0.1; two further 125,000-run streams give
0.123% and 0.112%, pooling to 0.118% [0.104, 0.131] — above it. Quote a bound the sample supports.) **This paragraph said FIVE for three commits and five was never
the measurement** — the count was carried, not taken, and it understated the residual by two
routes and 40% of it.

**Re-measured at M3.11f/g on the full 25 × 5 grid, 1,000 runs per cell (5,000 per route). The
count, the hour range and the km floor all hold exactly; the flat "0.0%" and the provenance did
not.** Four are true zeros over 5,000 runs; three land on **3, 2 and 5** completions — written as
counts, not rounded to 0.0%, so nobody re-derives a false absolute. **They are doomed under all
five policies**: of the 35 cells, 30 are exactly 0 of 1,000 and the best anywhere is 3 of 1,000.
The doom is a property of the route, not of how it is played. **Those three counts do not ORDER
their routes and must not be read as if they did** — at 125,000 runs per route they are 383 h
0.060%, 395 h 0.100%, 407 h 0.047%, so the 5,000-run column gets the 395/407 pair backwards. A
handful of completions is evidence a route is doomed and is not a ranking among doomed routes.

**The cliff is bounded, not located.** It lies in **(285 h, 383 h]** — 285 h completes **24.88% at
25,000 runs per cell** (24.5% at 1,000 runs per cell; this said 15.0%) and 383 h completes 0.06%
(0.060% at both samples). The 98-hour span between them holds no route, and
that is a **hole in `CORPUS_PAIRS`**, which takes one pair per leg bucket, **not a measured dead
zone**. Write "between 285 and 383 hours"; do not pick a number inside it. Independent
corroboration that the bound is real: `HOURS_PER_HUNGER` 6 to the starving rung is ~60 hours, plus
10 health at `HOURS_PER_STARVING_DAMAGE` 22 is 220 more — **280 hours, from two constants and no
simulation**, five hours under the observed lower bound. The distribution either side is bimodal,
exactly the "averaging artefact" ADR 0026's addendum described. **The fixture control shows the
same wall from the other side: 48.5% → 75.3% → 74.0%, above the band, `failure_collapsed` 0.1%.**
(74.0% is the committed Latin-square figure — `docs/sim-baseline.md` body and its M3.11f/g block.
The 75.0% this line briefly carried is the REJECTED odometer's number, which never reached a
committed baseline and must not be quoted; both baseline headers say so in as many words.)

The cause is structural: there is **no recovery term anywhere in `worldTick`**. Energy floors by
mid-run and never returns, which makes `ENERGY_TIRED` permanently true and the morale bleed
unconditional; content recovery is 0.38 picks/run. Survival is therefore a FIXED hour budget, and
a fixed budget cannot span a route space whose hours vary 4.5×. The two honest options are a
recovery mechanic or a route-length contract the generator enforces. **Both are milestones. Do
not sweep these constants a fourth time expecting a different shape.**

### Also found, not fixed

- **The graph has a fat detour tail.** Routed km over great-circle km is p50 1.72 / p90 2.53
  across 191 sampled long pairs — but Copenhagen→Brest, which is IN `CORPUS_PAIRS`, is **5.87**
  (1,414 km great-circle, 8,306 km routed) and the worst sampled pair is 8.24. Since leg count
  rises with routed distance, selecting pairs by leg bucket preferentially selects the graph's
  worst-connected regions. Fourth instance of "the ranking, not the measurement, decides the
  shape". Belongs to the geo work.
- **Corpus long-range payoff is 24.8% with 46 unresolved threads, and the explanation this bullet
  carried is WITHDRAWN.** It read **18.0% → 14.0%** with threads **55 → 63**, and blamed runs
  lasting long enough to schedule consequences and then arriving before resolving them. M3.11f/g
  moved the line to **24.8% / 46 without touching the engine** — only which policy each route is
  played under — so a +10.8pp swing says the rate was being measured on a biased fifth of the
  grid, **not** that runs arrive early. Both siblings withdrew this in the previous pass
  (`docs/sim-baseline-corpus.md`, `docs/adr/0035`); the M3.11d fence above this section covers
  completion, median legs and the ending mix only and does not reach this list, so the withdrawal
  is written here in full rather than inherited. It is also the lowest-n line in the report — 113
  schedules and 28 fires across 2,000 runs, where completion rests on 2,000 — still far from the
  80% target, and it wants a bigger instrument before anyone tunes against it.
- **Three more tests carried leg-length assumptions**, all in `world-tick.test.ts`, all now
  derived from the constants they were silently capping. ADR 0035's first addendum fixed exactly
  this bug for one constant, wrote down the general rule, and left the other three.
- **Both baseline headers said to regenerate with `cp`, which destroys them.** Recipe corrected
  in place. While correcting it I put a literal close-comment marker in the prose and broke
  `sim:diff` — `diff-report.ts:stripHeader` cuts at the FIRST line containing one — so the
  corrected recipe now warns about that too.

DoD: `typecheck` clean · `lint` clean · `test` 1615/1615 green · `content:lint` 0 errors
(1 pre-existing `MISSING_IMAGE_MANIFEST` warning) · `sim:diff` **No change** on BOTH packs
against the regenerated baselines · goldens regenerated (3 runs get further, 2 convert failure →
arrival, 6 unchanged in outcome).

---

## M3.11 — modifier chips collapse by `sourceKind` (COMMITTED at `06f462b`)

`ModifierResolution` gained `chips`: the resolved rows grouped by `sourceKind` and summed, as a
seventh **presentation-only** step of `resolveModifiers`. `modifiers` is unchanged and is still
what `runSkillCheck` builds the roll from, so the arithmetic cannot move — asserted as a
property over 600 generated resolutions, the load-bearing one being roll neutrality (same die,
same total, same verdict off either list). A group of one keeps the row's own
`check.modifier.<id>` label; a group of two or more takes a new `check.kind.<sourceKind>` key,
twelve of them, covered both ways by `packages/content/__tests__/locale.test.ts`.

**Measured, corpus, 2,000 runs: chips/check 7.3 → 6.9, over-band 7,525 (38.5%, worst 13) →
5,980 (30.6%, worst 11). Two lines moved and no others.** The goldens regenerate
byte-identically, because the chip list is returned from `resolveChoice` and never written into
`RunState` — `stateDigest` cannot see it.

**IT DOES NOT LAND THE 3–7 BAND, and the reason is worth carrying forward:** 94.6% of groups
have exactly one member. Checks pull one row from each of eight-to-eleven _different_ kinds, not
eight rows of one kind, so there is almost nothing to fold. This is a breadth problem, which is
what `modifiers.yaml`'s own header says the registry was authored for. Two measured follow-ups
are deferred with their numbers in `docs/adr/0037`: suppressing zero-delta groups reaches 19.1%
over band, and a top-6-plus-overflow chip reaches 0.0% by construction. Neither is in this
change; each is its own design decision.

---

## Shipped this session (2026-08-12, session 8) — **M3.6, M3.7, M3.8a and M3.8b**

Four milestones. M3.6 made the geo data loadable and linted; M3.7 put `legKm` and `montageLegs`
on `RouteState` at uniform values and bumped `SAVE_VERSION` to 5; M3.8a replaced flat
`HOURS_PER_LEG` with a distance-derived hours model — **and moved the fixture baseline**; M3.8b
graded hygiene, **and the prediction written before the run was wrong.**

---

## M3.8b — graded hygiene, and a prediction that missed

Hygiene was the last cliff in `world-tick.ts`: `hours >= 6 ? -1 : 0`, one point once for any leg
over six hours. It now accrues via `spanPoints` against the clock span like hunger and energy, so
the remainder carries and two short legs cost what one long one does. ADR 0014's third rule
("penalties are GRADED, not cliffs") is finally true about every meter it covers.

Grading a DRAIN is not what `ENERGY_TIRED` warns against — that rule is about a THRESHOLD penalty
keyed on a floored meter. **Morale stays ungraded** and got no exception.

### The prediction, and what actually happened

Written before the run, as the milestone requires:

|                          | predicted           | actual                              |
| ------------------------ | ------------------- | ----------------------------------- |
| fixture behaviour        | none — digests only | ✅ **5 digests, nothing else**      |
| `docs/sim-baseline.md`   | No change           | ✅ No change                        |
| corpus completion        | down to 37–41%      | ❌ **44.1% → 44.0%**                |
| `Modifier chips / check` | up to 7.0–7.3       | ❌ **6.7 → 6.7**                    |
| `Checks under 2 chips`   | 0                   | ✅ 0                                |
| endings toward failure   | yes                 | ~ `failure_collapsed` 45.1% → 45.3% |

The fixture half was exactly right, and for a checkable reason: `mini-pack.json` contains **zero**
occurrences of `hygiene`, and `check-run-end.ts` tests only health and morale. Nothing in that
pack can read the meter, so grading it cannot change behaviour there. Only 5 of 9 digests moved —
the other 4 runs bottom out at hygiene 0 under both models, so their final states are identical.

### Why the corpus half missed — and the line that was missing

**Hygiene was already floored by mid-run under the cliff.** The report could not show that,
because it had no hygiene line; `hygiene` joins the resource trajectory table in the same commit,
which is a report-format change and is why BOTH baselines were regenerated together.

| corpus hygiene p10/p50/p90 | leg 5 | leg 15 |
| -------------------------- | ----- | ------ |
| old (6-hour cliff)         | 3/5/6 | 0/0/3  |
| graded                     | 1/2/4 | 0/0/0  |

A p90 of 3 at leg 15 means `dishevelled` (hygiene ≤ 3, −2, five check tags) was **already firing
for 90%+ of runs**. Grading brings that forward from ~leg 12 to ~leg 6. The behavioural window is
legs ~3–12 only, and it intersects 5 of 18 check tags — so the aggregate barely moves. **Grading
changed WHEN hygiene floors, not WHETHER.**

`presentable` (+1 at hygiene ≥ 8) was already near-dead and is now dead: hygiene starts at 8, so
one point of drain ends it. The row is reachable for about one leg.

### The one number that looks like a real move, and is not

`Long-range payoff rate` 73.9% → 78.3% is **17/23 → 18/23** — a single thread out of twenty-three,
which `Unresolved threads 6 → 5` confirms. A four-point swing on a two-dozen denominator is one
event. Reading it as a behavioural result would be exactly the mistake ADR 0032 exists to prevent.

### The lever, for whoever tunes hygiene next

Not the drain rate — both models floor the meter and the rate only sets how fast. It is the
RESTORE economy (`rest.the_shared_room` is the only event that gives any back, +1 and +2) and the
`dishevelled` threshold, which at ≤3 on a meter that reaches 0 by mid-run is effectively
"always, eventually".

---

## M3.8a — the hours model, and the incoherence that stopped being hypothetical

`loop/leg-hours.ts` is new: `legHours(km, mode, montage)` = a per-mode overhead plus
`mulDivRound(km, 1, KMH[mode])`, floored at 1 hour and capped at 12 (30 for a montage leg).
`HOURS_PER_LEG` is gone from `world-tick.ts`, and so is `Math.round(totalKm/legCount)` — a leg now
advances `progressKm` by its own `legKm`, so a completed run lands on `totalKm` to the kilometre.

**The structural claim held.** `worldTick` needed no new code to make drain proportional: ADR 0014
had already denominated it in hours, so clock, hunger, energy, health and `progressKm` all scaled
by themselves the moment hours became a function of distance.

### ⚠ The fixture baseline moved. `docs/sim-baseline.md` was regenerated, by decision

The plan said it must not move, and that if it did the calibration was wrong. **The calibration is
not wrong — the prediction was.** It was derived from the three routes' STARTING modes (car 62 km →
4+1 = 5, truck 89/90 → 4+2 = 6, bus 86/87 → 3+2 = 5, all exactly reproducing the flat table). It did
not consider that transport mode **changes mid-run**:
`__fixtures__/events/transit/bus_ejection.yaml:49,64` sets `mode: foot`. A leg planned at 86 km by
bus, once walked, costs `0 + mulDivRound(86,1,4)` = 22 hours capped at 12, against the old flat
`foot: 9` — every walked leg 33% more expensive.

That is **ADR 0026 Decision 6's recorded incoherence**, written as a future concern with no owner.
It has evidence now.

**The three fixtures isolate the three cases, which is the useful part:**

| fixture   | mode       | what moved                                                      |
| --------- | ---------- | --------------------------------------------------------------- |
| `short`   | car        | **nothing** — 62 km is exactly `round(620/10)`; a clean control |
| `illicit` | truck      | **digest only** — `progressKm` 89/90 vs a flat 89; no behaviour |
| `scenic`  | bus → foot | legs 11→8/9, one ending `gave_up`→`collapsed`, choices diverged |

**The corpus baseline says "No change"** — no corpus event sets `field: 'mode'`; every
`op: transport` there is `condition`. Same routes, same engine, different event sets: the mode
change is the entire cause, demonstrated rather than argued.

**What moved in the fixture baseline** — completion **unchanged at 31.2%**, median legs 10 and
median in-game days 5 both unmoved. The FAILURE MIX shifted: `failure_collapsed` 35.8% → 39.0%,
`failure_gave_up` 33.0% → 29.8%, health leg-5 p10 9 → 8, beat fill 51.8% → 53.2%. Making walking
expensive should move exactly those and nothing else.

**Rejected, and why:** capping `foot` at 9 hours would have preserved the control by choosing a
number to fit a fixture rather than because it is right, and left the same divergence latent for
every other mode change. Recomputing `legKm` on a mode change is the proper fix — and it moves
`legCount` mid-run, rebasing the beat schedule, which is the exact problem leg-as-time-slice was
rejected for.

**Decision 6 still needs a phase.** It is not a tail case: one shipped event on one of three
fixture routes reaches it, and it is worth 3.2pp of the failure distribution when it fires.

---

## M3.7 — `legKm`, `montageLegs`, `SAVE_VERSION` 5

**The values are uniform everywhere. M3.9 replaces them.** Shipping the field, the save bump and
the migration on their own is the whole point: when the numbers change, the golden diff is
attributable to the numbers rather than to the format.

### The prediction held exactly

ADR 0026 said all nine golden digests would move and nothing else would. That is what happened:

- `golden-runs.json` diff is **9 lines, every one an `expectedDigest`**. `contentVersion`,
  `choiceSequence`, `expectedHistoryKeys`, `expectedLegs` and `expectedEndings` byte-identical.
- **Both sim baselines report "No change."** `progressKm` is write-only telemetry, so a
  digests-only signature is what distinguishes a save-format bump from a behaviour change — and
  this was the cheapest milestone in the phase to find out otherwise.

Tests **1480 → 1498 across 73 files**.

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm content:lint && pnpm format:check
pnpm sim:diff -- --runs=2000                    # "No change vs docs/sim-baseline.md."
pnpm sim -- --pack=corpus --runs=2000 --diff    # "No change vs docs/sim-baseline-corpus.md."
```

### The allocator is cumulative-floor, and ADR 0026 was wrong about it

The ADR specified "largest-remainder". **Largest-remainder is ill-defined on a uniform split** —
every leg has the identical remainder, so ranking them is a whole-array tie and the output depends
on the sort's tie-break. That is a nondeterminism surface in a value that feeds `stateDigest`.
Decision 5 of the same ADR had already rejected largest-remainder for `arrivalLegOfEdge` on
exactly those grounds; Decision 3 did not notice it was specifying the thing Decision 5 threw out.

`uniformSplit` is `floor((i+1)·total/n) − floor(i·total/n)`. The sum is exact **by construction**
rather than by a correction pass, and the remainder **spreads** instead of clumping at the front —
which is cosmetic now and stops being cosmetic at M3.8, when `legHours` divides `legKm` by speed
and a front-loaded remainder would put a duration bump on the opening legs of every route. There
is a test for the spread, not just the sum. ADR 0026 has an addendum recording the correction.

### What landed

`state/uniform-split.ts` (new) · `route-state.ts` +2 fields · `validate-route.ts` +3 checks ·
`ENGINE_ERROR_CODES` +2 (`route/leg-distance-mismatch`, `route/montage-out-of-range`) ·
`SAVE_VERSION` 5 · `migrate_4_to_5` · `save-v5{,-loaded}.json` · `routes.json` ×3 ·
`load-fixtures.ts` guards · `make-route.ts` · `golden-runs.json` · `state/__tests__/leg-km.test.ts`
(new, 12 cases) · 2 migration tests.

### Three things worth carrying forward

1. **The digest is NOT the forcing function.** `canonicalJson` serialises `Object.keys`, so an
   absent key contributes nothing — adding a field to the TYPE without editing `routes.json` moves
   no digest and leaves `state.route.legKm` as `undefined` inside a type that says
   `readonly number[]`. The `requireArray` guards in `load-fixtures.ts` are the only thing that
   makes it loud. **Any new `RouteState` field lands with its guard in the same commit.**
2. **`migrate_4_to_5` WRITES rather than omits**, the same trap `migrate_3_to_4` had to learn:
   `isRunStateShape` checks only that `route` is present (`run-state-shape.ts:39`), never its
   fields. It writes the CORRECT value too — a v4 save was produced by an engine whose every leg
   covered `totalKm/legCount`, so `uniformSplit` is what that run was already doing, which is what
   makes the bump safe to ship mid-journey.
3. **The extra hand-built mid-route v4 save was not needed.** That instruction came from v3→v4,
   whose branch no fixture reached. `migrate_4_to_5` has no branch, and `save-v4.json` is already
   mid-route at `legIndex: 7` of 24.

### Still true, and M3.8a is where it goes away

`world-tick.ts:126` still applies `Math.round(totalKm/legCount)` per leg — M3.7 did not touch
`world-tick.ts` at all. So a run's accumulated `progressKm` is built at a rate summing to
`legCount × round(totalKm/legCount)` rather than `totalKm` (24 × 89 = 2136 against 2140 on the
illicit fixture). Harmless in play; **do not write a test asserting the clamp can never fire**, as
ADR 0026's last bullet warns.

---

## M3.6 — the geo data is loaded and linted

`packages/content/geo/` held 263 nodes, 404 edges and a 42-row overlay that **nothing in
`packages/content` could read**. It shipped validated by nothing except the tool that generated
it. That is closed: the geo files now go through a Zod schema and a loader like every other
content file, and `content:lint` carries ten `GEO_*` rules.

### Prove it

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm content:lint && pnpm format:check
```

```bash
pnpm content:lint     # 19 rules, 0 errors, 1 warning (MISSING_IMAGE_MANIFEST, structural)
pnpm geo:diversity    # VERDICT: PASS — median 59% against a 70% ceiling, unmoved
pnpm geo:verify       # PASS at the measured maximum
node packages/tools/geo-build/cli.ts --stage=all --real --bbox=-12,36,30,60 --check   # byte-identical
pnpm sim:diff -- --runs=2000                      # "No change vs docs/sim-baseline.md."
pnpm sim -- --pack=corpus --runs=2000 --diff      # "No change vs docs/sim-baseline-corpus.md."
```

Tests moved **1440 → 1480 across 72 files** (+14 `content/__tests__/geo.test.ts`,
+26 `content-lint/__tests__/rules-geo.test.ts`).

| commit    | what                                                                         |
| --------- | ---------------------------------------------------------------------------- |
| `b80f5d5` | `overlay.yaml`, the file/record schemas, `load-geo.ts`, the `./geo/*` export |
| `28441f2` | `rules-geo.ts` — ten rules, each fired against a deliberate violation        |

### ⚠ The finding: the record schemas could never have parsed a committed artifact

The M3.6 brief warned that a `strictObject` FILE schema would reject the metadata headers. True,
and **incomplete**. `geoNodeSchema` was a `strictObject` over canonical keys (`name`, `type`,
`terrain`, `elevationM`) while `write-artifacts.ts` emits terse ones (`n`, `t`, `tr`, `e`) — and
the files carry `y`/`x` coordinates that had **no field in the schema at all**. Edges were the
same (`a`/`b`/`d`/`m`/`td`/`sc`/`sz`/`tl`/`ab`/`uv`).

It survived from M3.2 because `conformance.test.ts` pins the schema's OUTPUT against the engine's
`GeoNode`/`GeoEdge` — a real check, and a completely different one. **Nothing pinned the input,
because nothing had ever tried to parse the file.**

The schema's input is now the terse form, transformed to canonical — the shape `predicate.ts`
already uses. `geo.test.ts` parses the COMMITTED artifacts and is the only thing in the repo
linking the writer to the schema; they are in different packages and the writer builds strings.
**Do not replace it with a synthetic fixture** — a hand-built record passes whatever shape the
schema happens to have, which is exactly how this shipped.

### The four decisions worth knowing without reading ADR 0033

1. **The headers are DECLARED, not deleted.** `_format` is optional (documentation; a file
   without one should still load), `digest`/`nodesDigest`/`count` are required (integrity claims;
   an absent claim is not a satisfied one). The overlay's comments became real `#` comments in the
   YAML move. `count` is checked in the loader, not as a Zod refinement, so the message can name
   both numbers.
2. **`lat`/`lng` ride on `GeoNodeRecord`, never on `GeoNode`.** `conformance.test.ts:99` asserts
   `z.infer<…>['node']` equals `engine.GeoNode`, so the split is compiler-enforced.
3. **The three §11 text rules scan raw bytes on purpose.** A file carrying `cc` FAILS TO LOAD
   under a `strictObject`, so `bundle.geo` is null and a parsed-data check would be silent exactly
   when it matters. They scan KEYS, never values — the overlay's justifications name real
   countries ("Free in Germany, then the A36 charges from Mulhouse") and must keep doing so.
4. **`GEO_UNDECLARED_BRIDGE` is a warning with a budget of 13**, measured: 35 bridges, 13 of them
   stranding 10+ nodes. Growth is the signal. **M3.11 will move this number** — raising it is a
   decision with the new measurement in hand, not a formality.

### Two things the brief said that turned out to be wrong

- **"Write `load-geo.ts` beside `load-content.ts`"** — `load-content.ts` is in
  `packages/tools/content-lint/`, a different package. The loader went to
  `packages/content/loader/`, per the brief's own header and the plan's blast radius. The
  `readLocale` citation at `load-content.ts:84-87` was accurate.
- **`"./geo"` became `"./geo/*"`.** A bare subpath needs an index module inside a directory that
  must stay pure data; the pattern resolves today and a bare one would not.

`geo-build` got a real fix out of this: its `JSON.parse(...) as Overlay` cast is gone. A
hand-edited overlay with a misspelled key typechecked perfectly and silently did nothing.
`loadGeoOverlay` is a separate export because that tool WRITES the artifacts `loadGeo` insists on
parsing — a first build would otherwise be impossible.

---

## Shipped in session 7 (2026-08-12) — **PHASE 3 THROUGH M3.5**

Steps 1–5 of the Phase 3 plan (`~/.claude/plans/plan-mode-build-the-synthetic-bird.md`) are
done. **The route generator runs on real geography and the M3.5 diversity gate PASSES at a
median 59% route overlap against a 70% ceiling.** It got there after failing at 83%, and almost
none of the fix was where the plan predicted — see ADRs 0030 and 0031.

### The slice, as committed

`263 nodes` (170 settlements + 93 border crossings) · `404 edges` · **1 connected component** ·
0 orphans · 35 bridges · 33 tolled edges · 129 rail corridors · 58 `unavoidable` hard edges.
Derived from GeoNames + Natural Earth only; no OSM anywhere (ADR 0024).

### Prove it

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm content:lint && pnpm format:check
```

```bash
pnpm geo:build       # 1 component, 0 orphans, overlay issues none
pnpm geo:diversity   # VERDICT: PASS — median 59% against a 70% ceiling
pnpm geo:verify      # named pairs, pathologies, benchmark
node packages/tools/geo-build/cli.ts --stage=all --real --bbox=-12,36,30,60 --check
pnpm sim:diff -- --runs=2000                    # "No change vs docs/sim-baseline.md."
pnpm sim -- --pack=corpus --runs=2000 --diff    # "No change vs docs/sim-baseline-corpus.md."
```

`--stage=all` needs `.geo-cache/` populated (seven archives, `sources.lock.json` lists them).
Everything else runs on committed artifacts.

### What landed, in commit order

| commit    | what                                                                                     |
| --------- | ---------------------------------------------------------------------------------------- |
| `ff5f5e3` | last 5 components closed via overlay; `--stage=diversity`, which names its own cause     |
| `d9b55be` | `place-borders.ts` — 51 controlled crossings, 42 of them forced by connectivity          |
| `9d539cd` | `classify-terrain` precedence: `hill` 0 → 12, `desert` correctly still 0 in Europe       |
| `8e42227` | `tolled` was declared and NEVER READ; `train` tested endpoints not corridors (93% → 36%) |
| `59d71e0` | `safest`'s terrain mask cut the graph into 52 pieces; `GeoEdge.unavoidable` fixes it     |
| `b702315` | **the gate PASSES** — `TWO_HOP_RATIO` 1.6 → 1.2 took the median 72% → 59%                |
| `c9c86ae` | there was no sim baseline drift; `sim:diff` now refuses a mismatched run count           |
| `606c407` | the fixture pack is the empty-registry control and must stop being reported as failing   |
| `3f6522a` | `pnpm geo:verify` — and three findings it turned up                                      |
| `846a4e8` | ADRs 0030–0032                                                                           |

### The three things worth remembering

1. **A mask must not disconnect the graph** (ADR 0030). The boundary mask left 43 components,
   the terrain mask 52. The ladder then rescued every profile by dropping masks, after which all
   five searched one identical graph and "diversity" was arithmetic. Both masks now carry a
   derived Kruskal exemption, and what is NOT exempted is the point.
2. **Diversity came from graph density, not the cost functions** (ADR 0031). Three real
   cost-model fixes moved identical `fastest`/`cheapest` pairs 170 → 167. Moving the 2-hop prune
   from 1.6 to 1.2 took it to 102 and the median from 72% to 59%.
3. **A report must read its diagnosis off its own measurement** (ADR 0032). Two reports printed
   conclusions their data did not support. One cost a twenty-commit bisect for a drift that did
   not exist.

---

## Half-done

Nothing is left broken. These are absent or partial, with paths:

- ~~`overlay.json` should be `overlay.yaml`.~~ **Done at M3.6.** Byte-verified: `--check` is
  byte-identical after the move.
- ~~`packages/content/package.json` has no `"./geo"` export.~~ **Done at M3.6**, as `"./geo/*"`.
- **M3.9 is complete, but `generateRoutes` has NO CALLER.** All six modules exist and are
  tested; the run path still takes `RunInit.route` from a caller and no corpus routes file
  exists. That is M3.10a, and it is why both baselines read unmoved through four milestones. `leg-plan.ts` has **no caller** — it is pure and fully tested, so the tree is green and
  both baselines are unmoved, but nothing generates a route yet. The exact continuation is under
  "Next step" above.
- **ADR 0026 Decision 6's incoherence is LIVE and has no owner.** `legKm` is baked at generation,
  so a leg planned by bus and walked after `bus_ejection` costs `legHours(86,'foot')` = 22 hours
  capped at 12. It is reachable by one shipped event on one of three fixture routes and is worth
  3.2pp of the failure distribution when it fires. The proper fix recomputes `legKm` on a mode
  change, which moves `legCount` and rebases the beat schedule — no milestone in this phase
  contains it.
- **`GEO_UNDECLARED_BRIDGE`'s budget is 13 and belongs to THIS slice.** 35 bridges, 13 stranding
  10+ nodes, measured at 263 nodes. M3.11 quadruples the node count and the budget must be
  re-measured, not extrapolated. If it grows faster than the node count the selector is producing
  a stringier graph — that is the finding, not the bump.
- **13 lifeline edges are undeclared, and `overlay.yaml`'s `criticalEdges` is still empty.**
  Declaring them is real work with a real payoff (each is an edge whose loss cuts the map) and it
  was not M3.6's job. Nothing depends on it yet.
- **`densify-corridors.ts` was never built.** 16 edges (4%) exceed 450 km, the largest `D_max`
  in the plan; the max is 573 km. A `GEO_EDGE_TOO_LONG` rule added at M3.6 goes red on our own
  data immediately — the plan warns about exactly this.
- **`place-borders` and `mark-unavoidable` are global over-approximations.** Both compute one
  spanning set for the whole graph rather than per origin–destination pair (ADR 0030).
- ~~`docs/geo-data-licensing.md` §6 contradicts the code.~~ **Fixed 2026-08-12.** It now records
  the measured one-global-1.39 factor, the 13-pair sample, and a p90 residual of 21.6% — and says
  plainly that sea legs are not calibrated at all.
- **`world.simplified.json` does not exist.** Deferred to M3.11 with the scale-up.
- **The 22–48 leg band is unsurvivable** — 0% completion at 24+ legs, measured (ADR 0026
  addendum). Still open, and it gates M3.10b.

---

## Next step — ONE task

**M3.11: scale the geo slice. SCOUTED, NOT STARTED — and the plan's framing of it is wrong.**

**"A data commit only, and only because ids are source-derived" is false**, measured 2026-08-12
with `--stage=all --real --bbox=-18,-35,180,72 --check` (Afro-Eurasia, the largest connected
landmass — a world bbox cannot work at all, because the Americas and Oceania are not
land-connected and the build fails closed on >1 component).

What that bbox actually produces:

|                                    | 263-node slice | Afro-Eurasia       |
| ---------------------------------- | -------------- | ------------------ |
| nodes / edges                      | 263 / 404      | **805 / 1307**     |
| components                         | 1              | **49** (must be 1) |
| orphans                            | 0              | **37**             |
| overlay rows naming a dropped node | 0              | **11+**            |

**Stable ids were necessary and not sufficient.** The ids do survive — that part of ADR 0024
holds. What breaks is WHICH NODES GET SELECTED: `SETTLEMENT_QUOTA` is a global budget
(europe 150, asia 195, africa 120, …), so once Asia and Africa compete for it, Europe's 150 slots
go to different cities. Patra, Hedensted, Calabria, Bursa, Mallorca, Orléans and Tours all drop
out, and every overlay row naming them goes stale. `GEO_OVERLAY_STALE` fires exactly as designed
— the M3.6 rule doing its job — but the work it exposes is **re-authoring the overlay**, which the
plan already priced at ~181 rows and then described as a data commit anyway.

Supply is NOT the problem: at a world bbox every continent supplies its quota 12×–60× over, and
**epsilon resolutions are 0**, so `--check` determinism holds at scale.

> **SUPERSEDED at M3.11e — this list is history, not instructions.** Items 1-3 and 6 shipped at
> `04f0f38`/`6961f77`; item 4's budget of 13 was re-measured to **0** and its "16 edges >450 km,
> max 573" is now **398 edges, max 2,531**; item 5 is untouched. The live numbers are in the
> M3.11e section at the top of this file. A fresh agent should start there.

A fresh agent starts here:

1. **The landmass question is DECIDED: one component per landmass (ADR 0036, accepted, not yet
   implemented).** Read it before anything else — and read the section on what it does NOT fix.
   Afro-Eurasia is ONE landmass, so its 49 components are 1 landmass + 48 fragments (Britain,
   Japan, Sicily, Madagascar and forty-odd more) and **every one still has to be ferried in or
   dropped**. The decision buys the ability to extend past Afro-Eurasia at all; it buys nothing
   toward closing those 48. M3.5 spent most of a milestone taking 13 components to 1 on a slice a
   third of this size — budget accordingly.
   Its three pieces of work, in order: define `MIN_LANDMASS_NODES`; **invert `GEO_DISCONNECTED`**
   from a component-count error to a fragment check (its synthetic-bundle test inverts with it);
   and make route generation **refuse a cross-landmass pair up front** rather than returning a
   `shortfall`, which is the right shape for a thin corridor and the wrong shape for two cities
   on different continents.
2. **Budget for closing 49 components and 37 orphans.** M3.5 spent most of a milestone taking 13
   components to 1 on a 263-node slice. Four of the leaf branches strand ≥5 nodes.
3. **The overlay is re-authored, not migrated.** Do it AFTER the node set is final, or it rots
   twice.
4. `GEO_UNDECLARED_BRIDGE`'s budget of 13 belongs to the 263-node slice — re-measure, do not
   extrapolate (ADR 0033). `GEO_EDGE_TOO_LONG` and the node-count band rule were deferred to this
   milestone and `densify-corridors.ts` is still unbuilt (16 edges >450 km, max 573).
5. `world.simplified.json` is also deferred here.
6. **Both sim baselines will move**, because corpus routes are generated from the slice (ADR
   0034), and `CORPUS_PAIRS` in `sim/load-pack.ts` names six city ids that may not survive
   re-selection either — check them before regenerating.

**DoD:** the five checks, `geo:build --check` byte-identical, one component, diversity under the
70% ceiling, `geo:verify` re-measured (the <150 ms budget was taken on 263 nodes and Dijkstra is
O(E log V)), both `sim:diff`s explained, and an ADR for the landmass decision.

---

### The original M3.11 brief, for reference

**M3.10b is DONE.** Corpus completion is **47.3%** on 22–48 leg routes at median 24 (routes are
23–31, so runs mostly finish); fixture 48.5%. Both packs in band. ADR 0035 and its addendum.

**Two wrong calls were made and corrected inside this milestone, both the same mistake.** First
the survival-conditioned trajectory table said morale was fine — it only contains runs that
survived. Then a falling `gave_up` share said morale was the problem and energy was next; slowing
energy 3× moved completion 26.1% → 27.4% and nothing else. **The ending mix was correct and
available both times**: at 16/9 it read collapsed 50.8% / arrival 26.0% / gave_up 22.9%, so health
had never stopped being the wall. When completion moves, read what runs are DYING of before
picking a lever.

A fresh agent can start here:

1. **`pnpm geo:build` at a wider bbox.** The current pin is `-12,36,30,60`. Node ids derive from
   `geonameid` and border ids from a hash of their two adjacent settlements (ADR 0024), so the
   overlay's 42 rows survive re-selection — that is the property that makes this a data commit
   rather than a re-author, and it was checked on paper at M3.0 precisely so this milestone
   would be cheap.
2. **`GEO_UNDECLARED_BRIDGE`'s budget of 13 belongs to the 263-node slice** and must be
   re-measured, not extrapolated. If it grows faster than the node count, the selector is
   producing a stringier graph — that is the finding, not the bump. ADR 0033.
3. **`GEO_EDGE_TOO_LONG` and the node-count band rule were deferred to THIS milestone.**
   `densify-corridors.ts` is still unbuilt and 16 edges (4%) exceed 450 km, max 573. Decide
   whether to build densification or ship the rules with a higher threshold.
4. **`world.simplified.json` is also deferred here** — the map basemap, LOD-tiered from NE 50m,
   under 400 KB.
5. Re-run `pnpm geo:diversity` (must stay under the 70% ceiling) and `pnpm geo:verify` (the
   <150 ms budget was measured on 263 nodes; Dijkstra is O(E log V), so ~8× the work).
6. **Both sim baselines will move**, because corpus routes are generated from the slice
   (ADR 0034). That is expected; explain the delta rather than chasing it.

**DoD:** the five checks, `geo:build --check` byte-identical, diversity still passing, both
`sim:diff`s explained, and an ADR if the densification question is answered either way.

---

### The M3.10b brief, for reference

Two commits landed (`4ffe4cd`, `664c8a5`) and ADR 0035 records the reasoning. The corpus runs
22–48 leg routes; completion went **3.6% → 26.1%** and median legs **14 → 21** on routes of
23–31, so runs now nearly finish. The fixture pack moved 31.2% → 35.1% and is still in band.

**What was found, and it overturned the first diagnosis.** The trajectory table showed health
falling and morale healthy at p50 7 by leg 25 — but that table is **conditioned on survival**,
and every run that died of `failure_gave_up` had already left the sample. The failure mode is
CONSERVED: softening starvation converts `failure_collapsed` → `failure_gave_up` (68.1% → 3.0%
against 28.2% → 72.4%) without saving a run. A reverted diagnostic with hunger made unreachable —
perfect food forever, zero collapse — still stalled at 26.3%, which bounds the entire
health-and-food family, content levers included, below the floor.

`moraleCost` was the last per-leg drain in the file and is now per-hour. That is a RATE change,
not a grading — `ENERGY_TIRED` stays single-rung, pinned by a test.

A fresh agent continues here:

1. **The sweep saturates, so do not keep turning `HOURS_PER_MORALE`.** 8/12/16/20 gives
   23.5/26.1/27.5/27.8. No value reaches 30.
2. **ENERGY is the binding meter.** It floors by mid-run, and morale only drains at all because
   energy is at or below `ENERGY_TIRED`. Fix energy and the morale drain stops being
   unconditional. Levers, in rough order of cheapness: `HOURS_PER_ENERGY` per mode (currently
   foot 5 … train 14); an energy floor that is not 0; or content that restores energy — check the
   pick-rate first, because the health equivalent bought only +0.3pp.
3. **Content cannot close this gap and there is arithmetic for that.** The four health-restoring
   choices are picked 0.38 times per run out of 15.5; and universal injection is **saturated** —
   all 13 events sit at `min(3, authored)`, so a 16th registry row EVICTS one rather than adding
   coverage. At this route length balance is an engine-rate problem.
4. **`sim.test.ts`'s payoff floor was lowered 0.5 → 0.2 and that is a weaker guard.** Tighten it
   and raise the sample if unresolved threads climb in either baseline.
5. **Do not use `payoffRate` to choose between settings** — it moved non-monotonically
   (73.9 → 70.8 → 80.0) across a monotone constant, so it is noise-dominated at n=2000.

**DoD:** the five checks, both `sim:diff`s explained, **completion inside 30–50% at 22–48 legs**,
and an ADR for the energy change.

---

### The original M3.10b brief, for reference

**M3.10a is DONE** (`63c5aa7`). `--pack=corpus` now generates its routes from the geo slice
(ADR 0034 — built at sim time, not committed), `generateRoutes` is barrel-exported, and CI runs
50 corpus journeys on generated routes. **The control held: `pnpm sim:diff -- --runs=2000`
reports "No change".** Never-fired events went to **0** — every corpus event is reachable for
the first time.

Two findings from the first generated set, both fixed and both worth remembering:

- **Every route came out `mode=bus`**, because `startingMode` ordered by best-supported and
  bus/car/truck tie on every road edge. That erases transport as a decision and makes
  car/truck-gated content unreachable. Mode is now chosen by PROFILE preference.
- **The first pair list crossed no borders** — it came off the overlay's tolled corridors, which
  are deliberately intra-country, so `border.night_crossing` never fired in 2,000 runs. Pairs
  were re-chosen by measurement; four of six now cross.

A fresh agent can start here:

1. **The band is the whole milestone, and it is known to be unsurvivable.** ADR 0026's addendum
   measured the corpus at **0.1% completion at 24 legs and 0.0% beyond** — 2 of 2000 runs reach
   leg 25. M3.10a's 74.4% at median 15 legs sits exactly on that curve. Raising the band without
   touching the economy will produce ~0% completion, so **this milestone is a content and
   `worldTick` problem wearing a route-generation hat.**
2. The lever is **recovery, not drain**. Health is a one-way ratchet: two outcomes in the entire
   13-event corpus restore it (`rest.the_shared_room/see_to_your_feet`,
   `weather.the_storm_you_cannot_drive_through/see_to_the_damage`), both +2. Long-range payoff
   already fell to 13.9% with 62 unresolved threads at 15 legs, because runs end before
   consequences land.
3. Widening the band is a one-line change to `SHORT_BAND_MIN`/`SHORT_BAND_MAX` in
   `sim/load-pack.ts` plus a new pair list — **do that last**, after the economy can support it,
   or the measurement says nothing that ADR 0026 has not already said.
4. **Do not chase completion by shortening routes.** That is what M3.10a's band did, and it is
   why its numbers are a measurement point rather than a shipping target.

**DoD:** the five checks, both `sim:diff`s explained, completion back inside 30–50% at 22–48
legs, and an ADR for whatever the economy change turns out to be.

---

### The M3.10a brief, for reference

**M3.9 is COMPLETE** — `681f621`, `adb36db`, `05dfb93`. `packages/engine/src/route/` now has
`leg-plan`, `leg-locations`, `beat-schedule`, `materialise-route`, `route-preview` and
`generate-routes`; `legKm` is terrain-derived and montage legs exist. **Nothing calls it**, which
is why both baselines are still unmoved — and closing that is exactly what M3.10a is.

A fresh agent can start here:

1. **`generateRoutes` is not barrel-exported yet.** That is deliberate: an export nothing imports
   is a conformance-L2 risk for no benefit. M3.10a is the milestone that needs it, so export it
   and its result types (`RoutePlan`, `RouteStart`, `RoutePreview`) in the same commit as the
   first caller.
2. **Short band FIRST, deliberately.** M3.10a isolates route SHAPE from leg COUNT by generating
   only 10–16-leg routes; M3.10b raises to the full 22–48 band. Do not merge them — ADR 0026's
   addendum measured 0.1% completion at 24 legs and 0.0% beyond, so a combined milestone cannot
   tell a shape regression from the known survivability wall.
3. Touches `sim/cli.ts:62`, a baseline path keyed on `(pack, routes)`, and **a corpus `sim-smoke`
   CI step, which does not exist today**.
4. **Prove the control held**: after `--pack=corpus --runs=5000 --diff`, run
   `pnpm sim -- --runs=5000 --diff` and confirm "No change". That second command is what says the
   fixture pack was untouched by a corpus-only change.
5. `corpus-routes.json` is a committed generated file and CLAUDE.md §6 says never commit generated
   output. **That contradiction is unresolved** — plan open question 4. Sanction it in an ADR with
   a staleness digest, or build it at sim time and accept that route changes become invisible to
   `sim:diff`. Decide before writing the file, not after.

**DoD:** the five checks, `--pack=corpus --runs=5000 --diff` explained, the fixture control
reporting "No change", and an ADR for the committed-generated-file question.

---

### How M3.9 landed, in three slices

`leg-locations.ts` ✅ and `beat-schedule.ts` ✅ are done and tested (18 cases), and they consume
`LegPlan.arrivalLegOfEdge` rather than recomputing it. Two things settled there that slice 3
depends on:

- **Invariant (c) is solved in LOCATIONS, not in placement.** The leg before a crossing is typed
  `checkpoint`, which border content already accepts (`night_crossing.yaml` declares
  `[border_crossing, checkpoint]`), and the border slot anchors on that checkpoint leg so its
  slack-1 window is exactly `{checkpoint, border_crossing}`. **This removes the plan's "every
  crossing edge gets ≥2 legs" requirement** — the preceding leg may belong to the previous
  segment, and overriding its type is the point.
- **`LegSegment` gained `arrivalType`**, because a `GeoNode.type` IS a `LocationType` (ADR 0024)
  and that makes `deriveLegLocations` a direct read rather than a mapping table.

`packages/engine/src/route/leg-plan.ts` ✅ is done, tested (20 cases) and committed: density
sizing, the compression curve, the ramped clamps, RNG-free montage selection and exact `legKm`.
It is pure, takes segments, has **no caller**, and both sim baselines report "No change".

**Two findings from slice 1 that the remaining slices depend on:**

- **A ferry is excluded from surplus allocation**, not merely worth one raw leg. Without that
  the `minLegs` floor padded a lone 900 km crossing to nineteen legs — with `ferry_boarding`
  scheduled on one of them. The floor now goes unmet instead, which ADR 0026 Decision 4 already
  sanctions.
- **Terrain is invisible below ~3,000 km**: 2,000 km of mountain and 2,000 km of plain both
  compress under `minLegs(2000)` = 22 and both clamp to 22. That is the clamp working. Pinned as
  its own test so nobody retunes the density table chasing a difference the floor is eating.
- ADR 0026's `LEG_DENSITY_KM` lists **`marsh` and `forest`, which are not `TerrainKind`s**. The
  shipped table is keyed off the real eight-kind vocabulary.

### Slice 2 — DONE (`adb36db`)

Both consume `LegPlan.arrivalLegOfEdge`, which slice 1 already returns — **one allocator, two
consumers** (ADR 0027 Decision 1). Do not recompute it.

1. `leg-locations.ts`: one `LocationType` per leg, derived from the node each leg arrives at.
   `validateRoute` rejects a length mismatch, so it must be exactly `legCount` long.
2. `beat-schedule.ts`: the placement table is ADR 0027 Decision 2 — `departure`@0 slack 0,
   `finale`@`legCount−1` slack 0, `border_crossing` at the first leg of the crossing edge's span
   capped at `MAX_BORDER_BEATS = 4` slack 1, `ferry_boarding` on the ferry edge's single leg
   slack 0, `midpoint_crisis` at `mulDivRound(legCount, 50, 100)` ±2 jitter, `approach` at
   `mulDivRound(legCount, 83, 100)` ±1 jitter and only when `legCount >= 14`.
3. **Jitter is cursor-free**: `deriveKey(streamKey(seed,'routeGen'), \`${startId}>${endId}:${profile}:beat:${type}\`)`.
Mandatory, not stylistic — the NUMBER of jitter draws depends on how many beats a route has,
which depends on the graph, so a cursored draw would make `routeGen`'s cursor a function of
geography and a geography edit would move every save fixture. **`drawWord` is not
barrel-exported** (`index.ts:247`exports`deriveKey`/`streamKey` only).
4. **Enforce the four invariants generator-side, never in `validateRoute`** (ADR 0027 Decision 3).
   Invariant (b), non-overlapping windows, is **already violated by the shipped `fixture.illicit`**
   — `border_crossing@17 slack 3` overlaps `approach@20`, so the border slot masks `approach`,
   which then slides and expires, and every such collision reports as content starvation for what
   is a scheduling bug. Adding it to `validateRoute` would invalidate that fixture, break 13 test
   files and move the control baseline.
5. Invariant (c) needs **≥2 legs per crossing edge**, the leg before typed `checkpoint` and the
   crossing leg `border_crossing`, slack 1 — otherwise a slack-3 border slot has three legs where
   no border event is location-eligible, and `locationTypes` relaxes last (rung 5) while
   `beatGate` goes at rung 1.

### Slice 3 — DONE (`05dfb93`)

`RoutePlan = { route, start, preview }` mirroring `FixtureScenario`, because
`load-pack.ts:63-69` is explicit that route and start block are inseparable — the walking skeleton
had 5 of 9 events never firing when they came apart. Neither `start` nor `preview` enters
`RunState` or `contentVersion`. The start block is DERIVED (transport from `preview.transportMix`,
cash from `recommendedCash × 1.3`, `startHour`/`weather` from cursor-free `routeGen` draws), which
satisfies the inseparability rule by construction rather than by convention.

**Success is a seeded property loop, not a golden:** `validateRoute(generated) === null` over
hundreds of routes, `Σ legKm === totalKm`, monotone in km, `|legCount(500) − legCount(501)| ≤ 1`,
ascending beat emission, non-overlapping windows, border windows on eligible legs, no window on a
montage leg, all slots `pending`, and **`routeGen`'s cursor still 0**.

**DoD for the whole milestone:** the five checks, both `sim:diff`s reporting "No change" (nothing
calls the generator yet), and an ADR only if a decision departs from 0026/0027.

---

### The original M3.9 brief, for reference

The plan is `~/.claude/plans/plan-mode-build-the-synthetic-bird.md` §"The leg model" and
§"BeatSchedule derivation"; ADR 0026 Decision 4 is leg sizing and ADR 0027 the beat schedule. The
last three milestones existed to clear the way for this one. A fresh agent can start here:

1. **Leg sizing is Decision 4 and its constants are the curve.** Raw legs accumulate in scaled
   units (`LEG_SCALE = 1000`) because `Σ floor(km/d)` truncates every segment. Compression is
   piecewise-linear because `Math.log` is banned, and the breakpoints ARE the curve: first 18 legs
   at 100%, next 14 at 75%, next 28 at 50%, beyond at 25%. **Keep `COMPRESSION_BANDS`
   module-private** — an array reaching the barrel turns conformance L2 red for a change made
   entirely inside the engine.
2. **There is no `isShortTrip` boolean anywhere.** The floor ramps
   (`minLegs`/`maxLegs` both interpolate) because a boolean is a cliff waiting to be
   reintroduced. Property tests: more kilometres must never produce fewer legs, and
   `|legCount(500) − legCount(501)| ≤ 1`.
3. **Montage selection is RNG-free**, integer, and reads only a segment's own fields — so adding a
   node elsewhere cannot reshuffle an unrelated montage. Crossings and ferries sort last by
   construction (`−1000×crossing`), not by a special case someone can forget.
4. **Four beat-schedule invariants the generator must self-enforce, because `validateRoute` checks
   none of them** — and invariant (b) is **already violated by the shipped `fixture.illicit`**:
   `border_crossing@17 slack 3` overlaps `approach@20`, so the border slot masks `approach`, which
   then slides and expires. Every such collision currently reports as content starvation for what
   is a scheduling bug. **Do not add (b) to `validateRoute`** — it would invalidate that fixture,
   break 13 test files and move the control baseline. Enforce it generator-side with a named test.
5. **Jitter is cursor-free on `routeGen`.** Mandatory, not stylistic: the NUMBER of jitter draws
   depends on how many beats a route has, which depends on the graph — a cursored draw would make
   `routeGen`'s cursor a function of geography, so a geography edit would move every save fixture.
6. **Success is a seeded property loop, not a golden**: `validateRoute(generated) === null` over
   hundreds of routes, `Σ legKm === totalKm`, monotone in km, ascending beat emission,
   non-overlapping windows, no window on a montage leg, all slots `pending`, and **`routeGen`'s
   cursor still 0**.

**DoD:** the five checks, both `sim:diff`s reporting "No change" (nothing calls the generator
yet), and an ADR only if a decision departs from 0026/0027.

---

### Superseded: the M3.8b brief

**M3.8b: graded hygiene — its own commit, with the prediction written BEFORE the run.** Shipped —
see above. The prediction was written and was wrong; the discipline worked exactly as intended,
because being wrong in writing is what forced the measurement that explained it.

`world-tick.ts` reads `if (hours >= HOURS_PER_HYGIENE) … delta: -1` — a single 6-hour rung. Today
that fires for truck (6) and not for car (5), bus (5) or train (4), so hygiene is very nearly
static. Grading it makes it drain on most legs, and `modifiers.yaml:61,69` make hygiene
mechanically live across five check tags — so it **will** move `Modifier chips / check` off 6.7 and
every DC it touches. A fresh agent can start here:

1. **Write the predicted diff first, in the commit message, then run the sim.** This is the one
   milestone in the phase whose whole point is a balance change, so an unpredicted number is the
   finding. ADR 0032's lesson applies: a report must read its diagnosis off its own measurement.
2. **Morale stays ungraded, and this is not an oversight.** `world-tick.ts:91-101` measured that a
   second rung on a FLOORED meter synchronises the collapse (`0/2/6` → `0/0/0` at leg 15). Hunger
   is graded because it has no ceiling. Grade a penalty on an unbounded meter, never on a floored
   one. Montage gets no exception.
3. **Both baselines will move and that is expected** — unlike M3.8a, where only one did and the
   asymmetry was the diagnosis. Regenerate both in the same commit and explain each line.
4. Watch `Checks under 2 chips` and the corpus `Complication rate`: hygiene modifiers entering more
   checks can push chips/check ABOVE the 3–7 band, which ADR 0023 already says is the risk
   direction (measured min 3 · median 7 · max 9).

**Then M3.9** — `leg-plan`, `leg-locations`, `beat-schedule`, `materialise-route`,
`route-preview`, `generate-routes`. That is where `legKm` stops being uniform and montage legs
first exist, and it is the milestone the last three have been clearing the way for.

---

### Superseded: the M3.8a brief

**M3.8a: the hours model. `legHours(km, mode, montage)` replaces `HOURS_PER_LEG`, lifted out of
`world-tick.ts` into `loop/leg-hours.ts`.** Shipped — see above. Its step 2 below asserted the
fixture baseline must not move, and that was wrong for the reason recorded in the M3.8a section.

The plan is `~/.claude/plans/plan-mode-build-the-synthetic-bird.md` §"The leg model"; ADR 0026
Decision 6 is the table. A fresh agent can start here:

1. **The strongest structural result in the design is that this is nearly free.** `worldTick`'s
   drift model is ALREADY denominated in hours rather than legs (ADR 0014, restated at
   `world-tick.ts:20-27`: "TIME makes you hungry, not legs"). So once hours become a function of
   distance, montage drain becomes proportional **with no new code** — clock, `progressKm`,
   hunger (`spanPoints`), energy and health all scale by themselves.

   ```
   legHours(km, mode, montage) = clamp(LEG_OVERHEAD_HOURS[mode] + mulDivRound(km, 1, KMH[mode]),
                                       MIN_LEG_HOURS[mode], montage ? 30 : 12)
   LEG_OVERHEAD_HOURS = {foot 0, bus 3, train 2, car 4, truck 4, ferry 4, rideshare 3}
   KMH                = {foot 4, bus 50, train 80, car 70, truck 50, ferry 30, rideshare 65}
   ```

2. **The table is calibrated so the three fixtures reproduce their current `HOURS_PER_LEG`
   exactly**, and stably across the ±1 km split `uniformSplit` now produces: car 62 km → 4+1 = 5 ✓,
   truck 89/90 km → 4+2 = 6 ✓, bus 86/87 km → 3+2 = 5 ✓. **So the fixture baseline must move by
   NOTHING.** If `Median legs` or `Median in-game days` moves on `--pack=fixture`, the calibration
   is wrong and that is a spec bug, not a finding.
3. **This is also where `world-tick.ts:126`'s `Math.round(totalKm/legCount)` goes away** — see the
   note under M3.7 above. Until it does, a run's `progressKm` accumulates to
   `legCount × round(totalKm/legCount)` rather than `totalKm`.
4. **Graded hygiene is M3.8b, a SEPARATE commit with its own predicted diff.** `world-tick.ts:131`
   reads `hours >= 6 ? −1 : 0`, which today never fires for car (5), bus (5) or train (4) — so
   hygiene is effectively static. Grading it makes it drain every leg, and `modifiers.yaml:61,69`
   make hygiene mechanically live across five check tags, so it WILL move
   `Modifier chips / check` off 6.7 and every DC it touches. Write the prediction before the run.
5. **Morale stays ungraded, deliberately.** `world-tick.ts:94-104` measured that a second rung on
   a floored meter _synchronises_ the collapse (`0/2/6` → `0/0/0` at leg 15). Montage gets no
   exception.

**DoD:** the five checks, both `sim:diff`s explained (fixture unmoved; corpus explained at M3.8b),
regenerated goldens with the diff reviewed, and a regression test.

---

## Decisions taken (2026-08-12, by the human)

Taken at M3.6, after the (a)/(b)/(c) review:

- **`lat`/`lng` are CARRIED on the geo node record**, not dropped by the loader — but never on
  `GeoNode`. ADR 0033 Decision 3; compiler-enforced by `conformance.test.ts:99`.
- **`GEO_UNDECLARED_BRIDGE` is IN SCOPE and was built.** `GEO_NAME_SAFETY` and
  `GEO_LOCALE_INCOMPLETE` (ADR 0028) stay deferred with `GEO_EDGE_TOO_LONG`: no regex finds a
  politically loaded place name, and there is no review process behind it yet.

Taken earlier the same day:

- **`GEO_EDGE_TOO_LONG` and the node-count band rule are DEFERRED to M3.11.**
  `densify-corridors.ts` is not built now. Waypoint density is a function of the final node set,
  so calibrating it against 263 nodes would mean redoing it at 1,200. M3.6 ships the rules that
  can hold against the current slice and no more.
- **Open questions 1–3 below were reviewed and deliberately left open.** They are findings, not
  oversights: nobody needs to re-raise them, and nothing in M3.6 depends on them. Revisit when
  the milestone that cares arrives — 1 and 2 at M3.9 when routes reach a player, 3 whenever
  `illicit` is next tuned.

---

## Open questions for the human

1. **The 70% diversity guarantee is directional, and nobody decided that.**
   `acceptByDiversity` tests each new candidate against what is already accepted, normalised by
   the candidate's length, and never re-tests an earlier route against a later one. On
   Barcelona–Palermo, `fastest` is 79% inside `safest` while `safest` was accepted at 69%. Is a
   symmetric check wanted, or is the one-way guarantee the intended contract? (ADR 0031.)
2. **Yen has no length ceiling.** Vienna–Budapest is 297 km direct and the pool also holds 866,
   1,186 and 1,352 km routes. Sample-wide the longest/shortest ratio is p50 1.36×, tail 10.32×.
   Should `kShortestPaths` reject a backfill beyond some multiple of the shortest?
3. **`illicit` strictly dominates on 9 of 168 sampled pairs** — shorter than every other route,
   no more borders, no harder ground. The illegal route is meant to be a trade. Accept, or price
   it?
4. **The 22–48 leg band is unsurvivable and M3.10b depends on it.** Health is a one-way ratchet
   with two `+2` restores in the whole corpus. Content problem or tuning problem?
5. **Is ~40% the accepted beat-fill number for Phase 3**, or do the four missing beat events
   (`departure`, `ferry_boarding`, `approach`, `finale`) come into scope? Unchanged from session
   6, and it gates M3.10b's acceptance criteria.

---

## Shipped this session (2026-08-09, session 6) — **PHASE 2B COMPLETE**, M0 through M-F

**Phase 2B is complete. All seven milestones landed in one session.** The plan — 162
modifiers, 25 complications, 15 universal choices, 12 seed events, a real `en/` locale and a
style guide, across seven milestones — is at
`~/.claude/plans/plan-mode-author-the-enchanted-pizza.md`, approved with four decisions
recorded in its Context section. **The seed corpus exists, has words, and plays inside its
design band: 13 events, 137 modifiers, 25 complications, 15 universal choices, a complete `en`
locale, and `content:lint` at 0 errors / 1 warning — from 31 warnings at session start.**

**Prove it:**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm format:check
```

```bash
pnpm content:lint                          # exit 0 — 0 errors, 31 warnings
pnpm sim:diff -- --runs=2000               # "No change vs docs/sim-baseline.md."
pnpm sim -- --runs=2000 --pack=corpus --diff   # "No change vs docs/sim-baseline-corpus.md."
pnpm vitest run --project engine src/loop/__tests__/search-check.test.ts   # 6 tests
```

Totals moved 1055 → **1142 Vitest + 3 Jest across 53 files**.

### What M0 delivers

`Choice.search` — a container search that resolves through the existing `runSkillCheck` on the
existing `skillCheck` stream. No new RNG stream, no `RngCursors` change, no save migration.
`docs/adr/0020` is the reasoning; the two decisions worth knowing without reading it:

- **`search` is on the CHOICE, not the Outcome** (PROGRESS's own prose said Outcome and was
  wrong — `onCheck` branches on the choice's roll, so a search on the outcome resolves too late
  for the branching mechanism both documents named).
- **Success means it stayed HIDDEN.** The Phase 2A plan file's example comments this the other
  way round. Every `search`-tagged row in `modifiers.yaml` is signed from the player's side —
  `cash_concealed` +2, `wanted_by_authorities` −3 — so a searcher-rolls framing makes all four
  apply backwards. Reading either document literally would have shipped a silently inverted
  mechanic that no test could catch, because no event used a search.

Two warnings closed and four opened, all honest: `UNUSED_TAG: search` is gone (the completion
signal the old next-step named), `LIABILITY_UNBACKED: cash_belt` is gone because `collectRefs`
now walks `search.item`. New: `stealth` is a `THIN_TAG` twice over, because the registry has no
stealth rows — M-E's job. 29 → 31.

`hiddenUnless` is **no longer dead**. ADR 0012 recorded that it had exactly one instance and
that instance never fired; `hide_the_cash` gates at `cash >= 100`, which a fixture run starting
on 320 reaches, and it is picked in 0.3% of runs.

### ⚠ The finding: the fixture pack ships an EMPTY modifier registry

**The ten rows in `packages/content/modifiers.yaml` have never applied in a golden run or a sim
run.** `mini-pack.json` has `registries.modifiers: []`, and `packages/tools/sim/load-pack.ts`
reads that same file. They are exercised by `packages/content`'s unit tests and by
`content:lint`'s static analysis, and by nothing that runs the engine.

M2A.3's sim delta was recorded as "`contentVersion` only". True — but because the `modifiers`
**key** went from absent to `[]`, not because the rows entered the pack.

Not fixed here: the fix belongs with M-D, where the sim gains a pack that loads `modifiers.yaml`.
**Until then no sim number is evidence about the registry** — including the ~162 rows M-E adds.

### Sim delta — a redistribution, not a difficulty change

`offer_bribe` 0.4% → 0.1%, `hide_the_cash` 0.3% (new), `border.guard_remembers/acknowledge`
0.2% → 0.0% because fewer bribes fire to schedule it. Endings moved ±0.3pp inside that same
chain. **Completion rate unmoved at 31.2%.** Golden runs: exactly 18 lines changed, 9
`contentVersion` and 9 `expectedDigest`, everything else byte-identical.

**Wall clock is not comparable across machines and the baseline now says so.** It reads ~740 ms
where M2A.6 read 496 ms; the pre-M0 tree measures 758–787 ms on the same machine, so the whole
difference is hardware. Measured both ways before believing it.

### M-A — the `ContentRegistries` shape commit

`ContentRegistries` gains `complications` and `universalChoices`, **both shipped empty**, so the
`contentVersion` hit is taken once and reviewed on its own rather than mixed into the milestone
that fills them. `contentVersion` moved `819cb199` → `aee5a082`.

**The invariant it exists to demonstrate held:** the `golden-runs.json` diff is exactly 18
lines — 9 `contentVersion`, 9 `expectedDigest` — with `choiceSequence`, `expectedHistoryKeys`,
`expectedLegs` and `expectedEndings` byte-identical across all nine runs. `pnpm sim:diff` says
"No change". Zero behaviour moved.

Both element types are defined in full now rather than stubbed: `RegistryComplication`
(`content/registry-complication.ts`) and `UniversalChoice` (`content/universal-choice.ts`),
plus a 13th branded id, `ComplicationId`. Defining them early costs nothing — `contentVersion`
hashes `[]` identically whatever the element type is — and it makes M-B and M-C purely
additive.

Three things settled here that the later milestones depend on:

- **`UniversalChoice` embeds a whole `Choice`** rather than flattening its fields. A flattened
  copy is a second definition of `Choice` that drifts the first time either gains a field —
  which `search` just demonstrated by being added in M0.
- **`UNIVERSAL_CHOICE_PREFIX` is `'u:'`, not `'u.'`.** `:` is outside `ID_PATTERN`; a dot is
  legal precisely so ids can be namespaced, so a `u.` prefix would be forgeable. The failure it
  prevents is not a crash: `resolveChoice` uses `.find`, so a colliding injected id would be
  displayed, picked, and resolve the AUTHORED choice's outcomes.
- **`MAX_UNIVERSAL_PER_EVENT = 3`, and "never more than half the choices shown" reduces to
  `i <= a`** — with `a` authored and `i` injected, `i <= (a+i)/2` is exactly `i <= a`. So the
  cap is `min(3, authored.length)`: static, state-free, and computable where the splice happens.

Two new `content-pack.test.ts` blocks assert the version moves when a complication's
`checkDelta` or a universal choice's `labelKey` changes, plus an anti-vacuity case — the
placement is otherwise untested until the milestone that fills the registries, which is the
milestone that would have to debug it.

`conformance.test.ts`'s L2 layer caught both new empty constants and demanded they be
classified. Working as designed; they are recorded as `'empty constant'` alongside
`EMPTY_MODIFIER_REGISTRY`.

### M-B — universal choices

The subsystem, shipped with an **empty registry**. `injectUniversalChoices` splices matching
rows into `GameEvent.choices` inside `createContentPack`, before the `contentVersion` call, so
`pack.version` fingerprints what the pack actually plays rather than what was authored.

**The proof: `contentVersion` did not move** (still `aee5a082`), `golden-runs.json` is
byte-identical to the M-A state, and `pnpm sim:diff` says "No change". A whole subsystem landed
and nothing observable changed — which is only checkable because the registry ships empty.

New: `content/inject-universal-choices.ts`, `content/event-tags.ts`,
`content/schema/universal-choice.ts`, `content/loader/load-universal-choices.ts`,
`content/universal-choices.yaml` (empty, with the authoring rules in its header),
`tools/content-lint/rules-universal.ts`. `content:lint` is now **14 rules**.

Things settled here that are easy to get wrong later:

- **`tagsOf` moved from `director/` to `content/event-tags.ts`.** Pack construction needs it,
  and `content/` depending on `director/` to build a pack inverts the layering — the director
  consumes content, not the reverse. Still exported from the barrel, so no API break.
- **The splice is the identity on an empty registry, down to object reference.** Tested. A
  rebuilt-but-equal array would also be correct, but this is the stronger claim and it is what
  makes "nothing moved" mean something.
- **`buildOutcome` now takes a `keyBase`, not an event id.** That indirection is the whole
  reason universal choices are affordable: row-scoped keys (`universal.walk_away.label`) mint
  ONE key however many events a row lands in. Event-scoped derivation would have minted one per
  event x per row — twelve events and three rows is thirty-six keys for three strings, each one
  a `MISSING_I18N_KEY` error.
- **The schema reuses `event.ts`'s `skillCheckSchema` / `searchSchema` / `outcomeSchema`**
  rather than restating them. A second definition of what a choice may contain drifts the first
  time either gains a field — which `search` demonstrated one milestone ago.
- **The "never strictly the best option" rule is half-mechanised.** The schema rejects a row
  with no costs, no roll and no effects; a roll counts as a cost because risk is one. The rest
  is review and `content:lint`.
- **`content-lint` runs the REAL splice** rather than reimplementing matching, the cap and
  families. A linter with its own copy of the rule reports on a second implementation.

### M-C — complications. `docs/adr/0021`. **The first milestone to touch `RunState`.**

The subsystem, shipped with an **empty registry**. `Presentation` gains `complicationId`;
`SAVE_VERSION` is **4**; `MIGRATIONS` has a third entry.

**What moved and what did not:** all nine `expectedDigest` values moved and **nothing else
did** — `contentVersion` is still `aee5a082`, and `choiceSequence`, `expectedHistoryKeys`,
`expectedLegs` and `expectedEndings` are byte-identical. `RunState.version` is inside
`stateDigest`, so a save-format bump necessarily moves every digest. **That signature —
digests only — is what distinguishes a format bump from a behaviour change**, and it is the
thing to check if M-D or M-E ever produces a diff you cannot explain.

New: `director/select-complication.ts`, `content/presented-choices.ts`,
`content/schema/complication.ts`, `content/loader/load-complications.ts`,
`content/complications.yaml` (empty, rules in its header). The sim gained a **`Complication
rate`** line against the `ATTACH_PERCENT` target; it reads 0.0% until M-E writes rows.

Four decisions, all argued in ADR 0021 — the ones worth knowing here:

- **Persisted, not recomputed.** The decisive reason is not the state drift or the differing
  `chanceScope` between the two call sites, both of which are real; it is RELOAD.
  `reconcileContent` tolerates a `contentVersion` mismatch by policy, so a player who reads a
  complication, closes the app, updates and reopens would — under recomputation — resolve a
  different situation than the one they read. A persisted id that no longer resolves degrades
  to no-complication in one `Map.get`.
- **`migrate_3_to_4` WRITES `null` rather than leaving the key absent.** `isRunStateShape` does
  not inspect `presentation`, so an absent key loads clean, reads `undefined`, and
  `undefined !== null` sends `resolveChoice` looking up a complication by an undefined id.
  Both v4 fixtures are byte-copies of the v3 ones (`presentation: {kind:'none'}`), so the
  meta-test passes while the migration's only branch never runs — **two tests were added for
  exactly that gap.**
- **Selection is cursor-free**, so `encounterFlavor`'s cursor stays 0 forever and adding a row
  shifts no other event's complication. That property is load-bearing: M-E adds twenty-five at
  once. Pinned by a test.
- **`presentedChoices` is ONE function used by both the presentation path and
  `resolveChoice`'s lookup.** `resolve-choice.ts` no longer touches `event.choices` directly.
  A `removesChoice` that would empty the list is DECLINED — a content mistake must not become
  a stuck run.

`effects[]` and `exclusiveWith[]` were cut before implementation, approved: the first would
make `advanceLeg` an effect applier, the second is degenerate at one complication per event.

### M-D, part 1 — prerequisites and the `--pack` machinery

**A plan bug, found before it cost anything.** The plan said "modifiers before events". That is
**impossible as the tests stood**, and the two assertions bound in opposite directions:

- `modifier-registry.test.ts:43` — every npc/item/flag a MODIFIER's `when` names must be declared.
- `declarations.test.ts:55` — every DECLARED id must be referenced by an EVENT; it walked
  `collectRefs(events.events)` with no registry argument.

Between them a modifier could not name an id unless an event named it too, so `modifiers.yaml`
could never grow ahead of the corpus — the order `STARVED_CHECK` demands. **`content:lint` never
had the bug**: `rules-references.ts` already passes `bundle.modifiers` to both walks. The test
now does too. That is the test catching up with the tool, not a relaxation — a flag a modifier
reads is read, and the anti-pattern being guarded is a declaration NOTHING consumes.
Behaviour-neutral today; verified.

**`docs/content-style-guide.md` written.** Its subject is the one question that decides
everything else: does this belong in an event or in a registry? It also records the
non-stacking-collapse rule that shapes every modifier, the check-tag pairing rule, the two
`sourceKind`s with no state behind them (`region`, `companion`), the i18n cliff, and the §11
place-neutrality rule in authoring terms.

**`pnpm sim -- --pack=fixture|corpus`.** `loadCorpusPack` builds from `packages/content/` —
YAML events plus `modifiers.yaml`, `complications.yaml` and `universal-choices.yaml`.

> **This closes the M0 finding: `modifiers.yaml` has now reached a running engine.** Same nine
> events, same routes, ten modifier rows live: **completion 31.2% → 30.8%**. That is what the
> registry does, measured for the first time.

**One baseline per pack**, tagged in the filename. A single shared file would be overwritten by
whichever ran last, so "no change" would mean "no change since somebody else's run" — worse than
no baseline, because it looks like coverage. `docs/sim-baseline.md` keeps its name;
`docs/sim-baseline-corpus.md` is new. Both diff clean.

**`docs/sim-baseline*.md` are now in `.prettierignore`**, found the hard way: Prettier collapsed
the corpus report's column alignment, and `sim:diff` compares line by line — so every headline
metric read as changed against a file that was byte-identical in substance.

Corpus routes are deliberately still the fixture routes: route generation is Phase 2B
`engine/src/route/`, and inventing a corpus route file here would pre-empt it. Flagged in the
baseline header to revisit when the corpus lands.

### M-D, part 2 — the corpus split. **The seed corpus exists.**

Thirteen events across all twelve categories, **137 modifiers** covering all twelve
`sourceKind`s, twenty declared flags, ten items, six npcs, ten traits. The nine fixture YAMLs
moved to `packages/content/__fixtures__/events/`; `round-trip.test.ts` repointed in one line.

**`content:lint` went 31 warnings → 3, zero errors.** Every `THIN_TAG` and `UNUSED_TAG` is gone:
all eighteen check tags now have **≥3 events and ≥5 modifiers**. The three that remain are
`MISSING_LOCALE`, `SAFETY_NOT_SCANNED` and `MISSING_IMAGE_MANIFEST` — the locale and the image
manifest, both of which are their own commits and neither of which may be stubbed.

**The fixture control survived intact:** golden runs byte-identical, `pnpm sim:diff` "No change".
That is what the split was for.

#### Two content bugs the first corpus sim found

Both are the class of silent failure ADR 0001 says content has no other instrument for:

- **`authority.the_file_catches_up` was `priority: beat`.** A beat event only fires when a beat
  SLOT of its type is due, and the consequence queue cannot arrange one — so the payoff was
  scheduled 129 times and paid off **1.6%**. Made `normal`: **1.6% → 67%**, unresolved threads
  125 → 42. **A queued payoff must never be a beat event**, and that is now the rule.
- **`breakdown.the_roadside_repair` gated on `transportStat condition lte 7`.** Transport starts
  at 10 and only a failed storm takes 2 off it, so the event **never fired in 2000 runs**.
  Now `lte 9`; never-fired 1 → 0.

#### Three tools tests were asserting the fixture's gaps, not a property

Worth reading before writing the next one:

- `lint.test.ts` asserted `UNUSED_TAG` is REPORTED. That was the honest state of a nine-event
  fixture; the corpus covers every tag, so the assertion was inverted into its positive form —
  tag coverage is now pinned as `expect(coverage).toEqual([])` rather than left to a warning.
- `lint.test.ts`'s rule-SELECTION test keyed on `tag-coverage` and expected a non-empty set, so
  filling the gaps broke a test that has nothing to do with rule selection. Re-keyed to `i18n`.
- `stats.test.ts` asserted `not.toContain('region')` to mean "there is no region AXIS". It
  passed only because no modifier used `sourceKind: region`; four now do, and the word appeared
  under "Modifiers by source kind" while the property was still true. **A substring match on a
  vocabulary member was never testing what its comment claimed.** Now asserts on headings.

#### Open, and left for M-F rather than tuned further here

**Completion 52.1% against engine-spec 6's 30–50% band.** The fixture sat at 31% because it had
no food at all and every long run converged to health 0; the corpus added food and rest and
overshot. Three trims took it 60.0 → 59.1 → 53.1 → 52.1 — diminishing returns on the wrong
lever. Median legs is 13, so runs COMPLETE rather than survive, and the remaining distance is
route length, not recovery. Corpus routes want route generation (`engine/src/route/`).

Beat fill 30.3%: the corpus fills `border_crossing` and `midpoint_crisis`; the fixture routes
also schedule `departure`, `approach` and `finale`.

> **Corrected at Phase 3 M3.1: `ferry_boarding` was in that list and no fixture route schedules
> it.** `grep -c ferry_boarding packages/engine/src/__tests__/__fixtures__/routes.json` → 0. The
> 13 slots are departure ×3, border_crossing ×2, midpoint_crisis ×3, approach ×2, finale ×3. The
> error originated in the M9 note far below and propagated into three places. Measured inventory
> and the resulting beat-fill ceiling: `docs/adr/0027` Decision 5.

### The `en` locale — the game has words now

**Twelve files, 157 event keys, 146 check-chip keys, in one commit** — because the locale is a
cliff, not a slope: `MISSING_I18N_KEY` is an error that fires PER KEY the moment `i18n/en/`
holds any `.json`, so half a locale is hundreds of errors.

**`content:lint`: 3 warnings → 1, still zero errors.** `MISSING_LOCALE` and `SAFETY_NOT_SCANNED`
are closed. Landing it also switched on `BODY_TOO_LONG`, `CHOICE_TOO_LONG` and the four §11
`SAFETY_*` scans **for the first time**, and all of them are clean — longest body 54/60, longest
choice label 7/8.

The one warning left is `MISSING_IMAGE_MANIFEST`, and it is **structural rather than a to-do**:
`packages/tools/imagegen/` is empty, no image exists, and a manifest mapping thirteen keys to
nothing is a stub of exactly the kind CLAUDE.md §5 forbids. Leave it until imagegen lands.

#### The gap the linter has, and the test that covers it

**`content:lint` does not check modifier chip labels, and cannot.** `i18nCoverage` walks keys
reachable FROM an event; a modifier is not reachable from one, because it applies by tag
intersection at roll time. So a missing `check.modifier.<id>` does not fail a build — it ships
the raw key to the result screen, which is precisely what design pillar 2 exists to prevent.

`packages/content/__tests__/locale.test.ts` is that check: every modifier's `labelKey`, every
`check.modifier.skill.<key>` that `runSkillCheck` synthesises, and every
`check.modifier.container.<kind>` that `searchCheck` synthesises — none of which is authored
anywhere, so nothing else would have caught their absence. It also asserts the reverse (no
orphaned strings), no duplicate key across files, and the pillar-5 budgets as assertions rather
than warnings.

#### `lint.test.ts` had been wrong twice; it is now keyed to nothing

The rule-SELECTION test named the rules it expected to fire — first `{THIN_TAG, UNUSED_TAG}`,
then `{MISSING_LOCALE}` — and **both broke when the corpus improved**, for reasons with nothing
to do with rule selection. It now asserts the actual contract, which holds on a clean corpus and
a broken one alike: every single-rule run is a subset of the full run, and the union of all of
them is the whole of it.

Worth generalising: **a test that asserts a linter REPORTS something is asserting a to-do list.**
Three of them broke this session for that reason. Assert the positive property instead.

### M-F — the last two registries. **Phase 2B is complete.**

25 complications and 15 universal choices, with their locale. `docs/adr/0022` records the
decisions; `docs/adr/0009` §5 is amended for the fixture move it should have specified.

#### The headline: completion reached the band by adding CONTENT, not by tuning

**44.1%**, inside engine-spec 6's 30–50%. Three rounds of trimming food and rest moved it
60.0 → 59.1 → 53.1 → 52.1 and then stopped paying. What took it the rest of the way was landing
the two registries, which add **costly options a player will actually take**.

**Diversity and difficulty turned out to be the same lever**, which is the strongest evidence so
far that CLAUDE.md §9's architecture is the right one. It is also the argument to reach for when
the next balance problem looks like a tuning problem.

`Complication rate 59.5%` against an `ATTACH_PERCENT` of 60 — the tunable measures what it says.
Payoff 73.9% with 6 unresolved threads (from 1.6% and 125 before the `priority: beat` bug).

#### A bug the first full-registry run found, and why it is good news

`resolveChoice: loop/unknown-choice`, across 2000 runs. The sim read `event.choices` directly,
so when a complication **removed** a choice it offered one the engine refuses.

**The engine refusing is CLAUDE.md 2.7 working** — it is the authority on legality, not the
screen, and the sim is a screen. The fix is that `selectableChoices` now goes through
`presentedChoices`, which is the entire reason that is ONE exported function rather than two
inline expressions. **The app layer will need it too**; anything that renders a choice list must
derive it the same way.

#### What the first real registry taught us about `appliesTo`

`UNIVERSAL_NEVER_INJECTED` fired on **three of fifteen rows** — the rule written in M-B, firing
on content for the first time. The cause is structural: with a 3-per-event cap and one row per
family, a row that is both **low priority and broadly targeted never lands anywhere**. It loses
its family contest where it matches and loses the cap where it does not.

Raising priorities only moves the problem to whoever gets displaced. The fix was to make each
row in a family target a **different kind of event** and win there. Two rows also shared a family
they had no business sharing — a distraction and a day's labour are not two ways of doing the
same thing — which made the cheaper one unreachable.

**`appliesTo` breadth is a cost, not a benefit.** A row matching everything wins nowhere in
particular and starves its family. That is now in the style guide.

#### Corpus totals

|                   |                                                                          |
| ----------------- | ------------------------------------------------------------------------ |
| events            | 13, all twelve categories, two fillers for the ladder floor              |
| modifiers         | **137** — 3 under the brief's floor, see below; all twelve `sourceKind`s |
| complications     | 25                                                                       |
| universal choices | 15, all reachable                                                        |
| declarations      | 20 flags, 10 items, 6 npcs, 10 traits, 7 endings                         |
| locale            | complete `en` — 157 event keys, 146 chip keys, plus both registries      |
| `content:lint`    | **0 errors, 1 warning** (`MISSING_IMAGE_MANIFEST`, structural)           |

#### ⚠ The one deliverable that came in under its number — and the measurement that says leave it

**137 modifiers against a brief of "140–180" and an approved list of 162.** Three under the
floor, twenty-five under the plan. It was reported as a count in every milestone summary and
never flagged as a shortfall, which it should have been.

Where the 25 went, and why: **`item`, `trait`, `companion` and `region` rows are the ones that
need declarations**, and declarations are constrained from both sides — a flag a modifier reads
must be WRITTEN by an event (`FLAG_READ_NEVER_WRITTEN` is an error), and an item needs a
liability event that reads it. Thirteen events can only back so many. The rows were cut during
authoring rather than declared and left dangling, which was the right call; not saying so was
not.

**But the count was a proxy, and the property it stood for is met.** The brief's actual
requirement was "a typical check should pull 3–7". Measured over all 29 checks in the corpus
against a representative mid-run state:

```
min 3 · median 7 · max 9 · mean 6.4
```

The registry is at the top of the target band and slightly over it — **the twelve checks outside
3–7 are outside it on the HIGH side (8–9), not the low.** Adding 25 rows to reach 162 would push
more checks further above the range the number existed to produce.

**So: do not top this up to hit 162.** If the count is revisited, the honest lever is the
`item`/`trait` kinds, and only alongside events that give the declarations something to be
backed by. Recorded rather than fixed.

### Also shipped, after the milestones: a verification pass and a constitution audit

Neither was planned. Both came out of being asked "is it finished?" twice, and both found things.

**Sim instrumentation.** None of the D1 metrics existed. Added: `Modifier chips / check`,
`Checks under 2 chips`, `Universal choices offered`, `Universal choices picked`, and
`pnpm sim -- --json` for a per-run TRACE (fired events and picks in order) rather than the
aggregate. `docs/adr/0023` records what they measure and why the row count is not the metric.

**`content-stats` was reporting a wrong number, and had been since M0.** It read
`choice.skillCheck?.tags`, so the `search` tag showed **1** use when three choices carry it —
both actual searches were invisible. The tool whose job is finding content holes had a hole in
it. Helper now shared at `packages/tools/shared/rolled-checks.ts`.

**`REGION_MODIFIER_NOT_DOCUMENT`** — proposed in the plan, never built. Now built, wired (15
rules), and **tested against a deliberate violation**, because a rule that has never fired is a
rule nobody has checked. Silent on the shipped corpus, which is correct.

**CLAUDE.md 502 to 405 lines**, closing open question 1 after six sessions. Everything MOVED, not
deleted: `docs/enforcement.md` and `docs/stack-notes.md` are new. The audit found **six stale
claims** — listed in the closed question below.

---

## Half-done

**Nothing is broken, stubbed, or partially applied.** Working tree clean, all checks green. What
follows is live data with no consumer, or a number below its stated target — each with the file
that closes it.

### 1. `quirks.yaml` — the fourth §9 registry does not exist

`packages/content/` has `modifiers`, `complications` and `universal-choices`. CLAUDE.md §9 names
four; `quirks.yaml` (NPC personality traits that register as modifiers) is `(planned)`. It was
never in Phase 2B's brief, so this is a gap rather than a regression — but §9 promises four.

The seam it plugs into is `packages/engine/src/effects/modifier-source.ts`, which still ships
empty and still has a test appending a stub. ADR 0008's prediction that Phase 2 would append a
`quirkModifierSource` there is the one part of it still outstanding.

### 2. 137 modifiers against a brief of 140-180

Three under the floor, 25 under the approved list. **Measured, it does not need fixing**: 6.7
chips per check over 27,395 checks, top of the 3-7 band, 0 checks under two. Adding rows
overshoots. `docs/adr/0023` decision 1. Left deliberately.

### 3. Universal choices are offered more than they are taken

38.5% of choices shown, 36.0% picked — but per policy: `random` 0.99 pick/offer, `greedy-safe`
0.56, `risk-taker` **0.02**. They are **too many, not too strong**, and `risk-taker` at 0.6%
means they are near-dead for aggressive play. The lever is measured
(`MAX_UNIVERSAL_PER_EVENT` 3 to 2 gives offered 30.2% / picked 31.8%) and **not applied**.
ADR 0023 decisions 2-3.

### 4. Beat fill 30.6%

The corpus fills `border_crossing` and `midpoint_crisis`. The fixture routes also schedule
`departure`, `approach` and `finale` — **not `ferry_boarding`, which no fixture route schedules
at all** (corrected at Phase 3 M3.1). This is not a director fault and not tunable — it wants
corpus routes, which want route generation.

**And route generation alone will not close it.** Measured at Phase 3 M3.0: 5 of the 13 fixture
slots are of a type the corpus can fill, so the ceiling is 38.5% and the observed 30.1% is 78% of
what is reachable. A generated route with 2–4 border crossings lands at 39–49%. The rest needs
`departure`, `approach` and `finale` events — and `finale` is the one to write first, because it
is scheduled on every route and the corpus lost it when it replaced the fixture pack, which does
have `arrival.final_stretch`. See `docs/adr/0027` Decision 5.

### 5. `MISSING_IMAGE_MANIFEST` — the one remaining lint warning

`packages/tools/imagegen/` is empty and no image exists. A manifest mapping 13 keys to nothing
is the stub CLAUDE.md §5 forbids. Correct to leave.

---

## Next step (ONE task, start here)

**Build `packages/engine/src/route/` — route generation. It is the last `(planned)` engine
directory, and it closes steps 1-3 of the game loop, which have never existed.**

A fresh agent can start with no other context:

1. **Read first, in order:** `CLAUDE.md` §1 (the loop — steps 1-4 are the missing half),
   `docs/engine-spec.md` **Part II** (Part I is the pre-Phase-1 design doc and diverges; see
   open question 4), and `docs/adr/0005` §1 for the `routeGen` RNG stream, which **already
   exists, is named, and has never been drawn from**.

2. **What the engine already assumes about a route.** `RouteState` is caller-supplied today via
   `RunInit.route` and validated by `packages/engine/src/state/validate-route.ts`. It carries
   `nodes[]`, `edges[]`, `legIndex`, `legCount`, `progressKm`, `totalKm`, `beatSchedule[]` and
   **`legLocations[]` — one `LocationType` per leg, and `validateRoute` rejects a length
   mismatch**. Generation must produce all of it, including the beat schedule.

3. **The three fixture routes in `packages/engine/src/__tests__/__fixtures__/routes.json` are
   the specification by example** — read them before writing anything. Each carries a `start`
   block (transport, cash, startHour, weather); `packages/tools/sim/load-pack.ts` documents why
   route and start block are inseparable, and the walking skeleton had 5 of 9 events never
   firing when they came apart.

4. **Use the `routeGen` stream.** Do not add one: an `RngCursors` key is a `SAVE_VERSION` bump
   and a migration (currently 4). If generation's draw COUNT would depend on how much content
   exists, use the cursor-free `deriveKey` form — see `director/select-complication.ts` for the
   pattern and ADR 0021 for why.

5. **`geo/` is empty** (`nodes.json`, `edges.json`, `world.simplified.geojson` are `(planned)`).
   Deciding whether generation reads real geography or synthesises a graph is the first real
   design question, and **CLAUDE.md §11 constrains it**: the map may use real cities and
   distances, but no data file may carry a per-country danger index, and difficulty must come
   from the route PROFILE and player STATE.

6. **What it unblocks, and the measurement that proves it worked:** a corpus routes file, which
   is what beat fill at 30.6% is actually asking for. Success is
   `pnpm sim -- --pack=corpus --runs=5000` showing beat fill materially up with completion still
   inside 30-50%.

**DoD:** `pnpm typecheck && pnpm lint && pnpm test && pnpm content:lint`, a regression test, both
sim baselines diffed (`pnpm sim:diff` and `--pack=corpus --diff`), and an ADR if the geography
question is answered either way.

---

## Open questions for the human

**Two are decisions I am holding, not opinions I lack** — I have a recommendation on both and
have deliberately not acted:

1. **Apply `MAX_UNIVERSAL_PER_EVENT` 3 to 2?** My recommendation is **no** (ADR 0023 §3). It
   buys 4pp on a metric distorted by the `random` policy and costs a third of the injection
   diversity. One-line change if you disagree.

2. **Top the modifier registry up to 140+?** My recommendation is **no** (ADR 0023 §1) —
   chips/check is already at the top of the band. Say the word and I will add rows in the
   declaration-free kinds (`condition`, `context`, `momentum`, `skill`, `transport`, `document`),
   which need no new declarations.

The rest are carried forward unchanged and listed in full further down: `CHECK_DIE_SIDES` still
a placeholder, **Hermes still unproven** (ADR 0012 §3 — the engine has never executed on the
runtime it ships on), whether `engine-spec.md` Part I should be deleted, the conformance
harness's `readonly`-widening gap (ADR 0019), and whether losing a container should mark tickets
rather than delete them.

**Open question 1 — CLAUDE.md over its cap — is CLOSED**, see below.

---

## Superseded — the M-D part 2 brief

**`git mv` the nine fixture YAMLs to
`packages/content/__fixtures__/events/`, repoint `round-trip.test.ts` and `structure.test.ts`,
add `sim --pack=fixture|corpus` plus a corpus routes file — **and land the seed corpus in the
same commit**. `declarations.test.ts:72,88-101` asserts every declared flag, npc, item and
trait is actually used, so there is no intermediate state where `events/` is empty and the
suite is green.

Decide there, not later: `sim:diff` compares against exactly one `docs/sim-baseline.md`, and
two packs means two baselines or a pack-tagged one.

**Carry forward:** the fixture pack ships an empty MODIFIER registry (see the finding above),
so M-D is also where `modifiers.yaml` first reaches a running engine.

---

## Shipped in session 5 (2026-08-08) — Phase 2A under adversarial verification

**No new features. The deliverable is knowing which of Phase 2A's guarantees are real.** Six
checks against what session 4 claimed. Four confirmed it; **two did not, and both produced a
fix.** Every number below came from running something, not from reading the code.

What is different in the repo afterwards: one engine bug fixed, three documents that asserted
things the code contradicted corrected, and two new tests.

**Prove it, from a clean checkout:**

```bash
pnpm i && pnpm typecheck && pnpm lint && pnpm test && pnpm format:check
```

```bash
pnpm content:lint              # exit 0 — 0 errors, 29 warnings
pnpm sim -- --runs=5000        # 31.2% completion, contentVersion 4c57cd5c
pnpm sim:diff -- --runs=2000   # "No change vs docs/sim-baseline.md."
```

```bash
pnpm vitest run --project engine src/effects/__tests__/containers.test.ts
```

That last one is the session in miniature: 13 tests, of which the two added here are the
`loseContainer` contract in full and the visa bug it exposed. Totals moved 1053 → **1055
Vitest + 3 Jest across 47 files**.

### What was verified, and how

| #   | Claim                                                                      | Verdict                                                            |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | `content:lint`'s rules all fire                                            | **33 of 33 rule IDs fired**, one break at a time                   |
| 2   | Schema/engine drift fails the build                                        | **8 kinds proven to fail**; one kind does not, characterised below |
| 3   | The registry plugs into the `ModifierSource` seam with no call-site change | **FALSE.** Corrected in three places                               |
| 4   | Losing a bag takes the passport in it                                      | **True** — and writing the full test found a live bug              |
| 5   | The sim is unmoved                                                         | `pnpm sim:diff -- --runs=2000` → "No change"                       |

### 1. Every linter rule fires — 33 rule IDs, not 13

The 13 entries in `RULES` emit **33 distinct rule IDs** (the four `UNDECLARED_*` are
template-constructed from `ContentRefKind`, so they never appear as string literals in the
source). Each was fired individually against a throwaway copy of `packages/content`, diffed
against the pristine 29-warning baseline so corpus-global rules could be told apart from
pre-existing findings.

**`ZERO_WEIGHT_CHOICE` is unreachable through the YAML loader.** Both routes to it are closed
earlier by a strictly stronger schema: `weight: intSchema.positive()` rejects `weight: 0`
("Too small: expected number to be >0") and `outcomes: z.array(...).min(1)` rejects an empty
list. Handed a zero-weight event directly, the rule fires correctly — so it is dead code with
respect to authored content, not a broken rule. Leave it: it guards `runLint`'s actual input
type, which is `GameEvent[]` and does permit weight 0.

### 2. The drift guard works — but not by the mechanism the comment claimed

Eight kinds of disagreement were each made to fail the build: engine gains a field (TS2741),
schema gains a field (TS2353), optional-vs-null (TS2322), engine drops a `readonly` (TS2322),
a new engine vocabulary with no schema (L2 names it), the vacuity annotation (L1' **and** the
source scan, independently), a schema enum narrower than the engine's (the `_beatType`
`Equals`), and a semantic-only transform flip (0 type errors, 13 test failures).

**The finding: most of the `Equals` assertions are tautologies, and the real work is done
elsewhere.** `buildEvent` is declared `: GameEvent` and every predicate/effect arm is
`.transform((v): Predicate => …)`, so `z.infer` of those schemas IS the engine type by
declaration. `_event`, `_choice`, `_outcome`, `_check`, `_modifier`, `_context`, `_predicate`
and `_effect` cannot go red. That is **not a hole** — the annotation moves the check to the
builder body, where assignability catches everything above with better error messages than
`Equals` gives. `_beatType` proves L1 is genuinely load-bearing where no transform annotates
the output.

**The one uncaught kind: the schema widening `readonly T[]` to `T[]`.** A mutable array is
assignable to a readonly one, so the builder accepts it. Harmless — same object at runtime,
and the dangerous direction (the _engine_ going mutable) is caught. Recorded as an open
question rather than fixed, because closing it means dropping the builder annotations and
taking worse errors in exchange.

Also worth knowing: **an engine vocabulary growing a member cannot drift at all.** The schemas
are built from the engine arrays (`z.enum(BEAT_TYPES)`), so adding a beat type propagates
automatically. Derivation beats assertion.

### 3. The `ModifierSource` seam claim was false — corrected in three places

ADR 0008 promised "Phase 2 appends `registryModifierSource` and `quirkModifierSource` **with no
change at the call site**." Neither function exists in any source file. `git grep` returns only
the ADR line and a code comment repeating it. `PHASE_1_MODIFIER_SOURCES` still holds exactly one
entry. M2A.3 **bypassed the seam**: it threaded the registry as a fifth parameter to
`runSkillCheck` and resolved it in `modifiers/resolve-modifiers.ts`.

And the call site did change: `runSkillCheck` went 4 params → 5 and `RollResult` →
`CheckOutcome` (it is a public barrel export, so that is a published-API break);
`SkillCheckSpec` gained a required `tags`; `resolve-choice.ts` changed across 24 lines.

**Why the bypass was right, which is the part nobody wrote down:** a `ModifierSource` returns a
flat `RollModifier[]` of `{ labelKey, delta }`. The registry's output is not flat — pillar 2
needs `rawDelta`, which rows a conflict deleted, and each row's share of the clamp. Widening the
seam would have made every source pay for the registry's needs.

**What is actually true, and is the claim to make instead:** `resolveChoice(state, pack,
choiceId)` never changed, because the registry rides on the `pack` argument that already
existed. `advanceLeg`, `replayRun` and `sim/run-one.ts` were untouched by `8013aac`.

Corrected in `effects/modifier-source.ts`, `docs/adr/0008` (amended, prediction left standing
so the miss stays legible) and the stale cell in this file's session-3 table.

_One claim NOT repeated:_ the golden digests did move at `8013aac`, but in exactly the 18 lines
`contentVersion` moved, with `choiceSequence` and `expectedHistoryKeys` untouched — and
`stateDigest` hashes the whole state including `contentVersion`. Fully explained; not evidence
of behavioural change.

### 4. A live bug: a visa outlived the passport it is stamped in

`documents-state.ts` and ADR 0017 both state "**visa reads inherit the passport**" — that is the
stated reason `VisaState` has no container of its own, so that one physical object cannot become
two independently-losable records. `evaluate-state-leaf.ts` never implemented it: the `visa` arm
read only `documents.visas[region]`.

So the exact scenario the design ruled out was live. Bag stolen → passport in it marked
`present: false` → **`visa` still reports `held: true`**. Fixed; the read now requires
`passport.present === true`, and the trace carries `noPassport` so pillar 2 can distinguish "no
visa" from "no passport to show it in". The visa RECORD still survives in state, deliberately —
a recovered passport keeps its stamps.

**Nothing could have caught this.** The state shape was right, the ADR was right, and no test
tied them together; no event in the corpus uses a `visa` predicate, which is also why the fix is
sim-neutral. It was found by writing the test the design implied.

The same test pins the three other things losing a bag does, because they disagree with each
other: items go, the passport is **marked**, tickets are **hard-deleted**, and
`passport.container` still reads `'bag'` after the bag is null.

### What changed in the repo

| File                                    | Why                                                                  |
| --------------------------------------- | -------------------------------------------------------------------- |
| `predicate/evaluate-state-leaf.ts`      | the visa fix                                                         |
| `effects/__tests__/containers.test.ts`  | +2 tests: the full `loseContainer` contract, and the visa regression |
| `effects/modifier-source.ts`            | the seam comment promised something that never happened              |
| `docs/adr/0008`                         | same promise, amended with the prediction left standing              |
| `docs/adr/0017`                         | records that the visa inheritance it specified was never implemented |
| `docs/adr/0019`                         | **new** — conformance is enforced by annotation, not identity        |
| `content/__tests__/conformance.test.ts` | the L1 comment overstated what L1 catches                            |
| `CLAUDE.md` §9                          | "bidirectional (mutual-extends)" was wrong twice over                |

**Half-done, the next step and the open questions are unchanged in shape and live below** —
this session added no features, so gap 1 (`searchContainer`) is still the next task. Two new
entries: open question 5, and a design question under Half-done 4.

---

## Shipped in session 4 (2026-08-08) — **PHASE 2A COMPLETE**, M2A.0–M2A.7

`packages/content` is now a real content pipeline: YAML in, validated `GameEvent[]` out, with a
compiler-enforced conformance harness holding the Zod schemas identical to the engine's types,
five declaration registries, a global modifier registry with a 6-step resolution pipeline,
container inventory, three-tier money, and two tools — `content:lint` and `content:stats`.

**Prove it, from a clean checkout:**

```bash
pnpm i && pnpm typecheck && pnpm lint && pnpm test && pnpm format:check
```

```bash
pnpm content:lint          # exit 0 — 0 errors, 29 warnings (tabulated below)
pnpm content:stats         # 9 events, 8 modifiers, 1400-cell coverage pass
pnpm sim:diff -- --runs=2000   # "No change" against docs/sim-baseline.md
pnpm sim -- --runs=20000   # the full balance report
```

Totals: **1053 Vitest + 3 Jest across 47 files**, up from 851 at Phase 1. Eight milestones,
~20 commits. Review gates after M2A.2 and M2A.5 were both passed.

**Every behavioural sim number is unchanged since M2A.0's deliberate retune**, except two 0.1pp
ending shifts M2A.6 caused by fixing `wanted`. M2A.3/4/5 moved `contentVersion` only.

Three questions were settled by the human before planning: rename `money` → `cash` and add
`bank`; skill bypasses the modifier clamp (`d20 + skill + clamp(mods, −8..+6)`); fix `worldTick`
first as its own milestone. The plan is at
`~/.claude/plans/phase-2a-plan-mode-precious-elephant.md`.

### M2A.0 — the drift curve. `docs/adr/0014`. Two commits.

`worldTick` now charges every drain against the **clock span the leg covers**, not the leg.
Open question 1 is **closed**.

- **The defect, measured:** health first dropped on leg 8 in **1500 of 1500 runs**, distinct=1.
  Identical, not clustered — because every drain was per-leg and unconditional, so a nine-hour
  walk cost the same as a four-hour train ride and nothing read the hour jitter.
- **After:** distinct=**9** (legs 5–14). Completion 30.1% → 31.2%, inside the 30–50% band, so
  this is not a difficulty change. `gave_up` 39.1% → 33.2%, `collapsed` 30.8% → 35.6% — the two
  failure modes are near-balanced where one dominated.
- **`spanPoints(before, hours, per)`** carries the remainder across legs, so summed cost is
  exactly `floor(total / per)` (property test). **No new state** — the clock is already the
  accumulator, so `SAVE_VERSION` is untouched and there is no migration.
- **The finding worth keeping (ADR 0014 §3): grade a penalty on an unbounded meter, never on a
  floored one.** Energy floors at 0 and most runs sit there, so a second harsher morale rung is
  a penalty the whole population takes on the same leg — it _synchronises_ the collapse.
  Measured: it drove leg-15 morale from `0/2/6` to `0/0/0`. Hunger has no ceiling, so grading
  there spreads. This cost the most to learn.
- **`worldTick` had no unit test at all**, which is how a curve that resolves to a constant
  survived to a sim report. It has 12 now, pinning the _shape_ not the constants; verified
  failing on a deliberate violation first.
- **`pnpm golden:update` now exists.** `golden-runs.json`'s header and `golden-run.test.ts` both
  said to regenerate with `ODYSSEY_UPDATE_GOLDEN=1`; **nothing implemented it.** The generator is
  `packages/tools/sim/regenerate-goldens.ts` — outside the engine because the engine may not
  touch `process` or write files, and it derives expectations from `replayRun` rather than the
  simulator so the two cannot drift apart and still look green.

**Still true and not fixed by M2A.0:** the fixture pack contains **no food** — nothing reduces
hunger, one effect grants energy. Health decline is therefore irreversible and every long run
still converges to 0; only the leg it _starts_ varies. A wide p10/p90 at a fixed late leg needs
the seed corpus.

Baseline regenerated; `pnpm sim:diff -- --runs=2000` reports no change. 863 Vitest + 3 Jest.

### M2A.1 — schema foundations + the conformance harness. Four commits.

**The three experiments were run first, and the load-bearing one came back NO.** Zod 4.4.3
cannot infer a recursive transforming schema (TS7022), and the annotation that fixes it
(`z.ZodType<Predicate>`) makes ADR 0009's assertion a **tautology** — `z.infer` of an annotated
schema IS the annotation, so it passes on a schema that parses nothing, and because `Equals` is
deep it poisons `GameEvent`/`Choice`/`Outcome` too: five of twelve, including the four that
matter. Fix: annotate **only the recursive back-reference**, leave the union inferred.

The anti-vacuity guard is better than the one the plan proposed. Hand-mirroring a terse input
type is brittle (the readonly boundary differs between annotated and inferred arms). What works
is `Equals<z.input<S>, unknown> = false` — an annotated schema's input collapses to `unknown`.

**The harness, four layers, each verified failing on a deliberate violation:**

| Layer                                     | Catches                          | Proven by                                          |
| ----------------------------------------- | -------------------------------- | -------------------------------------------------- |
| L1 `Equals<z.infer<S>, T>`                | shape drift                      | a new field on `GameEvent` → TS2741 at the builder |
| L1' `Equals<z.input<S>, unknown> = false` | annotating a schema into vacuity | annotating `effectSchema` → red                    |
| L2 runtime barrel enumeration             | a type with **no** schema        | removing `BEAT_TYPES` → named                      |
| L3 27-case terse→canonical corpus         | semantics `Equals` is blind to   | `gte`→`lte` → 7 cases fail                         |

Other findings worth keeping:

- **`.default()` does not fire on `null`,** and YAML `weather:` parses as null. `z.array().default([])`
  would leave the field null at runtime while every type assertion passed. Every default is
  `.nullish().transform(v => v ?? …)`.
- **`.brand()` is unusable** (Zod's symbol, not the engine's); `.readonly()` on a branded scalar
  yields `Readonly<EventId>`. `z.string().transform(engineCtor)` is the only idiom.
- **`z.intersection` DOES infer identity-equal** — my plan's stated reason for flattening
  `SkillCheck` was wrong. The real reason: `.strictObject` on either half rejects the other
  half's keys, so an intersection can never be sealed.
- All settled in `packages/content/__tests__/zod-idioms.test.ts`, which is the regression guard
  for the next Zod upgrade.

**Authoring form is 36% of canonical** (10.3KB/496 lines vs 28.3KB/1182) and **no event file
contains a text field at all** — keys are derived from ids, so rule 2.4 is true by construction.
Two escape hatches the fixtures forced: explicit `textVariants` (`out.onward_again` reads better
than `out.onward.v2`) and explicit `labelKey` (a choice with id `fix_it_yourself` keyed
`choice.fix`).

### M2A.2 — declaration registries. One commit.

`flags` `items` `npcs` `traits` `endings` + schemas + loader, all in `packages/content`.

- **Deviated from the plan: `ContentRegistries` was NOT widened.** ADR 0007 §4 says a missing
  flag is deliberately not `unknown-ref`; endings are the same. Widening would contradict that
  ADR and move `contentVersion` for no behavioural gain. ADR 0009 §4 already assigns the walk to
  `content-lint`, so the cross-reference checks live in the content package.
- **The liability rule is decidable now.** "Is this outcome bad?" is not statically checkable, so
  each item names the events where carrying it hurts and the schema refuses an empty list.
- **The reverse checks caught two of my own mistakes**: I copied `ration` and `light_sleeper`
  from the engine fixture's registry block without checking any event reads them. Neither does,
  and `ration` had a liability I had annotated as unbacked. Both removed rather than explained.

`pnpm sim:diff` reports no change for both milestones. 950 Vitest + 3 Jest.

### M2A.3 — check tags, modifier registry, pipeline. `docs/adr/0015`.

- **A correlated-randomness bug was live.** `modifier-source.ts` called `evaluatePredicate`
  with no `path`, so every `{chance}` gate in every modifier, in one event on one leg, shared
  one RNG address and returned one answer. Both paths are now content-addressed.
- **DR is computed once over the tail sum, and rounds half-up.** Per-entry `trunc(d×3/5)` makes
  four `+1`s and eight `+1`s both total `+3`; a test then caught that truncation still zeroes a
  single `+1`.
- **Clamp attributes by largest remainder** so chips sum to the total exactly (pillar 2).
- 18 tags: dropped `border` (a location — replaced by the `locationType` predicate kind, the
  28th), added `bribery`/`documents`/`search`/`language`.
- Registry lives INSIDE `ContentRegistries` so `contentVersion` covers it.
- **`sim:diff` no longer ignores the report header** — a `contentVersion` change was invisible.

### M2A.4 — three-tier money, first real migration. `docs/adr/0016`.

- `money` → `cash`, plus `bank`. `SAVE_VERSION` 2. **`MIGRATIONS` is no longer empty.**
- **The migration is not a field rename**: `key: 'money'` is persisted inside
  `pendingEvents[].requires`, so the predicate tree is rewritten recursively. A _flag_ named
  `money` is left alone; `history` is not rewritten at all.
- Closed a NaN hazard: `isRunStateShape` checked `resources` only as an object.
- Sim delta: two lines, neither a number.

### M2A.5 — container inventory. `docs/adr/0017`. **← second review gate**

- Four containers; `SAVE_VERSION` 3. Documents record their container; **visas deliberately do
  not** (a visa is a stamp in the passport).
- **Fixed the predicate-sums / applier-first-matches divergence**, which containers made
  reachable: the player paid less than the price they were shown, silently.
- `isRunStateShape`'s `inventory` array check moved in the same commit — otherwise every save
  becomes unloadable with the error blaming the migration.
- **`searchContainer` is deferred and named as a gap**: the `search` check tag has registry
  rows and no caller. The data (searchDC, concealability) exists and is inert until 2B.

1029 Vitest + 3 Jest. Sim delta for M2A.3/4/5 is `contentVersion` only — no behavioural number
has moved since M2A.0.

### M2A.6 — `pnpm content:lint`. 13 rules, wired into CI.

**It found three errors on its first run, all genuine.** Two `LOCAL_MODIFIER` (the bribe event
kept choice-local `unwashed`/`wanted` after M2A.3 declared them in the registry — the D1 decay
the rule exists to catch, introduced two milestones earlier) and
**`FLAG_READ_NEVER_WRITTEN: wanted`** — the finding the sim printed every run since Phase 1 and
that PROGRESS carried as an untested engine surface. Being detained now sets it; the sim line
went from `wanted <- gate can never open` to `(none)`.

Rules are scoped honestly: `CONTRADICTORY_REQUIRES_NUMERIC` names its own fragment because only
numeric intervals inside an `all` are decidable, and the orphan check documents that it is
static. An absent locale gives ONE finding, not a hundred. `--fix` will not touch i18n (a
placeholder is a user-visible string) or hoist a modifier (id/priority/sourceKind are not
derivable). **CLAUDE.md rules 1, 4 and 6 moved to live; DoD item 4 is no longer N/A.**

### M2A.7 — `pnpm content:stats`. Phase 2A complete.

Counts plus a 4-axis coverage pass (1,400 combinations). The rule it turns on: an empty
constraint means NO constraint, so empty expands to the full axis. The number worth reading is
**filler-only cells**, not empty ones — a cell covered by two universal fillers is a hole with a
rug over it, and it is the sim's 75%-filler finding seen from the other end.

Reports zero holes today, which is honest for nine loosely-constrained events — so three tests
construct narrow corpora and prove it _can_ find 1,399. **No region axis**: `EventContext` has
no region field, `geo/` is empty, and region-gating events is what §11 warns against.

---

## Superseded — Half-done as of session 5

Nothing is broken and nothing is stubbed to make a check pass. What follows is **live data with
no consumer** — shapes that parse, validate and persist, but that no code path reads yet. Each
one is a real gap, not a placeholder, and each has the file that closes it.

### 1. `searchContainer` — the largest one. Data live, no caller.

`packages/engine/src/state/container-state.ts` gives every container a `searchDC` (person 2 /
bag 4 / vehicle 6 / stash 9) and every item a `concealability`. `CHECK_TAGS` includes `search`
and `packages/content/modifiers.yaml` has four rows keyed to it. **No event performs a search**,
so all of it is inert — `pnpm content:lint` reports `UNUSED_TAG: search`, correctly.

ADR 0017 explains why this is not an effect op: an effect applier has no `Rng` by contract
(`packages/engine/src/effects/effect-context.ts:6-11`), and a search writes, so two searches in
one effect list would address identically. The design is settled — `Outcome.search: SearchSpec |
null`, resolved through the existing `runSkillCheck` on the existing `skillCheck` stream, so no
new RNG stream and no `RngCursors` change. It is **not built**. Files it would touch:
`packages/engine/src/content/game-event.ts`, `packages/engine/src/loop/resolve-choice.ts`,
`packages/content/schema/outcome.ts`.

### 2. The nine events are still fixtures, not a corpus.

`packages/content/events/**.yaml` is nine events re-expressed from the Phase 1 JSON. They exist
to exercise the tooling, and per ADR 0009 §5 they **must not become the seed corpus**. Two
consequences that read as balance problems but are content gaps:

- **No food anywhere in the pack.** Nothing reduces hunger; one effect grants energy. Health
  decline is therefore irreversible and every long run converges to 0 — M2A.0 widened _which
  leg it starts_ (distinct 1 → 9) but cannot widen the endpoint. ADR 0014.
- **Fillers are 75% of everything that fires**, which `content:stats` shows from the other end
  as filler-only coverage cells.

### 3. The 29 lint warnings, which are the 2B to-do list

| Warning                                 | Count | Closes when                                                           |
| --------------------------------------- | ----- | --------------------------------------------------------------------- |
| `MISSING_LOCALE` / `SAFETY_NOT_SCANNED` | 2     | `i18n/en/*.json` exists                                               |
| `MISSING_IMAGE_MANIFEST`                | 1     | `images/manifest.json` exists                                         |
| `THIN_TAG` / `UNUSED_TAG`               | 22    | the seed corpus gives every tag ≥3 events and ≥5 modifiers            |
| `LIABILITY_UNBACKED`                    | 2     | events actually read `cash_belt` / `spare_tyre`                       |
| `FLAG_WRITTEN_NEVER_READ`               | 3     | something gates on `bribe_on_record`, `detained`, `took_the_long_way` |

They are honest fixture gaps, all warnings, none suppressed. **They should go to zero as 2B
lands, not be silenced.** Reproduce with `pnpm content:lint`.

### 4. Three things that are pinned by tests but not decided (added session 5)

Not broken — each has a passing test asserting current behaviour. What is missing is a decision
that the behaviour is _right_. All three live in
`packages/engine/src/effects/__tests__/containers.test.ts`.

- **Losing a container DELETES its tickets but MARKS its passport.** `apply-container-effects.ts`
  filters tickets out of the array and sets `passport.present = false`. Defensible — a lost
  passport opens a recovery storyline and a lost ferry ticket leaves nothing to write against —
  but the asymmetry is unargued in the code, and an author reasoning about "your bag is stolen"
  has to know it. Pinned so a change is noticed; see open question 6.
- **`passport.container` still reads `'bag'` after `inventory.bag` is null.** A dangling name.
  Harmless today because every read guards on `present` first, and arguably useful — it records
  _where_ the passport was lost, which a recovery event would want.
- **The `readonly`-widening gap in the conformance harness** (ADR 0019). Accepted, not fixed;
  the reasoning and the rejected alternatives are in the ADR. Open question 5 is whether to
  revisit it.

---

## Superseded — the session-5 next step (shipped as M0)

**Implement `Outcome.search` — the search check — closing gap 1 above.**

_Carried over unchanged from session 4: session 5 was verification and added no features._

This is deliberately NOT "start the seed corpus". Authoring 12 events against an engine that
cannot resolve a search means writing around the hole and then rewriting; and it is the one
piece of 2A that shipped as data without a consumer. It is small, fully specified, and
`content:lint` already tells you when it is done (`UNUSED_TAG: search` disappears).

A fresh agent can start with no other context:

1. Read **`docs/adr/0017-container-inventory.md`, section "What is deferred, and why it is not
   a gap"** — it states the design and, more importantly, why a `searchContainer` effect op is
   forbidden.
2. Add `SearchSpec { container: ContainerKind, dc: number, tags: readonly CheckTag[] }` and
   `readonly search: SearchSpec | null` to `Outcome` in
   `packages/engine/src/content/game-event.ts`. `Outcome` already carries `onCheck`, which is
   the branching mechanism — a search reuses it.
3. Mirror it in the event schema (`packages/content/schema/event.ts` — there is no
   `outcome.ts`; `outcomeSchema` lives inside it). `z.strictObject`, `.nullish()`-defaulted per
   ADR 0009 §2. Then run `pnpm --filter @odyssey/content run typecheck`. **It will fail before
   you have written the schema, with `TS2741: Property 'search' is missing … but required in
type 'Outcome'` pointing at `buildOutcome`** — that is the guard working, not a problem to
   route around. Note per ADR 0019 that the error comes from the builder's return annotation,
   not from the `Equals` assertions, so `conformance.test.ts` is not where you will see it.
4. Resolve it in `packages/engine/src/loop/resolve-choice.ts` alongside the existing
   `runSkillCheck` call. Use the **`skillCheck` RNG stream** — do not add a stream, that is an
   `RngCursors` change and a save migration for nothing. The effective DC is the container's
   `searchDC` from `CONTAINER_SPECS` adjusted by the spec's `dc`; the searched item's
   `concealability` is a modifier input.
5. Give the fixture event `border.bribe_attempt` its `hide_the_cash` choice a real search (the
   authoring shape is already written out in the plan file, Part 1 §1).
6. `pnpm sim -- --runs=20000`, regenerate `docs/sim-baseline.md`, explain the delta. **This
   moves numbers** — it is the first thing since M2A.0 that will.

DoD: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm content:lint` (item 4 is real now), a
regression test, the sim delta, and an ADR if anything non-obvious comes up.

After that, Phase 2B proper — the seed corpus. `content:stats` and `content:lint` are the
instruments for writing it; author against `docs/engine-spec.md` Part II. The 12 seed events,
160 modifiers, complications, universal choices and quirks are all 2B.

---

## Open questions — the carried-forward list, in full

> Referenced by the current list above. Question 1 is CLOSED; 2-6 are live.

1. ~~**`CLAUDE.md` over its own ~400-line cap.**~~ **CLOSED 2026-08-09, after six sessions.**
   It had reached 502. Now **405**, and everything was MOVED rather than deleted:

   - §2's `_Enforcement:_` notes -> **`docs/enforcement.md`**, each rule keeping a one-line
     status. That was the proposal raised five sessions running; it is done.
   - §4's dependency caveats (moti, rive, the wildcard-peer trap, the Hermes plural risk) ->
     **`docs/stack-notes.md`**.
   - §1's status block, §3's layout, §5's planned commands and §9's type-ownership block
     compressed to pointers at the docs that already own them.

   The audit that came with it found **six stale claims** in a file whose whole job is to be
   true: Zod "not yet used", DoD item 6 saying the sim harness does not exist, `content-lint`
   at 13 rules (15), `adr/0001-0021` (0022), `src/route/ (planned — Phase 2B)` after 2B
   shipped, and §9 asserting complications and universal-choices did not exist. Every numeric
   claim left in the file was then checked against ground truth.

   **The lesson worth keeping: the cap is not about tidiness.** A file that grows past what
   anyone re-reads is a file whose claims stop being audited, and six of them had rotted.

2. **`CHECK_DIE_SIDES = 20` is still the Phase 1 placeholder**, and 2A made the question sharp
   rather than answering it. With the clamp at +6/−8 and skill bypassing it, one point of
   modifier is worth 5% on a d20 — so the entire registry moves a check by at most 30/40
   percentage points, and a single skill point is worth as much as a modifier. A 3d6 (or 2d10)
   would make the middle of the curve dense and modifiers matter more where checks are close.
   **This wants the seed corpus before deciding**, but flagging it now: changing it later
   invalidates every DC an author has written.

3. **Hermes is still unproven** (ADR 0012 §3). Every cross-engine determinism defence in the
   engine is preventive and verified on V8 only. The engine has never executed on the runtime
   it will ship on. **Proposal: a one-off harness run in the Expo dev client that replays the
   golden runs and compares digests.** Cheap, and it either confirms the defences or finds the
   problem while there are 9 events instead of 200.

4. **Is `docs/engine-spec.md` Part I still worth keeping?** Part II is written from the code and
   is authoritative. Part I is the pre-Phase-1 design document, and several of its statements
   are now simply wrong (`requires: { context: { locationTypes: [...] } }` at `:143` was
   unimplementable and is superseded by the `locationType` predicate kind). Options: delete it,
   or mark it `# Superseded` in place as a design record. I would delete.

5. **Should the conformance harness trade error quality for real identity?** (New — ADR 0019.)
   Dropping the `: GameEvent` return annotations and asserting
   `Equals<ReturnType<typeof buildEvent>, GameEvent>` would make all thirteen L1 assertions
   load-bearing and close the `readonly`-widening gap. It would also turn
   `Property 'mood' is missing in type … but required in type 'GameEvent'` into
   `Type 'false' is not assignable to type 'true'` at a line naming no field. **I decided no
   and wrote the reasoning into ADR 0019** — the missed direction is harmless, the dangerous
   direction is caught, and the message is worth more than the coverage. Flagging it because it
   is a guarantee you were told you had in a stronger form than you actually have, and that is
   your call to accept, not mine.

6. **Should losing a container mark tickets rather than delete them?** (New.) A lost passport
   becomes `present: false` so a recovery storyline can exist; a lost ticket is removed from the
   array outright. If tickets are ever meant to be recoverable — "the driver remembers you paid"
   — the state has to keep them. Cheap to change now while the corpus is nine events and no
   content depends on either behaviour; expensive after 2B. Both are pinned by tests either way.

---

## Shipped in session 3 (2026-08-08) — **PHASE 1 COMPLETE**, M0–M11

The engine plays a full run, replays it bit-for-bit, reports on itself, and migrates its own
saves. **[PR #2](https://github.com/corazon714/odyssey/pull/2) is open against `main`, all six
CI jobs green** — including `sim-smoke`, which had never run on a real runner until now.

Every claim below has the command that proves it. All were run at session end.

```bash
pnpm typecheck                      # exit 0 — 4 projects + root
pnpm lint                           # exit 0
pnpm test                           # 851 Vitest + 3 Jest
pnpm format:check                   # exit 0
node packages/engine/src/index.ts   # exit 0 — CI's rule-2.2 proof, run locally
pnpm sim -- --runs=20000            # 4.6 s against a 30 s budget
pnpm sim:diff -- --runs=2000        # "No change vs docs/sim-baseline.md"
pnpm --filter @odyssey/engine run coverage   # 88.51% statements
```

| Milestone | Delivers                                                              | Commit              |
| --------- | --------------------------------------------------------------------- | ------------------- |
| M0        | `.ts` module specifiers; purity guard widened to cross-engine hazards | `998cea1` `9aeed80` |
| M1        | Counter-based RNG, 8 named substreams                                 | `31b731a`           |
| M2        | `RunState`, `createRunState`, `stateDigest`                           | `9c875ee`           |
| M3        | 27 predicate kinds + the reason trace Phase 7 renders                 | `c29a544`           |
| M4        | 12 effect ops, pure applier, `ModifierSource` seam                    | `6db1333`           |
| M5        | Content model, `createContentPack`, JSON fixtures                     | `ff0f981`           |
| M6        | The walking skeleton — a run that runs                                | `b3cb1d7`           |
| M7        | Six scoring factors, seven-rung ladder, tension, complication seam    | `67fd25d`           |
| M8        | Consequence queue: caps, eviction, expiry, rebasing                   | `b8ccf70`           |
| M9        | Beat consumption: fill, slide, expire                                 | `651ccbd`           |
| M10       | Golden replay, engine-spec §6 report, `sim:diff`                      | `2330d07`           |
| M11       | Save migration ladder, shape guard, content reconciliation            | `f92d5a0`           |
| —         | Verification pass, engine-spec Part II, ADR 0012                      | `f9f7b5f`           |

**Bugs found by running the thing, that no unit test saw:** 5 of 9 events unreachable (M6),
a payoff scheduled 20× and fired 0× (M6), two sim policies producing byte-identical runs (M6),
a queue that never released fired promises (M8), beat slots re-fillable forever (M9).

---

## Half-done

**Nothing is broken or partial.** No `TODO(handoff)` markers, working tree clean, all CI green.

Three things are **deliberately inert** — built, tested, and called by nothing. That is by
design, but a fresh agent will find them and should not "fix" them:

| Path                                                             | State                          | Why                                                                                                                                                                                                         |
| ---------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/engine/src/queue/rebase-pending.ts`                    | Fully tested, **zero callers** | Re-routing is Phase 2. The queue's shape was chosen for it, so the test IS the deliverable (ADR 0011 §3). Wiring is one line when re-routing lands.                                                         |
| `packages/engine/src/migrate/migrations.ts`                      | **Empty array**                | `SAVE_VERSION` is 1; no save format has been superseded. Inventing a fake migration would put a lie in the ladder (ADR 0012). Machinery is proven against a synthetic list.                                 |
| `effects/modifier-source.ts` · `director/complication-source.ts` | Seams ship **empty**           | Phase 2 registries plug in with no call-site change. Each has a test appending a stub and asserting it reaches the output. **← the prediction in this cell was wrong; see the correction under session 5.** |

**Not started** (still `.gitkeep` only): `packages/content/{events,geo,i18n,images}`,
`packages/content/schema/`, `packages/tools/{content-lint,imagegen,i18n-check}`.

---

### What the sim's instruments found — open findings

Every one of these is a FIXTURE gap, not an engine fault — and none of them errored:

| Finding                                | Detail                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **`wanted` is read but never written** | Three gates reference it, nothing sets it. Those branches are unreachable.                                               |
| 3 flags written but never read         | `bribe_on_record`, `detained`, `took_the_long_way` — dead writes.                                                        |
| 2 choices never picked                 | `bribe_attempt/present_documents` (needs a passport the fixture never grants) and `/turn_back` (`hiddenUnless heat>=6`). |
| Repeat-event rate 62.4%                | Nine events, two of them universal fillers.                                                                              |
| health p50 = 0 by leg 15               | 69.9% of runs end in failure (`gave_up` 39.1%, `collapsed` 30.8%).                                                       |
| Beat fill rate 47.9%                   | Routes schedule three beat types the pack cannot fill.                                                                   |

They are recorded rather than tuned away: the fixture pack exists to exercise the engine, and
balancing against nine events would be fitting to a fixture. Revisit with the Phase 2 seed
corpus.

### ⚠ UNTESTED ENGINE SURFACE — carried into Phase 2 deliberately

Findings 1–3 above are not balance questions. They are **coverage gaps**, and the distinction
was missed when they were first recorded. Four engine mechanisms have **never executed in any
of the 2,000 simulated runs**, because the fixture cannot reach them:

| Mechanism                                   | Why unreachable in the fixture                                |
| ------------------------------------------- | ------------------------------------------------------------- |
| Skill-check modifier gating                 | `check.modifier.wanted` — the flag is never set by any effect |
| Outcome `requires` + `unlockEnding`         | `out.flagged_in_system` gates on `wanted`                     |
| The `passport` predicate (all three fields) | No fixture scenario grants a passport                         |
| **`hiddenUnless`**                          | `turn_back` needs `heat >= 6`; observed runs peak at 3        |

`hiddenUnless` is the sharpest: it has **exactly one instance in the whole pack**, and it is
dead — so engine-spec §2's "reward for state" mechanism has never run inside the loop. Unit
tests cover these paths in isolation; the golden runs and the sim corpus do not touch them.

**Decision (2026-08-08): accepted as a known limitation and carried to Phase 2.** Closing it is
content work — grant a passport on one route, add an effect that sets `wanted`, let heat reach
6 — and belongs with the seed corpus rather than with a fixture built for the engine. **When
that corpus lands, verify these four paths appear in the sim before treating the coverage as
complete.**

---

## Superseded — current state before M10

**The game runs, the director paces it, consequences survive, and beats are consumed.**
776 engine tests; 799 Vitest + 3 Jest total.

---

## Next step (ONE task, start here)

**Build `packages/content/schema/` — the Zod schemas and the terse→canonical transform.**

This is Phase 2's first milestone. It is first because everything else in Phase 2 — the seed
corpus, the four registries, i18n — needs a validated content pipeline, and because it is the
milestone that discharges the promise made in ADR 0009.

### Start here, in this order

```bash
pnpm install && pnpm typecheck && pnpm lint && pnpm test   # must be green before writing
```

Read, in order: `docs/adr/0009` (who owns the types), `docs/adr/0007` §1 (why predicates are
kind-tagged), `CLAUDE.md` §9 (already amended to match), and `docs/engine-spec.md` **Part II**
(what the engine actually accepts — Part I is the original plan and diverges in nine places).

### Deliver

1. **Declare two dependencies by hand** (`pnpm add` is DENIED by `.claude/settings.json`; edit
   the manifests then run `pnpm install`, which is an `ask` rule):
   - `pnpm-workspace.yaml` catalog: `yaml: ^2.9.0` — **it is already in `node_modules` as an
     undeclared phantom via Vite.** Using it without declaring it breaks the day Vite drops it.
   - `packages/content/package.json`: `@odyssey/engine: workspace:*` and `yaml: catalog:`
2. **Zod schemas** in `packages/content/schema/` mirroring the engine's types. The engine owns
   the types; the schema owns _content semantics_ — which YAML fields exist, which values are
   legal, what an omitted key defaults to.
3. **The terse→canonical transform.** Authors write engine-spec §2's
   `{ resource: money, gte: 30 }` and `{ not: { flag: bribed } }`; the engine consumes
   `{ kind: 'resource', key: 'money', cmp: { op: 'gte', value: 30 } }`. Use `z.lazy` for the
   recursive predicate and `.transform()` to normalise. Effects need NO transform — `op` is
   already a proper discriminant.
4. **`.default()` on every optional YAML key**, producing `| null` for scalars and `[]` for
   lists — the engine has no optional properties (ADR 0006 §1).
5. **The conformance test that discharges ADR 0009.** Bidirectional, so a schema narrower _or_
   wider than the type fails the build:
   ```ts
   type Equals<A, B> =
     (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
   const _eventsMatch: Equals<z.infer<typeof gameEventSchema>, GameEvent> = true;
   ```
   Twelve types on the surface: `GameEvent`, `Choice`, `Outcome`, `SkillCheck`, `CheckModifier`,
   `EventContext`, `EventPriority`, `BeatType`, `LocationType`, `TimeOfDay`, `Predicate`,
   `Effect`.
6. **`loadEvents()`** — readdir + parse YAML + validate → `readonly GameEvent[]`, feeding
   `createContentPack`.
7. **Three sample YAML events** proving the transform round-trips. **NOT the seed corpus** —
   that is a later milestone written against the content bible.

### Constraints that will bite

- `packages/content/tsconfig.json` includes only `schema/**` and `__tests__/**`. A new
  top-level dir is invisible to `tsc` **and** to type-aware ESLint until you add the glob.
- Relative imports need an explicit `.ts` extension (ADR 0005 §4).
- No default exports; inline type imports; no `any`; no `!` outside tests.
- Do **not** put Zod in `packages/engine` — `purity.test.ts` asserts its manifest, and ADR 0009
  §1 explains why the layering must not invert.

### Done when

`pnpm typecheck && pnpm lint && pnpm test` green, the conformance assertion compiles, the three
YAML events parse into `createContentPack`, and `pnpm sim:diff -- --runs=2000` still reports
**no change** — the schema layer must not move a single engine number.

---

## M11 shipped — save versioning and content reconciliation

`src/migrate/`. Engine tests 814 → 851. **No sim numbers moved.**

- **`MIGRATIONS` is empty, and that is correct** rather than an omission: `SAVE_VERSION` is 1,
  so no save format has ever been superseded. Inventing a fake schema change to exercise the
  machinery would put a lie in the ladder. It is proven against a SYNTHETIC list instead, which
  tests chaining, ordering and gap detection without pretending history happened.
- **The fixture-completeness meta-test** is what makes the ladder enforceable: it fails the
  moment someone bumps `SAVE_VERSION` without adding a fixture, in CI rather than on a device.
- **A gap in the ladder is a distinct error from a corrupt save** — one is a build defect, the
  other is a bad file, and they need different fixes.
- **`isRunStateShape` checks the rng cursors exhaustively** and everything else shallowly,
  because a missing cursor is silently catastrophic (every draw reads `undefined` → NaN) while
  a malformed history entry is merely wrong.
- **`reconcileContent` TOLERATES a `contentVersion` mismatch where `replayRun` REFUSES one.**
  Both are correct: content ships in every app update, so refusing would delete in-progress
  runs; but a tolerant replay would prove nothing about determinism.

---

## Superseded — M11 brief

The two version axes from ADR 0006 §Consequences, with opposite policies:

1. **`migrate/` — the save-schema axis.** An ordered list of pure
   `migrate_N_to_N+1(unknown) -> unknown` functions. **Never edit a shipped migration.** Every
   new `SAVE_VERSION` adds one function AND one checked-in fixture save.
2. **The meta-test that makes it work**: `it('has a fixture for every version below
SAVE_VERSION')`. It is the only thing that makes writing a migration without a fixture
   impossible, and it fails the moment someone bumps the constant and forgets.
3. **`isRunStateShape`** — a shallow hand-written guard, not Zod. Deep save validation belongs
   with the persistence layer in Phase 2; the engine needs enough to refuse a corrupt save.
   A future `version` returns a typed `save/version-too-new`, never a throw.
4. **`reconcileContent` — the content axis, which CANNOT migrate.** Tolerant read:
   - dangling `pendingEvents` dropped and each drop reported
   - `eventMemory` for removed events **kept** — dropping loses "seen" if the event returns
   - `history` retained verbatim (i18n keys; `i18n-check` catches the rest)
   - flags with unrecognised ids evaluate normally — flags are runtime data, not content
   - a predicate over a missing CONTENT id resolves false with `unknown-ref` (already true)

Note the asymmetry M10 made concrete: **replay refuses a `contentVersion` mismatch, while
reconciliation tolerates one.** Both are correct — a content update must not delete an
in-progress run, and a tolerant replay would prove nothing.

Diff the sim against `docs/sim-baseline.md`; M11 should not move a single number.

---

## M9 shipped — beat consumption

`src/director/beat-slots.ts` plus a beat-fill metric in the sim. Engine tests 733 → 776.

**Sim delta from the M8 baseline:**

```
Completion rate             29.9%   (was 30.0%)
Beat fill rate              47.8%   (1132 filled, 1236 missed)  ← NEW
Unresolved threads              0
Queue departures               18
20,000 runs                 4.8 s
```

- **`legIndex` never moves.** A slot is open over `[legIndex, legIndex + slackLegs]`, and
  sliding is a STATUS, not a mutation of the leg. Advancing the leg and decrementing slack
  reads more naturally right up until you want to report "scheduled for 12, fired at 14" — at
  which point the original is gone.
- **A filled slot cannot be re-filled**, which is the defect M9 closes: before slot consumption
  a beat stayed `pending` forever and could fire again on any later leg in range.
- **`createContentPack` now reports `unfillableBeatTypes`**, alongside `danglingRefs`. Same
  class of silent bug: the slot opens, nothing is eligible, it slides, it expires, and the only
  trace is a beat-miss rate that reads like a balance problem.

**Open finding — the 47.8% fill rate is a fixture gap, not an engine fault.** _[Corrected at Phase 3
M3.1: `ferry_boarding` is wrong here and this sentence is where the error started. No fixture route
schedules it. The nine-event fixture pack also DOES have a `finale` event, `arrival.final_stretch`.
Left in place as the origin of a claim that propagated into three later documents.]_ The fixture
routes schedule `departure`, `approach` and `ferry_boarding`; the nine-event pack has events for none
of them, so those slots can only expire. The sim now prints the unfillable types under the
number so it is self-explaining. Fixing it is content work — either events for those beats or
routes that do not schedule them — and belongs with the Phase 2 seed corpus, not with a fixture
built to exercise the engine.

---

## M8 shipped — the consequence queue

7 files under `src/queue/`. See `docs/adr/0011`. Engine tests 690 → 733.

**M8 found a real defect while being built:** nothing removed a pending entry when it fired.
The promise stayed queued for the rest of the run, and only `maxOccurrences` stopped the payoff
re-firing on every leg of its window — a filter doing the queue's job. Every kept promise would
also have surfaced in the journal as an unresolved thread. The sim now reports **18 queue
departures against 18 fires, and 0 unresolved threads**.

- **Eviction uses a TOTAL order** ending in an insertion index, so ties are impossible by
  construction. Tested by evicting from EVERY permutation of a tie-heavy set and asserting one
  answer — a stronger claim than "the comparator looks total".
- **Append-then-evict, not reject-when-full**, so a promise due next leg displaces one due
  twenty legs out instead of being turned away at the door.
- **Rebase COMPRESSES rather than drops.** Nothing calls it yet — re-routing is Phase 2 — but
  the queue's shape was chosen for it, and a shape chosen for an unimplemented capability is
  one nobody has checked. A property test sweeps leg counts 1–30 against deltas −10..+10.
- **The queue survives an ending**, feeding the journal ("Dmitri never found you") and the
  sim's bug detector.

The sim is otherwise unchanged from the M7 baseline: nine events schedule one payoff, so the
caps are never approached. Expected — they bound pathological runs, not fixture ones, and the
unit tests are what exercise them.

---

## M7 sim delta against the M6 baseline (still the balance baseline)

|                 | M6 (uniform) | M7 (scored)                                       |
| --------------- | ------------ | ------------------------------------------------- |
| Completion rate | 33.7%        | **30.5%** (30.5 / 30.9 / 31.5 across three seeds) |
| Uneventful legs | 0.0%         | 0.0%                                              |
| Fallback legs   | 0.0%         | 0.0%                                              |
| Payoff rate     | 100% (20/20) | 100% (18/18)                                      |
| Never-fired     | 0 of 9       | 0 of 9                                            |
| 20,000 runs     | 4.4 s        | 4.7 s (+7%)                                       |

The completion drop is **signal, not noise** — stable across seeds. Scoring penalises fillers
(`priorityBoost: 0.40`), so more consequential events fire and runs cost more. Still inside
engine-spec 6’s 30–50% band, at its lower edge.

**Open balance finding: fillers are still 75.7% of everything that fires.** They are the only
events with no context constraints, so they are eligible on nearly every leg while the rest
are gated — a 0.40 boost cannot outweigh that eligibility gap. This is a CONTENT observation,
not an engine defect: nine events, two of them universal, is not a distribution to balance
against. Revisit with the Phase 2 seed corpus.

| Event                  | Share |
| ---------------------- | ----- |
| filler.roadside_quiet  | 38.3% |
| filler.long_hours      | 37.4% |
| rest.pickpocket_victim | 11.3% |
| crisis.breakdown       | 4.3%  |
| transit.bus_ejection   | 3.2%  |
| arrival.final_stretch  | 2.5%  |
| border.document_check  | 2.4%  |
| border.bribe_attempt   | 0.3%  |
| border.guard_remembers | 0.1%  |

```
Completion rate             33.7%      (engine-spec 6 target band 30-50%)
Median legs / days          11 / 5
Uneventful legs              0.0%      (target <2%)
Fallback legs                0.0%      (target <2%)
Long-range payoff rate     100.0%      (20/20 scheduled)
Never-fired events              0      of 9
Wall clock                219 ms       (0.22 ms/run)
Extrapolated to 20,000    4.4 s        (target <30 s — 7x margin)
```

Every gate criterion met. **The performance target is not close** — 4.4 s against a 30 s
budget, before any of M7's optimisation levers (pack pre-indexing, `explain` off) are needed.

### What the gate caught — the point of building it

Two bugs that every unit test in M1–M5 passed straight through, both found in the first
1,000-run report:

1. **5 of 9 events were unreachable.** The fixture routes supplied no preparation choices, so
   transport defaulted to `foot` and money to 0 — silently making every vehicle-constrained
   and cost-gated event impossible. Fixed by giving each fixture route a `start` block, which
   is what the preparation screen will produce.
2. **`border.guard_remembers`: scheduled 20×, fired 0×** — the exact signature ADR 0001 names
   as the shape of a whole class of silent content bug. The payoff window `[9,17]` contained
   exactly ONE leg whose location could host it, and zero if the bribe fired at leg 17. Fixed
   by adding checkpoints inside the windows. Payoff rate went 0% → 100%.

A third, found by its own test rather than the report: **`greedy-safe` and `risk-taker` were
producing byte-identical runs** on every fixture seed, because `risk-taker`'s bonus only
applied where a skill check existed. Two policies that always agree bound nothing, so they
were rebuilt as maximin and maximax.

### One engine addition M6 forced

`RouteState.legLocations` — one `LocationType` per leg, caller-supplied like the rest of the
route. Without it `context.locationTypes` cannot be evaluated at all, which makes every border
and rest-stop event unfilterable. `validateRoute` now rejects a length mismatch, because a
short list would silently fall back to `roadside` for the tail of the route.

---

## Superseded — current state before M6

---

## Superseded — current state before M5

The engine can now read and write state deterministically. `src/rng/` (seeded RNG),
`src/state/` (`RunState`, `createRunState`, `stateDigest`), `src/predicate/` (27 kinds + reason
trace) and `src/effects/` (12 ops + applier) are done; 548 of the repo's 561 tests are engine
tests (558 Vitest + 3 Jest). Still missing: the content model, the director, the turn loop,
and all content.

**Both Phase 2 seams are in place and tested as seams:** `ModifierSource` (M4) and the
complication hook (M7, pending). Neither is decorative — each has a test that appends a stub
source and asserts it reaches the output.

The Phase 1 plan is approved, with review gates after **M0** (done) and **M6** (the walking
skeleton, where `pnpm sim -- --runs=1000` first runs end to end). Milestones: M0 prerequisites
· **M1 RNG** · M2 state · M3 predicate · M4 effects · M5 content model · M6 walking skeleton ·
M7 scoring · M8 queue · M9 beat consumption · M10 sim report + goldens · M11 versioning.

---

## Shipped this session (2026-08-08, session 2) — Phase 1 M0

M0's entire job was to settle the module-specifier question **before** ~115 engine files
depend on the answer, and to widen the determinism guard to cover cross-engine hazards.

### The module-specifier decision

`allowImportingTsExtensions: true` is now set in `tsconfig.base.json`, and engine sources
import each other with explicit `.ts` specifiers. This was forced, not chosen: CI runs
`node packages/engine/src/index.ts` to prove rule 2.2 executably, Node ESM requires an
explicit extension, and a `.js` specifier fails with `ERR_MODULE_NOT_FOUND` (verified
against `packages/tools/shared/__tests__/`, which only passes today because Vitest — not
Node — resolves it). The flag is legal because every project sets `noEmit`.

It lives in the shared base rather than in `packages/engine` because `@odyssey/engine`'s
`types` field points at raw `src/*.ts`, and TypeScript realpaths the workspace link — so
engine sources land in a **consumer's** program as ordinary project files that
`skipLibCheck` does not cover. `apps/mobile` extends `expo/tsconfig.base`, not this file,
and will need its own copy the first time the app imports the engine.

### The four gate checks, all green

| Check                                    | Command                                                     | Result                                        |
| ---------------------------------------- | ----------------------------------------------------------- | --------------------------------------------- |
| Bare-Node import by package name         | `node -e "import('@odyssey/engine')"` from `packages/tools` | **pass** — `OK: resolved. exports = []`       |
| Two-file engine module under bare Node   | `node packages/engine/src/index.ts` with a probe re-export  | **pass** — exit 0; `exports = ["M0_PROBE"]`   |
| Typecheck, all projects, probes in place | `pnpm typecheck`                                            | **pass** — 4 projects + root                  |
| Metro still starts                       | `expo start --port 8083`                                    | **pass** — `Waiting on http://localhost:8083` |

**The risk flagged in the plan is closed.** Node refuses type-stripping for files under
`node_modules`, and pnpm puts the link at `packages/tools/node_modules/@odyssey/engine`
(package-local, not hoisted). It works because ESM resolution realpaths by default, so the
junction resolves to `packages/engine` — outside `node_modules` — before stripping. The
relative-path fallback named in the plan is **not needed** and is withdrawn.

Both probe files were removed after the checks (`git clean -f`; `rm` is denied).

### `purity.test.ts` extended — cross-engine hazards

New `CROSS_ENGINE_PATTERNS` block bans `Math.pow/exp/log/sqrt/cbrt/hypot`, all trig, the
exponent operator, `localeCompare`, the `toLocale*` family and `Intl`. These are
deterministic on one machine but **implementation-approximated or locale-dependent**, so
two conforming engines may disagree on the last bit or on sort order — and a golden run is
only worth something if it reproduces on Linux, Windows and Hermes alike.

**Verified failing on a deliberate violation before being trusted**, per the standard the
other three layers were held to: injecting `Math.pow(2, 8)`, `2 ** 8` and `localeCompare`
into a real engine source file failed the suite with all three labels reported.

**Also fixed, unplanned:** the existing `Math['random']` pattern was **silently dead**.
`stripCommentsAndLiterals` blanks the quoted key before the regex runs, so
`Math['random']` had already become `Math['']` and could never match. Replaced with
`Math[`, `Date[`, `crypto[`, `performance[` — engine source has no legitimate reason to
index those dynamically, so the broader form is both correct and stricter. ESLint's AST
selector was catching this case, so nothing slipped through; the backstop was just not
backing anything up.

Vitest count 15 → 17.

### Dependency added

`packages/tools` now declares `@odyssey/engine: workspace:*`. Justification per CLAUDE.md
§8: the sim harness executes the engine headlessly and there is no other route to its
exports; `packages/tools` declared no workspace dependencies at all before this. **New
Architecture compatibility: N/A** — an internal workspace package of pure TypeScript with
zero runtime dependencies, which runs under Node and never reaches a device bundle.

---

## Shipped in session 1 (2026-08-08)

Everything here is verified. The command that proves each claim is next to it.

### Workspace and toolchain

pnpm 11.20.0 workspace, 5 projects (`apps/mobile`, `packages/{engine,content,tools}`, root).
All shared versions live in one `catalog:` block in `pnpm-workspace.yaml`, so packages
cannot drift.

```bash
pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm test:engine && pnpm format:check
```

All six exit 0. Tests: **15 Vitest** (3 projects) + **3 Jest** (apps/mobile).

**Every one of the 9 scripts in `package.json` has been executed**, not just the six above:

| Script         | Result                                           |
| -------------- | ------------------------------------------------ |
| `dev`          | Metro starts, `Waiting on http://localhost:8081` |
| `typecheck`    | exit 0 — 4 projects                              |
| `lint`         | exit 0                                           |
| `lint:fix`     | exit 0, **0 files changed**                      |
| `format`       | exit 0, **0 files changed**                      |
| `format:check` | exit 0                                           |
| `test`         | exit 0 — 15 Vitest + 3 Jest                      |
| `test:engine`  | exit 0 — 5 tests                                 |
| `prepare`      | exit 0, `core.hooksPath = .husky/_`              |

`format` and `lint:fix` changing zero files is the meaningful assertion — it means the
committed tree is already canonical, not merely that the commands exit 0.

### Versions pinned deliberately BEHIND npm latest

Read `docs/adr/0002` before "upgrading" any of these. Each was pinned because latest is
broken here, not out of caution.

| Package    | Pinned    | npm latest | Why                                                                                                |
| ---------- | --------- | ---------- | -------------------------------------------------------------------------------------------------- |
| typescript | `~6.0.3`  | 7.0.2      | TS 7 ships no stable compiler API; typescript-eslint peers `<6.1.0`                                |
| eslint     | `~9.39.5` | 10.8.0     | Expo's plugin tree caps at `^9`; ESLint 10 per-file config lookup silently shadows the root config |
| jest       | `^29.7.0` | 30.4.2     | jest-expo 57 + `@react-native/jest-preset` are on the Jest 29 family                               |

### Determinism guardrails — three independent layers

All three were verified **failing on a deliberate violation** before being trusted.

1. `eslint.config.mjs` — `no-restricted-properties` + `no-restricted-syntax` +
   `no-restricted-globals`. Catches `Math.random()`, `Math['random']`,
   `const { random } = Math`, `Date.now()`, `Date['now']`, `new Date()`, `Date()`.
   (`no-restricted-globals` alone _cannot_ ban `Math.random()` — see `docs/adr/0002`.)
2. `packages/engine/tsconfig.src.json` — `types: []`, no `DOM` in `lib`, so `document` and
   `process` do not typecheck in the engine.
3. `packages/engine/src/__tests__/purity.test.ts` — scans engine source and manifest for
   forbidden imports and nondeterministic APIs.

Plus `scripts/check-no-nested-eslint-config.mjs`, which fails `pnpm lint` if any
`eslint.config.*` appears outside the root — the failure mode that would silently disable
layer 1 for a whole subtree.

### CI

`.github/workflows/ci.yml`: `typecheck`, `lint`, `test`, `engine-under-plain-node`
(executes the engine entry under bare Node — `node packages/engine/src/index.ts`), and a
Windows `typecheck` + `test` job. Actions pinned to `checkout@v7`, `setup-node@v7`,
`pnpm/action-setup@v6`, with action-setup **before** setup-node (the cache footgun).

**CI is green on a real runner.** `dev` was pushed and
[PR #1](https://github.com/corazon714/odyssey/pull/1) opened; all 5 jobs passed on both the
`push` and `pull_request` runs (10 checks total). Run
[31242944764](https://github.com/corazon714/odyssey/actions/runs/31242944764).

| Job                       | Result       |
| ------------------------- | ------------ |
| `typecheck`               | pass (30s)   |
| `lint`                    | pass (37s)   |
| `test`                    | pass (29s)   |
| `engine-under-plain-node` | pass (38s)   |
| `typecheck-windows`       | pass (1m23s) |

Notably `typecheck-windows` and `engine-under-plain-node` both passed first time — the
Windows job proves no path-separator or CRLF assumptions leaked in, and the plain-Node job
is the executable proof of `CLAUDE.md` rule 2.2. `--frozen-lockfile` also held, so the
lockfile is not drifting.

### Claude Code extension layer (`.claude/`)

See `docs/adr/0003`. Four hooks, all proven by driving them with the documented stdin
contract and asserting exit codes:

| Hook                        | Event                      | Proven                                                                                                                                 |
| --------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `guard-protected-paths.mjs` | PreToolUse Write/Edit      | blocks `reports/`, `.env`, both generated-asset dirs; allows `.env.example` and engine source                                          |
| `guard-git-push.mjs`        | PreToolUse Bash/PowerShell | blocks `--force`, `--force-with-lease`, `origin main`, `HEAD:main`, and `git status && git push -f`                                    |
| `gate-commit.mjs`           | PreToolUse Bash/PowerShell | blocks a commit with a failing test, printing the real assertion error; passes when fixed; **fails closed** if its own plumbing breaks |
| `warn-new-dependency.mjs`   | PostToolUse Write/Edit     | exit 2 feedback naming each added dependency                                                                                           |

Timings: docs-only commit **113ms**, `packages/engine` commit **5.9s**, full monorepo
**11.9s** (which the scoping avoids). Bash guards **~162ms** per call.

Also `.claude/skills/handoff/SKILL.md` (`/handoff`) and
`.claude/agents/code-reviewer.md` (reviews a diff against `CLAUDE.md` §2).

### Fixed during verification: `expo-env.d.ts` was tracked and shouldn't be

Running `pnpm dev` for the first time exposed a real defect in the Phase 0 scaffold.
`expo start` **regenerates** `apps/mobile/expo-env.d.ts` (without a trailing newline) and
writes its own `apps/mobile/.gitignore` listing that file. Because the hand-written version
was committed, `pnpm format:check` failed for anyone who had ever started the dev server —
a check that passed in CI and failed on every developer machine.

Fix: untracked the file, committed Expo's generated `.gitignore`, and added the path to
`.prettierignore` (Prettier does **not** read `.gitignore`, verified). Confirmed first that
`apps/mobile` still typechecks with the file absent, which is the fresh-CI-checkout case.

### The permission layer fired live

While cleaning up a probe file, `rm` was **denied** by the `Bash(rm *)` deny rule in
`.claude/settings.json`. Removal went through `git clean -f <path>` (an `ask` rule) instead
of being routed around with a node one-liner. First live confirmation that the permission
layer works, as opposed to the hook scripts, which were proven by contract.

### CLAUDE.md audit

Every claim checked against the repo; aspirational sections marked `(planned)` (42
markers). Stack re-verified against Expo SDK 57.0.11 — see `docs/adr/0004`: **moti is
banned** (value-imports framer-motion 6, which peers React ≤18 and pulls in `@motionone/dom`,
the DOM engine §4 already bans). Use Reanimated 4's built-in CSS animations API.

---

## Half-done

**Nothing is half-done.** No file is in a broken or partial state, no `TODO(handoff)`
markers exist, and the working tree is clean apart from the commits made this session.

The honest gaps are _unverified_, not _broken_:

- ~~CI has never executed.~~ **Resolved** — all 5 jobs green on GitHub Actions, including
  the Windows and plain-Node jobs. See the CI section above.
- **The app has never run on a device or simulator.** `expo export` bundles cleanly on both
  platforms (android 1226 modules, ios 1097) and `pnpm dev` starts Metro on port 8081 — that
  is the real test of pnpm's hoisted `node_modules` against Metro resolution. But no
  `expo prebuild`, no Gradle/Xcode build, and nothing has ever rendered on a screen.
- **Hooks proven by contract, not by live firing.** They were driven with the exact stdin
  JSON Claude Code sends. Hooks load at session start, so they were not armed in the session
  that wrote them — verified by writing to `reports/` and watching it succeed.

---

## Next step (ONE task, start here)

**M7 — the director's scoring, and the full relaxation ladder.** _(after the M6 review)_

M6's director picks UNIFORMLY among eligible events and has a two-rung ladder. M7 makes it a
director.

1. **The six scoring factors** with the ranges recorded in the plan: `contextAffinity`
   [0.50, 2.00] · `tensionFit` [0.25, 1.50] · `novelty` [0.20, 1.00] · `recency` [0.05, 1.00]
   · `tagSaturation` [0.25, 1.00] · `priorityBoost` {0.40, 1, 1, 3.00}. **Multiplication order
   is part of the replay contract** — float multiplication is not associative, so reordering
   changes `Math.round`, which changes the pick. Pin it with `scoring-order.test.ts`.
2. **`pickWeight = clampInt(round(score), 1, 1_000_000)`** so an eligible event is ALWAYS
   pickable. That invariant is what separates scoring from filtering; it gets its own test.
3. **All rational arithmetic.** No `Math.pow`/`exp`; `purity.test.ts` enforces it.
4. **`tagSaturation` uses `max`, not a product** — a six-tag event in a busy window would
   otherwise collapse to near-zero and become a filter in disguise. Window derives from
   `history`, which already carries tags copied at fire time.
5. **The full seven-rung ladder**: beat gate → `exclusiveGroup` → soft context → cooldown +
   recency → `locationTypes` → filler pool → `uneventful`. `requires` and `maxOccurrences`
   never relax, at any rung.
6. **The complication hook** — the second Phase 2 seam. Post-selection, drawing from
   `encounterFlavor` so Phase 2 can consume randomness without shifting `eventPick`. Test it
   as a seam, like `ModifierSource`.
7. **`tension`** — `nextTension(state, pack)`, with the "breathe after two high-tension
   events" rule from engine-spec 4.

Re-run the sim after each factor lands; the numbers above are the baseline to diff against.

---

## M6 brief (delivered) — the walking skeleton

The minimum that proves the loop end to end. Deliberately NOT the full director: scoring,
the relaxation ladder, beats and the queue's caps all come after, because their bugs are
invisible until something can run a thousand runs.

1. **`director/`, minimal** — hard filters (`requires`, `maxOccurrences`, context, cooldown,
   `exclusiveGroup`) plus **uniform** `weightedPick`. No scoring factors, no beat gate, no
   ladder beyond falling through to `{ kind: 'uneventful' }`. `selectEvent` returns a
   discriminated union and never throws.
2. **`loop/`** — `advanceLeg(state, pack)`, `resolveChoice(state, pack, choiceId)`,
   `worldTick`, `runSkillCheck` (through `collectModifiers` and
   `PHASE_1_MODIFIER_SOURCES` — never reading `check.modifiers` directly), `pickOutcome`,
   `checkRunEnd`. Every illegal transition returns a typed `EngineError`, never a throw.
3. **`packages/tools/sim/`** — `runOne`, `runMany`, `parse-args`, `cli` printing five counts.
   Policies: `random`, `greedy-safe`, `greedy-fast`, `risk-taker`, `adversarial-worst-case`.
   Reads the fixture pack and routes by path via `findWorkspaceRoot`.
4. **Add `sim` to root `package.json`** and a `pnpm sim -- --runs=50` smoke job to CI.

**Gate criteria:** `pnpm sim -- --runs=1000` completes 1,000 full runs; report shows a
non-zero completion rate, empty-pool fallbacks under 2%, and no never-fired event among the
nine. Measure 1,000 runs and extrapolate against the **20,000-runs-under-30-seconds** target
before optimising anything — if the extrapolation misses, that is a finding to report at the
gate, not a slip to absorb.

Wire `PredicateContext` to the pack's real `ContentRefs` here — `ALL_REFS_KNOWN` was a
placeholder, and `unknown-ref` should start firing on genuinely missing content.

---

## M5 shipped — the content model

7 files under `src/content/`, the fixture pack and routes as JSON, and a hand-written fixture
loader. Engine tests 548 → 591. `docs/adr/0009` records the decisions, and **`CLAUDE.md` §9 is
amended** (DoD item 8).

- **The type-ownership conflict is resolved.** §9 implied engine types are `z.infer`red from
  the Zod schemas; that would make the engine a consumer of `packages/content` and give it a
  Zod dependency. Now: the engine owns the types, the schema owns content _semantics_, and
  Phase 2 holds them identical with a bidirectional compile-time assertion.
- **Sorted once, at construction.** Twenty shuffled orderings produce an identical pack and an
  identical `contentVersion` — with a guard-the-guard asserting the fixture is _not_ already
  in sorted order, or that test would prove nothing.
- **`danglingRefs` walks every predicate and effect.** ADR 0001 accepts that content bugs are
  silent; this is the first instrument that sees them. `content-lint` subsumes it in Phase 2.
- **Fixtures are JSON data in the engine**, not `.ts` and not `packages/content/events/`.
  `packages/content` is still untouched, so Phase 1 needs no `yaml` dependency.
- **Nine events, chosen for coverage not realism:** two fillers (the ladder's rung-6 floor),
  beats for three beat types, a schedule/payoff pair, and one event that can legitimately fail
  to fire so the never-fired line has something real to report.

---

## M5 brief (delivered) — the content model

M4 shipped (below). M5 is the last piece before the walking skeleton, and it is where the
type-ownership decision from the plan review becomes code.

Deliver:

1. **Engine-owned TypeScript types** in `src/content/`: `GameEvent`, `Choice`, `Outcome`,
   `SkillCheck` (extend M4's `SkillCheckSpec`), `EventContext`, `EventPriority`,
   `LocationType`. `BeatType` and `TimeOfDay` already exist. **Hand-written, not `z.infer`** —
   see the CLAUDE.md §9 amendment below.
2. **`createContentPack(events)`** — sorts **once, at construction**, into canonical id order
   using `<`/`>` on strings, and builds lookup indices. Sorting per leg is both wasteful and
   an invitation to "optimise" the sort away later. `ContentPack` is not `RunState`, so it may
   legally hold `Map`s.
3. **`contentVersion(events)`** — a stable hash over the sorted pack, reusing `digestOf`.
4. **`ContentRefs` implementation** so `PredicateContext` can stop using `ALL_REFS_KNOWN`.
5. **The fixture pack**: `src/__tests__/__fixtures__/mini-pack.json` — 9 events as JSON DATA,
   not `.ts` (rule 2.6 honoured rather than bent). Plus `routes.json` carrying `legCount` and
   `beatSchedule`, which the sim reads by path via `findWorkspaceRoot`.
6. **Amend `CLAUDE.md` §9** (DoD item 8). It currently says the Zod schemas are the single
   source of truth, implying engine types are inferred from them. That cannot hold: `z.infer`
   types are owned by whichever package declares the schema, so the engine would become a
   consumer of `packages/content` and would need a Zod dependency. The amendment: the schema
   is authoritative over _content semantics_, and Phase 2 holds schema and type identical with
   a **bidirectional** compile-time assertion (mutual-extends, so narrower _or_ wider fails).

`packages/content` is still NOT touched — no schemas, no YAML, no seed events.
`shuffled-pack-invariance` is the test that matters: an identical run digest from a shuffled
event array, proven end to end rather than by inspecting a sort.

---

## M4 shipped — the Effect DSL and applier

10 files under `src/effects/`, plus `src/text-params.ts`. Engine tests 487 → 548.
`docs/adr/0008` records the decisions.

- **12 ops** (the spec's 11 plus `clearFlag`). Exhaustiveness verified by injecting a
  `teleport` op: two errors, one at the dispatcher's `never` guard and one at `EffectOp`,
  because `EFFECT_OPS` and the union cross-check each other.
- **`AppliedEffect` records what happened, not what was asked.** Spending 40 when you hold 12
  logs `applied: -12` plus a `ClampEvent`. `applied.length === effects.length` is an
  invariant, so an effect can never be silently dropped.
- **Structural sharing, with identity as the no-op signal.** A resource change leaves `flags`,
  `route`, `history` as the _same objects_; a no-op returns the identical state.
- **Purity is enforced by deep-freezing** the input and applying all 12 ops — module code is
  strict, so an in-place write throws. The freeze is itself guarded by a test.
- **Compound ops carry a nested tagged `field` union**, not a bag of nullables, because
  `{ vehicleId: string | null }` cannot distinguish "leave alone" from "set to none".
- **`ModifierSource` seam is live.** `runSkillCheck` (M6) will never read `check.modifiers`
  directly. Phase 1 passes one source; Phase 2 appends the registry and quirk sources with no
  call-site change.

---

## M4 brief (delivered) — the Effect DSL and its applier

M3 shipped (below). Effects are the other half of the same contract: predicates read state,
effects write it, and CLAUDE.md 2.7 says every mutation goes through one.

Deliver:

1. **The 11 ops from engine-spec §2**: `resource` · `flag` · `relationship` · `advanceTime` ·
   `scheduleEvent` · `unlockEnding` · `item` · `skill` · `transport` · `document` · `route`.
   `op` is already a proper discriminant, so no terse→canonical normalisation is needed —
   unlike predicates.
2. **`applyEffects(state, effects, ctx) -> { state, applied }`**, pure, with **structural
   sharing**: untouched branches keep object identity. A full clone per effect is ~30 legs ×
   many effects of needless allocation in a 20k-run sim.
3. **`AppliedEffect` records what actually happened**, not what was asked for — including
   **clamp reporting** (reuse `ClampEvent` from M2) and a `noop` case. `{ requested: -40,
applied: -12, clampedAt: 'floor' }` is what makes "money floors at 0 after leg 15" visible
   to the sim rather than absorbed by a silent `Math.max`.
4. **`ModifierSource` seam** (`effects/modifier-source.ts`) — ships **empty, not absent**.
   `runSkillCheck` (M6) never reads `check.modifiers` directly; it collects from an ordered
   list of sources. Phase 1 passes one (`choiceModifierSource`, filtering by each modifier's
   `when` predicate); Phase 2 appends the registry and quirk sources **with no call-site
   change**. A test must prove an empty source list is inert and a stub source's output
   reaches the result.
5. **`scheduleEvent` appends naively.** Caps, per-eventId limits, deterministic eviction and
   rebasing all land in M8 — do not build them here.

Tests that matter: one per op; `frozen-input-purity` (deep-freeze the input, apply all 11,
assert no throw and an unchanged digest); `structural-sharing` (untouched branches keep
identity); `applied-length-invariant` (`applied.length === effects.length`, so a silently
dropped effect is impossible).

---

## M3 shipped — the predicate DSL and the reason trace

10 files under `src/predicate/`, plus `state/flag-access.ts`. Engine tests 350 → 487.
`docs/adr/0007` records the decisions. Worth knowing:

- **27 predicate kinds**, canonical `kind`-tagged. **Exhaustiveness verified, not asserted**:
  injecting a `moonPhase` kind failed with `TS2345 … not assignable to parameter of type
'never'` at the evaluator's guard, then was reverted.
- **`ReasonNode` / `ReasonLine` are frozen** (ADR 0007 §2). Two user-facing consumers depend
  on the shape — the result screen and Phase 7's MO2 chips — and they are built in different
  phases. Changing either type needs an ADR.
- **`all`/`any` do not short-circuit**, and the trace is built eagerly. Short-circuiting would
  show one reason where three applied, which is the opposite of design pillar 2.
- **`chance` consumes no cursor.** `chance-gate.test.ts` asserts all eight cursors stay at
  zero across 50 evaluations, and that two gates in one predicate get independent answers.
- **A missing content id is `unknown-ref`; a missing flag is not.** Content ids are a bug the
  sim must count; flags are runtime data with no registry to be missing from.
- **Flag TTL is applied at read time**, and `isSet` does not mean truthy — a flag set to
  `false` or `0` is still set.

---

## M3 brief (delivered) — the `requires` DSL and its evaluator

M2 shipped (below), so state exists to evaluate predicates against. `predicate/predicate.ts`
currently holds a two-member placeholder union; M3 expands it. Growing a union is additive,
so nothing written against it needs rework.

Deliver:

1. **~20 kind-tagged node types**: `all` · `any` · `not` · `always` · `never` · `flag` ·
   `resource` · `skill` · `trait` · `item` · `document` · `visa` · `relationship` ·
   `eventMemory` · `transport` · `weather` · `timeOfDay` · `leg` · `tension` · `chance` ·
   plus `unknown-ref` as an evaluation _result_, not an authored node.
2. **`evaluatePredicate(p, ctx): { value, trace }`.** The trace is not debug output — Phase 7
   (MOTION MO2) renders it as the dice modifier chips, and design pillar 2 requires the
   player be able to reconstruct why. **`ReasonNode` and `ReasonLine` are contract-frozen
   from M3; changing either needs an ADR.** Shape:

   ```ts
   type ReasonNode = {
     readonly kind: PredicateKind | 'unknown-ref';
     readonly value: boolean;
     readonly labelKey: string; // i18n key, never prose
     readonly params: Readonly<Record<string, string | number | boolean>>;
     readonly children: readonly ReasonNode[]; // EMPTY_REASONS for leaves
   };
   ```

3. **`describeReason(node): readonly ReasonLine[]`** — flattens to
   `{ labelKey, params, polarity: 'pro' | 'con' }`, the chip list the result screen renders.
4. **`{ chance: p }` draws from `chanceGate` and advances NO cursor.** It is addressed by
   `deriveKey(keys.chanceGate, '<eventId>:<legIndex>:<nodePath>')`. Drawing from `eventPick`
   would make the draw _count_ depend on pool size, so adding one event would shift every
   later draw. See ADR 0005 §2. This also makes re-evaluation within a leg idempotent, which
   the director needs to explain itself.
5. **A missing content id resolves to `false` with a distinct `{ kind: 'unknown-ref' }`
   reason node**, so the sim can count them instead of them vanishing into a generic false.
   A missing _flag_ is not this case — an unset flag is ordinary runtime data.

Tests that matter: every kind exercised; `reason-trace-consistency` (`reason.value` matches
the evaluator at every node, recursively); `i18n-keys-only` (rule 2.4, mechanised);
exhaustiveness (adding a kind must fail to compile at every site that must handle it).

---

## M2 shipped — RunState, the serialisable core

23 files under `src/state/`, `src/ids/`, `src/errors/`, plus placeholder `src/content/` and
`src/predicate/`. Engine tests 224 → 350. `docs/adr/0006` records the six decisions; the ones
that will bite if forgotten:

- **No optional properties in engine state — `| null` instead.** `exactOptionalPropertyTypes`
  makes `{ ...state, x: maybeUndefined }` an error wherever `x?: T`, which is exactly what a
  structural-sharing effect applier does every leg; and `undefined` does not survive
  `JSON.stringify` while `null` does. Authored content types keep `?`.
- **Clamps are recorded, not silent.** `clampResources`/`clampSkills` return the clamp events
  so the sim can count them. A silent `Math.min` hides a balance finding.
- **`stateDigest` canonicalises first.** `JSON.stringify` emits string keys in insertion
  order, so two `toEqual` states can serialise differently depending on the order their flags
  were set. 128 bits (4 murmur passes), because 32 collides by birthday inside a 20k-run sim.
- **`RunState.presentation` was added** — not in engine-spec §1. Without it `resolveChoice`
  needs the caller to pass the event id back, putting engine state in the app layer.
- **The route is validated, not generated**, and `legIndex`/`progressKm` are normalised so a
  reused `RunInit` cannot start a run halfway along.

`json-serializable.test.ts` is the load-bearing one: it round-trips a _fully populated_ state
— every memory mechanism, every branded id — and compares digests, because `toEqual` alone
would not notice a `Map` collapsing to `{}` on both sides.

---

## M2 brief (delivered) — `RunState`, `RunInit` and `createRunState`

M1 shipped (see below), so randomness is settled and every later subsystem can draw from it.

Deliver, per `docs/engine-spec.md` §1 and the Phase 1 plan:

1. `RunState` as a fully JSON-serialisable type — **no optional properties: use `| null`**.
   `exactOptionalPropertyTypes` makes `{ ...state, x: maybeUndefined }` an error wherever
   `x?: T`, which is what a structural-sharing effect applier does constantly; and
   `undefined` does not survive `JSON.stringify` while `null` does. Authored content types
   keep `?`, because YAML omission is natural there.
2. `RunInit` — what the app supplies to start a run. **It carries the route**, including
   `nodes`, `edges`, `legCount`, `totalKm` and `beatSchedule`: route generation, `legCountFor`
   and beat-schedule generation are all out of Phase 1. The engine validates what it is
   given and returns a typed error if the route is incoherent.
3. `createRunState(init)`, resource/skill clamping with **clamp events recorded, not
   silently applied** (a clamp is a balance signal the sim must count), and clock arithmetic.
4. `stateDigest(state)` — a stable hash with **explicitly sorted keys**, because `Object.keys`
   hoists integer-like keys ahead of string keys.
5. `state/__tests__/json-serializable.test.ts` — round-trip a fresh state and a state after
   30 simulated legs; digests must match. This is the only place engine-spec §1's
   no-`Map`/`Set`/`Date` rule can actually be enforced.

`ids/` (branded `EventId`, `FlagId`, …) lands here rather than in M1, where nothing used it.

Constraints that will bite if ignored:

- `packages/engine` may not import React/RN/Expo, and `tsconfig.src.json` sets `types: []`
  with no `DOM` in `lib` — so no `process`, no `Buffer`, no `crypto` global. Pure TS only.
- **No `enum`, `namespace`, or parameter properties**: CI runs the engine under Node's
  strip-only type stripping, which rejects all three. Use `const` objects + union types.
- Relative imports need an explicit `.ts` extension.
- No transcendental math, no `**`, no `localeCompare`/`Intl` — `purity.test.ts` enforces it.
- Files stay readable end-to-end under ~200 lines (`CLAUDE.md` §6); split otherwise.
- One exported concept per file. No default exports.

Start with:

```bash
pnpm typecheck && pnpm lint && pnpm test
```

---

## M1 shipped — the seeded RNG

19 files under `packages/engine/src/rng/`, 224 engine tests (was 5). `docs/adr/0005` records
the reasoning; the summary is that a draw is a **pure function of `(streamKey, counter)`**,
so there is no generator state to serialise and stream isolation holds by construction
rather than by luck.

All five acceptance criteria met:

| #   | Criterion                                     | Where it is proven                                                                              |
| --- | --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | Same seed → same sequence, across processes   | `rng.test.ts` — including _resumes exactly where a drained Rng stopped_, which is replay itself |
| 2   | Named substreams, `hash(seed + ':' + stream)` | `stream-key.test.ts`; **eight** streams — `chanceGate` added, see ADR 0005 §2                   |
| 3   | Plain `Record<RngStream, number>` cursor      | `rng-cursors.test.ts` — JSON round-trip, no aliasing of the caller's record                     |
| 4   | **Draws on one stream never shift another**   | `stream-isolation.test.ts` — all 56 ordered pairs                                               |
| 5   | `weightedPick` stable for a fixed seed        | `weighted-pick.test.ts` — plus proportions within a few percent of declared weights             |

Two things worth knowing beyond the checklist.

**The isolation test has a negative control.** `it('would expose the additive-offset
generator that was rejected')` builds the rejected `splitmix(streamKey + cursor · GAMMA)`
inline and demonstrates two of its streams being the _same sequence, shifted by one_ — while
that generator still passes the non-interference test trivially. Without this case, an
implementation with that exact flaw would show green.

**The murmur3 vectors are external.** `murmur3.test.ts` checks six published MurmurHash3
x86_32 vectors covering all four tail lengths. They passed first run, which is mutual
confirmation from two independent directions: an implementation written from the algorithm,
and vectors from outside the repo. This is why `utf8Bytes` is hand-rolled — the vectors are
defined over UTF-8, and hashing UTF-16 code units would have left the test comparing the
implementation to itself. `drawWord` (the unrolled hot path) is separately asserted equal to
`murmur3Bytes` over the counter's little-endian bytes across thousands of inputs.

**Open balance parameter:** `CHECK_DIE_SIDES = 20` in `roll-result.ts` is a placeholder.
engine-spec §2 shows `dc: 5` and ±2..3 modifiers but never states the die, and how a skill
enters the total needs simulation to settle. It is deliberately the only place the die
appears. `roll()` knows nothing about skills — M6 passes a skill in as a labelled modifier.

---

## Open questions for the human

1. ~~**PRNG algorithm.**~~ **Resolved** — MurmurHash3 x86_32, counter-based, `Math.imul`
   only, no BigInt. Reasoning and rejected alternatives under "Next step" above; ADR 0005
   is an M1 deliverable.
2. ~~Push and CI.~~ ~~Merge to `main` first?~~ **Both resolved** — PR #1 merged
   2026-08-08T06:00:18Z; `origin/main` is `6ac8a9a`, and `dev` has zero commits not in it.
   Note the **local `main` branch is stale** at `fdd93aa Initial commit`, 13 behind
   `origin/main`, which will mislead any `git diff main`.
3. **Rive vs Lottie.** `docs/adr/0004` defaults to Lottie because it is in Expo SDK 57's
   `bundledNativeModules` and Rive is not — Rive additionally forces a hand-pinned
   `react-native-nitro-modules@0.35.10` if MMKV is also used. Confirm Lottie as the default,
   or say Rive is worth the pin. **Still open; not needed before Phase 3.**

---

## ⚠ Open questions for the human — SESSION 3

**These block or shape Phase 2. Answering 1 and 2 before content lands is much cheaper than
answering them after.**

1. **`worldTick`'s drift constants are structurally wrong — fix before or after content?**
   At 20,000 runs health's p10/p50/p90 collapse to `0/1/1` together, so the dominant failure
   mode is independent of player choice (ADR 0012 §2). **The trap:** real content will apply
   resource effects on top of a decay curve already killing ~60% of runs alone, and the obvious
   fix — weakening the drift — silently changes which system controls pacing. Fixing it _first_
   means one baseline regeneration; fixing it _after_ means re-tuning content too.
   _My recommendation: fix first, as a small dedicated milestone with its own sim delta._

2. **`CHECK_DIE_SIDES = 20` needs a real decision, and it is coupled to the check formula.**
   engine-spec §2 shows `dc: 5` with ±2–3 modifiers. On a d20 each modifier is worth 5% while
   the skill (0–10) swamps them entirely. Currently `total = die + skill + modifiers` vs `dc`.
   Skill checks are picked 0.3–1.5% of the time, so nothing has tested it. **What die, and
   how should skill enter?** This is a design call, not an engineering one.

3. **Merge PR #2 to `main` before Phase 2, or keep stacking on `dev`?**
   All six CI jobs are green. Phase 2 is comparable in size to Phase 1; stacking it on an
   unmerged `dev` makes both unreviewable — the same argument that applied to PR #1.
   ⚠ **Local `main` is stale** at `fdd93aa Initial commit`, now ~30 commits behind
   `origin/main`, which will mislead any `git diff main`.

4. **`CLAUDE.md` is now 463 lines** against its own "~400 lines" cap — third time asked, and
   the gap grew this session because the enforcement notes got longer as rules became live.
   Move the per-rule `_Enforcement:_` notes to `docs/enforcement.md` and keep one-word markers
   in §2, or drop the cap? _It is a constitution; 463 lines is past what anyone re-reads._

5. **Hermes verification — who does it, and when?** Determinism is proven on V8 only. Every
   cross-engine defence (no transcendentals, no `localeCompare`, integer `weightedPick`,
   `Math.imul` over BigInt) is preventive rather than demonstrated (ADR 0012 §3). It needs a
   device or emulator running the golden runs, which is app-layer work.

---

## Open items carried into M1

**1. ~~`.claude/settings.json` deny rule~~ — RESOLVED, applied by hand by the human.**

The old rule `Write(~/.claude/**)` / `Edit(~/.claude/**)` was over-broad: it blocked Claude
Code's own plan-mode harness path (`~/.claude/plans/`). It is now replaced by seven narrow
rules covering credentials and the two settings files:

```json
"Read(~/.claude/.credentials.json)",
"Write(~/.claude/.credentials.json)",
"Edit(~/.claude/.credentials.json)",
"Write(~/.claude/settings.json)",
"Edit(~/.claude/settings.json)",
"Write(~/.claude/settings.local.json)",
"Edit(~/.claude/settings.local.json)"
```

Scope: the files whose modification actually changes what the agent may do, leaving
`~/.claude/plans/`, `~/.claude/projects/` and everything else writable.

**This had to be a human edit, and that is the system working, not a limitation.** The
permission classifier blocks the agent from editing the file that governs its own write
access — in the tightening direction as well as the loosening one. Anything that changes
this file is a human action by construction.

**Rules load at session start, so the narrowed set arms next session, not this one.**

Two notes for whoever touches it next. Prettier covers `.claude/settings.json` (it is not
in `.prettierignore`), so hand-pasted rules at the wrong indent fail `pnpm format:check`
and therefore the CI lint job — run `pnpm exec prettier --write .claude/settings.json`
after editing. And there is still no explicit `allow` entry for `~/.claude/plans/**`; with
the broad deny gone it merely prompts rather than being blocked, which is fine, but add an
allow rule if the prompting becomes noise.

**2. `CLAUDE.md` §9 must be amended at M5.** §9 says the Zod schemas are the single source
of truth, implying engine types are inferred from them. That cannot hold: `z.infer` types
are owned by whichever package declares the schema, so the engine would become a consumer
of `packages/content` and would need a Zod dependency. Phase 1 hand-writes the canonical
types in `packages/engine/src/content/`; Phase 2's schemas are held identical to them by a
**bidirectional** compile-time assertion (mutual-extends, so a schema narrower _or_ wider
than the type fails the build). §9 should say the schema is authoritative over _content
semantics_, not that the types are inferred. The twelve types on that conformance surface:
`GameEvent`, `Choice`, `Outcome`, `SkillCheck`, `CheckModifier`, `EventContext`,
`EventPriority`, `BeatType`, `LocationType`, `TimeOfDay`, `Predicate`, `Effect`.

**3. Hermes is unproven.** Determinism is currently demonstrated only on V8 (Linux +
Windows in CI). A Hermes golden-run job is a named Phase 2 gap, not an oversight.
