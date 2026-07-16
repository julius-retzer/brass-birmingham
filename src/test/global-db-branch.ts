// Vitest globalSetup: point DB-backed suites at an ISOLATED database, never the
// shared `dev` branch.
//
// Runs ONCE in the main process before any worker spawns, so setting
// `process.env.DATABASE_URL` here propagates to the test workers that import
// the DB layer (`~/server/db` reads it at import time). Mirrors the CI workflow
// (.github/workflows/ci.yml) for laptops. Uses the official Neon TypeScript SDK
// directly — see src/test/neon-branch.ts.
//
// Precedence (offline work must never hard-fail; tests must NEVER hit `dev`):
//   0. DATABASE_URL already in the process env → an EXTERNAL owner provisioned
//      it (CI passes the run's Neon branch to `pnpm test`); use it untouched.
//      Nothing loads `.env` into this process, so a local run does not hit this.
//   1. The local Docker stack (compose.yaml) is up → per-run DATABASE on it,
//      dropped in teardown. Fast, free, offline: the default for laptops.
//   2. else NEON_API_KEY present (and TEST_DB_BRANCH!=0) → per-run EPHEMERAL
//      branch off `ci`, deleted in teardown.
//   3. else (TEST_DB_BRANCH=0, no key, or create failed) → TEST_DATABASE_URL,
//      the dedicated long-lived Neon `test` branch, when set.
//   4. else → the existing DATABASE_URL, with a LOUD warning that tests are
//      about to hit a non-test database.
// Whichever database we land on, the DB suites' `ensureTestSchema()` (beforeAll)
// migrates it idempotently — so a fresh local database and a stale `test` branch
// are both brought up to date by the same harness step.
import {
  createLocalDatabase,
  dropLocalDatabase,
  isLocalDbReachable,
  newLocalDbName,
} from './local-db'
import {
  createBranch,
  deleteBranch,
  resolveNeonApiKey,
  resolveTestDatabaseUrl,
} from './neon-branch'

// First line of an error message, safe against non-Error throws (a bad
// `.message` access here would crash globalSetup and defeat the fallback).
function firstLine(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.split('\n')[0] ?? ''
}

// Fallback shared by every no-ephemeral path: prefer the dedicated test branch;
// only ever touch a non-test DATABASE_URL as a last resort, and shout about it.
function useFallbackDatabase(reason: string): void {
  const testUrl = resolveTestDatabaseUrl()
  if (testUrl) {
    process.env.DATABASE_URL = testUrl
    console.info(
      `[test-db] ${reason} → using TEST_DATABASE_URL (dedicated Neon test branch); ensureTestSchema migrates it if stale`,
    )
    return
  }
  if (process.env.DATABASE_URL) {
    console.warn(
      [
        '',
        '════════════════════════════════════════════════════════════════════',
        `[test-db] ⚠  ${reason}, and TEST_DATABASE_URL is not set.`,
        '[test-db] ⚠  DB-backed tests are about to run against DATABASE_URL,',
        '[test-db] ⚠  which is NOT a designated test database (possibly dev/prod).',
        '[test-db] ⚠  Set NEON_API_KEY (ephemeral per-run branch) or',
        '[test-db] ⚠  TEST_DATABASE_URL (shared Neon `test` branch) in .env.local.',
        '════════════════════════════════════════════════════════════════════',
        '',
      ].join('\n'),
    )
    return
  }
  console.info(
    `[test-db] ${reason}, no TEST_DATABASE_URL / DATABASE_URL → DB-backed suites cannot run; engine suites run offline`,
  )
}

// Create this run's own database on the local stack. Returns a teardown, or
// null to fall through to the Neon paths if the stack turns out unusable
// (reachable-but-broken: probed liveness is not proof the database works).
async function setupLocalDatabase(): Promise<(() => Promise<void>) | null> {
  const name = newLocalDbName()
  try {
    process.env.DATABASE_URL = await createLocalDatabase(name)
  } catch (err) {
    console.warn(
      `[test-db] local Docker stack answered but the database could not be created (${firstLine(err)}) → falling back to Neon`,
    )
    return null
  }
  console.info(
    `[test-db] local Docker database ${name} created (compose.yaml) → DATABASE_URL points at it`,
  )
  return async () => {
    try {
      await dropLocalDatabase(name)
      console.info(`[test-db] dropped local Docker database ${name}`)
    } catch (err) {
      console.warn(
        `[test-db] could not drop local database ${name} (${firstLine(err)}); \`docker compose down\` clears it`,
      )
    }
  }
}

export default async function setup(): Promise<(() => Promise<void>) | void> {
  // (0) An external owner already chose the database — CI hands `pnpm test` the
  // run's Neon branch. Never second-guess it: CI must keep using Neon branches.
  if (process.env.DATABASE_URL) {
    console.info(
      '[test-db] using the DATABASE_URL supplied by the environment (CI provisions the run branch)',
    )
    return
  }

  // (1) The local Docker stack — the fast, free, offline default. TEST_DB_LOCAL=0
  // forces the Neon path (e.g. to reproduce a CI-only failure locally).
  if (process.env.TEST_DB_LOCAL !== '0' && (await isLocalDbReachable())) {
    const local = await setupLocalDatabase()
    if (local) return local
  }

  // TEST_DB_BRANCH=0 forces the no-ephemeral path (still avoids `dev`).
  const apiKey = process.env.TEST_DB_BRANCH === '0' ? null : resolveNeonApiKey()

  if (!apiKey) {
    const reason =
      process.env.TEST_DB_BRANCH === '0'
        ? 'TEST_DB_BRANCH=0'
        : 'no NEON_API_KEY'
    useFallbackDatabase(reason)
    return
  }

  let branch: Awaited<ReturnType<typeof createBranch>>
  try {
    branch = await createBranch(apiKey)
  } catch (err) {
    useFallbackDatabase(
      `could not create ephemeral Neon branch (${firstLine(err)})`,
    )
    return
  }

  process.env.DATABASE_URL = branch.connectionUri
  console.info(
    `[test-db] ephemeral Neon branch ${branch.name} (${branch.id}) created off ci → DATABASE_URL points at it`,
  )

  // Runs on teardown for every exit path vitest controls (pass or fail). A hard
  // crash is covered by the branch's 2h TTL.
  return async () => {
    try {
      await deleteBranch(branch.id, apiKey)
      console.info(`[test-db] deleted ephemeral Neon branch ${branch.name}`)
    } catch (err) {
      console.warn(
        `[test-db] could not delete branch ${branch.name} (${firstLine(err)}); it will auto-expire`,
      )
    }
  }
}
