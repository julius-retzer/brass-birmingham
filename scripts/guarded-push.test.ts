import { describe, expect, it } from 'vitest'
import { decidePush } from './guarded-push.mjs'

// `drizzle-kit push` writes no migration journal row and is what drifted prod
// (2026-07-21). These pins guard that it can only target a disposable DB.
describe('decidePush (ban push outside disposable databases)', () => {
  it('allows a localhost target (docker test DB)', () => {
    expect(
      decidePush({ DATABASE_URL: 'postgresql://u:p@localhost:5432/db' }).action,
    ).toBe('allow')
  })

  it('allows a 127.x target', () => {
    expect(
      decidePush({ DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/db' }).action,
    ).toBe('allow')
  })

  it('refuses a remote Neon host by default', () => {
    const d = decidePush({
      DATABASE_URL:
        'postgresql://u:p@ep-red-cloud-adll4y8k.c-2.us-east-1.aws.neon.tech/db',
    })
    expect(d.action).toBe('refuse')
    expect(d.reason).toContain('journal')
  })

  it('allows a remote host only with the explicit BB_ALLOW_REMOTE_PUSH=1 opt-in', () => {
    const d = decidePush({
      DATABASE_URL: 'postgresql://u:p@ep-x.region.neon.tech/db',
      BB_ALLOW_REMOTE_PUSH: '1',
    })
    expect(d.action).toBe('allow')
    expect(d.reason).toContain('THROWAWAY')
  })

  it('refuses when DATABASE_URL is unset', () => {
    expect(decidePush({}).action).toBe('refuse')
  })

  it('refuses an unparseable DATABASE_URL', () => {
    expect(decidePush({ DATABASE_URL: 'not a url' }).action).toBe('refuse')
  })
})
