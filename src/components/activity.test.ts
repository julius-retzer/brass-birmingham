// The charter's "N tables in progress" line: wording, and — the part that
// matters — that a broken/unreachable `/api/stats` degrades to silence rather
// than an error or a "NaN games" render. DOM-free, like `mp/refusal.test.ts`.
import { describe, expect, test } from 'vitest'
import { activityLine, fetchActivity } from './activity'

const jsonRes = (body: unknown, ok = true): Response =>
  ({ ok, json: async () => body }) as Response

const stubFetch = (impl: () => Promise<Response>) =>
  impl as unknown as typeof fetch

describe('activityLine', () => {
  test('renders nothing when the stats are unavailable', () => {
    expect(activityLine(null)).toBeNull()
  })

  test('renders nothing when no games are in progress', () => {
    // Zero and "DB unreachable" must look identical on the page.
    expect(activityLine({ activeGames: 0, activePlayers: 0 })).toBeNull()
  })

  test('singularizes a lone table and player', () => {
    expect(activityLine({ activeGames: 1, activePlayers: 1 })).toBe(
      '1 table in progress · 1 industrialist at play',
    )
  })

  test('pluralizes multiple tables and players', () => {
    expect(activityLine({ activeGames: 3, activePlayers: 7 })).toBe(
      '3 tables in progress · 7 industrialists at play',
    )
  })

  test('omits the player clause when a lobby has no claimed seats', () => {
    expect(activityLine({ activeGames: 1, activePlayers: 0 })).toBe(
      '1 table in progress',
    )
  })
})

describe('fetchActivity', () => {
  test('returns the counts on a healthy response', async () => {
    const stats = await fetchActivity(
      stubFetch(async () => jsonRes({ activeGames: 2, activePlayers: 5 })),
    )
    expect(stats).toEqual({ activeGames: 2, activePlayers: 5 })
  })

  test('returns null when the endpoint is unreachable', async () => {
    const stats = await fetchActivity(
      stubFetch(() => Promise.reject(new Error('offline'))),
    )
    expect(stats).toBeNull()
  })

  test('returns null on a non-ok response', async () => {
    const stats = await fetchActivity(
      stubFetch(async () => jsonRes({ error: 'boom' }, false)),
    )
    expect(stats).toBeNull()
  })

  test('returns null when the body is not JSON', async () => {
    const stats = await fetchActivity(
      stubFetch(
        async () =>
          ({
            ok: true,
            json: async () => {
              throw new SyntaxError('Unexpected token <')
            },
          }) as unknown as Response,
      ),
    )
    expect(stats).toBeNull()
  })

  test('returns null on a malformed body rather than rendering NaN', async () => {
    // A tunnel/proxy answering 200 with something that is not our shape.
    const stats = await fetchActivity(
      stubFetch(async () => jsonRes({ activeGames: 'lots' })),
    )
    expect(stats).toBeNull()
  })

  test('an aborted fetch degrades to silence', async () => {
    const stats = await fetchActivity(
      stubFetch(() =>
        Promise.reject(new DOMException('Aborted', 'AbortError')),
      ),
    )
    expect(stats).toBeNull()
  })
})
