#!/usr/bin/env node
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Fail the lint run if any eslint.config.* exists outside the repository root.
 *
 * This guards a silent failure mode rather than a style preference. ESLint resolves
 * configuration per linted file by walking up from that file's own directory; the first
 * eslint.config.* found wins and ancestor configs are NOT merged. So a nested config —
 * `npx expo lint` writes one into the app directory automatically — would stop the root
 * config from applying to that whole subtree, taking the Math.random()/Date.now() ban
 * and the engine import boundary with it. `pnpm lint` would stay green while two
 * non-negotiable rules from CLAUDE.md quietly went unenforced.
 *
 * Expo's rules are applied instead via a `basePath: 'apps/mobile'` block inside the
 * single root eslint.config.mjs.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_NAME = /^eslint\.config\.(js|mjs|cjs|ts|mts|cts)$/;
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.expo',
  'ios',
  'android',
]);

/** @param {string} dir @returns {string[]} */
function findNestedConfigs(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      found.push(...findNestedConfigs(full));
      continue;
    }
    if (dir !== ROOT && CONFIG_NAME.test(entry)) found.push(full);
  }
  return found;
}

const nested = findNestedConfigs(ROOT).map((f) => relative(ROOT, f).split(sep).join('/'));

if (nested.length > 0) {
  console.error(
    [
      '',
      'Nested ESLint config detected:',
      ...nested.map((f) => `  - ${f}`),
      '',
      'ESLint resolves config per file by walking up from that file and stopping at the',
      'first eslint.config.* it finds — ancestors are not merged. A nested config here',
      'would silently disable the repo-wide determinism ban (CLAUDE.md 2.3) and the',
      'engine import boundary (CLAUDE.md 2.2) for everything beneath it.',
      '',
      'Delete the file and add its rules to the root eslint.config.mjs under a',
      '`basePath` block instead. See docs/adr/0002-toolchain-and-determinism-enforcement.md.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}
