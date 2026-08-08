---
name: handoff
description: Write a context-reset handoff note to docs/handoff/ before /clear or /compact. Use when the context is filling up, when the user says they are about to clear, or at the end of a long working session that is not finished.
argument-hint: '[short-topic-slug]'
allowed-tools: Read, Write, Glob, Grep, Bash(git status *), Bash(git diff *), Bash(git log *), Bash(git branch *)
---

# Handoff note

Write a note to your future self, who will start with **zero memory of this session** and
will have read `CLAUDE.md` and nothing else.

## Live context

- Today: !`date +%Y-%m-%d`
- Branch: !`git branch --show-current`
- Uncommitted changes:

```!
git status --short
```

- Committed this session:

```!
git log --oneline -12
```

- Where `docs/PROGRESS.md` says the project is:

```!
sed -n '/## Exact next step/,/^## /p' docs/PROGRESS.md
```

## What to write

Create `docs/handoff/<today>-<topic>.md`, where `<topic>` is `$1` if given, otherwise a
short kebab-case slug you choose from the work in progress. Create the `docs/handoff/`
directory if it does not exist.

Use exactly these sections:

1. **Task in progress and its acceptance criteria** — what "done" means, concretely enough
   to test. Not "finish the RNG" but "`rng.test.ts` proves adding a draw in one substream
   does not shift results in another".
2. **Files touched and why** — every path, one line each on the reason. Include files you
   read and rejected, if that saves the next agent the same detour.
3. **Decisions made, and the alternatives rejected, with reasons** — the reason matters
   more than the decision. A future agent that does not know why will re-litigate it.
4. **Traps a fresh agent would hit again** — the things that cost you time here. Be
   specific: exact error text, the command that produced it, the fix.
5. **The exact next 3 steps** — ordered, each one concrete enough to start immediately.
6. **Temporary hacks to remove before merge** — every one marked `TODO(handoff)` in the
   code. If there are none, write "none", and make sure that is true.

## Rules

- **Be specific, and skip the obvious.** No summarising what `CLAUDE.md` already says. The
  reader has it. Everything in the note should be something they could not have known.
- **Prefer verifiable statements.** "`pnpm test:engine` is green, `pnpm lint` fails with 3
  errors in `predicate/evaluate.ts`" beats "mostly working".
- **Record what you did NOT verify**, explicitly. An unverified claim that reads as
  verified is the single most expensive thing you can leave behind.
- **Do not update `docs/PROGRESS.md`** from here. PROGRESS is the end-of-session record
  (`CLAUDE.md` §12); a handoff is a mid-task rescue. They have different readers and
  different lifetimes.
- Finish by printing the path you wrote and the exact prompt the human should paste after
  `/clear`, then **stop**. Do not continue the task.
