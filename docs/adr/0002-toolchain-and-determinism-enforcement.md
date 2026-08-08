# 0002 — Toolchain pins and how determinism is actually enforced

- **Status:** Accepted
- **Date:** 2026-08-07

## Context

Three Phase 0 decisions look like mistakes at a glance and will be "helpfully" reverted by
a future session unless the reasoning is written down: two dependencies are pinned _behind_
npm `latest`, and the ESLint rule named in `CLAUDE.md` was replaced with a different one.

## Decision 1 — TypeScript is pinned to `~6.0.3`, not 7.x

npm `latest` for TypeScript is **7.0.2** (the native Go port, GA 2026-07-08). We pin
`~6.0.3` anyway.

- **TS 7 ships no stable compiler API.** `typescript@7.0.2`'s manifest has `"main": null`
  and `"types": null`, no `tsserver` binary, and an `exports` map that exposes only
  `./unstable/*`. The release announcement states 7.0 does not ship an API and that 7.1
  will ship a different one.
- **typescript-eslint cannot run on it.** `typescript-eslint@8.66.0` — the current latest,
  with no v9 in existence — declares `typescript: ">=4.8.4 <6.1.0"` across the parser,
  typescript-estree and the plugin. Their TS 7 support issue was closed as _not planned_;
  overriding the peer produces `TypeError: Cannot read properties of undefined (reading
'Cjs')` at runtime.
- **Expo agrees.** `expo-template-default@57.0.13` pins `"typescript": "~6.0.3"`.

There is no 6.1.x, so `<6.1.0` means **6.0.3 is the newest usable TypeScript**. Type-aware
linting is the mechanism enforcing the engine's import boundary, so trading it away for a
faster compiler is not a trade worth making.

**Revisit when:** typescript-eslint ships a release whose `typescript` peer admits 7.x.

TS 6.0 also changed defaults (`strict`→true, `module`→esnext, `target`→es2025,
`types`→`[]`, `rootDir`→tsconfig dir). `tsconfig.base.json` states all of these explicitly
so a future upgrade cannot move the floor silently. The `types: []` default is used as an
asset: `packages/engine/tsconfig.src.json` keeps it, and omits `DOM` from `lib`, so
`document` and `process` fail to _typecheck_ in the engine independently of any lint rule.

## Decision 2 — ESLint is pinned to `~9.39.5`, not 10.x

- `eslint-config-expo@57.0.1` pulls `eslint-plugin-import@2.32.0` (peer `…|| ^9`) and
  `eslint-plugin-react@7.37.5` (peer `…|| ^9.7`). Neither admits `^10`.
- ESLint **10 made per-file config lookup the default** and removed the opt-out. Config is
  resolved by walking up from each linted file; the first `eslint.config.*` found wins and
  ancestors are **not** merged. `npx expo lint` writes an `eslint.config.js` into the app
  directory as a matter of course — and the moment it exists, the root config stops
  applying to all of `apps/mobile`, taking the determinism ban and the engine boundary with
  it. `pnpm lint` stays green throughout. A guardrail that fails silently is worse than no
  guardrail, because it is believed.

`CLAUDE.md` §4 already resolves this: when a version conflicts with the Expo SDK, the SDK
wins. ESLint 9.39.5 has flat config as its default, has `basePath` (shipped in 9.30.0), and
is supported by typescript-eslint 8.66.0.

**Regardless of major**, the repo keeps exactly **one** `eslint.config.mjs` at the root.
Expo's rules are applied through a `basePath: 'apps/mobile'` block, and
`scripts/check-no-nested-eslint-config.mjs` fails `pnpm lint` if a nested config ever
appears.

**Revisit when:** eslint-plugin-import and eslint-plugin-react declare `^10` peers.

## Decision 3 — Jest is pinned to `^29.7.0`, not 30.x

Found by the scaffold failing, not by reading docs. `jest-expo@57.0.3` and
`@react-native/jest-preset@0.86.2` both depend on the **Jest 29** family
(`jest-mock`, `@jest/globals`, `jest-environment-node` at `^29.x`). Because
`nodeLinker: hoisted` puts exactly one copy of each package name at the top of
`node_modules`, adding Jest 30 placed `jest-runtime@30` beside `jest-mock@29` and every
suite died with `this._moduleMocker.clearMocksOnScope is not a function`.

This is the cost of hoisting, paid knowingly: RN native module resolution needs a flat
tree, so version alignment has to be maintained by hand instead of by the package manager.

**Revisit when:** jest-expo moves to the Jest 30 line.

## Decision 4 — `no-restricted-globals` cannot ban `Math.random()`

`CLAUDE.md` rule 2.3 originally named `no-restricted-globals` as the enforcement mechanism.
That rule reports **variable references by name**, so the only thing it can express here is
a ban on the entire `Math` binding — which would also outlaw `Math.max`, `Math.floor` and
`Math.abs`, all of which the engine needs. As specified the rule either does nothing or
breaks the engine.

Enforcement is a **three-rule stack**, all in `eslint.config.mjs`:

| Shape                                                      | Rule                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `Math.random()`, `Date.now()`, `const { random } = Math`   | `no-restricted-properties` (covers dot access _and_ destructuring) |
| argless `new Date()` / `Date()`, `Math['random']`          | `no-restricted-syntax` with AST selectors                          |
| `window`, `document`, `fetch`, `process` inside the engine | `no-restricted-globals` — its actual purpose                       |

`new Date(injectedTimestamp)` stays legal: formatting an engine-supplied timestamp is not a
determinism violation, reading the host clock is. The selectors match `arguments.length=0`
only.

**Note the repeated rule-option spreads in `eslint.config.mjs`.** ESLint _replaces_ a
rule's options rather than merging them, so any later config block that touches
`no-restricted-syntax` must re-list the determinism selectors or it silently switches them
off for those files.

### Where it is enforced, and what still gets through

Three independent layers, because one is not enough:

1. **Lint** — the rules above. Defeated by an inline disable or a config edit.
2. **Types** — `packages/engine/tsconfig.src.json` (`types: []`, no `DOM` in `lib`).
   Defeated by editing the tsconfig.
3. **Test** — `packages/engine/src/__tests__/purity.test.ts` scans the engine's own source
   and manifest. Defeated only by deleting the test, which is visible in review.

Honest limit: none of these stop determined obfuscation (`globalThis["Ma"+"th"].random()`).
The real backstop for that is the golden-run replay test landing in Phase 1 — a run
replayed from `(seed, choiceSequence, contentVersion)` that diverges fails, whatever the
cause.

The one sanctioned wall-clock read in the whole repo is
`apps/mobile/src/clock/system-clock.ts`, which carries a single-line `eslint-disable-next-line`
with its reason attached — narrower and more visible than a path-based exemption.
