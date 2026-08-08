#!/usr/bin/env node
/**
 * PostToolUse / Write|Edit|MultiEdit — surface newly added dependencies.
 *
 * PostToolUse, not PreToolUse, on purpose: adding a dependency is legitimate, so this
 * must not block. Exit 2 on this event cannot undo the write — it feeds stderr back as
 * feedback, which is exactly the intent: Claude is told it just added a dependency and
 * is reminded to justify it before the human finds out later.
 *
 * Compares the dependency KEY SETS of HEAD's version and the working-tree version rather
 * than grepping the diff, so a reordering or a version bump does not read as a new
 * dependency and a new package.json reports all of its dependencies.
 */

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

let payload;
try {
  payload = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const target = payload.tool_input?.file_path;
if (typeof target !== 'string') process.exit(0);

const rel = target.replace(/\\/g, '/');
if (!/(^|\/)package\.json$/.test(rel)) process.exit(0);
if (rel.includes('node_modules/')) process.exit(0);

const cwd = payload.cwd ?? process.cwd();
const git = (args) =>
  spawnSync('git', args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });

const pathInRepo = (() => {
  const root = cwd.replace(/\\/g, '/').replace(/\/$/, '');
  return rel.toLowerCase().startsWith(root.toLowerCase() + '/') ? rel.slice(root.length + 1) : rel;
})();

function depsOf(json) {
  const set = new Map();
  for (const field of DEP_FIELDS) {
    for (const [name, range] of Object.entries(json?.[field] ?? {})) {
      set.set(`${field}:${name}`, { field, name, range });
    }
  }
  return set;
}

let after;
try {
  after = depsOf(JSON.parse(readFileSync(target, 'utf8')));
} catch {
  process.exit(0); // Mid-edit invalid JSON is not this hook's problem.
}

/**
 * Baseline order: last commit, then the index, then nothing.
 *
 * The index fallback matters while a package.json is still untracked — without it every
 * edit to a not-yet-committed manifest reports all of its dependencies as new, which is
 * noise, and noise is how a warning hook gets ignored.
 */
let before = new Map();
let baseline = null;
for (const ref of [`HEAD:${pathInRepo}`, `:${pathInRepo}`]) {
  const shown = git(['show', ref]);
  if (shown.status === 0) {
    try {
      before = depsOf(JSON.parse(shown.stdout));
      baseline = ref.startsWith('HEAD') ? 'last commit' : 'the staged version';
      break;
    } catch {
      process.exit(0);
    }
  }
}
if (baseline === null) process.exit(0); // Brand-new manifest: the human is reading it anyway.

const added = [...after.entries()].filter(([key]) => !before.has(key)).map(([, v]) => v);
if (added.length === 0) process.exit(0);

process.stderr.write(
  [
    `NEW DEPENDENCY ADDED to ${pathInRepo} (vs ${baseline}) — justify it before it lands.`,
    '',
    ...added.map((d) => `  + ${d.name}@${d.range}   (${d.field})`),
    '',
    'CLAUDE.md §8: "Each new dependency needs a one-line justification and a note on New',
    'Architecture compatibility." CLAUDE.md §4 adds two traps that apply here:',
    '  1. Prefer the Expo SDK pin over npm-latest — use `npx expo install`, not `pnpm add`,',
    '     for anything with native code. The SDK pins Skia to 2.6.2 and FlashList to 2.0.2,',
    '     both well behind latest.',
    '  2. A wildcard peer ("*") is the ABSENCE of a compatibility claim, not a promise. It',
    '     installs silently whether or not it works.',
    '',
    'Tell the human now: what it is for, why nothing already present does the job, and',
    'whether it supports the New Architecture. Do not wait to be asked.',
  ].join('\n') + '\n',
);
process.exit(2);
