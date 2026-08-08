import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The content pack's directory skeleton is part of the contract: packages/tools/sim,
 * content-lint, imagegen and i18n-check all resolve paths against it, and CLAUDE.md 3
 * fixes the layout. This test fails loudly if a directory is renamed or removed rather
 * than letting four tools break separately later.
 */

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const REQUIRED_DIRECTORIES = ['events', 'geo', 'i18n', 'i18n/en', 'images', 'schema'] as const;

describe('packages/content layout (CLAUDE.md 3)', () => {
  it.each(REQUIRED_DIRECTORIES)('%s/ exists', (relativePath) => {
    const full = join(PACKAGE_ROOT, relativePath);
    expect(existsSync(full), `missing directory: ${relativePath}`).toBe(true);
    expect(statSync(full).isDirectory(), `${relativePath} is not a directory`).toBe(true);
  });
});
