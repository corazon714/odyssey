# 02 — Motor Spesifikasyonu

Bu dosyayı `docs/engine-spec.md` olarak repoya koy ve promptlarda referans ver.
Claude Code'a "kendin tasarla" demek yerine somut hedef vermek, üç kat daha az iterasyon demek.

---

## 1. RunState

```ts
export interface RunState {
  readonly version: number;            // save schema version
  readonly contentVersion: string;     // content pack hash
  readonly seed: string;
  rngCursors: Record<RngStream, number>;

  clock: { day: number; hour: number; weekday: 0|1|2|3|4|5|6 };
  weather: WeatherId;

  route: {
    id: string;
    profile: RouteProfile;             // fastest | cheapest | safest | scenic | illicit
    nodes: NodeId[];
    edges: EdgeRef[];
    legIndex: number;
    legCount: number;
    progressKm: number;
    totalKm: number;
    beatSchedule: BeatSlot[];
  };

  transport: {
    mode: TransportMode;               // foot | bus | train | car | truck | ferry | rideshare
    vehicleId: string | null;
    condition: number;                 // 0-10, 0 = broken down
    fuel: number;                      // 0-10, mode-dependent relevance
    legal: boolean;                    // stolen/unregistered vehicle
  };

  resources: {
    money: number;      // primary currency, no upper bound
    energy: number;     // 0-10  fatigue
    health: number;     // 0-10  injury/illness
    morale: number;     // 0-10  quitting risk
    hunger: number;     // 0-10  higher = hungrier
    hygiene: number;    // 0-10  affects social/authority outcomes
    heat: number;       // 0-10  police/criminal attention
    reputation: number; // -5..+5 how the road treats you
  };

  skills: {
    negotiation: number; stealth: number; mechanics: number;
    streetwise: number; endurance: number;
    languages: LanguageId[];
  };

  traits: TraitId[];
  inventory: Array<{ id: ItemId; count: number; condition?: number }>;

  documents: {
    passport: { present: boolean; valid: boolean; flagged: boolean } | null;
    visas: Record<RegionId, { valid: boolean; expiresDay: number | null }>;
    tickets: Array<{ id: string; forEdge: EdgeRef; used: boolean }>;
  };

  // ── MEMORY (three mechanisms) ────────────────────────────────
  flags: Record<FlagId, { value: boolean | number | string; setAtLeg: number; expiresAtLeg?: number }>;
  relationships: Record<NpcId, { trust: number; met: boolean; lastSeenLeg: number; tags: string[] }>;
  eventMemory: Record<EventId, { count: number; lastLeg: number; lastChoiceId?: string }>;
  pendingEvents: Array<{
    eventId: EventId; earliestLeg: number; latestLeg: number;
    requires?: Predicate; source: EventId; payload?: Record<string, unknown>;
  }>;
  // ─────────────────────────────────────────────────────────────

  history: HistoryEntry[];
  tension: number;                     // 0-1, director pacing signal
  unlockedEndings: EndingId[];
  status: 'preparing' | 'travelling' | 'ended';
}
```

**Kural:** `RunState` tamamen JSON-serileştirilebilir olmalı. İçinde fonksiyon, `Map`, `Set`,
`Date`, sınıf örneği **olamaz**. Replay ve save bunun üzerine kurulu.

---

## 2. Event

