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
