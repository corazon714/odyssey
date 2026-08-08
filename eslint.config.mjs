import js from '@eslint/js';
import expoConfig from 'eslint-config-expo/flat.js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * The single ESLint configuration for the whole repository.
 *
 * There must be exactly one. ESLint resolves config per linted file by walking up from
 * that file and stopping at the first eslint.config.* it finds — ancestors are not
 * merged — so a nested config would silently switch off everything below. Expo's rules
 * are therefore applied via a `basePath` block here rather than by a config file inside
 * apps/mobile. scripts/check-no-nested-eslint-config.mjs enforces this and runs as part
 * of `pnpm lint`.
 */

const RNG_MESSAGE =
  'Nondeterministic. A run must be reproducible from (seed, choiceSequence, contentVersion) — ' +
  'use the seeded Rng service and its named substreams instead. CLAUDE.md rule 2.3.';

const CLOCK_MESSAGE =
  'Nondeterministic. Time comes from the injected Clock, never from the host — ' +
  'the only place the wall clock may be read is the Clock adapter in apps/mobile/src/clock/. ' +
  'CLAUDE.md rule 2.3.';

/**
 * `no-restricted-globals` cannot express any of this: it matches bare global identifier
 * references, so the only thing it could ban here is the whole `Math` object — which
 * would also outlaw Math.max/floor/abs. Property access needs `no-restricted-properties`
 * (which per the ESLint docs also covers destructuring, e.g. `const { random } = Math`),
 * and the remaining shapes need AST selectors.
 */
const RESTRICTED_PROPERTIES = [
  { object: 'Math', property: 'random', message: RNG_MESSAGE },
  { object: 'Date', property: 'now', message: CLOCK_MESSAGE },
];

const RESTRICTED_SYNTAX = [
  {
    // Argless only. `new Date(injectedTimestamp)` stays legal, because formatting an
    // engine-supplied timestamp is not a determinism violation — reading the host clock is.
    selector: 'NewExpression[callee.name="Date"][arguments.length=0]',
    message: CLOCK_MESSAGE,
  },
  {
    selector: 'CallExpression[callee.name="Date"][arguments.length=0]',
    message: CLOCK_MESSAGE,
  },
  {
    // Computed access defeats no-restricted-properties: Math['random'].
    selector: 'MemberExpression[computed=true][object.name="Math"][property.value="random"]',
    message: RNG_MESSAGE,
  },
  {
    selector: 'MemberExpression[computed=true][object.name="Date"][property.value="now"]',
    message: CLOCK_MESSAGE,
  },
];

/** CLAUDE.md rule 6: no default exports except expo-router route files. */
const NO_DEFAULT_EXPORT = {
  selector: 'ExportDefaultDeclaration',
  message:
    'No default exports (CLAUDE.md 6). Use a named export — it keeps imports greppable and ' +
    'rename-safe. expo-router route files under apps/mobile/app/ are the only exception.',
};

/** Everything packages/engine may not import. CLAUDE.md rule 2.2. */
const ENGINE_FORBIDDEN_PACKAGES = [
  'react',
  'react-dom',
  'react-native',
  'expo',
  'zustand',
  'immer',
];
const ENGINE_FORBIDDEN_PATTERNS = [
  'react-native-*',
  'react-dom/*',
  '@react-native/*',
  '@react-native-*/*',
  'expo-*',
  '@expo/*',
  '@shopify/react-native-*',
  'rive-react-native',
];
const ENGINE_IMPORT_MESSAGE =
  'packages/engine is pure TypeScript and must run under plain Node so it can be simulated ' +
  '20,000 times. No React, React Native, Expo, or platform API may be imported here. ' +
  'CLAUDE.md rule 2.2.';

/** Host APIs that would make the engine unrunnable in plain Node, or nondeterministic. */
const ENGINE_FORBIDDEN_GLOBALS = [
  'window',
  'document',
  'navigator',
  'location',
  'localStorage',
  'sessionStorage',
  'fetch',
  'XMLHttpRequest',
  'alert',
  'process',
  'requestAnimationFrame',
];