```yaml
# packages/content/events/border/bribe_attempt.yaml
id: border.bribe_attempt
version: 1
category: border
tags: [authority, money, risk, corruption]
priority: beat            # filler | normal | beat | critical
beatType: border_crossing
weight: 100
tensionBand: [0.4, 1.0]   # only eligible when director tension is in this band

context:
  locationTypes: [border_crossing, checkpoint]
  timeOfDay: [evening, night]
  transportModes: [car, truck, bus]

cooldownLegs: 999          # effectively once per run
maxOccurrences: 1
exclusiveGroup: border_resolution   # only one event from this group per leg

requires:
  all:
    - { resource: money, gte: 30 }
    - not: { flag: bribed_this_border }

image: border/bribe_attempt          # -> images/manifest.json
text:
  titleKey: events.border.bribe_attempt.title
  bodyKey:  events.border.bribe_attempt.body

choices:
  - id: offer_bribe
    labelKey: events.border.bribe_attempt.choice.offer
    costs:
      - { op: resource, key: money, delta: -40 }
    skillCheck:
      skill: negotiation
      dc: 5
      visibility: partial              # hidden | partial | full
      modifiers:
        - { when: { trait: smooth_talker }, delta: +2 }
        - { when: { resource: hygiene, lte: 3 }, delta: -2 }
        - { when: { flag: wanted }, delta: -3 }
    outcomes:
      - weight: 1
        onCheck: success
        textKey: events.border.bribe_attempt.out.success
        effects:
          - { op: flag, id: bribed_this_border, value: true, ttlLegs: 1 }
          - { op: relationship, npc: border_guard_archetype, trustDelta: +1 }
          - { op: advanceTime, hours: 1 }
          # long-range memory: the guard may reappear
          - { op: scheduleEvent, eventId: border.guard_remembers, inLegs: [4, 12],
              requires: { context: { locationTypes: [border_crossing, checkpoint] } } }
      - weight: 3
        onCheck: failure
        textKey: events.border.bribe_attempt.out.refused
        effects:
          - { op: resource, key: heat, delta: +2 }
          - { op: flag, id: bribe_on_record, value: true }
      - weight: 1
        onCheck: failure
        requires: { resource: heat, gte: 5 }
        textKey: events.border.bribe_attempt.out.detained
        effects:
          - { op: flag, id: detained, value: true }
          - { op: advanceTime, hours: 14 }
          - { op: resource, key: morale, delta: -3 }

  - id: present_documents
    labelKey: events.border.bribe_attempt.choice.documents
    requires: { document: passport, present: true, valid: true }
    outcomes:
      - weight: 4
        textKey: events.border.bribe_attempt.out.waved_through
        effects: [{ op: advanceTime, hours: 2 }]
      - weight: 1
        requires: { flag: wanted }
        textKey: events.border.bribe_attempt.out.flagged_in_system
        effects:
          - { op: flag, id: detained, value: true }
          - { op: unlockEnding, id: ending.detained_at_border }

  - id: turn_back
    labelKey: events.border.bribe_attempt.choice.turn_back
    hiddenUnless: { resource: heat, gte: 6 }    # unlocked choice — reward for state
    outcomes:
      - weight: 1
        textKey: events.border.bribe_attempt.out.detour
        effects:
          - { op: advanceTime, hours: 20 }
          - { op: resource, key: morale, delta: -2 }
          - { op: flag, id: took_the_long_way, value: true }
```

---

## 3. Hafızanın üç mekanizması — ne zaman hangisi?

| İhtiyaç | Mekanizma | Örnek |
|---|---|---|
| Kalıcı bir durum, ileride birçok yerde okunacak | **flag** | `passport_lost`, `wanted`, `owes:dmitri` |
| Belirli bir olay, gelecekte bir aralıkta tetiklenmeli | **scheduleEvent** | Rüşvet verdiğin gardiyan 4-12 etap sonra karşına çıkar |
| "Bunu daha önce yaşadın" varyantı | **eventMemory / seen** | İkinci kez otobüsten atılınca farklı metin |
| Bir NPC'nin sana karşı tutumu | **relationship** | Dmitri'ye borcun varsa yardım etmez |
| Geçici durum | **flag + ttlLegs** | `bribed_this_border` (1 etap) |
| Anlatı özeti / final | **history** | Journal ve ending girdileri |

**Anti-pattern:** her şeyi flag yapmak. 400 flag'lik bir sistem yönetilemez. Flag'ler
`flags.yaml`'da tanımlı olmalı ve linter, yazılıp hiç okunmayan flag'leri hata olarak vermeli.

---

## 4. Director seçim algoritması

