# Phase 3 verification — geography, routes, and the distance-band sweep

> **Measured at `dev` / HEAD `8effe2f`** (the wear curve, `FULL_UNTIL = 200`, `SAVE_VERSION` 6).
> Any completion figure taken before `8effe2f` is stale and does not appear here.
>
> This file is a **measurement record**, not a specification. Where it disagrees with
> `docs/engine-spec.md` about what the engine does, the spec is right and this is stale.
> Where it disagrees with `docs/sim-baseline-corpus.md` about balance, the baseline is right —
> the band sweep here is a **different sample** (12 generated routes, not the 25-route corpus
> grid) and is not a rebaselining of anything.
>
> **§8 FINDINGS is the part to read if you read one part.** Four failures are recorded there.
> None of them is softened into a caveat.
>
> **RE-MEASURED AT C2 (the two-directional diversity filter), and that is why this file moved.**
> `docs/phase-3-dod.md` gate 6 says a red gate whose numbers have MOVED is abandoned rather than
> handed off, and requires the new figures to land here in the same commit. C2 moved two of the
> three handed-off items, so every figure below that depends on `acceptByDiversity` or on the
> illicit sweep has been re-measured from `pnpm geo:verify` and `pnpm geo:diversity` on the C2 tree.
>
> **One finding is now CLOSED and it is marked closed, not deleted.** Finding 1's filter half —
> Valencia–Palermo — was the only genuine `acceptByDiversity` failure in the twelve and C2 fixed it.
> The structural half survives and always will. Keeping both is the point: `floorPercent` was built
> to make the difference between a structural breach and a filter breach measurable, and a record
> that erased the filter breach once it was fixed would have erased the evidence that the
> distinction works.
>
> **Milliseconds in §5 are NOT re-measured, by the same gate's instruction.** They move on every
> run; what §5 hands off is the verdict per statistic and the attribution. C2's effect on them is
> stated as a verdict-preserving regression, not as a new table.

---

## 0. Scope, provenance, and the state of the tree

Two halves, run against the same HEAD, sharing no code:

| Half    | What it measured                                                       | Where the code is                          |
| ------- | ---------------------------------------------------------------------- | ------------------------------------------ |
| **Geo** | Items 1–4: named pairs, route table, diversity, pathologies, benchmark | `packages/tools/geo-build/` (extended)     |
| **Sim** | Item 5: the distance-band sweep through the corpus                     | scratchpad harnesses only, zero repo files |

**The geo half EXTENDED `pnpm geo:verify`. It did not build a parallel reporter.** Files touched:

- NEW `packages/tools/geo-build/route-structure.ts` — forced edges, structural floor, endpoint degree, cause classifier
- NEW `packages/tools/geo-build/__tests__/route-structure.test.ts` — 17 tests
- MOD `packages/tools/geo-build/verify-routes.ts` — `PairReport` gains `fromDegree`/`toDegree`/`floorPercent`/`cause`; new `previewsFor`, `illicitCashDominates`
- MOD `packages/tools/geo-build/report-verify.ts` — sections 1, 1b, 2, 2b, 4, 5
- MOD `packages/tools/geo-build/__tests__/verify-routes.test.ts` — 6 tests added

**Tree state, declared rather than glossed.** The session opened on `dev` at `8effe2f` with a
clean tree. It ends at `8effe2f` with the five files above modified or untracked. That is this
verification's own geo deliverable, not a divergence from the stated baseline. The sim half
created zero repo files; every one of its harnesses lives in the scratchpad and imports the
shipped engine, loader and sim by absolute path, so the concurrent geo edits cannot have moved
a single sim number.

**Nothing here is committed.**

### Re-running it

```bash
pnpm geo:verify        # items 1-4: the route table, diversity, pathologies, benchmark
pnpm geo:diversity     # the median gate on its own (still exits 0)
```

Item 5's sweep is scratchpad-only and reproduces from three constants: endpoint sampling
`mulberry32(0x0d155ee1)`, routes from `generateRoutes(graph, a, b, 'band-sweep:m3.12')`, run
seeds `bandsweep:<band>:<i>`.

---

## 1. Item 1 — the named pairs, and the constraint they were chosen under

### The ten were NOT re-picked

`NAMED_PAIRS` is already chosen under a stated, argued constraint: **one pair per disjoint
distance band; 20 distinct endpoints; ≥3 hops on the first route; within a band, the first
admissible pair from a fixed stride offset, RNG-free.** Re-ranking them would have been the
fourth attempt at the same list and would have destroyed the evidence the previous three
produced.

**Chongjin–Jeju City and Palermo–Riyadh were deliberately KEPT.** Those are the degree-1 rows.
Removing them makes §3 read PASS — which is exactly how Barcelona–Zaragoza was handled before,
and it selects the finding away. They are kept and diagnosed in place.

### What was added instead: `KIND_PAIRS`

The ten were audited against the five named route kinds. Three fell out already; two did not,
so two supplementary rows were added rather than a caveat written.

| Kind               | Covered by              | Evidence                                              |
| ------------------ | ----------------------- | ----------------------------------------------------- |
| short, border-free | Ankara–Canakkale        | 778 km, 0 crossings on **every** route (1 of 12 rows) |
| long continental   | Tianshui–Toulouse       | 17,698 km                                             |
| needs a ferry      | Palermo–Riyadh          | 2 of 12 rows ferry on **every** route                 |
| 4+ borders         | Molde–Montana           | 4 of 12 rows, up to 11 crossings                      |
| no legal route     | **NONE — cannot exist** | see §4(a)                                             |

Every one of the ten banded pairs crosses ≥1 border, because the band constraint pairs nodes
half the settlement list apart. Ankara–Canakkale (border-free) and Valencia–Palermo
(ferry-forced) close the two gaps.

### Terminology, per CLAUDE.md §11

The column is **border-free**, not "domestic". What is mechanically checkable is the count of
`border_crossing` **nodes** on a route. No geo file carries a country code, so no column can say
which country a route stays inside, and none tries to.

---

## 2. Item 2 — the route table

First returned route per pair. `rts` and `ovlp` are properties of the whole candidate set, not
of the first route.

| pair                     | band                |     km | hops | legs | mtg | days | cash | mode  | brdr | fry | toll | hard | rts | ovlp | rung |
| ------------------------ | ------------------- | -----: | ---: | ---: | --: | ---: | ---: | ----- | ---: | --: | ---: | ---: | --: | ---: | ---: |
| Marand–Mosul             | 250–500             |    466 |    3 |   15 |   0 |  2.5 |  316 | car   |    1 |   0 |    0 |    2 |   5 |  50% |    1 |
| Belgrade–Burgas          | 500–1,000           |    950 |    4 |   20 |   0 |  2.4 |  394 | train |    1 |   0 |    0 |    4 |   5 |  59% |    1 |
| Chongjin–Jeju City       | 1,000–2,000         |  1,391 |    4 |   22 |   0 |  2.6 |  466 | train |    1 |   0 |    0 |    4 |   5 |  80% |    2 |
| Guangyuan–Monywa         | 2,000–3,000         |  2,754 |    7 |   22 |   0 |  5.3 |  685 | car   |    1 |   0 |    0 |    4 |   4 |  70% |    0 |
| Kampala–Kinshasa         | 3,000–4,500         |  3,016 |    5 |   23 |   0 |  5.7 |  830 | car   |    2 |   0 |    0 |    4 |   3 |  43% |    0 |
| Lampang–Mianwali         | 4,500–6,000         |  4,807 |   14 |   30 |   1 |  7.9 | 1222 | car   |    3 |   0 |    0 |    4 |   3 |  39% |    0 |
| Molde–Montana            | 6,000–8,000         |  7,345 |   20 |   32 |   2 |  9.8 | 1941 | car   |    6 |   0 |    0 |    4 |   3 |  25% |    0 |
| Palermo–Riyadh           | 8,000–10,000        |  9,787 |   35 |   45 |   3 |  8.9 | 2852 | train |   11 |   4 |    1 |    4 |   3 |  69% |    1 |
| Sambalpur–Slavonski Brod | 10,000–13,000       | 10,333 |   32 |   48 |   8 |  9.1 | 2527 | train |    7 |   0 |    1 |    4 |   4 |  54% |    0 |
| Tianshui–Toulouse        | 13,000+             | 17,698 |   46 |   48 |   9 | 13.2 | 4023 | train |   10 |   0 |    0 |    4 |   5 |  60% |    0 |
| Ankara–Canakkale         | _kind: border-free_ |    778 |    3 |   18 |   0 |  3.8 |  263 | car   |    0 |   0 |    1 |    1 |   5 |  68% |    1 |
| Valencia–Palermo         | _kind: ferry_       |  2,414 |    9 |   22 |   0 |  5.0 |  837 | car   |    3 |   4 |    0 |    4 |   3 |  63% |    1 |

Two rows sit on the 48-leg cap (Sambalpur, Tianshui) — exercised, not saturated.

### What moved in this table since it was first written, and who moved it

- **`days`, every row — C1, not C2.** `5de121b` made the leg jitter symmetric, so `travelHours`
  dropped by `ceil(legCount / 2)` on every route. C1 did not update this file; the sweep for gate 6
  caught it. Nothing else in the ten printed rows moved: `km`, `hops`, `legs`, `mtg`, `cash`,
  `mode`, `brdr`, `fry`, `toll` and `hard` all still reproduce byte-for-byte off `pnpm geo:verify`.
- **Chongjin–Jeju City `rung` 1 → 2, and Valencia–Palermo `rts` 4 → 3 with `ovlp` 85% → 63% — C2.**
  §3 is where both are explained.
- **THE TWO `KIND_PAIRS` ROWS WERE WRONG AND NOBODY COULD HAVE NOTICED.** `geo:verify` prints the
  ten banded pairs in its own section 1 table and does **not** print Ankara–Canakkale or
  Valencia–Palermo there, so those two rows were hand-carried and never re-checked against the
  command. Re-derived here through the exact calls the header below names — `previewsFor(...)[0]`
  and `factsFor` — which were first validated by reproducing all ten printed rows exactly. Ankara
  moves `legs` 15 → 18, `days` 2.3 → 3.8, `cash` 232 → 263, `toll` 0 → 1, `hard` 2 → 1; Valencia
  moves `mtg` 1 → 0, `cash` 1006 → 837, `mode` train → car, `brdr` 4 → 3. **None of that is C1's or
  C2's**: neither touched `legCount`, `recommendedCash` or the geo artifacts, and C2 provably left
  Ankara's accepted set identical (`fastest` 778, `cheapest` 769, then 1,198 / 1,426 / 1,528 under
  both filters). The rows were transcription drift, and the mechanism that hid them is that a row
  the gate does not print is a row the gate cannot check.

### The four columns that did not exist, and how each was derived

- **legs / montage legs — REAL.** `preview.legCount` / `montageLegCount`. The file header claiming
  these were unmeasurable was six milestones stale: `leg-plan`, `route-preview`,
  `materialise-route` and `generate-routes` all shipped M3.7–M3.10. Read via `generateRoutes`, the
  same call `sim/load-pack.ts` makes (ADR 0034), so there is no second copy to drift. Verified
  seed-independent: `materialiseRoute` computes `segments` and `plan` **before** the seed is used;
  the seed reaches only `deriveBeatSchedule`.
- **days — DERIVED and labelled advisory.** `travelHours / 24`. Expected in-game travel time at
  the starting mode including `worldTick` jitter, counting **no** time spent in events. It is not
  the length of a run.
- **cost — `recommendedCash`,** the preparation budget. A run STARTS at 130% of it.
- **RISK — REFUSED, NOT PRODUCED.** No risk field exists on `RoutePreview`, `GeoNode` or
  `GeoEdge`, and §11 forbids deriving one from place identity. The physical facts a risk band
  would have to be built from are printed instead — `brdr` (controlled crossings), `hard`
  (hardest `terrainDifficulty`, 0–4), `fry`, `toll`, and the profile. **Compressing them into one
  scalar is a design decision with no owner.** `hard` is new.

---

## 3. Item 3 — route diversity. **VERDICT: FAIL**

**1 of 12 pairs exceeds the 70% ceiling — 1 structural, 0 filter. Worst seen 80%.** Re-measured on
the C2 tree; it read **2 of 12, worst 85%** when this section was written, and the row that left is
the filter one.

