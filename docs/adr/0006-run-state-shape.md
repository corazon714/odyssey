# 0006 — The shape of RunState

- **Status:** Accepted
- **Date:** 2026-08-08

## Context

`RunState` is the type every other engine subsystem reads and returns. engine-spec §1
specifies its fields; it does not specify the decisions below, each of which turned out to be
forced by something in the toolchain, by the simulation harness, or by replay.

The binding constraint throughout: **`JSON.parse(JSON.stringify(state))` must be the
identity.** Save, load and golden-run replay are all built on it.

---

## Decision 1 — No optional properties in engine state. Use `| null`

engine-spec §1 shows five optional fields (`expiresAtLeg?`, `lastChoiceId?`, `requires?`,
`payload?`, `condition?`). All become `| null`.

Two independent reasons, either sufficient:

- **`exactOptionalPropertyTypes` is on.** It makes `{ ...state, x: maybeUndefined }` an error
  wherever `x?: T` — which is precisely what a structural-sharing effect applier does on
  every leg of every run. The alternative is a cast at each site, i.e. deleting the flag's
  value while keeping its cost.
- **`undefined` does not survive `JSON.stringify` and `null` does.** An optional property
  silently changes shape across a save/load boundary: `{ x: undefined }` becomes `{}`. For a
  type whose whole contract is round-tripping, that is a bug generator.

**Authored content types keep `?`**, because omission is natural in YAML and content is
parsed once at build time rather than round-tripped every leg.

---

## Decision 2 — Clamps are recorded, never silent

`clampResources` and `clampSkills` return `{ value, clamps: ClampEvent[] }` rather than
applying `Math.min`/`Math.max` in place.

"Money floors at 0 in 60% of runs after leg 15" is a **balance finding**, and a silent clamp
makes it unobservable. engine-spec §6 asks the sim for resource trajectories; those numbers
mean much less without knowing how often a trajectory was being held up by a floor rather
than genuinely sitting there. Callers that do not care ignore the array.

Clamping iterates `RESOURCE_KEYS` rather than `Object.keys(resources)`, so the clamps array
is ordered by source rather than by insertion — which keeps it deterministic for the digest.

---

## Decision 3 — `stateDigest` canonicalises before hashing, and is 128 bits

**`JSON.stringify` is not stable enough.** It emits string keys in _insertion_ order, so two
states that are `toEqual` serialise differently depending on the order their flags happened
to be set in — and a run sets flags in whatever order its events fire. (Integer-like keys are
a separate trap: stringify hoists them and orders them numerically ahead of string keys.
`canonicalJson` sorts every key as a string instead, so the two deliberately disagree, and a
test asserts that difference to stop someone "simplifying" back to `JSON.stringify`.)

Sorting uses `<` on strings — exact UTF-16 code-unit order. `localeCompare` would make the
digest depend on the machine's locale, the same hazard ADR 0005 §3 bans.

**Four murmur3 passes with different seeds, not one.** A 32-bit digest collides by birthday
at roughly 65,000 states, and a 20,000-run simulation is squarely inside that. 128 bits
removes the question.

The digest covers the **whole** state including `history`, so two runs that reached the same
numbers by different paths are distinguishable. Replay must prove the same story happened,
not merely the same balance sheet.

---

## Decision 4 — `RunState.presentation`, a field engine-spec §1 does not have

`resolveChoice` must know which event a choice belongs to. Without this field the caller has
to pass the event id back in, which puts a piece of engine state in the app layer and lets
the UI answer a question the engine never asked — a rule 2.7 violation by construction.

Keeping it in state also means the loop's position **survives a save**: closing the app
mid-event and reopening lands on the same event rather than silently skipping it.

`kind: 'uneventful'` is one of its cases, because a leg the director could not fill is a real
presentable outcome rather than an error.

---

## Decision 5 — The route is an input, and it is validated rather than trusted

Route generation, the leg-count formula and beat-schedule generation are all out of Phase 1:
leg density by terrain and montage compression need terrain data and sim tuning that do not
exist, and a provisional version would lock in numbers that have to be unpicked.

So `RunInit.route` is caller-supplied, and `createRunState` **validates** it — empty route,
edge/node count mismatch, a beat past the last leg, two beats claiming one leg. A beat
scheduled out of range would otherwise produce a slot that can never fill and a "beat missed"
line in every sim report: a content bug wearing the costume of a balance problem.

`createRunState` also **normalises** `legIndex` and `progressKm` to the start rather than
taking them as given, so a reused `RunInit` cannot begin a run halfway along its own route.

---

## Decision 6 — Branded id types

`EventId`, `FlagId`, `NpcId` and the rest are `Brand<string, '…'>` rather than plain `string`.

`RunState` holds four separate id-keyed maps — flags, relationships, eventMemory, visas —
and mixing them up typechecks perfectly without brands. The brand is a `declare`d unique
symbol, so it does not exist at runtime: a branded id **is** a string, and JSON round-trips
it unchanged.

The cost is one cast per id type, confined to `ids/content-ids.ts`. That gives "where does an
untrusted string become an id?" exactly one answer, which is where M5's content loader will
add validation.

**Accepted friction:** test fixtures must call `eventId('…')` rather than passing a literal.

---

## Consequences

- `Record<RngStream, number>` does not widen under `noUncheckedIndexedAccess` (mapped type
  over a finite union), but `Record<FlagId, FlagEntry>` **does** (branded string is an index
  signature). Readers of `state.flags[someId]` get `FlagEntry | undefined` and must handle
  it — which is correct, since the flag may genuinely not be set.
- `createRunState` returns a discriminated result, never throws. It is the first instance of
  the engine-wide no-throw contract in `errors/engine-error.ts`.
- `SAVE_VERSION` lives with `createRunState` and is 1. M11 adds the migration list; adding an
  RNG substream or changing a persisted shape requires bumping it plus a fixture.
