# How the ten rules are enforced

> Extracted from `CLAUDE.md` §2 on 2026-08-09. The rules themselves stay in the constitution;
> this is the evidence for each one. **Nothing was deleted in the move** — every sentence here
> was in CLAUDE.md, and the extraction happened because the enforcement notes had grown to ~90
> lines of a file that argues for a ~400-line cap.
>
> **A rule is binding whether or not it is mechanically enforced.** `(planned)` below means
> nothing will catch you breaking it, not that you may.
>
> Each entry says what enforces the rule, and — where it matters — that the mechanism was
> verified failing on a deliberate violation before it was trusted. A guard nobody has seen fail
> is a guard nobody has checked.

---

## Rule 1 — events never point at other events

**Live.** The event schema is `z.strictObject`, so `nextEventId` is not a rule the linter has to
know about: it is an unknown key and the file fails to parse.

The engine also has **no field an event could point with** — `GameEvent` has no successor, and
`scheduleEvent` is a queue entry the director may decline. The sim reports scheduled-vs-fired,
so a soft pointer that never resolves is visible rather than silent.

That report earns its place. Phase 1 shipped a payoff scheduled 20× and fired 0×; Phase 2B
shipped one scheduled 129× and fired 1.6%, because it had been authored as a `beat` event and a
beat needs a SLOT the queue cannot arrange. Both were found by the number, not by a test.

Rationale: `adr/0001`.

## Rule 2 — `packages/engine` imports nothing platform-specific

**Live, four independent layers:**

1. ESLint `no-restricted-imports` + `no-restricted-globals`, scoped to `packages/engine/**`.
2. `tsconfig.src.json` with `types: []` and no `DOM` in `lib`, so `document` and `process` do
   not typecheck.
3. `src/__tests__/purity.test.ts`, scanning both source and the package manifest.
4. The CI job `engine-under-plain-node`, which executes the engine entry under bare Node.

All four were verified failing on a deliberate violation before being trusted.

## Rule 3 — no `Math.random()`, no `Date.now()`

**Live.** A three-rule ESLint stack, because no single rule can express it:

- `no-restricted-properties` — dot access and destructuring
- `no-restricted-syntax` — argless `new Date()`, computed `Math['random']`
- `no-restricted-globals` — DOM/native globals inside the engine

`no-restricted-globals` alone matches bare global identifiers, so it could only ban all of
`Math`. See `docs/adr/0002`.

Verified catching `Math.random()`, `Math['random']`, `const { random } = Math`, `Date.now()`,
`Date['now']`, `new Date()` and `Date()`.

**The backstop is replay, not lint.** `replayRun` reproduces a run byte-for-byte from
`(seed, choiceSequence, contentVersion)`, which is what catches obfuscated nondeterminism a
regex cannot see. `purity.test.ts` additionally bans implementation-approximated and
locale-dependent APIs.

**Proven on V8 only. Hermes is untested** — ADR 0012, and still an open question.

The `Clock` port remains **(planned)**: the engine takes no clock, it advances its own.

## Rule 4 — no user-visible strings, only i18n keys

**Live, and by construction.** An event file has **no text fields at all**. `titleKey`,
`labelKey` and `textKey` are DERIVED from ids by the schema transform, so there is nowhere to
type prose. Explicit keys are accepted as an escape hatch and must still match the i18n-key
shape.

`pnpm content:lint` checks every derived key resolves in `en/` (`MISSING_I18N_KEY` is an
**error**, and it fires per key the moment `i18n/en/` holds any `.json`), and scans the locale
for §11 patterns. ADR 0015/0017.

**One gap, covered by a test rather than the linter.** `i18nCoverage` walks keys reachable from
an EVENT. A modifier chip is not reachable from one — it applies by tag intersection at roll
time — so `check.modifier.<id>` is invisible to it, and a missing one ships the raw key to the
result screen. `packages/content/__tests__/locale.test.ts` is that check, and it covers the
complication and universal-choice registries for the same reason.

## Rule 5 — no text inside generated images

**(planned)** — `packages/tools/imagegen/` is empty and no images exist. Human review of the
contact sheet is the intended mechanism.

## Rule 6 — content is data, not code

