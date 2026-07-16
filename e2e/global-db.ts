// Playwright globalSetup/globalTeardown for the local test database.
//
// WHICH database this run uses is decided in playwright.config.ts, not here:
// the webServer starts BEFORE globalSetup (playwright's runner composes
// createPluginSetupTasks ahead of the globalSetup task), so the dev server's
// DATABASE_URL must already be fixed by config-load time. This file only
// CREATES what the config named, and drops it afterwards.
//
// Creating it this late is safe because `neon()` is lazy — it builds a query
// function without connecting, and the first real query only happens once a
// spec drives an mp route, well after setup has run.
import {
  createLocalDatabase,
  dropLocalDatabase,
  localDbUrl,
} from '../src/test/local-db'

// The name the config picked for this run; absent => not using the local stack
// (external DATABASE_URL, or no Docker), so these hooks do nothing.
export const dbName = () => process.env.BB_E2E_DB

export default async function globalSetup(): Promise<void> {
  const name = dbName()
  if (!name) return

  await createLocalDatabase(name)

  // Same idempotent migration path the vitest DB suites use. Imported lazily:
  // it pulls in `~/server/db`, which reads DATABASE_URL at import time, so the
  // env must be settled first (it is — the config module set it).
  process.env.SKIP_ENV_VALIDATION ??= '1'
  process.env.DATABASE_URL = localDbUrl(name)
  const { ensureTestSchema } = await import('../src/test/db-schema')
  await ensureTestSchema()

  console.info(`[e2e-db] local Docker database ${name} created and migrated`)
}

// Teardown lives in e2e/global-db-teardown.ts: playwright loads globalSetup and
// globalTeardown by a file's DEFAULT export, so they cannot share one module.
