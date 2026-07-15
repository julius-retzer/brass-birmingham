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
    // Boots an isolated in-memory SQLite DB (migrated from ./drizzle) for any
    // test that touches the multiplayer store; a no-op for tests that don't.
    setupFiles: ['./src/test/setup-db.ts'],
  },
})