| pair                     | rts | worst | floor | deg | rung | verdict               |
| ------------------------ | --: | ----: | ----: | --- | ---: | --------------------- |
| Marand–Mosul             |   5 |   50% |    0% | 4,5 |    1 | PASS                  |
| Belgrade–Burgas          |   5 |   59% |    0% | 7,4 |    1 | PASS                  |
| **Chongjin–Jeju City**   |   5 |   80% |   71% | 4,1 |    2 | **FAIL — STRUCTURAL** |
| Guangyuan–Monywa         |   4 |   70% |    0% | 7,4 |    0 | PASS                  |
| Kampala–Kinshasa         |   3 |   43% |    0% | 5,6 |    0 | PASS                  |
| Lampang–Mianwali         |   3 |   39% |   18% | 5,5 |    0 | PASS                  |
| Molde–Montana            |   3 |   25% |    0% | 3,6 |    0 | PASS                  |
| Palermo–Riyadh           |   3 |   69% |   15% | 1,7 |    1 | PASS                  |
| Sambalpur–Slavonski Brod |   4 |   54% |    0% | 5,5 |    0 | PASS                  |
| Tianshui–Toulouse        |   5 |   60% |    0% | 6,5 |    0 | PASS                  |
| Ankara–Canakkale         |   5 |   68% |    0% | 4,3 |    1 | PASS                  |
| Valencia–Palermo         |   3 |   63% |   34% | 4,1 |    1 | PASS — _was_ 4 / 85%  |

### Structural vs real is now MEASURED, not asserted

New metric **`floor`** = the combined distance of the edges present in **every** returned route,
as a share of the **shortest** returned route. That is a hard lower bound on the worst symmetric
pairwise overlap: the shortest route spends that share of itself on ground every alternative also
covers. Normalised by the shortest deliberately, because `overlapPercent` normalises by the
candidate's own length, so the shortest route is where forced edges have least distance to dilute
them. **`floor` > ceiling ⇒ no filter could have passed the pair.**

**Chongjin–Jeju City, 80%, STRUCTURAL — confirmed by measurement, not repetition.** Three edges
totalling 1,000 km appear in all five routes. Shortest route 1,391 km ⇒ floor **71%**, already
past the ceiling before any filtering runs. Jeju City is degree-1 and its sole edge is 630 km of
that 1,000; the other 370 km is the neck out of Chongjin. Full matrix: route[0] reads 71% against
every one of the other four, so it cannot pass. The 80% cell is `safest` (1,724 km) against a
2,573 km Yen backfill — measured directly at 80% one way and 53% the other.

**It now resolves at rung 2 rather than rung 1, and that is C2's price rather than C2 failing.**
Under the two-directional filter a threshold of 70 admits **one** route here — the 1,391 km
`fastest`, after which every remaining candidate is rejected because that first route sits 71%
inside it — so the ladder relaxes to 80 and the pair is admitted at exactly 80. The 71% floor means
no threshold at or below 70 could ever have passed it, so escalating is the ladder doing its job on
an impossible pair. What escalation costs is Yen, and Yen is ~95% of `selectPaths`; §5 is where
that lands.

**The returned set changed even though the 80% did not.** It used to be 1,391 / 1,724 / 2,573 /
2,690 / **9,068** km — a 6.5× detour offered as a choice. At rung 2 it is 1,391 / 1,724 / 2,573 /
2,690 / **2,944**, because the five slots fill before the search reaches the 9,068 km route. The
9,068 km route is still in the pool and nothing bounds how far a backfill may stray; one pair
stopped displaying it. That is a display accident, not a fix — §4's detour tail is still open.

### The framing has to be corrected: degree-1 is the CAUSE, not the TEST

**Palermo–Riyadh is the control that disproves the simple rule.** Also degree-1, also a forced
unavoidable ferry — and it **PASSES at 69%**, because 1,525 km of forced edge is only 15% of a
9,787 km journey. A degree-1 endpoint breaks diversity **in proportion to how much of the route it
forces**. That is why the floor is the verdict and the degree is context.

### Valencia–Palermo, 85%, a GENUINE filter failure — **FOUND HERE, CLOSED BY C2**

**What the finding was.** Surfaced by the supplementary ferry row. Same degree-1 island as
Chongjin — but floor only **34%**. Two thirds of the route was free to vary and the filter returned
85% anyway. Nothing structural forced it. This was the only real diversity-filter failure in the
twelve, and the mechanism was a directional defect: `acceptByDiversity` tested each new candidate
against the union of what was **already** accepted, normalised by the CANDIDATE's own length, and
never re-tested an earlier route against a later one.

