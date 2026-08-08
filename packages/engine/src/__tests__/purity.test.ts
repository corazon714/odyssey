import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * CLAUDE.md rules 2.2 and 2.3, enforced as a test rather than only as a lint rule.
 *
 * eslint.config.mjs already bans these, but a lint rule can be disabled with an inline
 * comment, a config edit, or by adding a nested eslint.config.* file. This test cannot
 * be silenced without deleting it, which shows up in review.
 */

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC_ROOT = join(PACKAGE_ROOT, 'src');

/** Package specifiers the engine may never depend on, directly or transitively by import. */
const FORBIDDEN_SPECIFIERS: readonly RegExp[] = [
  /^react$/,
  /^react-dom(\/|$)/,
  /^react-native(\/|$)/,
  /^react-native-.+/,
  /^expo$/,
  /^expo-.+/,
  /^@expo\//,
  /^@react-native(-|\/)/,
  /^@shopify\/react-native-/,
  /^zustand(\/|$)/,
  /^@testing-library\//,
];

/**
 * Nondeterministic APIs. A run must be reproducible from
 * (seed, choiceSequence, contentVersion) — randomness comes from the seeded Rng service
 * and time from the injected Clock.
 */
const FORBIDDEN_PATTERNS: readonly { readonly label: string; readonly re: RegExp }[] = [
  { label: 'Math.random()', re: /\bMath\s*\.\s*random\b/ },
  { label: "Math['random']", re: /\bMath\s*\[\s*['"`]random['"`]\s*\]/ },
  { label: 'Date.now()', re: /\bDate\s*\.\s*now\b/ },
  { label: 'new Date()', re: /\bnew\s+Date\s*\(\s*\)/ },
  { label: 'performance.now()', re: /\bperformance\s*\.\s*now\b/ },
  { label: 'crypto.randomUUID()', re: /\bcrypto\s*\.\s*randomUUID\b/ },
];

const IMPORT_SPECIFIER =
  /(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * Remove comments and string/template literals before scanning for banned APIs.
 *
 * Without this the test flags any file that merely *documents* the rule — src/index.ts
 * explains the Math.random() ban in its own docstring, and would otherwise report
 * itself as a violation.
 *
 * This is deliberately a lexical approximation, not a parse: ESLint's AST rules in
 * eslint.config.mjs are the primary enforcement and this test is the backstop that
 * survives them being disabled. A string containing a literal `/*` sequence would
 * confuse it; nothing in a pure-TS engine should contain one.
 */
function stripCommentsAndLiterals(source: string): string {
  return (
    source
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      // `[^:]` keeps `https://…` inside a URL from being treated as a line comment.
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
      .replace(/`(?:\\[\s\S]|[^\\`])*`/g, '``')
      .replace(/"(?:\\[\s\S]|[^\\"])*"/g, '""')
      .replace(/'(?:\\[\s\S]|[^\\'])*'/g, "''")
  );
}

function collectSourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // Tests legitimately import vitest and node:fs, and this file necessarily
      // contains the very patterns it bans.
      if (entry === '__tests__') continue;
      found.push(...collectSourceFiles(full));
      continue;
    }
    if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) found.push(full);
  }
  return found;
}

const sourceFiles = collectSourceFiles(SRC_ROOT);
const rel = (file: string): string => relative(PACKAGE_ROOT, file).split(sep).join('/');

describe('packages/engine purity (CLAUDE.md 2.2)', () => {
  it('has source files to check', () => {
    // Guards against the whole suite passing vacuously if the walk ever breaks.
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  it.each(sourceFiles.map((f) => [rel(f), f]))(
    '%s imports no UI or platform package',
    (_name, file) => {
      const source = readFileSync(file, 'utf8');
      const offenders: string[] = [];

      for (const match of source.matchAll(IMPORT_SPECIFIER)) {
        const specifier = match[1] ?? match[2] ?? match[3];
        if (specifier === undefined) continue;
        if (FORBIDDEN_SPECIFIERS.some((re) => re.test(specifier))) offenders.push(specifier);
      }

      expect(offenders).toEqual([]);
    },
  );

  it('declares no UI or platform dependency in package.json', () => {
    const manifest = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };

    const declared = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ];

    expect(declared.filter((name) => FORBIDDEN_SPECIFIERS.some((re) => re.test(name)))).toEqual([]);
  });
});

describe('packages/engine determinism (CLAUDE.md 2.3)', () => {
  it.each(sourceFiles.map((f) => [rel(f), f]))('%s uses no nondeterministic API', (_name, file) => {
    const code = stripCommentsAndLiterals(readFileSync(file, 'utf8'));
    const offenders = FORBIDDEN_PATTERNS.filter(({ re }) => re.test(code)).map((p) => p.label);

    expect(offenders).toEqual([]);
  });

  it('still detects a violation once comments and strings are stripped', () => {
    // Guards the guard: if stripCommentsAndLiterals were ever made too aggressive it
    // could blank out real code, and every file above would pass vacuously.
    const code = stripCommentsAndLiterals(
      [
        '// Math.random() in a comment is fine',
        'const s = "Date.now()";',
        'const x = Math.random();',
      ].join('\n'),
    );
    const offenders = FORBIDDEN_PATTERNS.filter(({ re }) => re.test(code)).map((p) => p.label);

    expect(offenders).toEqual(['Math.random()']);
  });
});
