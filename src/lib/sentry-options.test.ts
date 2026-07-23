import { describe, expect, it } from 'vitest'
import { FILTERED } from './sentry-scrub'
import { sharedSentryOptions, tracesSampleRate } from './sentry-options'

describe('tracesSampleRate', () => {
  it('defaults to 1% and rejects junk / out-of-range values', () => {
    expect(tracesSampleRate(undefined)).toBe(0.01)
    expect(tracesSampleRate('')).toBe(0.01)
    expect(tracesSampleRate('not-a-number')).toBe(0.01)
    expect(tracesSampleRate('-1')).toBe(0.01)
    expect(tracesSampleRate('2')).toBe(0.01)
  })

  it('honours a valid override', () => {
    expect(tracesSampleRate('0')).toBe(0)
    expect(tracesSampleRate('0.25')).toBe(0.25)
    expect(tracesSampleRate('1')).toBe(1)
  })
})

describe('sharedSentryOptions', () => {
  it('degrades gracefully with no DSN configured', () => {
    // the test env sets no NEXT_PUBLIC_SENTRY_DSN — this is the local/CI/
    // preview default, and it must be a no-op rather than a crash.
    expect(sharedSentryOptions.dsn).toBeUndefined()
    expect(sharedSentryOptions.enabled).toBe(false)
  })

  it('is free-tier friendly: low traces, no PII, no replay/profiling', () => {
    expect(sharedSentryOptions.tracesSampleRate).toBeLessThanOrEqual(0.05)
    expect(sharedSentryOptions.sendDefaultPii).toBe(false)
    expect(sharedSentryOptions).not.toHaveProperty('replaysSessionSampleRate')
    expect(sharedSentryOptions).not.toHaveProperty('replaysOnErrorSampleRate')
    expect(sharedSentryOptions).not.toHaveProperty('profilesSampleRate')
  })

  it('runs every event through the scrubber before send', () => {
    const secret = 'aabbccddeeff00112233445566778899'
    const out = sharedSentryOptions.beforeSend({
      request: { url: `/api/mp/stream?token=abc&secret=${secret}` },
      extra: { seatSecret: secret },
    })
    expect(JSON.stringify(out)).not.toContain(secret)
    expect(out.request?.url).toContain(`secret=${FILTERED}`)
    expect(out.request?.url).toContain('token=abc')
  })

  it('scrubs breadcrumbs too (a fetch crumb carries the stream URL)', () => {
    const secret = 'ffeeddccbbaa99887766554433221100'
    const crumb = sharedSentryOptions.beforeBreadcrumb({
      message: `GET /api/mp/stream?secret=${secret}`,
      data: { url: `/api/mp/stream?secret=${secret}` },
    })
    expect(JSON.stringify(crumb)).not.toContain(secret)
  })
})