**What closed it.** C2 added a reverse pass — pairwise per accepted route — so the filter now bounds
`max(overlap(a,b), overlap(b,a))` over every accepted pair, which is exactly the quantity the
`worst` column above reports. ADR 0025 Decision 5 carries the amendment. The pair now reads **63% on
three routes and PASSES**, and an independent enumeration over the whole 692-node slice — 1,498
pairs, 5,498 accepted routes — finds **0 post-condition breaches**. The same enumeration under the
pre-C2 filter breaches on **386 of those 1,498 pairs** (900 ordered route-pairs, worst 96% against
its own rung's threshold). C2's own run reported 388; the two-pair gap is the harness that stands in
for the old ladder, not the filter, and is recorded rather than smoothed. **What it cost is 72
routes of 5,570 — 1.3%** — spread as one fewer alternative on some pairs, not as a pair losing its
minimum.

**The new three are not the old four minus one, and the difference is the whole mechanism.** Old
accepted set: `fastest` 2,414 / `scenic` 3,579 / `fastest`+Yen 2,819 / `safest`+Yen 3,975. New:
`fastest` 2,414 / `fastest`+Yen 2,819 / `scenic`+Yen 3,737. **The 85% cell was the FIRST route
sitting inside the FOURTH** — 2,414 km is 85% inside the 3,975 km backfill, a number nothing ever
computed because the backfill arrived after it. So the route being swallowed was route 1, the
swallower was route 4, and it is the swallower that the reverse check now rejects. Two of the old
four are gone (3,579 at 71% and 3,975 at 85%, both caught in reverse) and one route the old filter
never reached — 3,737 — takes a slot in their place.

**Why this row is kept rather than deleted.** `floorPercent` exists to tell a structural breach from
a filter breach. Valencia–Palermo is the only case on record where the classifier said "filter", the
filter was then fixed, and the row moved to PASS — while Chongjin–Jeju City, classified
"structural", did not move and cannot. That pairing is the evidence the metric works, and it is only
legible if both halves stay on the page.

### The median gate passes, and the tail is still the problem

`pnpm geo:diversity` exits 0 at median **53%** (n = 747, p10 12%). Its **p90 is 87%.** Re-measured
post-C2; it read median 54% (n = 755) with p90 88% before. The median barely moved, which is the
point `docs/phase-3-dod.md` §7 makes: **the median was never the instrument that could see this.**

**And the p90 was never going to move much either, because it is not the post-condition.**
`geo:diversity` measures each accepted route against the **union of all the others**, which is a
strictly stronger quantity than what C2 guarantees: the union is a superset of every pairwise edge
set, so overlap-against-the-union is never smaller than the worst pairwise overlap. A route can sit
87% inside the union of four others while being under 70% against each one individually — that is
the 45%-plus-45% case, and it is a diversity observation rather than a breach. **The two numbers to
keep apart are therefore:** the per-pair guarantee, which the system now DOES make and which the
enumeration above verified at 0 breaches; and this union statistic, which nothing bounds and which
still has a fat tail.

What is genuinely weaker than the flat claim is the threshold: the guarantee is against **the rung
the pair was accepted at**, not a flat 70%. On the 200-pair sample the ladder reaches rung 2 on 19
pairs and rung 3 on 21, so **40 of 200 pairs are held to 80% or 90% rather than to 70%** — and
Chongjin–Jeju City is one of them by structural necessity.

### 3a. Endpoint degrees — all 20, plus the slice

| endpoint    |   deg | endpoint       |   deg |
| ----------- | ----: | -------------- | ----: |
| Marand      |     4 | Mosul          |     5 |
| Belgrade    |     7 | Burgas         |     4 |
| Chongjin    |     4 | **Jeju City**  | **1** |
| Guangyuan   |     7 | Monywa         |     4 |
| Kampala     |     5 | Kinshasa       |     6 |
| Lampang     |     5 | Mianwali       |     5 |
| Molde       |     3 | Montana        |     6 |
| **Palermo** | **1** | Riyadh         |     7 |
| Sambalpur   |     5 | Slavonski Brod |     5 |
| Tianshui    |     6 | Toulouse       |     5 |

2 of 20 are degree-1. Across the whole slice **19 of 411 settlements are degree-1**; mean
settlement degree 4.55. Full list: Ca Mau, Taipei, Shanghai, Qinhuangdao, Busan, Jeju City,
Magadan, Bissau, Nouadhibou, Palermo, Viborg, Athens, Muscat, Dubai, Brest, Sassari, Bari,
Laascaanood, Benghazi. **Every one is a latent §3 failure waiting for a short enough partner.**

---

## 4. Item 4 — the pathology sweep

Stride sample, 410 pairs, settlements only (border posts excluded — no journey starts at one).

### (a) UNREACHABLE — 0, and structurally so

The shipped graph is **one connected component of 692 nodes**, verified directly rather than
inferred from the 410-pair sample finding zero. ADR 0036 permits several (one per landmass) and
`--stage=all` refuses to write a fragment below `MIN_LANDMASS_NODES`, so an unroutable pair cannot
be produced by the build at all. This is why §1's "no legal route" kind cannot be supplied.

**The nearest real thing is a PROFILE-level refusal.** Palermo–Riyadh and Valencia–Palermo both
refuse `illicit` at rung 0, and the reason is exact: the only edge out of Palermo is a ferry, and
`illicit` masks ferry and train as ticketed. That is a genuine "no legal route for this way of
travelling".

### (b) ONLY ONE ROUTE — 0 of 410

### (c) ILLICIT STRICTLY DOMINATES — **139 of 410 = 33.9%. CONFIRMED.**

Re-measured post-C2; it read **142 of 410 = 34.6%** before. Three pairs left the set, and the cause
is the same escalation §3 describes: dominance is measured against the routes `selectPaths`
RETURNS, so a pair whose returned set changed can change verdict without any cost function moving.
**The finding is unmoved in every way that matters** — a third of the graph, the same ten exemplars
printed by the report, and `Durban → El Bayadh` still at 0 crossings against 32.

(An illicit route is returned at all on 377 of 410, so the rate among pairs that have one is 37%.)

**What "strictly better" is measured on.** `verifyPair` tests three **geometric** facts about the
path: illicit is shorter than every other returned route, crosses no more borders, and crosses no
harder ground. It is **not** a claim about the cost function, and §4 of the report previously
printed it as though it were.

That metric was expected to be near-tautological — `illicit`'s cost is `distanceKm / 5` plus
crossing and population penalties, so it is close to a distance-minimiser that dodges border
posts, which is what two of the three tests reward. **So preparation cost was added and measured.
The hypothesis was WRONG, and the measurement is reported, not the hypothesis:**

| test                                | result                             | before C2        |
| ----------------------------------- | ---------------------------------- | ---------------- |
| geometric dominance                 | 139 of 410 (34%)                   | 142 of 410 (35%) |
| **also cheapest to prepare**        | 133 of 410 (32%) — **96% survive** | 137 of 410 (33%) |
| illicit distance ÷ best alternative | mean 0.825, median 0.865           | 0.827 / 0.870    |
| controlled crossings AVOIDED        | mean 16.4, median 14               | unmoved          |

**96% of the dominant set survives the cash test on both sides of C2**, which is the number the
hypothesis was tested against, and it did not move by a single point.

**The crossing count is the whole story.** `recommendedCash` charges 45 per crossing; a dominant
illicit route avoids a median of 14 (~630 cash), swamping the 125%-vs-85% `PROFILE_COST` handicap.
The same avoidance is why it is shorter: the other four profiles are masked out of crossing a
boundary except at a crossing node, so they detour to reach one, while `illicit` walks over for a
flat +150. Durban→El Bayadh: **0 crossings against 32, 12,580 km against 20,851.**

**Verdict: the finding is FIRMER than "an artefact of the metric" — it survives the only other
generation-time number that exists.** The narrow, defensible statement is: **at generation time
the illicit route has no visible downside on a third of pairs.** Everything it gives up
(`vehicleLegal: false`, no train or ferry, attention) is paid at RUN time in content and is not a
field on `RoutePreview`. Whether that trade is fair is a `sim --pack=corpus` question, not a geo
one.

**Second-order, and checkable here:** `borderBeats = min(crossings, 4)`, so a 0-crossing illicit
route schedules **zero** border beats — deleting most authored content on the way past. That is a
content-reachability problem, not only a balance one, and §6.4 measures it from the other side.

### (d) Bonus pathology — the rung-0 refusals

126 of 410 pairs refuse `fastest`/`cheapest`/`safest` at rung 0. Cause isolated by relaxing masks
one at a time: relaxing **season** alone takes fastest/cheapest 126 → 0; `safest` needs season +
terrain, then also 0. The entire effect comes from **38 `winter_closed` edges of 1,215 (3%), none
flagged `unavoidable`.**

The cost is **diversity, not reachability**: the ladder reaches rung 4 on only 6 of 200 pairs (5
before C2), so on 31% of pairs the pool is built from `scenic`, `illicit` and Yen backfill rather
than five profiles. `mark-unavoidable.ts` exists and has evidently set the flag on none of the 38.

---

## 5. Item 4b — the performance benchmark. **VERDICT: FAIL at p90 and max**

692 nodes / 1,215 edges, 200 pairs, Node v26 / V8.

> **THE MILLISECONDS BELOW ARE ONE SAMPLE AND ARE NOT RE-MEASURED HERE, BY INSTRUCTION.**
> `docs/phase-3-dod.md` gate 6 carves this item out of its own re-measure rule precisely because it
> is a wall-clock reading: run `pnpm geo:verify` twice on an unchanged tree and it moves. What this
> section hands to Phase 4 is the **verdict per statistic**, the **attribution**, and the
> break-even multipliers to about one decimal. Reprinting a fresh table every commit would dress
> the clock up as a finding.
>
> **C2's effect on it is real and is stated as a verdict-preserving regression.** The
> two-directional filter pushes pairs up the rung ladder, escalation means more Yen, and Yen is
> ~95% of the call. Over repeated runs the **mean moved ~11.9 ms → ~13.3 ms, bands not
> overlapping** — about 11.6%. p50 moved ~6%, p90 ~3%, max not at all. **No verdict changed: PASS at
> mean, PASS at p50, FAIL at p90, FAIL at max, exactly as below.** The break-even multipliers slide
> with the clock — mean's sat at 12.9× and now reads ~11.3× — but they slide inside their own
> run-to-run noise and none of them crosses a defensible phone multiplier in either direction.
> ADR 0025 records the regression as accepted: a diversity guarantee the report can contradict is
> not a guarantee.

| Node/V8 per call    |  mean |  p50 |   p90 |    max |
| ------------------- | ----: | ---: | ----: | -----: |
| `selectPaths` total | 11.63 | 0.91 | 42.11 | 122.95 |
| — 5× Dijkstra       |  0.63 | 0.60 |  1.16 |   1.24 |
| — Yen + filter      | 11.00 | 0.01 | 40.95 | 122.35 |

Against the 150 ms budget at the 6× phone multiplier:

| statistic | Node ms | phone ms | verdict  | flips at multiplier |
| --------- | ------: | -------: | -------- | ------------------: |
| mean      |   11.63 |     69.8 | PASS     |              12.90× |
| p50       |    0.91 |      5.5 | PASS     |             165.11× |
| **p90**   |   42.11 |    252.7 | **FAIL** |               3.56× |
| **max**   |  122.95 |    737.7 | **FAIL** |               1.22× |

### Attribution — instrumented, not asserted

Dijkstra is 5% of the call. ~95% is Yen backfill. The "Yen scales with hop count" claim was
previously asserted; hop count was recorded per sample and banded:

| hops  | pairs | mean ms | max ms | ms/hop |
| ----- | ----: | ------: | -----: | -----: |
| 0–9   |    25 |    1.91 |   6.04 |  0.280 |
| 10–19 |    40 |    1.62 |  18.86 |  0.115 |
| 20–29 |    34 |    6.67 |  43.17 |  0.280 |
| 30–39 |    43 |   12.83 |  86.47 |  0.377 |
| 40+   |    58 |   24.73 | 122.95 |  0.511 |

**ms/hop roughly quadruples from the 10–19 band to 40+**, so cost is super-linear in hops: each
extra hop adds a spur Dijkstra **and** every spur Dijkstra runs a longer path. The 0–9 row is
**not** part of the trend (25 pairs at sub-millisecond totals where fixed call overhead dominates);
read the four bands from 10 hops up. This is the confirmed mechanism for hops going 19 → 59 with
the continental slice.

### 5a. The 6× multiplier — kept, and made non-load-bearing

**The stated basis:** a mid-range phone under Hermes runs allocation-light integer work ~4–8×
slower than desktop V8; 6 is the middle.

**Why that is weaker than it looks, stated plainly:**

- Nothing in this repo has ever run on a phone. ADR 0012 records Hermes as **untested**; the
  determinism guarantees are proven on V8 only.
- Worse for this specific number: **Hermes has no JIT** in its default configuration, while the
  4–8× band is drawn from JIT-ed interpreter comparisons. The tight integer loops in Dijkstra and
  Yen are exactly the code a JIT helps most, so **6× is as likely optimistic as pessimistic.**
  There is no evidence either way.

**So the verdict was made independent of it,** via the break-even column above. `max` fits the
budget only at ≤1.22× — not a mid-range phone, that is a faster laptop. `p90` only at ≤3.56×,
below the bottom of any defensible range. **p90 and max FAIL at 4×, at 6× and at 8× alike; mean
and p50 PASS at all three.** Choosing 6 rather than 4 or 8 changes no PASS and no FAIL.

**What would replace it:** run `selectPaths` over these same 200 pairs inside the Expo app on a
real device and read the ratio off. That needs the app shell, which does not exist (Steps 1, 3 and
4 are not built). Until then the row is an assumption with a stated basis, labelled as one.

**The budget was NOT raised.**

> **THIS SECTION PROPOSED A FIX AND THE FIX WAS REFUTED. Built, swept, measured, reverted.**
> It read: "bound `kShortestPaths`' stray ratio relative to the shortest path … the pairs that blow
> the budget are exactly the pairs where it strays furthest … One change, three findings closed."
> All three claims are false, and the bound is not in the tree. See §11.
>
> The mechanism was implemented as a genuine PRUNE (a `maxCost` ceiling consumed inside the spur
> Dijkstra, so over-budget work is never done rather than done and discarded) and swept at
> 1.10× / 1.25× / 1.50× / 2.00× / 3.00× against an unbounded control that reproduced every
> committed statistic byte-for-byte.
>
> **p90 and max FAIL at every ratio, including 1.10×.** p90 must shed 41.8% of the work and max
> 80.4%; the most the mechanism removes without also removing the routes is 7.5%. The saving is a
> cliff — 88.4% of the work survives at 1.05× and 18.8% at 1.00×, and 1.00× returns 0.82 paths per
> call against 4.91, which is route generation switched off rather than bounded.
>
> **Why the attribution misled me.** Yen is ~95% of the call, but it runs one Dijkstra _per spur
> node along the path_, so its cost scales with HOP COUNT. Bounding how far each spur may stray
> does not reduce how MANY spur searches run. Hops went 19 → 59 with the continental slice; that is
> the driver, and a cost ceiling is the wrong axis to bound.

---

## 6. Item 5 — the distance-band sweep

`--pack=corpus` (13 events, 137 modifiers, 25 complications, 15 universal choices). **5,000 runs
per route, 60,000 total.** `runOne` from `packages/tools/sim/run-one.ts`, unmodified. Zero errored
runs and zero `MAX_TURNS` cap hits.

### 6.1 The selection constraint

**Twelve geometric distance bands from 300 km to 13,000 km**, ratio `r = (13000/300)^(1/12) =
1.369`. Geometric, not linear, because leg count is deliberately sub-linear in distance
(`COMPRESSION_BANDS` plus the `minLegs`/`maxLegs` ramp in `leg-plan.ts`), so equal _ratios_ of
distance are roughly equal steps of leg count. Linear bands would have put nine of twelve routes
in the 22–48-leg saturation zone.

One route per band, under five constraints:

1. **Settlement endpoints only** (`city`/`town`), never a `border_crossing` node. A crossing is
   typed, never named (§11); it is not a place a player picks as an origin.
2. **Both endpoints degree ≥ 2.** The direct tie-in to §3: a degree-1 endpoint forces every
   candidate through one edge. **19 of 403 settlements are degree-1** and were excluded; the pool
   is 384. This stops the twelve rows measuring a graph artefact.
3. **No city is an endpoint of more than one of the twelve.** This repo has shipped the opposite
   mistake twice — four pairs converging on one destination at `2e38375`, five pairs all at exactly
   48 legs at `04f0f38` — and the report looked healthy both times.
4. **Profile balance.** Within a band, the least-used profile so far wins, tie-broken by distance
   to the band's geometric centre. Result: fastest ×4, scenic ×3, safest ×2, cheapest ×2, illicit
   ×1. Without this, longest-first returns twelve `fastest` routes and profile is perfectly
   confounded with distance.
5. **The materialised `route.totalKm` must itself fall in the band.** The cheap Dijkstra price was
   a bucketing hint only (~0.6 ms/pair against ~12 ms for the full generator); `scenic` and
   `illicit` detour off it.

Candidates came from a seeded sample of 6,000 endpoint pairs (mulberry32, seed `0x0d155ee1`),
priced with one `shortestPath` under `costFor('fastest')`, then bucketed. Every band had ≥19
candidates.

> **Constraint 4 leaves ONE confound, and it matters in §7:** profile is not crossed with band.
> Each band has exactly one route with exactly one profile, so a band-level verdict that rests on
> a single row cannot be separated from that row's profile. This is why §7 requires a defect to
> **replicate across two adjacent bands** before it becomes a band verdict.

### 6.2 The twelve routes

| #   | Pair                       | Prof     |     km | Legs | Mont | Bord | Events fired (mean) | Median days | Est. play min (p50) | Chains completed (mean/run) | Completion |
| --- | -------------------------- | -------- | -----: | ---: | ---: | ---: | ------------------: | ----------: | ------------------: | --------------------------: | ---------- |
| 1   | Valdepenas → Merida        | fastest  |    357 |   14 |    0 |    0 |                14.0 |           3 |             **7.7** |                       0.000 | 98.4% ±0.4 |
| 2   | Vienna → Trieste           | fastest  |    481 |   15 |    0 |    1 |                14.9 |           3 |             **8.2** |                       0.031 | 97.6% ±0.4 |
| 3   | Chandigarh → Jaipur        | fastest  |    660 |   17 |    0 |    0 |                16.8 |           5 |             **9.3** |                       0.000 | 93.5% ±0.7 |
| 4   | Lviv → Liberec             | fastest  |    900 |   19 |    0 |    2 |                18.9 |           4 |            **10.5** |                       0.009 | 98.1% ±0.4 |
| 5   | Krakow → Bolzano           | scenic   |  1,285 |   22 |    0 |    3 |                21.2 |           6 |            **12.0** |                       0.072 | 82.6% ±1.1 |
| 6   | Joensuu → Nizhniy Novgorod | scenic   |  1,835 |   22 |    0 |    1 |                21.3 |           6 |            **12.0** |                       0.000 | 83.2% ±1.0 |
| 7   | Helsinki → Berlin          | scenic   |  2,487 |   22 |    0 |    5 |                21.2 |           7 |            **12.0** |                       0.045 | 81.8% ±1.1 |
| 8   | Arkhangel'sk → Debrecen    | safest   |  3,348 |   23 |    1 |    3 |                22.7 |           6 |            **12.8** |                       0.061 | 92.0% ±0.8 |
| 9   | Gaziantep → Stuttgart      | cheapest |  4,315 |   30 |    2 |    5 |                26.6 |           9 |            **16.3** |                       0.025 | 62.8% ±1.3 |
| 10  | Paris → Marand             | cheapest |  5,726 |   35 |    2 |    7 |                30.0 |          10 |            **18.9** |                       0.050 | 57.3% ±1.4 |
| 11  | Nanjing → Sukkur           | illicit  |  8,310 |   41 |    5 |    0 |                24.9 |           9 |            **11.5** |                       0.000 | 25.6% ±1.2 |
| 12  | Durban → Abidjan           | safest   | 12,067 |   48 |    0 |    7 |                31.7 |          13 |            **17.0** |                       0.033 | 28.5% ±1.3 |

#### The column the table needed and nobody asked for: travel hours

| #   |     km | `preview.travelHours` | Mode  | Completion |
| --- | -----: | --------------------: | ----- | ---------- |
| 1   |    357 |                    63 | car   | 98.4%      |
| 2   |    481 |                    68 | car   | 97.6%      |
| 3   |    660 |                    94 | car   | 93.5%      |
| 4   |    900 |                    67 | train | 98.1%      |
| 5   |  1,285 |                   117 | car   | 82.6%      |
| 6   |  1,835 |                   122 | car   | 83.2%      |
| 7   |  2,487 |                   132 | car   | 81.8%      |
| 8   |  3,348 |                   104 | train | 92.0%      |
| 9   |  4,315 |                   189 | bus   | 62.8%      |
| 10  |  5,726 |                   237 | bus   | 57.3%      |
| 11  |  8,310 |                   348 | truck | 25.6%      |
| 12  | 12,067 |                   410 | bus   | 28.5%      |

**Completion is monotone in travel HOURS, not in km or legs** — exactly as ADR 0035 says, and this
sample is the cleanest available demonstration because the twelve were not picked to show it. Band
4 (900 km, 19 legs, **train**, 67 h) completes at 98.1%, _better_ than band 3 (660 km, 17 legs,
car, 94 h) at 93.5%. Band 8 (3,348 km, train, 104 h) completes at 92.0%, better than band 5 at a
quarter the distance.

**Transport mode is a stronger predictor of completion than distance is,** because mode sets hours
per km and hours drive the wear curve. Anything reading this table as "longer = harder" will
misattribute a mode effect to a distance effect.

#### Route-shape notes the table hides

- **Not one of the twelve has a ferry hop.** Bands 11 (trans-Asia, 8,310 km) and 12 (trans-Africa,
  12,067 km) both cross zero water. This corroborates §8's ferry finding from the run-time side.
  **CORRECTED AT C3 — the second half of this bullet was wrong twice over.** It read
  "`ferry_boarding` is in `pack.unfillableBeatTypes` **and** unreachable by geometry". It is no
  longer unfillable (`transit.the_boarding_queue`), and "unreachable by geometry" does not
  generalise off these twelve routes: **4 of the 23 corpus routes take the Algiers–Barcelona ferry
  and carry 8 `ferry_boarding` slots between them**, 696 of which are reached over 2,000 runs. The
  observation about THESE TWELVE stands as measured; the inference drawn from it did not.
- **Band 11 is an `illicit` route with zero border crossings across 8,310 km.** Its beat schedule
  is `departure / midpoint_crisis / approach / finale` — no `border_crossing` slot at all. This is
  §4(c)'s dominance finding seen from the other side, and its consequence is concrete (§6.4).
- **The short bands are one or two graph edges stretched by the surplus allocator.** Band 1 is
  **1 hop** and 14 legs; band 3 is 2 hops and 17 legs. Band 1's `legLocations` is
  `{wilderness: 13, town: 1}`. Montage is impossible there by construction — `protectedFromMontage`
  reserves the first and last segment, and with one segment nothing is left. That is why bands 1–7
  show 0 montage legs; it is not a montage bug.
- **Montage legs currently have no run-time effect on what the player plays.** `montageLegs` only
  raises the leg-hour ceiling (`MAX_MONTAGE_HOURS = 30` against `MAX_LEG_HOURS = 12`) and pushes a
  `montage: 3` factor into the quiet gate — which does nothing while `BASE_EVENT_ODDS` is
  `{fire: 1, quiet: 0}`. Measured quiet share is **0.0% on all twelve.** The column is real
  geometry with, today, no consequence for the event stream.

### 6.3 Estimated play minutes — derived, with the arithmetic exposed

#### The word lengths are measured, not assumed

Computed from the shipped `packages/content/i18n/en/` (445 keys) at run time, so the estimate
moves if the corpus does:

| Text class                  |   n | Mean words | p50 | Max |
| --------------------------- | --: | ---------: | --: | --: |
| `events.*.title`            |  13 |   **4.23** |   4 |   6 |
| `events.*.body`             |  13 |  **44.00** |  44 |  54 |
| `events.*.choice.*` (label) |  41 |   **4.17** |   4 |   7 |
| `events.*.out.*` (outcome)  |  90 |  **25.48** |  26 |  38 |
| `universal.*.label`         |  16 |   **3.44** |   4 |   5 |
| `universal.*.out.*`         |  26 |  **22.12** |  22 |  41 |
| `complication.*.text`       |  25 |  **12.64** |  14 |  24 |
| `check.*` (result chip)     | 159 |   **2.79** |   3 |   5 |

**Pillar-5 compliance, checked in passing: 0 bodies over 60 words, 0 choice labels over 8 words.**
The mean body is 44 words — 73% of the cap, so building on the 60-word cap would have
overestimated by ~36%.

#### The reading rate is the pillar's own

CLAUDE.md §10 pillar 5 fixes two numbers that together determine it: _"Event body ≤ 60 words"_ and
_"Readable in 15 seconds"_. **60 words / 15 s = 4 words/s = 240 wpm.** That is the design's own
implied rate, used here in place of a literature value. Published adult silent screen-reading
means sit at 200–250 wpm, so **240 is at the top of that band and every figure here is a lower
bound on reading time.**

#### Two constants are declared, not derived

- `DECIDE = 4 s` per decision taken — the deliberation pause after reading the labels.
- `LEG_CHROME = 3 s` per leg — one travel/arrival card tapped through, event or not.

Both are stated so a reader can substitute; the sensitivity table shows exactly what they buy.

#### The formula

```
words  = E×(4.23 + 44.00)          events fired: title + body
       + C×12.64                   complicated legs: the attached line
       + Xe×4.17  + Xu×3.44        every offered label, event and universal
       + Pe×25.48 + Pu×22.12       the outcome actually resolved
       + K×2.79                    check chips on the result screen

minutes = words/240  +  (Pe+Pu)×4/60  +  L×3/60
```

`E, C, Xe, Xu, Pe, Pu, K, L` are all per-run counters `runOne` already returns
(`firedEvents.length`, `complicatedLegs`, `choicesOffered − universalOffered`, `universalOffered`,
`picks − universalPicked`, `universalPicked`, `chipsTotal`, `legs`). Nothing is invented.

#### The arithmetic, per band, at the means

| #   |     E |     C |   Xe |   Xu |    Pe |   Pu |    K |    L | words | read min | decide min | chrome min | **total** |
| --- | ----: | ----: | ---: | ---: | ----: | ---: | ---: | ---: | ----: | -------: | ---------: | ---------: | --------: |
| 1   | 13.96 |  8.39 | 43.4 | 21.0 | 10.42 | 3.54 | 27.8 | 14.0 | 1,454 |     6.06 |       0.93 |       0.70 |   **7.7** |
| 2   | 14.94 |  8.93 | 46.8 | 23.0 | 11.10 | 3.84 | 30.4 | 14.9 | 1,560 |     6.50 |       1.00 |       0.75 |   **8.2** |
| 3   | 16.81 | 10.07 | 52.0 | 26.0 | 12.46 | 4.34 | 33.1 | 16.8 | 1,750 |     7.29 |       1.12 |       0.84 |   **9.3** |
| 4   | 18.93 | 11.41 | 56.1 | 34.1 | 13.77 | 5.16 | 42.5 | 18.9 | 1,992 |     8.30 |       1.26 |       0.95 |  **10.5** |
| 5   | 21.21 | 12.71 | 65.2 | 35.5 | 15.27 | 5.94 | 49.6 | 21.1 | 2,236 |     9.32 |       1.41 |       1.06 |  **11.8** |
| 6   | 21.29 | 12.76 | 65.8 | 34.9 | 15.84 | 5.45 | 46.9 | 21.2 | 2,237 |     9.32 |       1.42 |       1.06 |  **11.8** |
| 7   | 21.24 | 12.72 | 65.3 | 36.8 | 15.11 | 6.14 | 51.3 | 21.2 | 2,248 |     9.36 |       1.42 |       1.06 |  **11.8** |
| 8   | 22.70 | 13.62 | 68.3 | 44.1 | 16.08 | 6.61 | 58.9 | 22.7 | 2,424 |    10.10 |       1.51 |       1.13 |  **12.7** |
| 9   | 26.62 | 15.97 | 80.5 | 51.3 | 19.49 | 7.13 | 67.8 | 26.5 | 2,841 |    11.84 |       1.77 |       1.32 |  **14.9** |
| 10  | 30.04 | 18.02 | 90.8 | 56.8 | 22.07 | 7.97 | 73.9 | 29.9 | 3,195 |    13.31 |       2.00 |       1.49 |  **16.8** |
| 11  | 24.92 | 14.94 | 78.1 | 40.7 | 18.01 | 6.91 | 57.3 | 24.7 | 2,628 |    10.95 |       1.66 |       1.23 |  **13.8** |
| 12  | 31.67 | 19.02 | 95.9 | 59.5 | 23.11 | 8.56 | 70.9 | 31.4 | 3,348 |    13.95 |       2.11 |       1.57 |  **17.6** |

These are **means**; §6.2's headline column is the **median**, which differs on the high-variance
routes (band 11 mean 13.8 against median 11.5; band 12 mean 17.6 against median 17.0).

**Reading is 79–87% of the total, and reading is the derived part.** The two declared constants
together contribute 13–21%, so the estimate is dominated by measurements, not by assumptions.

#### Sensitivity — substitute your own

| #   | Fast (300 wpm, 2 s decide, 2 s chrome) | **Base (240/4/3)** | Slow (180 wpm, 8 s decide, 5 s chrome) |
| --- | -------------------------------------: | -----------------: | -------------------------------------: |
| 1   |                                    5.8 |            **7.7** |                                   11.1 |
| 2   |                                    6.2 |            **8.2** |                                   11.9 |
| 3   |                                    7.0 |            **9.3** |                                   13.4 |
| 4   |                                    7.9 |           **10.5** |                                   15.1 |
| 5   |                                    9.0 |           **12.0** |                                   17.3 |
| 6   |                                    9.0 |           **12.0** |                                   17.3 |
| 7   |                                    9.0 |           **12.0** |                                   17.4 |
| 8   |                                    9.6 |           **12.8** |                                   18.4 |
| 9   |                                   12.3 |           **16.3** |                                   23.6 |
| 10  |                                   14.2 |           **18.9** |                                   27.3 |
| 11  |                                    8.7 |           **11.5** |                                   16.6 |
| 12  |                                   12.8 |           **17.0** |                                   24.5 |

The whole plausible span is roughly ×0.75 to ×1.45 around base. **Band ordering is invariant under
all three parameter sets** — §7's judgment cannot be flipped by disagreeing with these constants.

#### Two directional caveats on every minute figure

1. **UPPER bound w.r.t. the quiet gate.** `BASE_EVENT_ODDS` is `{fire: 1, quiet: 0}`, so measured
   quiet share is 0.0% on all twelve and _every_ leg presents an event. When M3.12b sets a real
   base, `E` falls and so does every number here.
2. **LOWER bound w.r.t. presentation.** No UI, animation, journal or prep screen exists (rules 9
   and 10 are `(planned)`), so there is no presentation term at all.

### 6.4 Memory chains completed — exactly what was counted

#### The definition

**One memory chain completed = one `queueFires`: the director drew a _due entry off the pending
consequence queue_ and fired the event it names.** Per run this is `SimRun.queueFires`, which
`run-one.ts` increments once per `selection.fromQueue === true`. That is the payoff half of the
`scheduleEvent` → `pendingEvents` → `duePendingEvents` → `consumePending` mechanism, i.e. ADR
0001's one sanctioned soft pointer, and nothing else.

| Term             | Source                           | Meaning                                         |
| ---------------- | -------------------------------- | ----------------------------------------------- |
| **opened**       | `SimRun.scheduled`               | `scheduleEvent` effects that returned `changed` |
| **completed**    | `SimRun.queueFires`              | promises the director kept                      |
| **open at end**  | `unresolvedThreads(state, pack)` | still pending when the run ended                |
| **left unfired** | `queueDrops − queueFires`        | expired + evicted + `superseded`, lumped        |

#### The definition is arithmetically closed, and this was checked

Every scheduled promise either leaves the queue (exactly one `PendingDrop`, of any reason) or is
still pending at the end, so `scheduled === queueDrops + unresolvedThreads` must hold run for run.
**Checked on all 60,000 runs: 0 violations.** That is what proves the column counts the population
it claims to.

**The one thing that could not be split:** `runOne` reports `queueDrops.length` only, so
`superseded` (a duplicate sibling retired when its twin fired) cannot be separated from
`expired`/`evicted`. "Left unfired" therefore over-reports abandonment by the sibling count.

#### The pooled numbers

| #          |    Opened | Completed | Open at end | Left unfired | Queue payoff rate | Runs with ≥1 chain |
| ---------- | --------: | --------: | ----------: | -----------: | ----------------: | -----------------: |
| 1          |     **0** |     **0** |           0 |            0 |                 — |               0.0% |
| 2          |       286 |       157 |         129 |            0 |             54.9% |               3.1% |
| 3          |     **0** |     **0** |           0 |            0 |                 — |               0.0% |
| 4          |       399 |        47 |         352 |            0 |             11.8% |               0.9% |
| 5          |       811 |       358 |         403 |           50 |             44.1% |               7.2% |
| 6          |     **0** |     **0** |           0 |            0 |                 — |               0.0% |
| 7          |     1,105 |       223 |         474 |          408 |             20.2% |               4.5% |
| 8          |       940 |       307 |         425 |          208 |             32.7% |               6.1% |
| 9          |       972 |       125 |         520 |          327 |             12.9% |               2.5% |
| 10         |       795 |       251 |         143 |          401 |             31.6% |               5.0% |
| 11         |     **0** |     **0** |           0 |            0 |                 — |               0.0% |
| 12         |       882 |       166 |         448 |          268 |             18.8% |               3.3% |
| **pooled** | **6,190** | **1,634** |       2,894 |        1,662 |         **26.4%** |           **2.7%** |

#### Three findings this column produces

**(a) The entire memory-chain mechanism in the shipped corpus is ONE authored edge.** Verified by
grep across `packages/content/events/`: exactly one `scheduleEvent` op exists —
`border.night_crossing` → `authority.the_file_catches_up`, `inLegs: [4, 14]`, on the
`held_and_questioned` outcome of the `present_papers` choice, i.e. the _failure_ branch of a DC-12
negotiation check. One of 13 events, one of its four choices, one of its outcomes. **The column is
measuring a single edge's throughput, not a system's.**

**(b) Four of twelve routes cannot open a chain at all — by geometry.** Bands 1, 3, 6 and 11
recorded `scheduled = 0` over 5,000 runs each. Bands 1, 3 and 11 have **no border-crossing leg
location**, so `border.night_crossing` (context `locationTypes: [border_crossing, checkpoint]`) is
unfilterable there. Band 6 is the sharper case: it _has_ one `border_crossing` leg, and the event
still fired **0 times in 5,000 runs**, because it is additionally gated on
`timeOfDay: [evening, night]`, one leg gives one arrival hour, and the route's beat schedule
contains no `border_crossing` slot to force it. **A route can carry a border crossing and never
produce a border event.**

**(c) Counting only the queue undercounts the narrative payoff by ~4×.** This is the most important
caveat on the column. `authority.the_file_catches_up` also carries `requires: {flag: night_crossing}`
— ADR 0001 "form 1" memory — so it can reach the player through the ordinary weighted pool with no
queue involvement:

| #          | Payoff fires (total) | via queue (form 2) | via flag + pool (form 1) |
| ---------- | -------------------: | -----------------: | -----------------------: |
| 2          |                  332 |                157 |                      175 |
| 4          |                  335 |                 47 |                      288 |
| 5          |                  823 |                358 |                      465 |
| 7          |                1,127 |                223 |            **904 (80%)** |
| 8          |                  922 |                307 |                      615 |
| 9          |                1,003 |                125 |            **878 (88%)** |
| 10         |                  888 |                251 |                      637 |
| 12         |                  862 |                166 |                      696 |
| **pooled** |            **6,292** |    **1,634 (26%)** |          **4,658 (74%)** |

Three quarters of the time the consequence lands because a flag was set, not because the queue
placed it. **Read "memory chains completed" as "queue payoffs", and read the form-1 column beside
it, or the corpus will look four times less consequence-heavy than it plays.**

### 6.5 Supporting distributions

Means are the wrong instrument for §7's judgment, so here is what is underneath each row.

#### (1) Spread — events fired

| #   |    p10 |    p50 |    p90 | min | max | Route legs |
| --- | -----: | -----: | -----: | --: | --: | ---------: |
| 1   |     14 |     14 |     14 |   6 |  14 |         14 |
| 2   |     15 |     15 |     15 |   8 |  15 |         15 |
| 3   |     17 |     17 |     17 |   7 |  17 |         17 |
| 4   |     19 |     19 |     19 |   9 |  19 |         19 |
| 5   |     19 |     22 |     22 |   4 |  22 |         22 |
| 6   |     19 |     22 |     22 |   8 |  22 |         22 |
| 7   |     19 |     22 |     22 |   8 |  22 |         22 |
| 8   |     23 |     23 |     23 |   9 |  23 |         23 |
| 9   |     17 |     30 |     30 |   7 |  30 |         30 |
| 10  |     19 |     35 |     35 |   9 |  35 |         35 |
| 11  | **12** | **21** | **41** |   5 |  41 |         41 |
| 12  | **16** | **30** | **48** |   6 |  48 |         48 |

**"Events fired" is currently not an independent measurement.** With quiet share 0.0% and
uneventful share 0.0%, every leg presents an event, so `events fired = legs survived (+1 when the
run ends inside resolveChoice)`. p10 = p50 = p90 = legCount on bands 1–4 and 8: those routes are
effectively deterministic in content volume. Bands 11 and 12 are the opposite — 3.4× and 3.0×
p10→p90 spreads.

#### (2) Spread — where runs die

| #   | legs p10/p25/p50/p75/p90   | died before ¼ |  before ½ | before ¾ |
| --- | -------------------------- | ------------: | --------: | -------: |
| 1   | 14 / 14 / 14 / 14 / 14     |          0.0% |      0.0% |     0.5% |
| 2   | 15 / 15 / 15 / 15 / 15     |          0.0% |      0.1% |     0.8% |
| 3   | 17 / 17 / 17 / 17 / 17     |          0.0% |      0.1% |     1.9% |
| 4   | 19 / 19 / 19 / 19 / 19     |          0.0% |      0.0% |     0.8% |
| 5   | 18 / 22 / 22 / 22 / 22     |          0.0% |      0.8% |     6.8% |
| 6   | 19 / 22 / 22 / 22 / 22     |          0.0% |      0.4% |     5.9% |
| 7   | 18 / 22 / 22 / 22 / 22     |          0.0% |      0.3% |     7.1% |
| 8   | 23 / 23 / 23 / 23 / 23     |          0.0% |      0.2% |     2.2% |
| 9   | 17 / 23 / 30 / 30 / 30     |          0.1% |      4.5% |    23.2% |
| 10  | 19 / 24 / 35 / 35 / 35     |          0.1% |      6.1% |    31.0% |
| 11  | **11 / 14 / 21 / 41 / 41** |      **6.6%** | **49.5%** |    63.2% |
| 12  | **15 / 20 / 29 / 48 / 48** |          2.5% | **36.8%** |    60.6% |

**Bands 11 and 12 are bimodal, not merely worse.** Band 11's IQR is 14→41 legs: a quarter of runs
end by leg 14 and a quarter reach the destination. **Pillar 4 is measurably violated on band 11 —
49.5% of runs are already over at the halfway mark**, and 6.6% die in the first quarter. Band 12
is 36.8% / 2.5%.

#### (3) Spread — completion by policy (n = 1,000 each, ±3.1 pp worst case)

| #   |  random | greedy-safe | greedy-fast | risk-taker | adversarial |     spread |
| --- | ------: | ----------: | ----------: | ---------: | ----------: | ---------: |
| 1   |    99.7 |       100.0 |       100.0 |      100.0 |        92.1 |      7.9pp |
| 2   |    98.8 |       100.0 |       100.0 |      100.0 |        89.4 |     10.6pp |
| 3   |    94.2 |        99.8 |       100.0 |      100.0 |        73.7 |     26.3pp |
| 4   |    99.8 |       100.0 |       100.0 |      100.0 |        90.7 |      9.3pp |
| 5   |    78.5 |        92.2 |       100.0 |       99.4 |        42.7 |     57.3pp |
| 6   |    76.3 |        94.7 |       100.0 |       99.9 |        45.0 |     55.0pp |
| 7   |    72.8 |        90.0 |       100.0 |       98.4 |        47.7 |     52.3pp |
| 8   |    89.3 |       100.0 |       100.0 |       99.0 |        71.8 |     28.2pp |
| 9   |    37.9 |        91.5 |       100.0 |       77.1 |         7.7 |     92.3pp |
| 10  |    30.0 |        89.6 |       100.0 |       64.9 |         2.1 | **97.9pp** |
| 11  | **2.3** |     **0.0** |        74.1 |       51.7 |         0.0 |     74.1pp |
| 12  |     4.8 |        44.5 |        76.7 |       16.3 |         0.0 |     76.7pp |

**Band 11 inverts the policy bracket, and that is a finding, not noise.** `greedy-safe` completes
89–100% on every route from band 1 to band 10 and then scores **0.0% on band 11** — worse than
`random` (2.3%). `greedy-fast`, the time-minimising oracle, gets 74.1%. On a 348-travel-hour truck
route the wear curve makes _conserving resources_ strictly dominated by _arriving sooner_, and a
policy that never optimises for hours cannot finish. Bands 9–12 also show `random` collapsing to
2–38% while `greedy-fast` holds 77–100%: **the playable difficulty band narrows to almost nothing
above ~190 travel hours.**

Median play minutes by policy show the same inversion — band 11: `adversarial` 7.8 min,
`greedy-safe` 8.6, `random` 9.3, `greedy-fast` 21.5, `risk-taker` 24.0. **A 3.1× session-length
swing on one route, driven purely by play style.**

#### (4) Repetition

| #   | distinct events (p50) | catalogue coverage | fires ÷ distinct | worst single-event repeat p50 / p90 | **filler share of all fires** | top single event               |
| --- | --------------------: | -----------------: | ---------------: | ----------------------------------- | ----------------------------: | ------------------------------ |
| 1   |                     6 |              10/13 |             2.31 | 4 / 4                               |                     **52.8%** | `the_long_quiet_stretch` 26.4% |
| 2   |                     6 |              10/13 |             2.63 | 5 / 5                               |                     **56.2%** | `the_long_quiet_stretch` 28.2% |
| 3   |                     7 |               9/13 |             2.48 | 5 / 5                               |                     **50.2%** | `the_hours_between` 25.1%      |
| 4   |                     7 |              10/13 |             2.61 | 5 / 6                               |                         48.3% | `the_long_quiet_stretch` 24.2% |
| 5   |                     8 |              11/13 |             2.51 | 5 / 6                               |                         43.9% | `the_long_quiet_stretch` 22.0% |
| 6   |                     8 |              10/13 |             2.56 | 5 / 6                               |                         41.0% | `the_hours_between` 20.5%      |
| 7   |                     9 |              11/13 |             2.36 | 5 / 6                               |                         40.4% | `the_hours_between` 20.2%      |
| 8   |                     9 |              10/13 |             2.50 | 4 / 5                               |                     **34.1%** | `the_long_quiet_stretch` 17.1% |
| 9   |                     9 |              10/13 |             3.07 | 6 / 7                               |                         35.8% | `the_hours_between` 17.9%      |
| 10  |                     9 |              10/13 |             3.44 | 7 / 8                               |                         37.9% | `the_hours_between` 19.0%      |
| 11  |                     7 |              10/13 |             3.25 | 6 / **11**                          |                         46.0% | `the_hours_between` 23.1%      |
| 12  |                     8 |               9/13 |         **3.94** | 6 / **11**                          |                         39.4% | `the_long_quiet_stretch` 19.8% |

**The two filler events are 34–56% of everything the player reads.** The short bands are worst: on
band 2 a 15-leg journey is `filler.the_hours_between` + `filler.the_long_quiet_stretch` eight or
nine times out of fifteen. Distinct events seen per run never exceeds a median of 9, and no route
reaches more than 11 of the 13; bands 3 and 12 reach 9.

Repetition ratio climbs monotonically with route length (2.31 → 3.94) and the tail is brutal: on
bands 11 and 12, **10% of runs see one single event fire 11 or more times.**

Two events are mutually exclusive by transport mode — `road.the_hitchhiker` on car/truck routes,
`transit.the_wrong_carriage` on train/bus — which is a large part of why coverage caps at 9–11
rather than 13.

#### (5) Beat fill — against its ceiling, not against 100%

> **THE CEILING THIS SECTION IS COMPUTED AGAINST NO LONGER EXISTS (C3, 2026-08-14).**
> `pack.unfillableBeatTypes` is **empty**: `road.the_first_hour`, `transit.the_boarding_queue`,
> `city.the_outskirts` and `city.the_last_kilometre` fill `departure`, `ferry_boarding`, `approach`
> and `finale`. Every `Ceiling` and `% of ceiling` cell below therefore divides by a denominator
> that has been retired, and the twelve-band sweep was **NOT re-run** — it is a bespoke harness at
> 1,000 runs per policy per band and re-running it is milestone-sized, so no re-measured table is
> printed here rather than a fabricated one. What WAS re-measured is the corpus, at 2,000 runs:
> **beat fill 28.2% → 47.8%, structural ceiling 55.8% → 100%**, per type
> `departure` 31.2% · `ferry_boarding` 20.8% · `approach` 98.6% · `finale` 65.1%.
> `docs/sim-baseline-corpus.md`'s C3 block has the full table and the mechanism.
>
> **WHAT THAT DOES NOT RETIRE, AND IT IS THE HALF THIS SECTION ACTUALLY TURNS ON.** Bands 9 and 10
> are short of their ceiling on `border_crossing` slots, and C3 touched no border content. On the
> corpus, `border_crossing` fill moved **45.0% → 43.8%** with four new events in the pool — the
> movement is resample (a beat event whose type is not the due slot's is excluded by gate 3, so the
> pool at a border leg is unchanged), and the shortfall is unmoved. **That is evidence against the
> corpus explanation and for the director one**, which is what §7.7 item 1 was built to separate.
> The band-level confirmation is still owed.

`pack.unfillableBeatTypes` **was** `['departure', 'ferry_boarding', 'approach', 'finale']` when this
was measured. **Four of six beat types had no content that could fill them**, and every route
schedules exactly one `departure` and one `finale`. A raw fill rate is therefore uninterpretable;
here it is against the then-achievable ceiling (`border_crossing` + `midpoint_crisis` slots ÷ all
slots):

| #   | Slots | Fillable | Ceiling | Measured | % of ceiling | Filled/run | Expired/run |
| --- | ----: | -------: | ------: | -------: | -----------: | ---------: | ----------: |
| 1   |     3 |        1 |   33.3% |    33.4% |     **100%** |       1.00 |        1.99 |
| 2   |     3 |        1 |   33.3% |    20.4% |          61% |       0.61 |        2.37 |
| 3   |     3 |        1 |   33.3% |    33.9% |         102% |       0.99 |        1.94 |
| 4   |     4 |        2 |   50.0% |    39.6% |          79% |       1.57 |        2.40 |
| 5   |     6 |        4 |   66.7% |    41.4% |          62% |       2.37 |        3.35 |
| 6   |     3 |        1 |   33.3% |    35.0% |         105% |       0.99 |        1.84 |
| 7   |     7 |        4 |   57.1% |    40.3% |          71% |       2.67 |        3.95 |
| 8   |     6 |        4 |   66.7% |    41.5% |          62% |       2.44 |        3.44 |
| 9   |     7 |        4 |   57.1% |    25.1% |      **44%** |       1.51 |        4.49 |
| 10  |     7 |        4 |   57.1% |    19.5% |      **34%** |       1.20 |    **4.97** |
| 11  |     4 |        1 |   25.0% |    22.4% |          90% |       0.44 |        1.53 |
| 12  |     6 |        3 |   50.0% |    37.6% |          75% |       1.43 |        2.38 |

(>100% on bands 3 and 6 is not an error: the denominator is `filled + expired`, and a run that ends
early never reaches its later slots, so they neither fill nor expire.)

**Beat fill collapses in the middle-long bands, not the longest.** Bands 9 and 10 hit 44% and 34%
of their own ceiling — they schedule 4 `border_crossing` slots each and fill barely one. Band 10
expires **5.0 beats per run.** Bands 11/12 look better only because they schedule fewer fillable
slots to begin with.

#### (6) Flat across all twelve — checked, so absence is a result

- **Complication attach rate: 59.7–60.3%.** Zero band effect.
- **Chips per check: 5.55–6.56**, inside the 3–7 legibility band everywhere; no route breaches it.
- **Quiet share 0.0%, uneventful share 0.0%** on all twelve — no content starvation anywhere, and
  the quiet gate is inert at `BASE_EVENT_ODDS = 1:0`.
- **In-game days** track travel hours cleanly: p10/p50/p90 of 2/3/4 (band 1) to 7/13/19 (band 12).
  Band 11's 5/9/16 is the bimodality again.

### 6.6 Run count — 5,000 per route, 60,000 total, and why

The requirement was ≥1,000 per route; 5× that was run, on three grounds:

1. **The binding precision constraint is per-POLICY, not per-route.** §6.5(3) is the load-bearing
   table, because the pooled route figure averages over a 92 pp-wide bracket (band 9: adversarial
   7.7% to greedy-fast 100%) and is nearly meaningless alone. At 1,000 runs/route each policy gets
   200 runs — a 95% CI half-width of ±6.9 pp worst case, wide enough to hide a real difference. At
   5,000 each policy gets **1,000 runs → ±3.1 pp**, and the pooled route rate lands at ±1.4 pp or
   better (actual half-widths ±0.4 to ±1.4 pp).
2. **5,000 is an exact multiple of the 5 policies**, so the design is perfectly balanced — 1,000
   runs per (route, policy) cell, 60 cells, no marginal short. This is the shape `run-many.ts`'s
   `cellFor` exists to protect and the mistake ADR 0038 documents.
3. **Cost is not a constraint.** 200 runs on the 48-leg route cost 261 ms; the full 60,000-run
   sweep runs in **43.9 s** on Node/V8. Choosing 1,000 would have bought nothing and cost precision.

The sweep was executed twice from scratch (once for the base table, once with the extended
instrumentation) with identical headline numbers.

---

## 7. THE BAND JUDGMENT — which distance band is least fun

> **The prior offered was: "the middle band will be weakest."** It is wrong, and it is wrong in a
> direction that matters. **The middle is the strongest part of the game.** The weak stretch is the
> **long half — bands 10–12, 4,500 km and up.** Note that is NOT the same finding as "the long
> routes are too hard": the wear curve fixed that hours ago and TOO HARD is no longer what ails
> them.

### 7.1 The answer

**Least fun: the long half, bands 10–12 (4,500 km and up), weakest at its two ends for two
different reasons.**

- **Band 10 (Paris → Marand, 5,726 km, `cheapest`, 35 legs, 237 travel hours) is the worst RATIO** —
  the most minutes invested against the least authored structure delivered, at 34% of its own beat
  ceiling and 4.97 beats expired per run, both the worst in the set.
- **Band 12 (Durban → Abidjan, 12,847 km) is the worst ABSOLUTE** — a 26-minute completed session
  at 5.95 fires per distinct event, i.e. the same thirteen events seen roughly six times each.

An earlier draft named band 10 alone, on a session-length statistic that pooled failed runs; §7.1's
correction box has the measurement and what it moved.

**Failure mode: TOO LONG AND TOO UNEVENTFUL, simultaneously.** Not too hard. Not, primarily, too
repetitive.

Band 10 **delivers the least authored structure of any band that promised any** — 34% of its own
beat ceiling, the worst in the set, and 4.97 beats expired per run, also the worst.

> **CORRECTED BEFORE COMMIT, and the correction moves the verdict.** This section first read "band
> 10 is the longest session in the game (18.9 min p50, the maximum of twelve)". That p50 was taken
> over ALL usable runs, completed and failed alike — and completion across the twelve spans
> 25.6%–98.4%, so the population composition IS the variable under study. A band where three
> quarters of runs die early looks short because dying is quick.
>
> Re-measured on COMPLETED runs only (5,000/band, same seeds), which is the population "how long is
> a session" is a question about:
>
> | band              | pooled p50 | completed-only p50 |
> | ----------------- | ---------: | -----------------: |
> | 10 Paris→Marand   |       18.9 |         19.2 (3rd) |
> | 11 Nanjing→Sukkur |       11.5 |         21.8 (2nd) |
> | 12 Durban→Abidjan |       17.0 |     **26.1 (1st)** |
>
> Band 10 is **third**, not first. A player who finishes band 12 spends 26.1 minutes — 36% longer
> than band 10. Band 11's pooled 11.5 was low only because 74% of its runs die early.
>
> This is the fifth survivorship-conditioned statistic caught in this project, and the first that
> changed a conclusion. Completion and died-before-½ are correctly rates over ALL runs; anything
> describing what a SESSION is like belongs to the runs that had one.

### 7.2 Why it is not the middle

Bands 5–8 (1,285–3,348 km) win, or come close to winning, on every quality axis measured:

| axis                      | bands 5–8  | best in set?                                                                   |
| ------------------------- | ---------- | ------------------------------------------------------------------------------ |
| completion                | 81.8–92.0% | healthiest failure rate — real stakes, no wall                                 |
| runs with ≥1 memory chain | 4.5–7.2%   | **yes** — band 5 at 7.2% is the maximum                                        |
| beat fill, % of ceiling   | 62–105%    | **yes** among routes with ≥3 fillable slots                                    |
| filler share              | 34.1–43.9% | **yes** — band 8's 34.1% is the minimum                                        |
| distinct events (p50)     | 8–9        | tied best                                                                      |
| policy spread             | 28–57 pp   | wide enough to reward skill, narrow enough that `random` still finishes 73–89% |
| play minutes              | 12.0–12.8  | comfortably inside a phone session                                             |
| died before ½             | 0.2–0.8%   | pillar 4 satisfied with room to spare                                          |

**Band 7 (Helsinki → Berlin, 2,487 km) is the single healthiest row in the table**: 0.223 beats
delivered per session minute — the highest of twelve — 11 of 13 events reachable, 40.4% filler,
4.5% chain rate, 81.8% completion, 12 minutes.

The middle is where every subsystem is simultaneously in range. The prior is not merely unsupported;
the evidence points the other way.

### 7.3 Weighing the four candidate failure modes against the data

The four modes want opposite fixes, so they are separated before any verdict.

| mode               | instrument                                       | worst bands, in order                                     |
| ------------------ | ------------------------------------------------ | --------------------------------------------------------- |
| **TOO HARD**       | completion, died before ½, policy floor          | 11, 12, 10, 9 — _rates over ALL runs, correctly_          |
| **TOO LONG**       | play minutes p50, **completed runs only**        | **12 (26.1)**, 11 (21.8), 10 (19.2)                       |
| **TOO REPETITIVE** | fires ÷ distinct, **completed runs only**        | **12 (5.95)**, 11 (4.81), 10 (3.99)                       |
| **TOO UNEVENTFUL** | % of beat ceiling, beats expired/run, chain rate | 11 (0.038 beats/min), **10 (34%, 4.97 expired)**, 9 (44%) |

**Band 10 is in the worst three of all four modes — but it leads none of them.** The long tail
(band 12, 12,847 km) leads TOO LONG and TOO REPETITIVE outright once the population error above is
corrected, and band 11 is second on both while leading TOO UNEVENTFUL on beats-per-minute.

So the honest verdict is a RANGE, not a point: **the weakest stretch is the long half, bands
10–12 (4,500 km and up), and it is weakest for two different reasons at its two ends.** Band 10 is
the worst _ratio_ — the most minutes invested against the least authored structure delivered (34%
of its beat ceiling). Band 12 is the worst _absolute_ — 26 minutes and 5.95 fires per distinct
event, which is the same thirteen events seen six times each.

What did NOT change under the correction: TOO HARD, and the finding that the middle is strongest.
Both are measured on populations the correction does not touch.

Derived densities, computed from §6.2 and §6.5:

| #   | play min | distinct/min | beats delivered/min | **min per beat delivered** |
| --- | -------: | -----------: | ------------------: | -------------------------: |
| 1   |      7.7 |        0.779 |               0.130 |                        7.7 |
| 2   |      8.2 |        0.732 |               0.074 |                       13.4 |
| 3   |      9.3 |        0.753 |               0.106 |                        9.4 |
| 4   |     10.5 |        0.667 |               0.150 |                        6.7 |
| 5   |     12.0 |        0.667 |               0.198 |                        5.1 |
| 6   |     12.0 |        0.667 |               0.083 |                       12.1 |
| 7   |     12.0 |        0.750 |           **0.223** |                    **4.5** |
| 8   |     12.8 |        0.703 |               0.191 |                        5.2 |
| 9   |     16.3 |        0.552 |               0.093 |                       10.8 |
| 10  | **18.9** |    **0.476** |               0.063 |                   **15.8** |
| 11  |     11.5 |        0.609 |           **0.038** |                   **26.1** |
| 12  |     17.0 |        0.471 |               0.084 |                       11.9 |

### 7.4 Why it is not band 11, which is the most BROKEN row

Band 11 has the worse _defect list_: pillar 4 violated outright (49.5% of runs over by halfway),
the policy bracket inverted (`greedy-safe` 0.0%, below `random`), zero memory chains, one event
fired 11+ times in 10% of runs, and the lowest beat delivery per minute in the set.

**It is nonetheless not the band answer, for two reasons that are about evidence, not charity.**

1. **Band 11's defects do not replicate, and band 12 actively contradicts them.** Band 12 is 45%
   longer (12,067 km, 410 h) and is _better_ on every one of band 11's charges: completion 28.5%
   against 25.6%, died-before-half 36.8% against 49.5%, 3 fillable beat slots against 1, 0.033
   chains/run against 0.000, `greedy-safe` 44.5% against 0.0%. **The worst row is not the longest
   row.** A band verdict resting on a single non-monotone row is a row verdict wearing a band's
   clothes.
2. **Band 11's defects are attributable to PROFILE, not distance, and §6.1's constraint 4 means
   profile is confounded with band.** Band 11 is the sample's only `illicit` route. §4(c) explains
   its shape exactly: `illicit` avoids a median of 14 controlled crossings, band 11 crosses **zero**
   borders in 8,310 km, `borderBeats = min(crossings, 4)` therefore schedules zero border beats,
   `border.night_crossing` is unfilterable, and the corpus's only `scheduleEvent` edge is
   consequently unreachable. **Every one of band 11's content failures is downstream of the illicit
   dominance finding, not of its distance.** Re-run band 11 as `safest` and the charges likely
   evaporate; that measurement has not been made.

By contrast **bands 9 and 10 replicate each other and trend monotonically** — beat fill 44% → 34%
of ceiling, expired 4.49 → 4.97, play minutes 16.3 → 18.9, repetition 3.07 → 3.44 — on **the same
profile (`cheapest`) and the same mode (bus)**, with distance the only variable that moved. That is
a band effect. It is the only band effect in the sample that survives the profile confound.

### 7.5 The pillar accounting for band 10

- **Pillar 3 — "the world reacts" — VIOLATED, and this is the primary charge.** The beat schedule
  is the engine's own statement about what shape this route has: band 10 schedules 7 slots, 4 of
  them fillable, and delivers **1.20**. It expires **4.97 beats per run**, the worst in the game.
  The route announces four border crossings and the player experiences roughly one. The world was
  told to react seven times and reacted once.
- **Pillar 5 — "readable in 15 seconds", a phone game — VIOLATED at session scale.** 18.9 minutes
  is the longest session of the twelve and 2.5× band 1's. Every individual string is compliant (0
  bodies over 60 words, 0 labels over 8), so the violation is not per-event; it is that the phone
  game's longest session is also its emptiest. On the slow-reader parameter set band 10 is **27.3
  minutes.**