```ts
function selectEvent(state: RunState, pool: GameEvent[], rng: Rng): GameEvent {
  // 1) Pending queue has priority
  const due = state.pendingEvents.filter(p =>
    state.route.legIndex >= p.earliestLeg &&
    state.route.legIndex <= p.latestLeg &&
    (!p.requires || evaluate(p.requires, state).value)
  );
  if (due.length) return byId(rng.pick(due).eventId);

  // 2) Beat slot?
  const beat = state.route.beatSchedule.find(b => b.legIndex === state.route.legIndex);
  const candidates = beat
    ? pool.filter(e => e.priority === 'beat' && e.beatType === beat.type)
    : pool.filter(e => e.priority !== 'beat');

  // 3) Filter
  const eligible = candidates.filter(e =>
    evaluate(e.requires, state).value &&
    contextMatches(e.context, state) &&
    cooldownOk(e, state) &&
    underMaxOccurrences(e, state) &&
    exclusiveGroupFree(e, state)
  );

  if (!eligible.length) return fallbackFiller(state, rng);   // never crash

  // 4) Score
  const scored = eligible.map(e => ({
    e,
    w: e.weight
      * contextMultiplier(e, state)      // e.g. region/time affinity
      * tensionFit(e.tensionBand, state.tension)
      * novelty(e, state)                // 1 / (1 + seen * DECAY)
      * recencyPenalty(e, state)         // 0.05 if seen in last 3 legs
      * priorityBoost(e.priority)
  })).filter(x => x.w > 0);

  return rng.weightedPick(scored, 'eventPick').e;
}
```

**Tension eğrisi:** `tension` her etapta kaynak baskısı (para/sağlık/heat) ve rota ilerlemesi
ile güncellenir; ayrıca bir "nefes alma" mekanizması — üst üste 2 yüksek gerilim olayından
sonra bir sonraki etapta düşük gerilim bandı zorlanır. Sürekli kriz = duyarsızlaşma.

---

## 5. RNG

```ts
type RngStream =
  | 'eventPick' | 'outcomeRoll' | 'skillCheck'
  | 'npcGen' | 'encounterFlavor' | 'worldTick' | 'routeGen';

// Substream = hash(seed + ':' + stream), cursor stored in RunState.rngCursors[stream]
// Adding a new call in 'skillCheck' must NOT shift results in 'eventPick'.
```

Bu izolasyon test edilmeli. Aksi halde bir olay eklediğinde tüm eski seed'lerin sonucu değişir
ve regresyon testlerin çöker.

---

## 6. Simülasyon raporu — hedef format

```
# Sim Report — seed=base contentVersion=a3f9 runs=20000 policy=random

Completion rate            41.2%   (target band 30-50%)
Median legs                 27
Median in-game days         11
Never-fired events          14  ← see list
Empty-pool fallbacks       0.8%   (target <2%)
Long-range payoff rate     73.1%  ← BELOW TARGET (80%)
Repeat-event rate           4.2%

## Endings
arrival.triumphant  8.1% | arrival.hollow 19.4% | arrival.hunted 6.9% ...
failure.detained   14.2% | failure.stranded 11.8% ...

## Never-fired events
border.guard_remembers        requires unreachable? scheduled 2140x, fired 0x  ← BUG
city.fence_contact            requires streetwise>=6, max observed 4           ← BALANCE

## Choices picked <2%
transit.bus_ejection / plead_with_driver    0.4%   ← trap or invisible

## Resource trajectories (p10/p50/p90 by leg)
money  leg5: 12/98/340   leg15: 0/31/210   leg25: 0/8/160
```

Bu raporun kendisi bir spec. Claude Code'a "şu formatta rapor üret" demek, "iyi bir rapor üret"
demekten çok daha iyi sonuç verir.

---

# PART II — AS BUILT (Phase 1, 2026-08-08)

> Everything above this line is the ORIGINAL SPEC and is left unedited, including where the
> implementation diverged from it. This part is written **from the code**, not from the plan,
> and every list below was printed out of the built barrel rather than transcribed.
>
> Where Part I and Part II disagree, **Part II is what runs**. Each divergence names the ADR
> that authorised it. `packages/content/schema/` now holds nine modules and is authoritative over
> content SEMANTICS; the engine's TypeScript types remain authoritative over SHAPE — see ADR 0009
> and ADR 0019.
>
> **§II.1 was re-printed from the built barrel on 2026-08-09 (Phase 3 M3.1).** It had gone stale in
> five places since Phase 1 — `EFFECT_OPS` was 12 against 15, `RESOURCE_KEYS` still said `money`,
> the predicate count said 27 against 28, `SAVE_VERSION` said 1 against 4, and the barrel-export
> count said 159 against 192. A block that claims to be printed from the code has to be reprinted
> when the code moves; **reprint it rather than patch it.**

## II.1 Vocabularies, as exported

