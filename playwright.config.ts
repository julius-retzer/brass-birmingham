import { defineConfig, devices } from '@playwright/test'
import {
  isLocalDbReachableSync,
  localDbUrl,
  newLocalDbName,
} from './src/test/local-db'

// Pick this run's database HERE, at config-load time, because the webServer
// starts before globalSetup (see e2e/global-db.ts) and inherits its env from
// this process. Precedence mirrors the vitest harness
// (src/test/global-db-branch.ts): an externally supplied DATABASE_URL wins, then
// the local Docker stack; otherwise nothing changes and the DB-backed specs fall
// back to `.env` — or skip, via e2e/db-available.ts.
//
// The choice is memoised through the ENVIRONMENT rather than a module variable,
// because every worker process re-loads this config and would otherwise mint a
// database name of its own. Only the main process gets as far as naming one;
// workers inherit both vars and short-circuit on the DATABASE_URL check below,
// which is why they still agree on the same database.
function useLocalDatabase(): boolean {
  if (process.env.DATABASE_URL || process.env.TEST_DB_LOCAL === '0')
    return false
  // Set by an ancestor process (or by hand) — reuse rather than re-probe.
  if (process.env.BB_E2E_DB) return true
  if (!isLocalDbReachableSync()) return false
  process.env.BB_E2E_DB = newLocalDbName('bb_e2e')
  return true
}

const localDb = useLocalDatabase()
if (localDb) {
  // Both the specs (via e2e/db-available.ts) and the dev server read this.
  process.env.DATABASE_URL = localDbUrl(process.env.BB_E2E_DB as string)
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Playwright's local default is half the logical cores (5 here), and each
  // worker is a browser plus its share of the dev server — enough that a few
  // concurrent runs on one machine saturate it. The cap is PER REPO COPY, so N
  // worktrees testing at once is still N × this; it lowers the multiplier
  // rather than bounding the machine. PW_WORKERS widens or narrows a single run
  // without editing this file. CI machines are dedicated, so they keep the
  // default.
  workers: process.env.CI ? undefined : Number(process.env.PW_WORKERS ?? 2),
  retries: 0,
  reporter: [['list']],
  globalSetup: './e2e/global-db.ts',
  globalTeardown: './e2e/global-db-teardown.ts',
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
    // GOTCHA: an already-running `pnpm dev` on :3199 is reused as-is, and it
    // reads DATABASE_URL from `.env` — so this run's database is NOT what it
    // talks to. Stop your dev server for a faithful DB-backed e2e run.
    reuseExistingServer: true,
    timeout: 120_000,
    // Next only fills gaps from `.env*`, so an explicit value wins: this is what
    // points the dev server at this run's database.
    env: localDb ? { DATABASE_URL: process.env.DATABASE_URL as string } : {},
  },
})