- **Pillar 1 — "consequence over difficulty" — VIOLATED as repetition, not as punishment.** 3.44
  fires per distinct event and 37.9% of everything read is two filler events. Across 18.9 minutes
  the player sees a median of **9 distinct events** — 0.476 per minute, the second-lowest in the
  set. Band 10's difficulty (57.3%) is fine; the outcomes are not interesting enough to fill the
  time it takes.
- **Pillar 2 — "legible randomness" — AT RISK, not confirmed violated.** Band 10 has the widest
  policy spread in the game, 97.9 pp: `adversarial` 2.1%, `random` 30.0%, `greedy-safe` 89.6%,
  `greedy-fast` 100%. The route is nearly a referendum on play style, and nothing in
  `RoutePreview` tells the player that. Whether it is _legible_ cannot be settled without the
  result screen, which does not exist — so this is listed as a risk, not scored.
- **Pillar 4 — "no dead ends before the halfway point" — SATISFIED.** 6.1% die before half. Band
  10 is not too hard. This is the charge it does _not_ carry, and dropping it is what leaves "too
  long and too uneventful" as the answer.
- **Pillar 6 — tone — not measurable here.** No instrument.

### 7.6 What the wear curve at `8effe2f` just did — and why it moved this answer

The wear curve is a **monotone function of travel hours only**: full drain to `FULL_UNTIL = 200`,
half rate for the next `MID_SPAN = 120`, quarter rate beyond. So its relief lands strictly in
proportion to hours. Computed from the shipped `worn()`:

