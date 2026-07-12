import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3199',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'SKIP_ENV_VALIDATION=1 pnpm dev --port 3199',
    url: 'http://localhost:3199',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