**Live.** Thirteen YAML events under `packages/content/events/`, validated by Zod and held
identical to the engine's types by the conformance harness in
`packages/content/__tests__/conformance.test.ts` (ADR 0009, corrected by ADR 0019 — the
guarantee comes from the builders' return annotations, not from the `Equals` assertions).

`pnpm content:lint` is the build-time gate and runs in CI. The engine fixture is JSON DATA,
never `.ts`, and `round-trip.test.ts` proves the YAML produces it byte-for-byte.

The nine Phase 1 fixture YAMLs live in `packages/content/__fixtures__/events/` and are
deliberately **unlinted** — frozen data whose only contract is reproducing `mini-pack.json`
(ADR 0022).

## Rule 7 — every mutation goes through an `Effect`

**Live.** `applyEffects` is the only writer; `RunState` is deeply readonly, and
`effects/__tests__/purity-and-sharing.test.ts` deep-freezes the input and applies all 12 ops.
Module code is strict, so an in-place write throws. The freeze is itself guarded.

## Rule 8 — the engine is deterministic and pure

**Live.** Package purity per rule 2; both entry points RETURN a typed `EngineError` and never
throw; the RNG is derived from state and drained back, never injected, so a caller cannot
desynchronise replay.

Two addressing schemes matter here. Cursor-advancing draws are fine where the number of draws
is fixed; anything whose draw COUNT depends on how much content exists must be content-addressed
through `deriveKey` instead, or adding a row shifts every later value. Complication selection
uses the cursor-free form, so `encounterFlavor`'s cursor stays 0 forever (ADR 0021).

See `docs/engine-spec.md` Part II.

## Rule 9 — animation is presentation, never mechanics

**(planned)** — no animation code exists. An architectural constraint on Phase 3+, not something
the toolchain can check.

## Rule 10 — every animation is skippable and speed-scaled

**(partly planned), and the rule's own wording still overstates what exists.** "A hardcoded
duration in a component is a lint error" is **not true today**: no such rule exists in
`eslint.config.mjs`. What DOES exist as of 2026-08-20 is `apps/mobile/src/design/motion.ts` —
named duration and easing tokens plus a `SPEED_SCALES` map with `instant: 0` — so there is now
something for that lint rule to point at. **There is no skip system and no persisted speed scale.**
Review-only until Phase 4C.

---

# Guards that are not one of the ten rules

These enforce decisions recorded elsewhere. They live here because this file is where someone
looks to find out what is actually mechanical.

## The app's native-surface boundary — **live**

Two `no-restricted-imports` blocks in `eslint.config.mjs`, added 2026-08-20. **Both verified
failing on a deliberate violation before being recorded here**, which is this file's house rule.

**`expo-glass-effect` is banned everywhere under `apps/mobile/`.** It is iOS-only — its own
package description says so — and the project's only test device is an iPhone. That combination is
the trap: it works perfectly on the hardware in front of you and is unbuilt on half the target
platform. A resolution not to use it is worth nothing during a device session; a lint rule is.
`docs/web-preview-traps.md` trap 4.

**`expo-blur` is banned everywhere under `apps/mobile/` EXCEPT `src/design/`.** Blur is the entire
cost of art direction E and the one thing an Android frame-budget measurement might refuse. Whether
that refusal is a **one-token change** or a **redesign** depends only on whether screens reached for
`BlurView` directly, so only the `Sheet` primitive may.
`docs/device-measurement-session.md` §7.

**The two are separate config blocks on purpose.** ESLint REPLACES a rule's options rather than
merging them, so a single `no-restricted-imports` on `apps/mobile/**` plus another on
`apps/mobile/src/design/**` would leave whichever matched last as the only one in force. The blocks
do not overlap — the second `ignores` exactly what the first `files` — so each file gets precisely
one and order cannot matter. This is the same trap the repeated `RESTRICTED_*` spreads in layers 2
and 4 exist to avoid.

## The engine-barrel boundary for the app — **live**

`no-restricted-imports` patterns banning `@odyssey/engine/*` and `**/packages/engine/**` throughout
`apps/mobile/`, added 2026-08-20 when the app first took a dependency on the engine. **Verified
failing on a deliberate violation** — a `@odyssey/engine/src/state/state-digest.ts` import planted in
`app/dev/index.tsx`, rejected with its message, then removed.

CLAUDE.md's hard rule for the app is that it imports the engine and renders. A deep import reaches
past the barrel AND past the L2 conformance sweep, which classifies everything the barrel exports —
so a new vocabulary could reach a screen without ever being classified. The barrel is the contract;
this keeps it the only door. If something is not exported, export it.

**What it does not catch:** a transitive import, a `require()`, or a native module reached through
some other package. It matches import specifiers, which is a shape rather than an intent — the same
honest limit as the determinism stack in rule 3.