export default tseslint.config(
  // ---------------------------------------------------------------------------------
  // Global ignores. This object's only key must be `ignores` — add any other key and it
  // silently degrades from a global ignore into a scoped exclusion. Directory patterns
  // need `/**`, because non-global ignore patterns cannot match a bare directory name.
  // ---------------------------------------------------------------------------------
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.expo/**',
      'reports/**',
      'apps/mobile/ios/**',
      'apps/mobile/android/**',
      'apps/mobile/.expo/**',
      'packages/content/images/generated/**',
    ],
  },

  // ---------------------------------------------------------------------------------
  // Layer 1 — base JS + type-aware TypeScript.
  // ---------------------------------------------------------------------------------
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    name: 'odyssey/parser',
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Plain JS/MJS (this file, scripts/, generated config) is not in any tsconfig, so
    // type-aware rules cannot run on it.
    name: 'odyssey/js-config-files',
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { ...globals.node } },
  },

  // ---------------------------------------------------------------------------------
  // Layer 2 — determinism ban, repo-wide. CLAUDE.md rule 2.3.
  // ---------------------------------------------------------------------------------
  {
    name: 'odyssey/determinism',
    files: ['**/*.{ts,tsx,mts,cts,js,mjs,cjs,jsx}'],
    rules: {
      'no-restricted-properties': ['error', ...RESTRICTED_PROPERTIES],
      'no-restricted-syntax': ['error', ...RESTRICTED_SYNTAX, NO_DEFAULT_EXPORT],
    },
  },

  // ---------------------------------------------------------------------------------
  // Layer 3 — house style. CLAUDE.md rule 6.
  // ---------------------------------------------------------------------------------
  {
    name: 'odyssey/house-style',
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // ---------------------------------------------------------------------------------
  // Layer 4 — packages/engine boundary. CLAUDE.md rule 2.2.
  //
  // Note the repeated RESTRICTED_* spreads: ESLint replaces a rule's options rather than
  // merging them, so omitting them here would switch the repo-wide ban back off for the
  // one package that needs it most.
  // ---------------------------------------------------------------------------------
  {
    name: 'odyssey/engine-boundary',
    files: ['packages/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ENGINE_FORBIDDEN_PACKAGES.map((name) => ({
            name,
            message: ENGINE_IMPORT_MESSAGE,
          })),
          patterns: [{ group: ENGINE_FORBIDDEN_PATTERNS, message: ENGINE_IMPORT_MESSAGE }],
        },
      ],
      'no-restricted-globals': [
        'error',
        ...ENGINE_FORBIDDEN_GLOBALS.map((name) => ({ name, message: ENGINE_IMPORT_MESSAGE })),
      ],
      'no-restricted-properties': [
        'error',
        ...RESTRICTED_PROPERTIES,
        { object: 'performance', property: 'now', message: CLOCK_MESSAGE },
        { object: 'crypto', property: 'randomUUID', message: RNG_MESSAGE },
        { object: 'crypto', property: 'getRandomValues', message: RNG_MESSAGE },
      ],
      'no-restricted-syntax': ['error', ...RESTRICTED_SYNTAX, NO_DEFAULT_EXPORT],
    },
  },

  // ---------------------------------------------------------------------------------
  // Layer 5 — Expo's React Native rules, scoped to the app.
  //
  // Applied via `basePath` from this one root config rather than by an eslint.config.js
  // inside apps/mobile. A nested config would win the per-file lookup outright and take
  // layers 2-4 offline for the whole app; see scripts/check-no-nested-eslint-config.mjs.
  // ---------------------------------------------------------------------------------
  {
    name: 'odyssey/expo',
    basePath: 'apps/mobile',
    extends: [expoConfig],
  },

  // ---------------------------------------------------------------------------------
  // Layer 6 — narrow, deliberate escapes. Each one states why.
  // ---------------------------------------------------------------------------------
  {
    // expo-router requires a default export from every file under app/. This is the
    // single exception CLAUDE.md rule 6 names. Note the RESTRICTED_SYNTAX spread: the
    // determinism selectors must be repeated or dropping NO_DEFAULT_EXPORT would drop
    // them too, since ESLint replaces rule options rather than merging them.
    name: 'odyssey/expo-router-routes',
    files: ['apps/mobile/app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', ...RESTRICTED_SYNTAX],
    },
  },
  {
    // CLAUDE.md rule 6 permits non-null assertions in tests. Tests also assert on
    // deliberately-wrong shapes, so unsafe-* type rules are noise there.
    name: 'odyssey/tests',
    files: ['**/*.test.{ts,tsx}', '**/__tests__/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  {
    // Config files are default-export by contract with their own tooling. Note the `**/`
    // prefix: a bare `*.config.ts` matches only the repository root, which would leave
    // each package's own vitest.config.ts failing the no-default-export rule.
    name: 'odyssey/config-files',
    files: ['**/*.config.{ts,mts,js,mjs}', 'eslint.config.mjs', 'scripts/**/*.mjs'],
    rules: {
      'no-restricted-syntax': ['error', ...RESTRICTED_SYNTAX],
      'no-console': 'off',
    },
  },
);
