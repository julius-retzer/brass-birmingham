// THE SECURITY PIN for Sentry. There is no Sentry project to send a probe
// event to (the DSN is set by the owner in Vercel), so the proof that seat
// secrets / host secrets / CRON_SECRET / auth tokens never leave this app is
// asserted at the `beforeSend` layer — the last gate every event passes
// through, shared by the client, server and edge runtimes.
//
// If a check here fails, a credential is on its way to a third party.
import { describe, expect, it } from 'vitest'
import {
  FILTERED,
  isSecretKey,
  scrubEvent,
  scrubQueryString,
  scrubText,
  scrubUrl,
  scrubValue,
} from './sentry-scrub'

/** Realistic values, so a substring leak is detectable in the payload. */
const SEAT_SECRET = 'b3f1c9a27de54810aa9f0c6b1e2d3f47'
const HOST_SECRET = '9911aabbccdd00112233445566778899'
const CRON = 'cron-super-secret-value-1234567890'
const GAME_TOKEN = '0f8a1c2b3d4e5f60718293a4b5c6d7e8'

/** Assert a credential appears NOWHERE in the serialized event. */
function expectNoSecrets(payload: unknown) {
  const json = JSON.stringify(payload)
  expect(json).not.toContain(SEAT_SECRET)
  expect(json).not.toContain(HOST_SECRET)
  expect(json).not.toContain(CRON)
}

describe('isSecretKey', () => {
  it('flags every credential-bearing key name we ship', () => {
    for (const k of [
      'secret',
      'seatSecret',
      'hostSecret',
      'secretHash',
      'CRON_SECRET',
      'Authorization',
      'authToken',
      'SENTRY_AUTH_TOKEN',
      'apiKey',
      'api_key',
      'password',
      'cookie',
    ]) {
      expect(isSecretKey(k), k).toBe(true)
    }
  })

  it('does NOT flag the game token — it is the identifier, not a credential', () => {
    for (const k of ['token', 'gameToken', 'seatId', 'phase', 'route']) {
      expect(isSecretKey(k), k).toBe(false)
    }
  })
})

describe('scrubUrl / scrubQueryString', () => {
  // The SSE stream is `GET /api/mp/stream?token=…&seat=1&secret=…`, so a URL
  // is a credential carrier here, not just metadata.
  it('strips the stream URL secret but keeps token, seat and path', () => {
    const url = `https://brass.example/api/mp/stream?token=${GAME_TOKEN}&seat=2&secret=${SEAT_SECRET}`
    const out = scrubUrl(url)
    expect(out).not.toContain(SEAT_SECRET)
    expect(out).toContain(`secret=${FILTERED}`)
    expect(out).toContain(`token=${GAME_TOKEN}`)
    expect(out).toContain('seat=2')
    expect(out).toContain('/api/mp/stream')
  })

  it('scrubs seatSecret and apiKey params, case-insensitively', () => {
    const out = scrubQueryString(
      `seatSecret=${SEAT_SECRET}&APIKEY=${CRON}&page=3`,
    )
    expectNoSecrets(out)
    expect(out).toContain('page=3')
  })

  it('leaves a URL with no query string alone', () => {
    expect(scrubUrl('https://brass.example/g/abc')).toBe(
      'https://brass.example/g/abc',
    )
  })
})

describe('scrubText', () => {
  it('redacts inline key=value credentials in free text', () => {
    const out = scrubText(
      `refused: seatSecret=${SEAT_SECRET} for token=${GAME_TOKEN}`,
    )
    expectNoSecrets(out)
    expect(out).toContain(GAME_TOKEN)
  })

  it('redacts a Bearer credential', () => {
    const out = scrubText(`Authorization header was Bearer ${CRON}`)
    expectNoSecrets(out)
  })

  it('is idempotent — scrubbing twice does not corrupt the placeholder', () => {
    const once = scrubText(`secret=${SEAT_SECRET}`)
    expect(scrubText(once)).toBe(once)
  })
})

describe('scrubValue', () => {
  it('redacts by key at any depth and survives cycles', () => {
    const node: Record<string, unknown> = {
      game: {
        token: GAME_TOKEN,
        seats: [{ seatId: 0, secretHash: HOST_SECRET }],
      },
      env: { CRON_SECRET: CRON },
    }
    node.self = node // a Sentry `extra` really can be cyclic
    const out = scrubValue(node) as Record<string, unknown>
    // The cycle survives as a cycle (so it cannot be JSON.stringify'd) — walk
    // it by hand and prove the scrubbed clone, not the raw original, is what
    // the self-reference points at.
    const env = out.env as Record<string, unknown>
    expect(env.CRON_SECRET).toBe(FILTERED)
    const game = out.game as Record<string, unknown>
    expect(game.token).toBe(GAME_TOKEN)
    const seats = game.seats as Record<string, unknown>[]
    expect(seats[0]?.secretHash).toBe(FILTERED)
    expect(out.self).toBe(out)
  })
})

describe('scrubEvent (the beforeSend body)', () => {
  it('drops headers, cookies and bodies wholesale', () => {
    const event = scrubEvent({
      request: {
        url: 'https://brass.example/api/mp/act',
        headers: {
          authorization: `Bearer ${CRON}`,
          cookie: `s=${SEAT_SECRET}`,
        },
        cookies: { s: SEAT_SECRET },
        data: { token: GAME_TOKEN, seatSecret: SEAT_SECRET },
      },
    })
    expect(event.request?.headers).toBeUndefined()
    expect(event.request?.cookies).toBeUndefined()
    expect(event.request?.data).toBeUndefined()
    expectNoSecrets(event)
  })

  it('scrubs the URL, query string, message, exception, tags, extra, contexts and breadcrumbs', () => {
    const event = scrubEvent({
      message: `stream failed for secret=${SEAT_SECRET}`,
      request: {
        url: `https://brass.example/api/mp/stream?token=${GAME_TOKEN}&secret=${SEAT_SECRET}`,
        query_string: `token=${GAME_TOKEN}&secret=${SEAT_SECRET}`,
      },
      exception: {
        values: [{ value: `save failed (hostSecret=${HOST_SECRET})` }],
      },
      tags: { 'mp.token': GAME_TOKEN, seatSecret: SEAT_SECRET },
      extra: { seats: [{ seatId: 1, secret: SEAT_SECRET }] },
      contexts: { multiplayer: { token: GAME_TOKEN, secretHash: HOST_SECRET } },
      user: { id: 'seat-1', secret: SEAT_SECRET },
      breadcrumbs: [
        {
          message: `GET /api/mp/stream?secret=${SEAT_SECRET}`,
          data: { url: `/api/mp/stream?secret=${SEAT_SECRET}` },
        },
      ],
    })
    expectNoSecrets(event)
    // …while keeping everything that makes the event diagnosable.
    const json = JSON.stringify(event)
    expect(json).toContain(GAME_TOKEN)
    expect(json).toContain('/api/mp/stream')
    expect((event.tags as Record<string, unknown>)['mp.token']).toBe(GAME_TOKEN)
  })

  it('handles an event with nothing to scrub', () => {
    expect(scrubEvent({})).toEqual({})
  })
})