| #   | travel h | `worn(h)` | drain relief |
| --- | -------: | --------: | -----------: |
| 1–8 |   63–132 |  identity |     **0.0%** |
| 9   |      189 |       189 |     **0.0%** |
| 10  |      237 |       219 |         7.6% |
| 11  |      348 |       267 |        23.3% |
| 12  |      410 |       283 |    **31.0%** |

**Nine of twelve bands sit entirely below the knee and received literally nothing.** Band 9 — one
of the two bands this section indicts — is at 189 h, **11 hours short of the knee**, and is
untouched by the newest engine change in the repo.

**What the curve did:** it removed the old, obvious answer. Before `8effe2f`, seven corpus routes
completed at **0.0%** and the least-fun band was trivially the longest — an unwinnable route is
pillar 4's dead end in its purest form, and no other defect competes with "you cannot finish this".
The curve took the worst route from 0.0% to 4.3%, put pooled completion at 43.1%, and made bands 11
and 12 survivable at 25.6% and 28.5%.

**What the curve did not do:** it did not touch bands 9–10's actual defects, and it could not
have. Their problems are **beat fill and session length**, neither of which is a drain quantity.
Band 10 got a 7.6% drain cut and still expires 4.97 beats per run; band 9 got nothing at all.

**So the wear curve moved the weak point inward by two bands — from the tail to the shoulder — and
stopped exactly where the shoulder begins.** That is the honest reading of the newest variable, and
it is the single strongest reason the answer today is band 10 and would not have been yesterday.

