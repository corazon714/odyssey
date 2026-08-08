# 0005 — Counter-based PRNG, and the boundaries determinism actually needs

- **Status:** Accepted
- **Date:** 2026-08-08

## Context

`CLAUDE.md` rule 2.3 requires that everything about a run be reproducible from
`(seed, choiceSequence, contentVersion)`, and ADR 0002 names golden-run replay as the only
backstop that survives a determined violation of the lint rules. Phase 1 is where that stops
being a promise and becomes code.

Reproducibility here is stronger than "no `Math.random()`". The engine ships inside React
Native on **Hermes**, CI runs on **Linux and Windows**, and the simulation harness runs on a
developer's machine — a golden run is worth something only if all of them agree bit for bit.
That constrains the generator, the arithmetic, and the module system, which is why one ADR
covers all three.

---

## Decision 1 — MurmurHash3 x86_32, counter-based, over uint32

A draw is `drawWord(streamKey, counter)`, a pure function of both inputs.
`streamKey = murmur3_32(seed + ':' + stream)`. `RunState.rngCursors` holds one plain integer
per stream and nothing else.

**Stream isolation is therefore structural, not statistical.** Stream B's values never
depended on stream A's cursor, so drawing from A cannot shift B. This is the property
`docs/PROGRESS.md` calls the one that matters most: without it, adding a single event to the
content pack invalidates every golden run at once, silently.

**Rejected: `splitmix64(streamKey + counter * GAMMA)` over BigInt**, which the original
Phase 1 brief proposed.

- It is an **additive offset into one shared sequence**. Two stream keys that differ by
  `k * GAMMA` produce sequences that overlap after `k` draws. The stated goal — isolation by
  construction — is not achieved by it; isolation is left to a large modulus and luck. This
  is not theoretical: `stream-isolation.test.ts` constructs the naive generator inline and
  demonstrates two of its streams being the same sequence, shifted by one.
- BigInt is **unexercised on Hermes**, which is where this code ultimately runs. `Math.imul`,
  `^`, `>>>` and `<<` are exactly specified by ECMAScript and universally correct.
- It allocates. A 20,000-run simulation is roughly 6M draws.
- 64 bits are not needed. A run consumes a few hundred draws per stream, and murmur3's
  `counter -> word` map is **bijective for a fixed key**, so no value repeats within 2³².

**Rejected: storing the generator's internal state in `RunState`.** A 64- or 256-bit state
does not fit a JS number, is not a `Record<RngStream, number>` as engine-spec §1 requires,
and gives up the jump-ahead property that makes the streams independent.

**Rejected: threading `(seed, stream, cursor)` through every call site by hand.** Correct,
but hand-threading cursors through director scoring and effect application is exactly where
an off-by-one corrupts replay without failing anything.

**The decisive practical advantage: published test vectors.** `murmur3.test.ts` checks
against MurmurHash3 x86_32 vectors from outside this repo, covering all four tail lengths.
A test comparing an implementation to values it generated itself detects _change_; these
detect _being wrong_. That is why `utf8Bytes` is hand-rolled rather than hashing UTF-16 code
units — the vectors are defined over UTF-8, and hashing code units would have left the test
comparing the implementation to itself.

**Revisit when:** the sim misses its 20,000-runs-under-30-seconds target and profiling shows
the generator is the cause. Changing the algorithm invalidates every golden run, so it needs
a `SAVE_VERSION` bump and regenerated fixtures.

---

## Decision 2 — `chanceGate`, an eighth substream that never advances

engine-spec §5 lists seven streams. A `{ chance: p }` predicate needs randomness, and the
obvious home — `eventPick` — is a trap: the **number** of draws would depend on how many
events the director evaluated, so adding one event to the pack would shift every subsequent
draw. That is the same catastrophe Decision 1 exists to prevent, reintroduced through the
predicate evaluator.

`chance` instead evaluates as
`drawWord(deriveKey(keys.chanceGate, '<eventId>:<legIndex>:<nodePath>'), 0)` — **addressed by
content, not by a cursor**. Consequences: adding content shifts nothing; re-evaluating the
same predicate twice within a leg returns the same answer, which the director needs in order
to explain its reasoning (design pillar 2) and to evaluate speculatively.

This works only because `drawWord` is a pure function of `(key, counter)` — the counter does
not have to be monotonic. It is the clearest payoff of Decision 1.