```
RNG_STREAMS       eventPick · outcomeRoll · skillCheck · npcGen · encounterFlavor
                  worldTick · routeGen · chanceGate            ← 8, spec §5 listed 7
EFFECT_OPS        resource · skill · flag · clearFlag · relationship · advanceTime
                  scheduleEvent · unlockEnding · item · transport · document · route
                  moveItem · loseContainer · grantContainer     ← 15, spec implied 11
EVENT_PRIORITIES  filler · normal · beat · critical
BEAT_TYPES        departure · border_crossing · ferry_boarding · midpoint_crisis
                  approach · finale
LOCATION_TYPES    border_crossing · checkpoint · city · town · village · roadside
                  rest_stop · station · port · wilderness
RESOURCE_KEYS     cash · bank · energy · health · morale · hunger · hygiene · heat
                  reputation                                    ← 9, ADR 0016 split money
SKILL_KEYS        negotiation · stealth · mechanics · streetwise · endurance
TRANSPORT_MODES   foot · bus · train · car · truck · ferry · rideshare
ROUTE_PROFILES    fastest · cheapest · safest · scenic · illicit
RUN_STATUSES      preparing · travelling · ended
CONTAINER_KINDS   person · bag · vehicle · stash                ← ADR 0017
BEAT_SLOT_STATUSES pending · filled · slid · expired            ← ADR 0013
CHECK_TAGS        social · haggle · deception · intimidate · authority · bribery · language
                  stealth · crime · search · documents · physical · endurance · mechanics
                  medical · navigate · perception · luck        ← 18, ADR 0015
PREDICATE kinds   28, kind-tagged (ADR 0007)
ERROR CODES       11, all RETURNED — the engine never throws
MOOD_IDS          default · night · wanted · destitute · desperate · injured · wilderness
                  urban · border_tension · storm · triumphant  ← 11, presentation NOT content
MOOD_OVERLAYS     night · storm                                ← the two that also layer
```

`SAVE_VERSION = 4` · `CHECK_DIE_SIDES = 20` · `MAX_PENDING = 32` / 3 per event · 192 barrel
exports.

### II.1a `moodFromState` — a presentation derivation in the engine

`packages/engine/src/presentation/mood.ts`. Pure, deterministic, reads `RunState` and nothing else.

**Why it is engine code at all.** It branches on nine BALANCE THRESHOLDS (`heat >= 7`,
`health <= 3`, `cash + bank === 0`, …), and a balance threshold inside a React component is the
shape CLAUDE.md's app-layer rule exists to forbid. The second reason decided it: with the
derivation here, the sim can fold mood occupancy over a corpus, so "the exhausted presentation
would be very nearly always-on" (`docs/phase-3-closeout.md` §6) becomes measurable rather than
asserted.

**Priority order, highest first.** Terminal state, then threat, then scene, then body, then
environment, then place:

| #  | mood                   | condition                                                     | measured share |
| -- | ---------------------- | ------------------------------------------------------------- | -------------: |
| 1  | `triumphant`           | `status === 'ended'` AND `ending.arrival_triumphant` unlocked   | 1.25% of runs  |
| 2  | `wanted`               | `heat >= 7`                                                    | 14.39%         |
| 3  | `destitute`            | `cash + bank === 0`                                            | 0.01%          |
| 4  | `border_tension`       | leg location is `border_crossing` or `checkpoint`               | 20.06%         |
| 5  | `injured`              | `health <= 3`                                                  | 5.98%          |
| 6  | `desperate`            | `morale <= 3`                                                  | 6.74%          |
| 7  | `storm`                | weather in `['rain', 'wind']`                                   | 21.13%         |
| 8  | `night`                | `timeOfDayFor(clock.hour) === 'night'`                          | 8.93%          |
| 9  | `wilderness` / `urban` | leg location is `wilderness` / `city` or `town`                 | 3.21% / 9.56%  |
| 10 | `default`              | —                                                              | 9.95%          |

Shares are `pnpm sim -- --pack=corpus --runs=2800 --moods`, 28 routes, 81,133 legs.

### `destitute` and `desperate` were ONE mood, and the split was not a retune

The original `desperate` required `cash + bank === 0` AND a failing meter and fired on **11 legs in
81,133**. The defect was not the threshold: **its NAME and its PREDICATE disagreed.** `desperate`
reads as a state of the person; the predicate measured the state of the wallet, and those come
apart constantly. Tuning the conjunction would have moved a number that was measuring the wrong
thing.

- **`destitute`** keeps the money predicate, alone. Still rare — 11 legs, and 10 of 2,800 runs end
  in it — because `wanted` suppresses 74% of its raw occurrences (43 legs raw). Being broke and
  being hunted correlate, which is unsurprising once said aloud: bribes cost money and raise heat.
