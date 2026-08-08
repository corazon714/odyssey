#!/usr/bin/env node
/**
 * PreToolUse / Bash|PowerShell — block force pushes and any push to the default branch.
 *
 * Reads the current branch from .git/HEAD directly rather than shelling out to
 * `git rev-parse`, so the whole hook stays inside one node process.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PROTECTED_BRANCHES = new Set(['main', 'master']);

/** Claude Code splits compound commands for permission rules; hooks see the raw string. */
const SEPARATORS = /\s*(?:&&|\|\||;|\||&)\s*/;

function currentBranch(cwd) {
  try {
    const head = readFileSync(join(cwd ?? process.cwd(), '.git', 'HEAD'), 'utf8').trim();
    const m = /^ref:\s*refs\/heads\/(.+)$/.exec(head);
    return m ? m[1] : null; // detached HEAD -> null
  } catch {
    return null;
  }
}

let payload;
try {
  payload = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const command = payload.tool_input?.command;
if (typeof command !== 'string' || !command.includes('push')) process.exit(0);

function deny(reason) {
  process.stderr.write(`BLOCKED: ${reason}\n`);
  process.exit(2);
}

for (const part of command.split(SEPARATORS)) {
  const sub = part.trim();
  if (!/^git\s/.test(sub) || !/\bpush\b/.test(sub)) continue;

  if (/\s(--force|-f|--force-with-lease)(\s|=|$)/.test(sub)) {
    deny(
      `force push detected.\n\n  ${sub}\n\n` +
        "Force pushing rewrites published history and can destroy a collaborator's work. " +
        'If the branch genuinely needs rewriting, the human must run it themselves.',
    );
  }

  // Explicit refspec naming a protected branch: `git push origin main`, `HEAD:main`, etc.
  const tokens = sub.split(/\s+/).slice(2);
  for (const token of tokens) {
    if (token.startsWith('-')) continue;
    const branch = token.includes(':') ? token.split(':').pop() : token;
    if (PROTECTED_BRANCHES.has(branch.replace(/^refs\/heads\//, ''))) {
      deny(
        `push to protected branch "${branch}".\n\n  ${sub}\n\n` +
          'Work lands on main through a pull request, never by direct push. ' +
          'Push your feature branch and open a PR instead.',
      );
    }
  }

  // Bare `git push` while standing on a protected branch pushes to it implicitly.
  const hasRefspec = tokens.some((t) => !t.startsWith('-'));
  if (!hasRefspec) {
    const branch = currentBranch(payload.cwd);
    if (branch && PROTECTED_BRANCHES.has(branch)) {
      deny(
        `bare "git push" while on protected branch "${branch}".\n\n  ${sub}\n\n` +
          'This would push straight to ' +
          branch +
          '. Create a feature branch and open a PR.',
      );
    }
  }
}

process.exit(0);
