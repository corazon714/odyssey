import { defineConfig } from 'vitest/config';

/**
 * Multi-project config for the pure-TypeScript half of the repo.
 *
 * Uses the `projects` field, not vitest.workspace.ts — the workspace file has been
 * deprecated since Vitest 3.2 in favour of this.
 *
 * Each package owns its own vitest.config.ts and is discovered by the glob below. That
 * indirection is deliberate: it means `pnpm --filter @odyssey/engine test` works with
 * only the engine's own dependencies installed, which is how CI proves the engine runs
 * under plain Node with no React Native toolchain present (CLAUDE.md 2.2).
 *
 * apps/mobile is not a project here: it runs on Jest via jest-expo, which is what the
 * React Native preset supports. `pnpm test` runs both.
 */
export default defineConfig({
  test: {
    projects: ['packages/*'],
  },
});