- **`desperate`** is now the person: `morale <= 3`, and **no energy term**. `energy <= 1` holds on
  **71.19%** of legs, so energy is floored for three quarters of the game and carries almost no
  information. Measured, `morale <= 3 && energy <= 3` fires on 15.76% against `morale <= 3` alone
  at 15.79% — **0.03 points**. Energy being non-informative is a BALANCE finding with its own
  owner.

The threshold was chosen as a SHARE, not a number: `morale <= 2` would have landed near 5.7%,
below `injured`, making exhaustion rarer than injury. `morale <= 3` lands at 6.74% — above injury
because it is a recurring condition, below night because it is not ambient.

Four further decisions are not obvious and are argued in the file:

- **`wanted` outranks `injured`** because heat is an external escalating threat with a scene
  attached, while low health is already displayed continuously by the resource meter. If `injured`
  won, a hurt player at heat 9 would lose the siren exactly when it matters most.
- **`triumphant` is gated on `status`, and that gate is load-bearing.** Content unlocks arrival
  variants DURING a run — `check-run-end.ts` filters `unlockedEndings` for them at arrival — so
  `ending.arrival_triumphant` can sit in the list for twenty legs. Without the gate the world would
  turn triumphant mid-journey.
- **`storm` is `['rain', 'wind']`, deliberately NOT `world-tick.ts`'s
  `HARSH_WEATHER = ['rain', 'wind', 'heat']`.** That is a drain-economy constant the balance sweep
  may move, and a heat wave is not a storm. Same coupling argument as `WEAR_BANDS`.
- **`urban` is derived, because there is no `urban` LocationType** — it is `city` or `town`.
  `village`, `rest_stop`, `station` and `port` map to nothing, and `fog` is a real `WEATHERS`
  member with nowhere to go. Recorded gaps rather than mislabelling.

**`moodOverlaysFromState`** returns `night` and `storm` a second time, as orthogonal layers, so
they still tint when outranked — a night border crossing must still look like night. Both are
therefore in `MOOD_IDS` and in `MOOD_OVERLAYS`, and **a consumer applying both will
double-darken**; the app's `useMood()` is the single place that resolves them.

**No colour, no asset, no duration lives here.** `MoodId` is an abstract vocabulary; every hex
value is in `apps/mobile/src/design/`. `MOOD_IDS` is classified `NOT_CONTENT` in the L2 conformance
sweep, so nothing authored can filter on mood — a `requires: { mood: 'wanted' }` would make the art
direction unchangeable without a content migration.

## II.2 Divergences from Part I

| Part I says | As built | Why |
| --- | --- | --- |
| 7 RNG streams | **8** — adds `chanceGate` | A `{chance:p}` drawing from `eventPick` would make the draw COUNT depend on pool size, so adding one event would shift every later draw. ADR 0005 §2 |
| `rngCursors` over a stateful PRNG | **Counter-based**: `drawWord(streamKey, counter)`, murmur3 x86_32, no BigInt | Stream isolation becomes structural, not probabilistic. Hermes-safe, published vectors. ADR 0005 §1 |
| `tensionBand` gates eligibility | **Soft scoring factor**, `[0.25, 1.50]` | Hard-gating a continuous signal is the fastest way to blow §6's own <2% empty-pool target. ADR 0005 §5 |
| Terse `{resource:money, gte:30}` predicates | **Canonical `kind`-tagged union** in the engine; content normalises | Key-as-discriminant cannot narrow in TypeScript. ADR 0007 §1 |
| `requires?`, `payload?`, `condition?` optional | **`\| null`**, no optional properties in state | `exactOptionalPropertyTypes` + `undefined` does not survive `JSON.stringify`. ADR 0006 §1 |
| `resolveChoice(state, choiceId, rng)` | **`resolveChoice(state, pack, choiceId)`** — rng derived from state | An injected generator whose cursors are not in state breaks replay. ADR 0005 |
| — | **`RunState.presentation`** added | `resolveChoice` needs to know what was presented; without it engine state leaks to the UI. ADR 0006 §4 |
| — | **`RouteState.legLocations`** added | `context.locationTypes` is unevaluable without per-leg location. Found at M6 |
| Schemas are the single source of truth | **Engine owns types; schema owns semantics**, held equal by a bidirectional assertion | `z.infer` would invert the layering. ADR 0009 §1, CLAUDE.md §9 amended |

