import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Mirror tsconfig's `~/*` -> `src/*` so server modules that import
    // `~/env` (via the DB layer) resolve under vitest.
    alias: {
      '~': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    testTimeout: 5000, // 5 second timeout per test
    hookTimeout: 3000, // 3 second timeout for setup/teardown
    teardownTimeout: 3000,
    globals: true,
    environment: 'node',
    // Relaxes env validation so suites that import the DB layer can load;
    // DB-backed suites provision their own schema via ensureTestSchema().
    setupFiles: ['./src/test/setup-db.ts'],
    // Gives each local run its own throwaway Neon branch (created here,
    // exported as DATABASE_URL, deleted in teardown). Escape hatches +
    // offline fallback live in the module. See AGENTS.md "Local test DB
    // isolation".
    globalSetup: ['./src/test/global-db-branch.ts'],
  },
})