### 7.7 What would CHANGE this answer

Ranked by how cheaply the measurement could be made and how decisively it would flip the verdict.

1. **Author content for the four `unfillableBeatTypes`, then re-run §6.5(5).** _Decisive._ Bands
   9–10's 34–44% of ceiling is measured against a ceiling that already excludes `departure`,
   `approach`, `finale` and `ferry_boarding`. If the collapse is a **director** failure it will
   persist; if it is a **corpus** failure it will not. **If bands 9–10 then fill at 70%+, the
   primary charge (pillar 3) is withdrawn and the answer moves to band 11.**

   **HALF-DONE AT C3, AND THE HALF THAT LANDED POINTS AT THE DIRECTOR.** The content exists — four
   events, `pack.unfillableBeatTypes` empty, corpus beat fill 28.2% → 47.8%. The twelve-band sweep
   was NOT re-run, so the verdict on bands 9–10 is still owed. But the corpus already answers the
   question the re-run was for: `border_crossing` fill is **45.0% → 43.8%** with four more events in
   the pool, i.e. unmoved, and bands 9–10's shortfall is a `border_crossing` shortfall. The
   mechanism is visible and is not corpus size — `hard-filters.ts` gate 3 restricts a BEAT event to
   its own open slot but does not restrict the POOL to beat events, so a beat event competes with
   every normal event on its slot's leg, and `PRIORITY_BOOST.beat` is 1.0 on a comment that says the
   gate already did the restricting. Slack is what decides the outcome: `approach` (slack 2) fills
   98.6% and `departure` (slack 0) fills 31.2% with the same authoring care. **Expect bands 9–10 to
   persist, and re-run the sweep to confirm it rather than to discover it.**

