import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3199',
    trace: 'retain-on-failure',
    // Watchable headed runs: SLOWMO=250 pnpm exec playwright test --headed --workers=1
    launchOptions: { slowMo: Number(process.env.SLOWMO ?? 0) },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // BB_AI_MOCK: AI-opponent journeys run against the deterministic mock
    // provider — no network, no ANTHROPIC_API_KEY, zero cost.
    command: 'SKIP_ENV_VALIDATION=1 BB_AI_MOCK=1 pnpm dev --port 3199',
    url: 'http://localhost:3199',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
