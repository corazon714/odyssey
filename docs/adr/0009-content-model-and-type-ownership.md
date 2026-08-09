# 0009 — The content model, and who owns its types

- **Status:** Accepted
- **Date:** 2026-08-08
- **Amends:** `CLAUDE.md` §9

## Context

`CLAUDE.md` §9 said: _"Zod schemas in `packages/content/schema/` are authoritative — if the
doc and the schema disagree, the schema is right and the doc is a bug."_ Read alongside rule
2.6 ("content is data, validated by Zod"), the natural implication is that the engine's
`GameEvent`, `Choice`, `Outcome` and friends are `z.infer`red from those schemas.

That implication cannot be satisfied, and the conflict is an ordering problem as much as a
design one: the schemas are a **Phase 2** deliverable, while the engine needs the types in
**Phase 1 M5** to build a director against.

---

## Decision 1 — The engine owns the types; the schema owns the semantics

`z.infer` types are owned by whichever package declares the schema. If the engine imported
them:

- `packages/content` would own `GameEvent`, making `packages/engine` a **consumer of content**
  — the layering inverted, and every schema tweak becomes an engine API change.
- The engine would need a **Zod dependency**, which it does not have and whose absence is
  asserted by `purity.test.ts` against its manifest.
- The device bundle would ship a build-time validator to re-validate a pack that was already
  validated at build time.

Moving the schemas _into_ the engine fixes ownership and keeps the last two problems. So:

| Owns                           | What                                                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| `packages/engine/src/content/` | the TypeScript types — the parsed, runtime shape                                                   |
| `packages/content/schema/`     | the Zod schemas — which YAML fields exist, which values are legal, what an omitted key defaults to |

**Neither is authoritative over the other.** They are held identical by a **bidirectional**
compile-time assertion in Phase 2, mutual-extends so that a schema narrower _or_ wider than
the type fails the build:

```ts
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const _eventsMatch: Equals<z.infer<typeof gameEventSchema>, GameEvent> = true;
```

The drift the original wording was trying to prevent is prevented by a build failure rather
than by a rule nobody can enforce. `CLAUDE.md` §9 is amended to say so.

**The Phase 2 conformance surface is twelve types:** `GameEvent`, `Choice`, `Outcome`,
`SkillCheck`, `CheckModifier`, `EventContext`, `EventPriority`, `BeatType`, `LocationType`,
`TimeOfDay`, `Predicate`, `Effect`.

---

## Decision 2 — Optionality lives in the schema, not in the engine

ADR 0006 §1 allows `?` on "authored content types". That means the **authored** shape — what
Zod accepts from YAML — not the parsed shape.

The engine's content types follow the engine-wide rule: `| null` for scalars, empty arrays for
lists. Phase 2's `.default()` is what turns an omitted YAML key into `null` or `[]`. One rule
inside the engine; YAML ergonomics entirely in the schema layer.

**An empty constraint array means NO constraint**, not "matches nothing". `locationTypes: []`
is an event that can fire anywhere — the common case, so it is the cheap one to author.

---

## Decision 3 — Sort once, at pack construction

Content arrives from a filesystem glob whose order differs between operating systems, and CI
runs Linux **and** Windows. An unsorted candidate pool makes `weightedPick` select differently
per platform while every test passes on the machine that wrote them — a golden-run break that
only appears in someone else's CI.

`createContentPack` sorts into canonical id order once, and the ordering becomes a property of
the pack rather than something each caller must remember. Sorting per leg would also be
wasteful and would invite a later "optimisation" that removes it.

The comparison uses `<` on strings — exact UTF-16 code-unit order, never `localeCompare`
(ADR 0005 §3).

`ContentPack` is **not** `RunState`, so it may hold `Map`s. Only `version` reaches state.

---

## Decision 4 — Dangling references are collected, not discovered in play

ADR 0001 accepts a real cost: in a Quality-Based Narrative, content bugs are **silent**. An
event whose `requires` names an npc that no longer exists simply never fires, and nothing
errors.

`createContentPack` therefore walks every predicate and effect and reports
`danglingRefs` — each with the event it was found in, which is what makes a report
actionable. `packages/tools/content-lint` subsumes and extends this in Phase 2; shipping the
walk now means the fixture pack is checked from its first day, and the sim can report the
count.

The walk is deliberately **not** an exhaustive switch. Its job is to find id-bearing nodes, so
its `default` recurses into children rather than failing — adding a predicate kind cannot
silently drop references from an existing one.

---

## Decision 5 — Fixtures are JSON data in the engine, and are not the seed corpus

Phase 1's nine events live at `src/__tests__/__fixtures__/mini-pack.json`: **JSON, not `.ts`**,
so rule 2.6 ("content is data, never hardcoded in a `.ts` file") is honoured rather than bent.
That directory is invisible to both `tsconfig.src.json` and `purity.test.ts`, which is why it
is the right home.

`packages/content/events/` is untouched. The 12 seed events remain a Phase 2 deliverable
written against the content bible, and the fixtures must not become them.

> **AMENDED 2026-08-09 (Phase 2B M-D, see ADR 0022).** This said where the fixtures must NOT go
> and not where they should live, and they were occupying the only directory the corpus could
> use. They now live in **`packages/content/__fixtures__/events/`**, and
> `packages/content/events/` is the seed corpus. The split is what let thirteen seed events land
> without moving a single golden run.
>
> One consequence worth knowing: the fixture YAMLs are **unlinted**, because `content:lint`
> reads `events/` only. That is deliberate — they are frozen data whose only contract is
> reproducing `mini-pack.json` byte-for-byte, which `round-trip.test.ts` checks. Do not "fix"
> the gap by moving them back.

The pack is built to provide specific coverage rather than to be representative: **two
fillers** (the relaxation ladder's rung-6 floor needs at least two), beats for three beat
types, a **schedule/payoff pair** (`border.bribe_attempt` → `border.guard_remembers`), and one
event that can legitimately fail to fire, so the sim's never-fired line has something real to
report.

---

## Consequences

- `PredicateContext` can stop using `ALL_REFS_KNOWN`: a pack supplies real `ContentRefs`, so
  `unknown-ref` (ADR 0007 §4) starts firing on genuinely missing content.
- Phase 1 needs **no `yaml` dependency** and touches `packages/content` not at all. (Worth
  knowing for Phase 2: `yaml@2.9.0` is already in `node_modules` as an undeclared phantom via
  Vite, and must be added to the `catalog:` block before use.)
- `duplicateIds` is reported rather than silently last-wins, because two files claiming one id
  is a merge accident that would otherwise change behaviour based on read order.
- The engine still has **zero runtime dependencies**.
