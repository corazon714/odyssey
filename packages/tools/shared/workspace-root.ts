import { existsSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';

/**
 * Locate the repository root by walking up from `startDir` until `pnpm-workspace.yaml`
 * is found.
 *
 * Every tool in this package needs this: the sim harness writes to reports/, the
 * content linter reads packages/content/, imagegen reads images/manifest.json, and
 * i18n-check reads packages/content/i18n/. Resolving those from `process.cwd()` breaks
 * the moment a script is invoked from a subdirectory or by a git hook, so the root is
 * derived from the calling module's own location instead.
 */
export function findWorkspaceRoot(startDir: string): string {
  const { root } = parse(startDir);
  let current = startDir;

  for (;;) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) return current;
    if (current === root) break;

    const parent = dirname(current);
    // Defensive: dirname('/') === '/' on posix and 'C:\\' on win32. Without this the
    // loop would spin forever if `root` were ever computed differently than dirname's
    // fixed point.
    if (parent === current) break;
    current = parent;
  }

  throw new Error(
    `Could not locate pnpm-workspace.yaml walking up from ${startDir}. ` +
      'Is this file outside the Odyssey workspace?',
  );
}
