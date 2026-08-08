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
  { label: 'Date.now()', re: /\bDate\s*\.\s*now\b/ },
  { label: 'new Date()', re: /\bnew\s+Date\s*\(\s*\)/ },
  { label: 'performance.now()', re: /\bperformance\s*\.\s*now\b/ },
  { label: 'crypto.randomUUID()', re: /\bcrypto\s*\.\s*randomUUID\b/ },
  // Computed access is checked as `Math[` rather than `Math['random']`, because
  // stripCommentsAndLiterals blanks the quoted key before this runs — the old
  // `Math['random']` regex could never match post-strip and was silently dead. Engine
  // source has no legitimate reason to index these objects dynamically at all, so the
  // broader form is both correct and stricter.
  { label: 'computed Math[…]', re: /\bMath\s*\[/ },
  { label: 'computed Date[…]', re: /\bDate\s*\[/ },
  { label: 'computed crypto[…]', re: /\bcrypto\s*\[/ },
  { label: 'computed performance[…]', re: /\bperformance\s*\[/ },
];

/**
 * Cross-ENGINE hazards, as distinct from the nondeterminism above.
 *
 * These are perfectly deterministic on one machine. The problem is that ECMAScript marks
 * Math.pow, Math.exp, Math.log, Math.sqrt, Math.cbrt, Math.hypot, every trig function and
 * the exponent operator as *implementation-approximated*, and makes localeCompare, the
 * toLocale family and Intl locale-dependent. Two conforming engines may therefore disagree
 * on the last bit, or on sort order.
 *
 * That matters here more than in most codebases: CI runs Linux and Windows today, the game
 * ships on Hermes, and a golden run is only worth something if it reproduces on all three.
 * A single Math.pow in a scoring factor breaks replay in a way that passes every local test.
 * Canonical ordering must use `<` / `>` on strings, which is exact UTF-16 code-unit order.
 */
const CROSS_ENGINE_PATTERNS: readonly { readonly label: string; readonly re: RegExp }[] = [
  {
    label: 'Math transcendental',
    re: /\bMath\s*\.\s*(?:pow|exp|expm1|log|log1p|log2|log10|sqrt|cbrt|hypot|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|fround)\b/,
  },
  // `**` survives the strip: block comments (including the `/**` opener) are removed first,
  // and glob strings like 'src/**' are blanked with the rest of the string literals.
  { label: '** operator', re: /\*\*/ },
  { label: 'localeCompare', re: /\blocaleCompare\b/ },
  { label: 'toLocale*', re: /\btoLocale[A-Z]\w*/ },
  { label: 'Intl', re: /\bIntl\s*[.[]/ },
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

describe('packages/engine cross-engine reproducibility (CLAUDE.md 2.3)', () => {
  it.each(sourceFiles.map((f) => [rel(f), f]))(
    '%s uses no implementation-approximated or locale-dependent API',
    (_name, file) => {
      const code = stripCommentsAndLiterals(readFileSync(file, 'utf8'));
      const offenders = CROSS_ENGINE_PATTERNS.filter(({ re }) => re.test(code)).map((p) => p.label);

      expect(offenders).toEqual([]);
    },
  );

  it('detects each cross-engine hazard in live code but not in prose', () => {
    // Guards the guard, twice over. The first array proves every pattern still bites; the
    // second proves the strip keeps a docstring that MENTIONS the ban from reporting
    // itself — which is exactly how this file's own rules are documented elsewhere.
    const live = stripCommentsAndLiterals(
      [
        'const a = Math.pow(2, 8);',
        'const b = 2 ** 8;',
        'const c = x.localeCompare(y);',
        'const d = n.toLocaleString();',
        'const e = new Intl.NumberFormat();',
      ].join('\n'),
    );
    expect(CROSS_ENGINE_PATTERNS.filter(({ re }) => re.test(live)).map((p) => p.label)).toEqual([
      'Math transcendental',
      '** operator',
      'localeCompare',
      'toLocale*',
      'Intl',
    ]);

    const prose = stripCommentsAndLiterals(
      [
        '/** Never use Math.pow or ** here — see CLAUDE.md 2.3. */',
        '// localeCompare and Intl are locale-dependent.',
        "const glob = 'src/**/*.ts';",
        'const label = "toLocaleString";',
      ].join('\n'),
    );
    expect(CROSS_ENGINE_PATTERNS.filter(({ re }) => re.test(prose)).map((p) => p.label)).toEqual(
      [],
    );
  });
});