2. **Set a real `BASE_EVENT_ODDS` at M3.12b and re-run §6.3.** _Decisive on half the charge._
   Every minute figure here is an upper bound taken at `{fire: 1, quiet: 0}`. If band 10 drops
   below ~13 minutes, the "too long" half evaporates and band 10 becomes merely average. Note the
   opposite risk: quiet legs also _lower_ content density, so this could deepen "too uneventful"
   while curing "too long".
3. **Cross profile with band — run all five profiles at bands 9–12.** _Decisive for band 11._
   §6.1's constraint 4 leaves one route per band. If band 11's charges (pillar 4 at 49.5%, zero
   chains, inverted bracket) **replicate under `safest`**, they are a distance effect and band 11
   takes the verdict. If they vanish, they were the illicit profile all along and §8 finding 3
   owns them.
4. **Author a second and third `scheduleEvent` edge.** The memory-chain column currently measures
   one authored edge's throughput. With three or four, bands 1–3's 0.0% chain rate becomes a real
   defect rather than a corpus artefact, and the **short** band enters contention on pillar 1.
5. **Move the knee below 189 h.** If `FULL_UNTIL` dropped to ~150, band 9 would enter the curve and
   bands 9–10's completion would rise — but this does **not** flip the verdict, because the charge
   against them is beat fill and session length, not difficulty. Recorded so nobody attempts it as
   a fix.
6. **Disagreeing with the play-minute constants — CANNOT flip it.** §6.3's sensitivity table shows
   band ordering invariant across ×0.75 to ×1.45. Stated so this is not proposed as an out.

---

## 8. FINDINGS

**Four failures. ONE IS NOW FIXED — the filter half of Finding 1, closed by C2 and marked closed
below. The other three stand, and none is a caveat.**

### FINDING 1 — Route diversity FAILS on 1 of 12 named pairs. **The filter half is CLOSED; the structural half is permanent.**

**Chongjin–Jeju City: 80% worst overlap against a 70% ceiling. STRUCTURAL. STILL OPEN, AND NO FILTER
CAN CLOSE IT.** Floor 71% — the pair was unpassable before any filtering ran. Cause: Jeju City is
degree-1, its sole 630 km edge is forced into all five routes. **This is the same defect the old
Barcelona–Zaragoza row was removed for. It was kept this time.** Post-C2 it resolves at **rung 2**
rather than rung 1, because a two-directional filter at 70 can find only one route here and the
ladder must relax to 80. **The fix for it is an edge — a ferry or a second corridor — never a
filter**, and that is Finding 4's territory.

**Valencia–Palermo: 85%, a GENUINE FILTER FAILURE. FOUND HERE. CLOSED BY C2.** Floor was only 34% —
two thirds of the route was free to vary and the filter returned 85% anyway. Mechanism:
`acceptByDiversity` tested each new candidate against the union of what was **already** accepted and
never re-tested an earlier route against a later one, so an accepted route could be swallowed by one
admitted after it and nothing looked. C2 added a pairwise reverse pass; the filter's guarantee is
now `max(overlap(a,b), overlap(b,a)) <= the rung's threshold`, which is exactly what `geo:verify`
reports. The pair reads **63% on three routes and PASSES**. Verified by independent enumeration over
the 692-node graph: **1,498 pairs, 5,498 accepted routes, 0 post-condition breaches — against 386 of
the same 1,498 pairs breaching under the old filter**, at a cost of 72 routes (1.3%) across the
sample. §3 has the mechanism and ADR 0025 Decision 5 has the amendment.

**Do not read "degree-1" as the test.** Palermo–Riyadh is degree-1 with a forced ferry and PASSES
at 69%, because the forced edge is only 15% of a 9,787 km journey. The **floor** is the verdict;
degree is context. **That distinction is now load-bearing rather than decorative**: it predicted
which of these two rows a filter change could move, and it was right about both.

**19 of 411 settlements on the shipped slice are degree-1.** Every one is a latent recurrence of the
STRUCTURAL half. None is a latent recurrence of the filter half any more.

**`pnpm geo:diversity` still exits 0 at median 53% — and its p90 is 87%.** But read that p90
correctly: it is each route against the **union of all the others**, a strictly stronger quantity
than the per-pair post-condition, so a fat tail there is not a breach. **As a per-pair guarantee,
"no two routes share more than 70%" is now a promise this system keeps — against the threshold of
the rung the pair was accepted at.** On the 200-pair sample, 40 pairs are held to 80% or 90% rather
than 70% because the ladder escalated. That weaker-but-true statement is the one to hand forward.

### FINDING 2 — The `selectPaths` benchmark FAILS its budget at p90 and max

**The handoff here is the verdict per statistic, not the milliseconds** — they move on every run and
`docs/phase-3-dod.md` gate 6 says so explicitly. At the 6× phone multiplier against a 150 ms budget:
mean **PASS**, p50 **PASS**, p90 **FAIL**, max **FAIL**. The sample behind that (Node/V8: mean
11.63 ms, p50 0.91, p90 42.11, max 122.95 → 69.8 / 5.5 / 252.7 / 737.7 on the phone estimate) is one
reading, kept for scale.

**C2 made it ~11.6% slower in the mean and changed no verdict.** Two-directional filtering pushes
pairs up the rung ladder, escalation buys more Yen, and Yen is ~95% of the call: mean ~11.9 → ~13.3
ms over repeated runs with non-overlapping bands, p50 ~6%, p90 ~3%, max unmoved. **Verdict-preserving
regression, accepted in ADR 0025** — the alternative was a diversity guarantee `geo:verify` could
contradict.

**The multiplier is not load-bearing.** Break-even: `max` needs ≤~1.2×, `p90` needs ≤~3.5×.
**p90 and max fail at 4×, 6× and 8× alike**, and that is true on both sides of C2.

**~95% of the call is Yen backfill** (5 raw Dijkstras are 0.63 ms mean), and cost is **super-linear
in hop count** — ms/hop quadruples from 0.115 (10–19 hops) to 0.511 (40+). Hops went 19 → 59 with
the continental slice, which is the whole mechanism.

**The multiplier itself is unevidenced and says so:** nothing in this repo has run on a phone,
ADR 0012 records Hermes as untested, and **Hermes has no JIT** while the 4–8× band comes from
JIT-ed comparisons — so 6× is as likely optimistic as pessimistic.

**The budget was not raised.** The stray-ratio bound this section proposed was built, swept and
**REFUTED** — p90 and max fail at every ratio including 1.10×, because Yen runs one Dijkstra per
spur node and its cost therefore scales with HOP COUNT, which a cost ceiling does not reduce. The
detour tail and the illicit dominance were unmoved too: three claims, none of which survived. §5
carries the measurement; the code was reverted rather than shipped. **The open fix is now to bound
the NUMBER of spur searches, not the cost of each — unmeasured, and nobody should quote it as a
plan until it is.**

### FINDING 3 — `ILLICIT STRICTLY DOMINATES` on 33.9% of pairs, and it is not a metric artefact

**139 of 410 (34%), re-measured post-C2** — it was 142 of 410 (34.6%) when this was written, and the
three pairs that left are pairs whose RETURNED route set changed under the new filter, not pairs
whose economics changed. §4's own text calls anything above 0 a design bug. **It still has no
owner.**

The obvious defence — that the three geometric tests are near-tautological for a distance-minimiser
that dodges border posts — was tested and **failed**. Adding preparation cost:
**133 of 410 (32%) are also cheapest to prepare — 96% of the dominant set survives**, the identical
survival rate measured on both sides of C2.

**The mechanism is the crossing count.** `recommendedCash` charges 45 per crossing; a dominant
illicit route avoids a **median of 14** (~630 cash), swamping the 125%-vs-85% `PROFILE_COST`
handicap. Durban→El Bayadh: 0 crossings against 32, 12,580 km against 20,851.

**The defensible statement: at generation time the illicit route has no visible downside on a third
of pairs.** Everything it gives up is paid at RUN time and is not a field on `RoutePreview`.

**The content consequence is now measured, not hypothesised.** `borderBeats = min(crossings, 4)`,
so a 0-crossing illicit route schedules **zero** border beats. Band 11 of the sweep is exactly that
case: 8,310 km, zero crossings, no `border_crossing` beat slot, `border.night_crossing`
unfilterable, and therefore **the corpus's only `scheduleEvent` edge structurally unreachable —
0 memory chains in 5,000 runs.** This is a content-reachability failure, not only a balance one.

