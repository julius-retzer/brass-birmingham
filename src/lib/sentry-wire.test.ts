// END-TO-END proof that the scrubbing is actually WIRED, not just written.
//
// The unit tests in sentry-scrub.test.ts prove the `beforeSend` body redacts
// credentials. This one proves the SDK really runs it: a live Sentry client is
// pointed at a throwaway localhost "ingest" server with the exact options the
// app ships (`sharedSentryOptions`), a deliberate error is thrown and captured
// with the same context `captureMpError` attaches, and the RAW BYTES that left
// the process are asserted.
//
// There is no real Sentry project yet (the owner sets the DSN in Vercel), so
// this localhost envelope IS the deliberate-test-error verification.
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sharedSentryOptions } from './sentry-options'

const SEAT_SECRET = 'deadbeefdeadbeefdeadbeefdeadbeef'
const CRON = 'cron-secret-value-that-must-not-escape'
const GAME_TOKEN = '11223344556677889900aabbccddeeff'

let server: Server
let received: string[] = []

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => {
      body += String(c)
    })
    req.on('end', () => {
      received.push(`${req.url ?? ''}\n${body}`)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{"id":"test"}')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('a captured error on the wire', () => {
  it('carries the game context and NONE of the credentials', async () => {
    received = []
    const port = (server.address() as AddressInfo).port
    const Sentry = await import('@sentry/nextjs')
    const client = new Sentry.NodeClient({
      ...sharedSentryOptions,
      dsn: `http://publickey@127.0.0.1:${port}/1`,
      enabled: true,
      // a scope-less client we drive directly, so nothing here touches the
      // app's own (disabled) global client
      integrations: [],
      stackParser: Sentry.defaultStackParser,
      transport: Sentry.makeNodeTransport,
    })

    let thrown: unknown
    try {
      // the deliberate test error — shaped like a real store failure, with a
      // credential baked into the message the way a careless throw would.
      throw new Error(
        `saveGame failed for token=${GAME_TOKEN} seatSecret=${SEAT_SECRET}`,
      )
    } catch (err) {
      thrown = err
    }

    client.captureException(thrown, {
      captureContext: {
        tags: { route: 'mp/store.saveGame', 'mp.token': GAME_TOKEN },
        extra: { seatSecret: SEAT_SECRET, CRON_SECRET: CRON },
        contexts: {
          multiplayer: { token: GAME_TOKEN, phase: 'playing', seatId: 2 },
        },
      },
    })
    await client.flush(4000)

    const wire = received.join('\n')
    expect(wire, 'the envelope reached the test ingest server').not.toBe('')
    // (a) it captured, with the context that makes it diagnosable
    expect(wire).toContain(GAME_TOKEN)
    expect(wire).toContain('mp/store.saveGame')
    expect(wire).toContain('playing')
    // (b) it scrubbed — no credential is anywhere in the bytes we sent
    expect(wire).not.toContain(SEAT_SECRET)
    expect(wire).not.toContain(CRON)
  })
})
