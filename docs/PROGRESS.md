# PROGRESS

> Updated at the end of every session (`CLAUDE.md` §12). Assume the next session starts
> with zero memory of this one.

---

## Current state: Phase 0 complete. Phase 1 not started.

There is **no game logic in the repository**. `packages/engine/src/index.ts` is an empty
barrel by design. Everything below is toolchain, guardrails and agent tooling.

---

## Shipped this session (2026-08-08)

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

**CI has never actually run** — nothing has been pushed. The workflow is unverified against
a real runner.

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

- **CI has never executed.** `.github/workflows/ci.yml` has not run on a real runner. First
  push will be the first test of it.
- **The app has never run on a device or simulator.** `expo export` bundles cleanly on both
  platforms (android 1226 modules, ios 1097) and `pnpm dev` starts Metro on port 8081 — that
  is the real test of pnpm's hoisted `node_modules` against Metro resolution. But no
  `expo prebuild`, no Gradle/Xcode build, and nothing has ever rendered on a screen.
- **Hooks proven by contract, not by live firing.** They were driven with the exact stdin
  JSON Claude Code sends. Hooks load at session start, so they were not armed in the session
  that wrote them — verified by writing to `reports/` and watching it succeed.

---

## Next step (ONE task, start here)

**Build `packages/engine/src/rng/` — the seeded PRNG with named substreams.**

This is first because everything else in the engine depends on it and because the test
below is the one that protects every future golden run.

Acceptance criteria:

1. A `Rng` created from `(seed, stream)` produces the same sequence every time, across
   processes and platforms. No `Math.random()` anywhere (the lint will stop you).
2. Named substreams per `docs/engine-spec.md` §5: `eventPick`, `outcomeRoll`, `skillCheck`,
   `npcGen`, `encounterFlavor`, `worldTick`, `routeGen`. Substream = `hash(seed + ':' + stream)`.
3. Cursor per stream, serialisable into `RunState.rngCursors` (a plain
   `Record<RngStream, number>` — no class instances, no `Map`; save and replay depend on it).
4. **The test that matters most:** drawing additional values from one substream must NOT
   shift the sequence any other substream produces. Without this, adding a single event
   later invalidates every existing golden run and every regression test breaks at once.
5. `weightedPick(items, stream)` used by the director, with a test proving the distribution
   is stable for a fixed seed.

Constraints that will bite if ignored:

- `packages/engine` may not import React/RN/Expo, and `tsconfig.src.json` sets `types: []`
  with no `DOM` in `lib` — so no `process`, no `Buffer`, no `crypto` global. Pure TS only.
- Files stay readable end-to-end under ~200 lines (`CLAUDE.md` §6); split otherwise.
- One exported concept per file. No default exports.

Start with:

```bash
pnpm install && pnpm typecheck && pnpm lint && pnpm test
```

All four must be green before writing anything. `docs/engine-spec.md` §5 is the spec
(written in Turkish).

---

## Open questions for the human

1. **PRNG algorithm.** I would use a small, well-understood counter-based generator
   (SplitMix64 or PCG-32) implemented in pure TS over `BigInt`/`Uint32Array`, so a run is
   reproducible across JS engines. Any preference, or shall I pick and record it in an ADR?
2. **Push and CI.** Nothing has been pushed, so CI is unverified. Do you want the `dev`
   branch pushed so the workflow gets its first real run? (`git push` is `ask`, not
   pre-approved, so I will not do it unprompted.)
3. **Rive vs Lottie.** `docs/adr/0004` defaults to Lottie because it is in Expo SDK 57's
   `bundledNativeModules` and Rive is not — Rive additionally forces a hand-pinned
   `react-native-nitro-modules@0.35.10` if MMKV is also used. Confirm Lottie as the default,
   or say Rive is worth the pin.
4. **`CLAUDE.md` is 424 lines**, past its own "~400 lines" cap, because of the `(planned)`
   markers and enforcement notes you asked for. Leave it, or move the per-rule
   `_Enforcement:_` notes into `docs/enforcement.md` and keep one-word markers in §2?
