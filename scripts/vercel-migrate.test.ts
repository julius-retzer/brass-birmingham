import { describe, expect, it } from 'vitest'
import { decideMigration } from './vercel-migrate.mjs'

// Regression for the PR #45 preview bug: the preview Neon branch was stuck at
// migration 0000, so create-game 500'd on the missing `chat_messages` /
// `game_intents` tables. The fix auto-migrates preview/development deploys at
// build time; production and local builds must stay untouched (the prod branch
// is migrated by hand). These pins guard that gating.
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

  it('NEVER runs for production (prod branch is migrated manually)', () => {
    const d = decideMigration({
      vercelEnv: 'production',
      databaseUrl: 'postgres://x',
    })
    expect(d.action).toBe('skip')
    expect(d.reason).toContain('production')
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