### FINDING 4 — The ferry gap: 6 ferry edges in the entire graph, and a road to an island

**6 ferry edges, 3 corridors, all western-Mediterranean** (Barcelona–Sardinia, Algiers–Barcelona,
Tunis–Palermo), all **authored in `overlay.yaml`**. `build-edges.ts` never generates a ferry. The
overlay was written for the 263-node slice and was not extended when the bbox went continental.

**9 of the 19 degree-1 settlements carry `terrain: coast`; exactly 2 (Palermo, Sassari) are
ferry-attached.** Every other one, islands included, hangs off a **road** edge.

**The mechanism was measured, not asserted.** `build-edges.ts` samples `WATER_SAMPLES = 9` points
and refuses below `MIN_LAND_PERCENT = 70`. Against the real `ne_10m_land.geojson`:

- **Seoul–Jeju City reads 77% land ⇒ ACCEPTED** as a 630 km road corridor **to an island** (7 of 9
  samples land on the peninsula, 2 on the strait). It ships typed `bus/car/truck/rideshare`, with
  no ferry.
- **Jeju City–Busan, the geographically real link, reads 11% ⇒ correctly refused.**

**The threshold hands Jeju a road precisely where a boat belongs.**

Across all 1,215 shipped edges: 1,149 are 100% land, 6 are the authored ferries, **60 are non-ferry
edges under 89% land, and 14 are below the 70% threshold that should have refused them outright.**
**13 of those 14 touch a border-crossing node** — `place-borders.ts` **splits** an edge to insert a
crossing and the two halves are never re-tested for water. The 14th is Istanbul–Canakkale, the one
authored `forcedCorridors` row, exempt by intent.

Run-time corroboration: **not one of the twelve swept routes has a ferry hop**, including a
trans-Asia and a trans-Africa crossing. (This sentence used to continue "`ferry_boarding` is in
`pack.unfillableBeatTypes` _and_ unreachable by geometry"; **both halves are retired at C3** — see
§6.4. The water-test finding above is unaffected, since it is about non-ferry edges.)

**This is `geo:build`'s, and it has no owner.**

### Also open, reported and NOT fixed

- **38 `winter_closed` edges of 1,215 (3%), none flagged `unavoidable`**, cause 126 of 410 rung-0
  refusals for `fastest`/`cheapest`/`safest`. The cost is diversity, not reachability: the ladder
  reaches rung 4 on only 6 of 200 pairs (5 before C2), so on 31% of pairs the pool is built from
  `scenic`, `illicit` and Yen backfill. `mark-unavoidable.ts` exists and has set the flag on none.
- ~~**`acceptByDiversity`'s directional guarantee**~~ (Finding 1's mechanism) — **CLOSED at C2.**
  The filter now bounds the same quantity `verifyPair` reports; 0 post-condition breaches over 1,498
  enumerated pairs. The cost was ~11.6% on the `selectPaths` mean and one extra pair escalated to
  rung 4; Finding 2's verdicts are unchanged by both.
- **§4's wording** printed a geometric test as though it were a cost-function claim.
- ~~**Four of six beat types are unfillable** by the shipped corpus~~ — **CLOSED at C3.** Four
  events land `departure`, `ferry_boarding`, `approach` and `finale`; `pack.unfillableBeatTypes` is
  empty and corpus beat fill is 28.2% → 47.8% against a structural ceiling that moved 55.8% → 100%.
  **§7's ceiling is retired, but §7's verdict is not**: bands 9–10 are short on `border_crossing`,
  which C3 did not touch and which did not move (45.0% → 43.8%). §7.7 item 1 records what the
  corpus measurement already implies and what the band re-run still owes.
- **NEW, and it is what §7.7 item 1 turned into: a beat event COMPETES for its slot.** Gate 3
  restricts a beat event to a matching open slot; it does not restrict the pool to beat events, so
  `PRIORITY_BOOST.beat = 1.0` leaves it at even odds with every normal event on that leg — against
  a comment asserting the gate already did the restricting. `approach` (slack 2) fills 98.6%,
  `departure` (slack 0) 31.2%. **Measured, not fixed**: it is a director constant and C3 is a
  content milestone.
- **The memory-chain mechanism is one authored `scheduleEvent` edge.** Verified by grep.
- **`RoutePreview` has no risk field and no scalar was invented.** Compressing crossings, terrain,
  ferry/toll hops and profile into one number is a design decision with no owner.

---

## 9. What could not be measured, and why

1. **"No legal route" — cannot exist, and that is a result rather than a failure to look.** The
   shipped graph is one connected component of 692 nodes, verified directly. ADR 0036 permits
   several (one per landmass) and `--stage=all` refuses to write a fragment below
   `MIN_LANDMASS_NODES`. The nearest real thing is reported instead: a **profile-level** refusal,
   with Palermo's ferry-only attachment against `illicit`'s ferry mask as the exact case.
2. **RISK — refused on principle.** No risk field exists on `RoutePreview`, `GeoNode` or `GeoEdge`,
   and §11 forbids deriving one from place identity. The constituent physical facts are printed
   instead.
3. **Real in-game days, cash spent, events fired, memory chains and completion as balance figures.**
   All are functions of the CONTENT PACK as well as the route. §2's `days` and `cash` are the
   PREVIEW's advisory figures only. The authoritative ones live in `pnpm sim --pack=corpus` and
   `docs/sim-baseline-corpus.md`; a second copy here would drift from the one anybody acts on.
4. **Whether the illicit trade is FAIR.** Finding 3 shows it dominates on every generation-time
   number that exists. Whether heat, wanted level and event rates pay for that is a corpus-sim
   question and was not guessed at.
5. **Hermes / real device performance.** See §5a. An assumption, mitigated by break-even reporting,
   not resolved.
6. **Real play minutes.** There is no UI. `apps/mobile/src/features/{map,prep,journey,journal}` is
   `(planned)`; no animation code exists; Instant mode, the speed scale and reduce-motion have no
   implementation. §6.3 has **no presentation term at all** — no transition, no dice landing, no
   result-screen reveal, no skip. It is a text-and-taps model of a game that does not yet render.
   Every figure is a floor.
7. **The preparation phase.** Step 4 does not exist; `generateRoutes` derives a start block
   instead. Zero minutes of §6.3 are prep, and prep is one of the two decisions CLAUDE.md §1 calls
   meaningful.
8. **Route selection time.** Step 2 renders 3–5 candidates for the player to compare. No
   route-preview screen exists, so the first meaningful decision costs zero measured minutes.
9. **The journal.** `unlockedEndings` is populated and `unresolvedThreads` returns labelled
   threads, but no renderer exists; end-of-run reading time is excluded entirely.
10. **`superseded` against `expired` against `evicted` queue drops.** `runOne` exposes
    `queueDrops.length` only, so §6.4's "left unfired" lumps a retired duplicate sibling in with a
    genuinely abandoned promise and **over-reports abandonment**. Splitting them needs a field on
    `AdvanceLegResult`.
11. **Whether the quiet gate changes any of §6.** At `BASE_EVENT_ODDS = 1:0` quiet share is 0.0% on
    all twelve and the `montage: 3` factor is inert. Every "events fired" and "play minutes" figure
    is an upper bound. Band _ordering_ should survive; the absolute numbers will not.
12. **Ferry behaviour at any distance.** None of the twelve has a ferry hop and `ferry_boarding` is
    unfillable — two independent reasons a ferry column would be empty. None was fabricated.
    **C3 removed the second reason and refuted the generalisation behind the first**: the corpus
    route set does carry ferries (4 of 23 routes, 8 slots), and `transit.the_boarding_queue` fills
    20.8% of the 696 that are reached. The twelve-band sweep still has no ferry column, because
    those twelve routes still have no ferry hop.
13. **The 43.1% pooled completion figure was not re-measured.** It is `sim`'s, from
    `docs/sim-baseline-corpus.md`, not this verification's, and nothing here touches it.

### One thing this report will not do

**No number here attaches danger, corruption or difficulty to a place.** Band 11's 25.6% completion
is **348 travel hours in a truck**, not Asia. Band 12's 28.5% is **410 hours on a bus**, not Africa.
Difficulty is attributed to route PROFILE, to physical facts (travel hours, transport mode,
terrain-derived leg density) and to player STATE — never to where the route happens to run. §3's
column is **border-free**, not "domestic", because the count of `border_crossing` nodes is what is
checkable and no geo file carries a country code. CLAUDE.md §11 holds throughout.

---

## 10. Checks

| check                | result                                                                            |
| -------------------- | --------------------------------------------------------------------------------- |
| `pnpm typecheck`     | **CLEAN** — all four projects                                                     |
| `pnpm lint`          | **CLEAN**                                                                         |
| `pnpm test`          | **GREEN** — 85 files / 1,825 tests, plus jest 2 / 3                               |
| `pnpm content:lint`  | **CLEAN** — 0 errors; 1 pre-existing unrelated warning, `MISSING_IMAGE_MANIFEST`  |
| `pnpm format:check`  | **CLEAN** — three geo-build files needed `--write`; formatting only, no behaviour |
| `pnpm sim:diff`      | **NOT RUN AND NOT REQUIRED** — no engine behaviour changed                        |
| `pnpm geo:diversity` | still exits 0, median 54% — **53% (n = 747) post-C2**                             |

**DoD 6 is not triggered.** Every code edit is in `packages/tools/geo-build/`; `packages/engine` is
untouched. No goldens, no baselines. New behaviour has tests: 17 in `route-structure.test.ts` plus
6 added to `verify-routes.test.ts`, with expectations derived from `DIVERSITY_PASS_THRESHOLD` and
never from a literal 70.

**DoD 8: CLAUDE.md needs no update** — no command, rule or layout changed. This file is new
documentation, linked from `docs/PROGRESS.md`.

**Nothing in this session is committed.**

---

## 11. REFUTED: the Yen stray-ratio bound

Proposed in §5 and §10 as "one change, three findings closed". Built, swept, measured, **reverted**.
No code from it is in the tree. Recorded here so nobody proposes it a second time.

**Implemented as a genuine prune, not a filter.** A `maxCost` ceiling consumed inside the spur
Dijkstra (`break` once the cheapest frontier entry exceeds budget; never enqueue a relaxation above
it), plus moving the root cost computation _before_ the spur search so the ceiling is available to it. Verified
by instrumented pops-per-call falling, which a post-filter cannot do.

**Swept** at 1.10× / 1.25× / 1.50× / 2.00× / 3.00× against an unbounded control that reproduced
every committed deterministic statistic byte-for-byte.

| claim                       | verdict                                                   |
| --------------------------- | --------------------------------------------------------- |
| fixes the p90/max benchmark | **FALSE** — both fail at every ratio, 1.10× included      |
| deletes the detour tail     | **FALSE** — max 10.71× at every ratio                     |
| dents illicit dominance     | **FALSE** — 142 of 410 at every ratio, not one pair moved |

The sweep's control was the pre-C2 filter, so its 142 is the pre-C2 count; §4(c) reads 139 today.
The numbers are left as they were measured — re-stating a refuted sweep against a tree it never ran
on would be inventing an experiment — and the claim it refutes is unaffected either way.

**Why the benchmark claim was wrong, and it is the transferable part.** The attribution was right
(Yen is ~95% of the call) and the inference from it was wrong. Yen runs one Dijkstra _per spur node
along the path_, so its cost scales with **hop count**, and hops went 19 → 59 with the continental
slice. Bounding how far each spur may stray does not change how many spur searches run. p90 must
shed 41.8% of the work and max 80.4%; the mechanism removes at most 7.5% without also removing the
routes. The saving is a cliff — 88.4% of the work survives at 1.05×, 18.8% at 1.00×, and 1.00×
returns 0.82 paths per call against 4.91, which is generation switched off rather than bounded.

**Why the illicit claim was wrong.** `illicitDominates` compares the routes `selectPaths` RETURNS,
and `illicit`'s winner is its own rung-0 profile shortest path — never a Yen backfill. A bound on
backfill candidates cannot touch it. The real cause is the one FINDING 3 already names: the other
four profiles are masked out of crossing an admin boundary except at a `border_crossing` node, so
they detour to reach one while `illicit` walks over for a flat +150, avoiding a median of 14
controlled crossings at 45 cash each. It is a cost-function and mask problem, not a search problem.

**Why nothing was kept.** The tightest ratio leaving every green gate green (200%) still cost one
pair of 410 its ladder minimum, and keeping the suite green required relaxing a pre-existing
assertion in `yen-k-shortest.test.ts` that had held since the file was written. A bound that fixes
nothing, costs a route, and needs an existing test loosened is worse than no bound.

**What is still open.** The benchmark fix is to bound the NUMBER of spur searches — cap the spur
nodes considered, or cap `k` by hop count. That is **unmeasured**; it is the next thing to try, not
a plan to quote.
