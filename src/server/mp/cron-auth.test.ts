// Cron endpoint auth — pure, offline (no DB, no request). Guards the weekly
// archive sweep so ONLY the authorized Vercel-Cron caller can trigger it.
import { describe, expect, it } from 'vitest'
import { authorizeCron } from './cron-auth'

describe('authorizeCron', () => {
  const SECRET = 'super-secret-cron-token'

  it('accepts the exact `Bearer <CRON_SECRET>` header', () => {
    expect(authorizeCron(`Bearer ${SECRET}`, SECRET)).toEqual({ ok: true })
  })

  it('refuses a wrong secret with 401', () => {
    const res = authorizeCron('Bearer nope', SECRET)
    expect(res.ok).toBe(false)
    expect(res.status).toBe(401)
  })

  it('refuses a missing/blank Authorization header with 401', () => {
    expect(authorizeCron(null, SECRET).status).toBe(401)
    expect(authorizeCron(undefined, SECRET).status).toBe(401)
    expect(authorizeCron('', SECRET).status).toBe(401)
  })

  it('refuses a bare-token header lacking the Bearer scheme', () => {
    expect(authorizeCron(SECRET, SECRET).status).toBe(401)
  })

  it('is DISABLED (500) when the server has no CRON_SECRET configured', () => {
    // No secret on the server → nobody, not even a matching header, may run it.
    expect(authorizeCron(`Bearer ${SECRET}`, undefined).status).toBe(500)
    expect(authorizeCron('Bearer anything', '').status).toBe(500)
  })
})