## II.3 The director, as implemented

```
score = weight × contextAffinity × tensionFit × novelty × recency × tagSaturation × priorityBoost
pickWeight = clampInt(round(score), 1, 1_000_000)
```

**The multiplication order is part of the replay contract** — float multiplication is not
associative, so reordering changes `Math.round`, which changes the pick. `SCORING_FACTORS`
declares it as data and a test folds over it. **`pickWeight >= 1` is the invariant** separating
filtering from scoring: the product's lower bound is ~0.000125 and rounds to zero.

**Two anti-repetition windows, both denominated in FIRED EVENTS** (`RECENCY_WINDOW` 6,
`TAG_WINDOW` 8) — a leg the quiet-leg gate silenced is not a draw and consumes no slot in either.
**`cooldownLegs` is the deliberate exception and counts WALL-CLOCK legs**, quiet ones included: it
is authored content in a field named for its unit, and a montage stretch would otherwise freeze
every cooldown across it. ADR 0029 addendum II carries both calls and the six-site sweep behind
them.

Relaxation ladder — 6 rungs, then filler (6), then `uneventful` (7):

```
0 nothing · 1 beatGate · 2 exclusiveGroup · 3 softContext · 4 cooldown · 5 locationTypes
```

**`requires` and `maxOccurrences` appear on NO rung.** Asserted across all six, plus a third
test proving the ladder does relax what it should — otherwise the first two pass vacuously.

## II.4 What Part I promised that Phase 1 does NOT ship

- **Route generation** — k-shortest paths, candidate routes, `legCountFor`. The route is
  caller-supplied via `RunInit.route`, including `legCount`, `beatSchedule` and `legLocations`.
- **Beat schedule GENERATION** — the engine consumes and validates a supplied schedule.
- **The four registries** (`modifiers`, `complications`, `universal-choices`, `quirks`) — the
  two integration SEAMS ship empty and tested; the content does not exist.
- **`packages/content`** — no schemas, no YAML, no seed events. Phase 1 fixtures are JSON under
  `packages/engine/src/__tests__/__fixtures__/`.

## II.5 §6 report — what the sim actually prints

Implemented in `packages/tools/sim/format-report.ts`, verified against 20,000 runs. Adds four
lines Part I did not specify, each because it made a real bug visible:

- **Beat fill rate** — routes can schedule beat types no event fills
- **Unresolved threads** — promises a run ended owing (found a queue leak at M8)
- **Flags written-but-never-read / read-but-never-written** — the second found `wanted`, a gate
  that can never open
- **Dangling content references** — with the event each was found in

Phase 3 M3.12a added three more: **Quiet legs (designed)** and **Forced-fire legs**, which keep
designed silence and a content gap distinguishable (ADR 0029 D7 item 4), and **Near-repeat rate**,
the less confounded of the report's two repetition lines — `Repeat-event rate` above it is a share
of DRAWS and moves with the draw count alone. **Neither survives a change in how many events a
route draws unaided**: sharing units removes the scaling confound, not sequence compression, and
the near-repeat null at a 30% quiet share measures +7.6pp on the corpus and −5.7pp on the fixture
with the director untouched. Subtract a null baseline before reading either (ADR 0029 addendum
III).

`pnpm sim:diff` compares against `docs/sim-baseline.md`, which is committed and Prettier-ignored
so the fixed-width report is not reflowed.

## II.6 Known gaps, carried into Phase 2 deliberately

1. **Four engine mechanisms have never executed in any run** — skill-check modifier gating,
   outcome `requires` + `unlockEnding`, the `passport` predicate, and **`hiddenUnless`** (one
   instance in the pack, unreachable). See `docs/PROGRESS.md`.
2. **Determinism is proven on V8 only.** Golden runs will not catch a Hermes divergence until
   something runs them there.
3. **`worldTick`'s drift constants are structurally wrong**, not merely untuned: at 20,000 runs
   health's p10/p50/p90 collapse to `0/1/1` together, so the dominant failure mode is
   unaffected by player choice.
4. **`CHECK_DIE_SIDES = 20` is a placeholder.** Part I shows `dc: 5` with ±2–3 modifiers; a d20
   makes each modifier worth 5% while the skill swamps them.
