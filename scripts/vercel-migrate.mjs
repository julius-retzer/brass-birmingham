// Apply pending Drizzle migrations at Vercel BUILD time so a deploy never
// boots against a database missing tables it needs. This is the fix for the
// bug where the preview Neon branch was stuck at migration 0000 and every
// create-game 500'd on the absent `chat_messages` / `game_intents` tables
// (see PR #45): there was NO automatic migration on deploy — schema reached
// each branch only by a manual `pnpm db:migrate`, so a new branch or a new
// migration silently left the deployed app broken.
//
// SCOPE — runs migrate for EVERY Vercel environment: `production`, `preview`
// and `development`. Production auto-migrate on deploy was captain-approved
// (2026-07-21): the prod (`main`) branch used to be migrated by hand, which
// left the deployed app broken whenever a new migration landed before someone
// remembered to run it. This is a no-op locally (no VERCEL_ENV) so `pnpm build`
// is unchanged.
//
// This only ever APPLIES pending migrations (drizzle-orm's `migrate()`), never
// pushes/resets the schema and never drops data — pending-only, forward-only.
// Idempotent: Drizzle records applied migrations in `drizzle.__drizzle_migrations`
// and skips them, so re-runs (and racing concurrent builds) are safe.

/**
 * Pure decision: given the deploy environment, should this build auto-migrate?
 * Split out (no I/O) so the gating is unit-tested offline — see
 * `scripts/vercel-migrate.test.ts`. Mirrors the repo's shell/pure split
 * (e.g. `mp/refusal.ts`).
 *
 * @param {{ vercelEnv?: string, databaseUrl?: string }} params
 * @returns {{ action: 'run' | 'skip', reason: string }}
 */
export function decideMigration({ vercelEnv, databaseUrl }) {
  if (
    vercelEnv !== 'production' &&
    vercelEnv !== 'preview' &&
    vercelEnv !== 'development'
  ) {
    return {
      action: 'skip',
      reason: `VERCEL_ENV=${vercelEnv ?? '(unset)'} — skipping auto-migrate (local build; migrate manually).`,
    }
  }
  if (!databaseUrl) {
    return {
      action: 'skip',
      reason: 'DATABASE_URL is not set — skipping auto-migrate.',
    }
  }
  return {
    action: 'run',
    reason: `applying migrations (VERCEL_ENV=${vercelEnv})…`,
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  const decision = decideMigration({
    vercelEnv: process.env.VERCEL_ENV,
    databaseUrl,
  })
  console.log(`[vercel-migrate] ${decision.reason}`)
  if (decision.action === 'skip' || !databaseUrl) return

  const { neon } = await import('@neondatabase/serverless')
  const { drizzle } = await import('drizzle-orm/neon-http')
  const { migrate } = await import('drizzle-orm/neon-http/migrator')
  const db = drizzle(neon(databaseUrl))
  await migrate(db, { migrationsFolder: './drizzle' })
  console.log('[vercel-migrate] migrations up to date.')
}

// Only run the side-effecting migrate when invoked as the build entrypoint,
// so the test can import `decideMigration` without hitting the network.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('[vercel-migrate] migration failed:', err)
    process.exit(1)
  })
}
