import { describe, expect, it } from 'vitest'
import { decideMigration } from './vercel-migrate.mjs'

// Regression for the PR #45 preview bug: the preview Neon branch was stuck at
// migration 0000, so create-game 500'd on the missing `chat_messages` /
// `game_intents` tables. The fix auto-migrates deploys at build time. As of the
// captain-approved 2026-07-21 change this now covers PRODUCTION too (the prod
// `main` branch was previously migrated by hand); only LOCAL builds stay
// untouched. These pins guard that gating.
describe('decideMigration (Vercel build auto-migrate gate)', () => {
  it('runs for a preview deploy with a database', () => {
    const d = decideMigration({
      vercelEnv: 'preview',
      databaseUrl: 'postgres://x',
    })
    expect(d.action).toBe('run')
  })

  it('runs for a development deploy with a database', () => {
    const d = decideMigration({
      vercelEnv: 'development',
      databaseUrl: 'postgres://x',
    })
    expect(d.action).toBe('run')
  })

  it('runs for a production deploy with a database (auto-migrate prod, 2026-07-21)', () => {
    const d = decideMigration({
      vercelEnv: 'production',
      databaseUrl: 'postgres://x',
    })
    expect(d.action).toBe('run')
  })

  it('skips (never crashes the build) when DATABASE_URL is absent on production', () => {
    const d = decideMigration({ vercelEnv: 'production' })
    expect(d.action).toBe('skip')
    expect(d.reason).toContain('DATABASE_URL')
  })

  it('is a no-op locally (no VERCEL_ENV) so pnpm build is unchanged', () => {
    const d = decideMigration({ databaseUrl: 'postgres://x' })
    expect(d.action).toBe('skip')
  })

  it('skips (never crashes the build) when DATABASE_URL is absent on preview', () => {
    const d = decideMigration({ vercelEnv: 'preview' })
    expect(d.action).toBe('skip')
    expect(d.reason).toContain('DATABASE_URL')
  })
})
