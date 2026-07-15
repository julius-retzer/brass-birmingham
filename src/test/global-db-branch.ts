// Vitest globalSetup: give each LOCAL test run its own throwaway Neon branch.
//
// Runs ONCE in the main process before any worker spawns, so setting
// `process.env.DATABASE_URL` here propagates to the test workers that import
// the DB layer (`~/server/db` reads it at import time). Mirrors the CI workflow
// (.github/workflows/ci.yml) for laptops. Uses the official Neon TypeScript SDK
// directly — see src/test/neon-branch.ts.
//
// Behaviour (offline work must never hard-fail):
//   - TEST_DB_BRANCH=0  → skip branching, keep whatever DATABASE_URL is set.
//   - no NEON_API_KEY   → skip branching with a one-line notice (set it in
//                         `.env.local` locally, or the CI repo secret).
//   - create failure    → warn and fall back to the existing DATABASE_URL.
// The pure-engine suites never touch the DB and are unaffected in every case.
import { createBranch, deleteBranch, resolveNeonApiKey } from './neon-branch'

export default async function setup(): Promise<(() => Promise<void>) | void> {
  if (process.env.TEST_DB_BRANCH === '0') {
    console.info(
      '[test-db] TEST_DB_BRANCH=0 → using existing DATABASE_URL, no ephemeral Neon branch',
    )
    return
  }

  const apiKey = resolveNeonApiKey()
  if (!apiKey) {
    console.info(
      '[test-db] no NEON_API_KEY (set it in .env.local or as an env var) → DB-backed suites use existing DATABASE_URL if set; engine suites run offline',
    )
    return
  }

  let branch: Awaited<ReturnType<typeof createBranch>>
  try {
    branch = await createBranch(apiKey)
  } catch (err) {
    console.warn(
      `[test-db] could not create ephemeral Neon branch (${(err as Error).message.split('\n')[0]}) → falling back to existing DATABASE_URL`,
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
