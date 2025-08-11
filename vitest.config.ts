import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    testTimeout: 5000, // 5 second timeout per test
    hookTimeout: 3000, // 3 second timeout for setup/teardown
    teardownTimeout: 3000,
    globals: true,
    environment: 'node',
    // Add explicit cleanup
    onConsoleLog: () => false, // Suppress console logs that might cause hanging
  },
})