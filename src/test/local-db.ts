// Per-run test databases on the LOCAL Docker stack (compose.yaml).
//
// The Neon project lives in us-east-1, so every query from Europe pays ~100ms+.
// A local Postgres behind the Neon HTTP proxy makes DB-backed suites fast, free
// and offline. This module owns detection + the per-run database lifecycle; who
// chooses it lives in src/test/global-db-branch.ts (vitest) and e2e/global-db.ts
// (playwright).
//
// ISOLATION: one database per run, `bb_test_<rand>`, created in setup and
// dropped in teardown — so two runs (two worktrees, vitest + playwright at once)
// never see each other's rows. The single proxy routes by the database name in
// the client's connection string, NOT by its own PG_CONNECTION_STRING (which
// only supplies the backend host + credentials), so one container serves them
// all.
import { randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { neon } from '@neondatabase/serverless'
import { configureLocalProxy } from '~/server/db/local-proxy'

const HOST = process.env.LOCAL_DB_HOST ?? 'localhost'
const PORT = process.env.LOCAL_DB_PORT ?? '4444'
// Credentials + admin database are fixed by compose.yaml; this is a throwaway
// container on loopback, so they are deliberately not secrets.
const USER = 'postgres'
const PASSWORD = 'postgres'
const ADMIN_DB = 'main'
const PROBE_TIMEOUT_MS = 2000

/** Connection string for a database on the local proxy. */
export function localDbUrl(database: string): string {
  return `postgres://${USER}:${PASSWORD}@${HOST}:${PORT}/${database}`
}

/** A fresh, unique database name for one test run. */
export function newLocalDbName(prefix = 'bb_test'): string {
  return `${prefix}_${randomBytes(4).toString('hex')}`
}

function adminSql() {
  const url = localDbUrl(ADMIN_DB)
  configureLocalProxy(url)
  return neon(url)
}

/** Is the local proxy up and serving queries? Never throws. */
export async function isLocalDbReachable(): Promise<boolean> {
  try {
    const sql = adminSql()
    await Promise.race([
      sql`select 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), PROBE_TIMEOUT_MS),
      ),
    ])
    return true
  } catch {
    return false
  }
}

/**
 * Synchronous liveness probe, for callers that cannot await.
 *
 * playwright.config.ts must decide DATABASE_URL at module load: the webServer
 * plugin starts BEFORE globalSetup (playwright's runner composes
 * createPluginSetupTasks ahead of the globalSetup task), so the dev server's env
 * is already fixed by the time an async hook could run. Shelling out to node
 * gives us an async answer synchronously.
 *
 * The child script is deliberately self-contained — no imports. It runs in a
 * bare node process with no bundler, so neither the `~/*` alias nor TypeScript
 * resolution is available to it. Any HTTP reply (even a 400 for the empty body)
 * proves something is serving; only a refused connection means "no stack". The
 * real create in setup is what proves the DB is actually usable.
 */
export function isLocalDbReachableSync(): boolean {
  const script = `
    const c = new AbortController()
    const t = setTimeout(() => c.abort(), ${PROBE_TIMEOUT_MS})
    fetch('http://${HOST}:${PORT}/sql', { method: 'POST', signal: c.signal })
      .then(() => process.exit(0))
      .catch(() => process.exit(1))
      .finally(() => clearTimeout(t))
  `
  try {
    execFileSync(process.execPath, ['-e', script], {
      stdio: 'ignore',
      timeout: PROBE_TIMEOUT_MS * 3,
    })
    return true
  } catch {
    return false
  }
}

/** Create an empty per-run database. Caller applies the schema. */
export async function createLocalDatabase(name: string): Promise<string> {
  // Identifiers can't be parameterized; the name is ours (newLocalDbName), but
  // validate anyway so a caller-supplied name can never inject SQL.
  assertSafeName(name)
  // `.query()` because the driver only accepts a plain (untagged) call this way.
  await adminSql().query(`create database "${name}"`)
  return localDbUrl(name)
}

/**
 * Drop a per-run database.
 *
 * WITH (FORCE) is required, not cosmetic: the proxy keeps pooled backends open
 * against the database, so a plain DROP loses to "is being accessed by other
 * users". FORCE terminates them first (Postgres 13+).
 */
export async function dropLocalDatabase(name: string): Promise<void> {
  assertSafeName(name)
  await adminSql().query(`drop database if exists "${name}" with (force)`)
}

function assertSafeName(name: string): void {
  if (!/^[a-z0-9_]+$/.test(name)) {
    throw new Error(`unsafe test database name: ${name}`)
  }
}
