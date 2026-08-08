#!/usr/bin/env node
/**
 * PreToolUse / Bash|PowerShell — the quality gate. Blocks `git commit` when the checks
 * for the packages you actually touched do not pass.
 *
 * PreToolUse because this must PREVENT the commit, not report on it afterwards. A hook
 * exiting 2 stops the tool call before permission rules are evaluated, so this fires even
 * though `Bash(git commit *)` is on the allow list.
 *
 * SCOPING — this is the part that keeps it usable. Running the whole monorepo's DoD on
 * every commit costs ~25s and gets the hook switched off within a day, at which point it
 * protects nothing. Instead the staged file list decides what runs:
 *
 *   docs/**, *.md, .claude/**   -> nothing runs (no code changed)
 *   packages/engine/**          -> that package's typecheck + test only
 *   root config (tsconfig, eslint.config.mjs, pnpm-workspace.yaml, ...) -> everything
 *
 * ESLint is always run against the staged files themselves rather than the whole repo,
 * which is what keeps the determinism and engine-boundary rules enforced at commit time
 * without paying for a full lint.
 */

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const PACKAGES = [
  { dir: 'packages/engine', name: '@odyssey/engine' },
  { dir: 'packages/content', name: '@odyssey/content' },
  { dir: 'packages/tools', name: '@odyssey/tools' },
  { dir: 'apps/mobile', name: '@odyssey/mobile' },
];

/** Changing any of these can break a package that was not itself edited. */
const ROOT_TRIGGERS = [
  'eslint.config.mjs',
  'tsconfig.json',
  'tsconfig.base.json',
  'package.json',
  'pnpm-workspace.yaml',
  'pnpm-lock.yaml',
  'vitest.config.ts',
];

/** Files that cannot affect a build at all. */
const INERT =
  /^(docs\/|\.claude\/|\.github\/|reports\/|README|LICENSE|\.gitignore|\.gitattributes|\.editorconfig|\.prettier|\.nvmrc|\.husky\/)|\.md$/i;

const LINTABLE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

const SEPARATORS = /\s*(?:&&|\|\||;|\||&)\s*/;

let payload;
try {
  payload = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const command = payload.tool_input?.command;
if (typeof command !== 'string' || !/\bcommit\b/.test(command)) process.exit(0);

const isCommit = command
  .split(SEPARATORS)
  .some((part) => /^git\s+(-\S+\s+|--\S+(=\S+)?\s+)*commit\b/.test(part.trim()));
if (!isCommit) process.exit(0);

if (process.env['ODYSSEY_GATE_SKIP'] === '1') {
  process.stderr.write('odyssey commit gate: skipped via ODYSSEY_GATE_SKIP=1\n');
  process.exit(0);
}

/**
 * Git Bash on Windows reports paths as /c/Users/... , which Node cannot use as a cwd —
 * spawnSync fails with ENOENT. Normalise before anything depends on it.
 */
function normaliseCwd(raw) {
  const p = raw ?? process.cwd();
  const m = /^\/([a-zA-Z])\/(.*)$/.exec(p);
  return m ? `${m[1].toUpperCase()}:/${m[2]}` : p;
}

const cwd = normaliseCwd(payload.cwd);

/** git is a real executable: spawn it directly, no shell, no argument-escaping hazard. */
const git = (args) => spawnSync('git', args, { cwd, encoding: 'utf8' });
/** pnpm is a .cmd on Windows and needs a shell, so pass one pre-quoted command string. */
const shell = (cmdline) => spawnSync(cmdline, { cwd, encoding: 'utf8', shell: true });

function abort(reason, detail) {
  // FAIL CLOSED. A gate that waves the commit through whenever its own plumbing breaks is
  // worse than no gate, because it is believed. If this cannot determine what changed, it
  // refuses rather than guessing.
  process.stderr.write(
    `BLOCKED: the Odyssey commit gate could not run, so it cannot vouch for this commit.\n\n` +
      `${reason}\n${detail ? detail.slice(0, 1000) + '\n' : ''}\n` +
      `Fix the gate (or set ODYSSEY_GATE_SKIP=1 deliberately) rather than retrying blind.\n`,
  );
  process.exit(2);
}

const staged = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR']);
if (staged.status !== 0 || typeof staged.stdout !== 'string') {
  abort(
    `\`git diff --cached\` failed in ${cwd} (status ${staged.status}).`,
    String(staged.error ?? staged.stderr ?? ''),
  );
}

const files = staged.stdout
  .split('\n')
  .map((f) => f.trim())
  .filter(Boolean);

// Nothing staged: git itself will complain. Do not add a second, confusing error.
if (files.length === 0) process.exit(0);

const codeFiles = files.filter((f) => !INERT.test(f));
if (codeFiles.length === 0) {
  process.stderr.write(
    `odyssey commit gate: ${files.length} staged file(s), none affect the build — skipped.\n`,
  );
  process.exit(0);
}

const fullRun = codeFiles.some((f) => ROOT_TRIGGERS.includes(f));
const touched = fullRun
  ? PACKAGES
  : PACKAGES.filter((p) => codeFiles.some((f) => f.startsWith(p.dir + '/')));

/** @type {{label: string, out: string}[]} */
const failures = [];
const ran = [];

function check(label, cmdline) {
  const r = shell(cmdline);
  ran.push(label);
  if (r.status !== 0) {
    failures.push({ label, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() });
  }
}

for (const pkg of touched) {
  check(`${pkg.name} typecheck`, `pnpm --filter ${pkg.name} run typecheck`);
  check(`${pkg.name} test`, `pnpm --filter ${pkg.name} run test`);
}

const lintTargets = codeFiles.filter((f) => LINTABLE.test(f));
if (lintTargets.length > 0) {
  const quoted = lintTargets.map((f) => `"${f}"`).join(' ');
  check(
    `eslint (${lintTargets.length} staged file(s))`,
    `pnpm exec eslint --max-warnings 0 ${quoted}`,
  );
}

if (failures.length === 0) {
  process.stderr.write(`odyssey commit gate: PASS — ${ran.join(', ')}\n`);
  process.exit(0);
}

const scope = fullRun
  ? 'root config changed, so every package was checked'
  : `scoped to ${touched.map((p) => p.name).join(', ') || 'staged files'}`;

process.stderr.write(
  [
    'BLOCKED: commit rejected by the Odyssey quality gate.',
    '',
    `CLAUDE.md §7 Definition of Done: typecheck, lint and test must be green before a commit.`,
    `Checks run (${scope}): ${ran.join(', ')}`,
    '',
    ...failures.map(({ label, out }) => `--- FAILED: ${label} ---\n${out.slice(0, 4000)}`),
    '',
    'Fix the failure and commit again. Do not stage around it, and do not weaken the test.',
    'If you genuinely need to commit a known-broken WIP, the human can set ODYSSEY_GATE_SKIP=1.',
  ].join('\n') + '\n',
);
process.exit(2);