**Adding a stream is a save-format change.** `RngCursors` gains a key, so `SAVE_VERSION` must
be bumped and a migration written.

---

## Decision 3 — No implementation-approximated or locale-dependent APIs in the engine

ECMAScript marks `Math.pow`, `exp`, `log`, `sqrt`, `cbrt`, `hypot`, all trig **and the `**`
operator** as _implementation-approximated_: two conforming engines may differ in the last
bit. `localeCompare`, the `toLocale*` family and `Intl` are locale-dependent, so they must
never establish a canonical order. `Object.keys` hoists integer-like keys ahead of string
keys, so any state digest must sort explicitly and no id may be a numeric string.

None of these is nondeterministic on one machine, which is what makes them dangerous: they
pass every local test and fail only when a golden run crosses platforms.

`src/__tests__/purity.test.ts` bans the whole family, and was verified failing on a
deliberate violation before being trusted. Consequences for the engine's own code: every
scoring factor must be **rational** (`1/(1+seen)`, not `exp(-k*seen)`), `2^32` is written as
the literal `4294967296`, and canonical ordering uses `<`/`>` on strings, which is exact
UTF-16 code-unit order.

The same pass fixed a **silently dead** assertion: the existing `Math['random']` pattern
could never match, because `stripCommentsAndLiterals` blanks the quoted key before the regex
runs. It is now `Math[`, `Date[`, `crypto[`, `performance[`. ESLint's AST selector was
catching that case, so nothing had slipped through.

---

## Decision 4 — `.ts` module specifiers, via `allowImportingTsExtensions` in the shared base

CI runs `node packages/engine/src/index.ts` to prove rule 2.2 executably. Node ESM requires
an explicit extension and does not rewrite `.js` to `.ts` — a `.js` specifier fails with
`ERR_MODULE_NOT_FOUND`. So engine sources import each other as `./thing.ts`, which TypeScript
permits only with this flag. Legal because every project sets `noEmit`.

It lives in `tsconfig.base.json` rather than in `packages/engine` because `@odyssey/engine`'s
`types` field points at raw `src/*.ts` and TypeScript realpaths the workspace link, so engine
sources land in a **consumer's** program as ordinary project files that `skipLibCheck` does
not cover.

The risk that Node refuses type-stripping under `node_modules` was checked and does not
apply: pnpm places the link at `packages/tools/node_modules/@odyssey/engine`, and ESM
resolution realpaths it to `packages/engine` — outside `node_modules` — before stripping.

**`apps/mobile` extends `expo/tsconfig.base`, not this file**, and will need its own copy of
the flag the first time the app imports the engine.

---

## Decision 5 — `tensionBand` is a weighting factor, not an eligibility gate

engine-spec §2 comments `tensionBand` as "only eligible when director tension is in this
band". Implemented literally, that hard-gates selection on a _continuous_ director signal,
which is the fastest available route to blowing the same spec's §6 target of under 2%
empty-pool fallbacks.

It is instead a scoring multiplier in `[0.25, 1.50]`: in-band events are strongly favoured,
out-of-band ones become rare but never impossible. Pacing still works and the pool never
empties on tension alone.

**This is a deliberate deviation from engine-spec §2**, taken with the human's sign-off. If
it is ever made hard, it must join the relaxation ladder rather than sit above it.

---

## Consequences

- `RunState` stays trivially serialisable: randomness is eight integers.
- The `Rng` object is a **drainable view**, built from `(seed, cursors)` at the top of an
  engine call and drained with `cursors()` at the bottom. It is never stored.
- `resolveChoice` therefore does **not** accept an injected `Rng`, deviating from the shape
  in the Phase 1 brief. A caller-supplied generator whose cursors are not in `RunState`
  breaks replay, which is the one guarantee the engine exists to provide. Seeds are injected
  at `RunInit`, the boundary where that is safe.
- `nextInt` uses rejection sampling, so a call consumes a **variable** number of words. Still
  deterministic given the cursor; worth knowing when reading a cursor value in a debugger.
- `weightedPick` works in integers end to end. Float accumulation across a few hundred
  candidates would make selection depend on summation order and on the last ULP of every
  scoring factor.
- `CHECK_DIE_SIDES = 20` is a **placeholder balance parameter**, not a decision. engine-spec
  §2 shows `dc: 5` and ±2..3 modifiers but never states the die, and how skill enters the
  total needs simulation to settle. It is deliberately the only place the die appears.
