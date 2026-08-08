# 0003 — The Claude Code extension layer: hooks, permissions, and why the gate is scoped

- **Status:** Accepted
- **Date:** 2026-08-08

## Context

An agent working in this repo needs guardrails that hold without a human watching every
tool call. `CLAUDE.md` §2 and §7 state the rules; nothing enforced them at the _agent_
level, only at `pnpm lint` level, which an agent can simply not run before committing.

Everything below was verified against the live docs at `code.claude.com/docs/en/*`
(`docs.claude.com` now 301s there) on 2026-08-08, not from memory.

## Decision 1 — Which hook event, and why it matters

`PreToolUse` is the only event in the agentic-loop family that can stop a tool call
(`PermissionRequest` can deny one too, but fires only when a permission decision is
needed). `PostToolUse` runs after the tool has already executed; exiting 2 there cannot
undo anything — it feeds stderr back to the model as feedback.

That difference drives the whole design:

| Hook                        | Event                                             | Why that event                                                                                                                                                                                                                     |
| --------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `guard-protected-paths.mjs` | PreToolUse `Write\|Edit\|MultiEdit\|NotebookEdit` | The write must not land. Nothing to undo afterwards.                                                                                                                                                                               |
| `guard-git-push.mjs`        | PreToolUse `Bash\|PowerShell`                     | A force push cannot be taken back.                                                                                                                                                                                                 |
| `gate-commit.mjs`           | PreToolUse `Bash\|PowerShell`                     | A commit that fails the DoD must not exist.                                                                                                                                                                                        |
| `warn-new-dependency.mjs`   | **PostToolUse** `Write\|Edit\|MultiEdit`          | Adding a dependency is _legitimate_. Blocking it would be wrong; the goal is that the agent volunteers the justification instead of the human discovering it later. Exit 2 here is feedback, not a block — exactly what is wanted. |

**Both Bash guards also match `PowerShell`.** Matching only `Bash` would let the identical
command through the other shell tool.

**A hook exiting 2 blocks the call _before_ permission rules are evaluated.** This is
load-bearing: `Bash(git commit *)` is on the allow list, and the gate still fires. Without
that ordering the design would not work at all.

## Decision 2 — The commit gate is scoped to changed packages

Measured on this machine:

| What the gate runs                                                      | Time      |
| ----------------------------------------------------------------------- | --------- |
| Full monorepo `typecheck && lint && test`                               | **11.9s** |
| Scoped to `@odyssey/engine` (typecheck + test + eslint on staged files) | **5.9s**  |
| Docs-only commit (nothing that affects a build)                         | **113ms** |

The staged file list decides: `docs/**`, `*.md`, `.claude/**`, `.github/**` run nothing;
one package runs only that package; a root config file
(`tsconfig*.json`, `eslint.config.mjs`, `pnpm-workspace.yaml`, `vitest.config.ts`,
`package.json`, `pnpm-lock.yaml`) runs everything.

ESLint always runs against the staged files themselves, never the whole repo, so the
determinism ban and the engine import boundary stay enforced at commit time without paying
for a full lint.

**Why this matters more than it looks.** A gate that costs 12s on every commit — including
a typo fix in a markdown file — gets switched off within a day, and then protects nothing.
The scoping is not an optimisation, it is what makes the gate survive.

**The gate is still not sub-second and cannot be**, because it runs tests. That is the one
place the "well under a second" budget is knowingly exceeded. The two path/push guards cost
~162ms per Bash call combined (two Node startups at ~63ms each); the path guard alone is
~90ms.

## Decision 3 — The gate fails CLOSED

Found by testing, not by design: the first version returned exit 0 when
`git diff --cached` failed, silently allowing the commit. That is the same failure mode
`docs/adr/0002` warns about — a guardrail that fails silently is worse than none, because
it is believed.

It now aborts with exit 2 and a readable reason if it cannot determine what changed.
`ODYSSEY_GATE_SKIP=1` is the deliberate, visible escape hatch, named in the failure
message. A gate with no escape hatch gets disabled wholesale, which is worse than one with
a documented one.

Two related fixes from the same test run:

- Git Bash on Windows reports `cwd` as `/c/Users/...`, which Node cannot use as a spawn cwd
  (ENOENT). `normaliseCwd()` converts it.
- `shell: true` with an args array is deprecated in Node and does not escape arguments.
  `git` is now spawned directly with no shell; `pnpm` (a `.cmd` on Windows, which Node
  refuses to spawn without a shell since CVE-2024-27980) gets one pre-quoted command string.

## Decision 4 — Hooks are Node `.mjs`, not shell scripts

Development is on Windows 11. A `.sh` hook depends on Git Bash being on PATH for whatever
shell Claude Code spawns; a `.ps1` hook does not run on CI or on a colleague's Mac. Node is
already a hard dependency of this repo (`engines.node >= 22.13.0`) and starts in ~63ms.

## Decision 5 — `deny` vs `ask` in permissions

`deny` beats `allow` and cannot carry exceptions, so it is reserved for things that should
never happen unattended:

- `pnpm add|remove|up|update`, `npm install|add`, `yarn add` — **denied**, because
  `CLAUDE.md` §8 says dependencies are not added casually and §4 says native packages must
  come through `npx expo install` to respect the SDK pin. Editing a manifest by hand still
  works and trips the PostToolUse dependency warning by design.
- `eas *`, `npx eas-cli *` — **denied**: EAS builds cost money.
- `rm`, `rmdir`, `del`, `curl … | sh` — denied.

`ask` (prompts, not blocked) covers legitimate-but-consequential actions: `git push`,
`pnpm install`, `npx expo install`, `git reset --hard`, `git clean`, `git rebase`.

Note that allow rules do not span shell operators — `Bash(pnpm test *)` does not authorise
`pnpm test && rm -rf x`; each subcommand is matched independently.

## Decision 6 — Both generated-asset paths are protected

The brief named `apps/mobile/assets/generated/`. That path does not exist in this repo:
`CLAUDE.md` §3 and `.gitignore` both put generated images at
`packages/content/images/generated/`. The guard blocks **both**, so the rule works today
and keeps working if the other directory is ever introduced.

## Consequences

- Hooks load at **session start**. Editing `.claude/settings.json` mid-session does not
  arm them — verified by writing to `reports/` after installing the guard and watching it
  succeed. Anyone changing hook config must restart to test it.
- The scripts were proven by driving them with the documented stdin contract
  (`{cwd, tool_name, tool_input}`) and asserting exit codes, which is a genuine behavioural
  test but is not the same as observing Claude Code invoke them.
- `.claude/` is committed, so the guardrails are shared rather than per-developer. Personal
  overrides belong in `.claude/settings.local.json`, which is not tracked.
