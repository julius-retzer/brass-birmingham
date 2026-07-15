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
//   1. NEON_API_KEY present (and TEST_DB_BRANCH!=0) → per-run EPHEMERAL branch
//      off `ci`, deleted in teardown. The isolation guarantee.
//   2. else (TEST_DB_BRANCH=0, no key, or create failed) → TEST_DATABASE_URL,
//      the dedicated long-lived Neon `test` branch, when set.
//   3. else → the existing DATABASE_URL, with a LOUD warning that tests are
//      about to hit a non-test database.
// Whichever branch we land on, the DB suites' `ensureTestSchema()` (beforeAll)
// migrates it idempotently — so a stale `test` branch is brought up to date by
// the same harness step the ephemeral path relies on.
import {
  createBranch,
  deleteBranch,
  resolveNeonApiKey,
  resolveTestDatabaseUrl,
} from './neon-branch'

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

export default async function setup(): Promise<(() => Promise<void>) | void> {
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
      `could not create ephemeral Neon branch (${(err as Error).message.split('\n')[0]})`,
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
        `[test-db] could not delete branch ${branch.name} (${(err as Error).message.split('\n')[0]}); it will auto-expire`,
      )
    }
  }
}
