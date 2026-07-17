// `loadActivityStats` — the aggregate behind GET /api/stats. DB-backed: it is
// a real SQL aggregate over a jsonb column, which is exactly the part a mock
// would not test.
//
// ISOLATION, and why it looks odd: the stats query is GLOBAL (no token filter)
// and its window has only a LOWER bound, over a database shared with the other
// DB suites in parallel workers. So a fixture stamped in the PAST isolates
// nothing — every real game those suites create is lexicographically ABOVE any
// past cutoff and lands in the count (this was a real red run: activeGames 5
// where 1 was expected). Two things buy exact counts instead of flaky deltas:
//   1. Fixtures are stamped in the FAR FUTURE and `now` is injected to match,
//      so every genuinely-current row sits BELOW the cutoff and drops out. No
//      other suite writes a year-2999 row.
//   2. Those rows are deleted after each test, so a lower-bound-only window
//      cannot see the previous test's fixtures either.
import { randomUUID } from 'node:crypto'
import { inArray } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { ensureTestSchema } from '../../test/db-schema'
import { db } from '../db'
import { games } from '../db/schema'
import {
  ACTIVE_WINDOW_MS,
  type GameRecord,
  type SeatRecord,
  loadActivityStats,
  saveGame,
} from './store'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

/** Far ABOVE any real game's `updatedAt`, so a window anchored here excludes
 *  every concurrently-created row. See the isolation note above. */
const BASE = Date.parse('2999-01-01T00:00:00.000Z')
/** Query instant: a minute after the fixtures, well inside the 5m window. */
const NOW = BASE + 60_000

const seeded: string[] = []

const seat = (seatId: number, name: string | null): SeatRecord => ({
  seatId,
  name,
  color: 'red',
  character: 'Eliza Tinsley',
  claimed: name !== null,
  secretHash: name === null ? null : 'x'.repeat(64),
})

/** A game row stamped `ageMs` before BASE, tracked for teardown. */
async function seedGame(opts: {
  ageMs?: number
  phase?: GameRecord['phase']
  seats: SeatRecord[]
}): Promise<void> {
  const token = randomUUID().replace(/-/g, '')
  const stamp = new Date(BASE - (opts.ageMs ?? 0)).toISOString()
  seeded.push(token)
  await saveGame({
    token,
    phase: opts.phase ?? 'playing',
    createdAt: stamp,
    updatedAt: stamp,
    version: 1,
    seats: opts.seats,
    snapshot: null,
  })
}

beforeAll(async () => {
  await ensureTestSchema()
})

afterEach(async () => {
  // Delete BY TOKEN, never a blanket wipe: parallel workers are using this
  // same database and their games must survive.
  if (seeded.length > 0) {
    await db.delete(games).where(inArray(games.token, seeded))
    seeded.length = 0
  }
})

describe('loadActivityStats', () => {
  test('counts nothing when no game is in the window', async () => {
    // Also pins the aggregate folding sum-of-nothing (NULL) to 0, not NaN.
    expect(await loadActivityStats(ACTIVE_WINDOW_MS, NOW)).toEqual({
      activeGames: 0,
      activePlayers: 0,
    })
  })

  test('counts a recent game and its seated players', async () => {
    await seedGame({ seats: [seat(0, 'Ada'), seat(1, 'Brunel')] })
    expect(await loadActivityStats(ACTIVE_WINDOW_MS, NOW)).toEqual({
      activeGames: 1,
      activePlayers: 2,
    })
  })

  test('counts only seats that are taken, not empty ones', async () => {
    // A half-full lobby: 4 seats, 1 named. Must not claim 4 players.
    await seedGame({
      phase: 'lobby',
      seats: [seat(0, 'Ada'), seat(1, null), seat(2, null), seat(3, null)],
    })
    expect(await loadActivityStats(ACTIVE_WINDOW_MS, NOW)).toEqual({
      activeGames: 1,
      activePlayers: 1,
    })
  })

  test('sums seats across several concurrent games', async () => {
    await seedGame({ seats: [seat(0, 'Ada'), seat(1, 'Brunel')] })
    await seedGame({ seats: [seat(0, 'George'), seat(1, null)] })
    expect(await loadActivityStats(ACTIVE_WINDOW_MS, NOW)).toEqual({
      activeGames: 2,
      activePlayers: 3,
    })
  })

  test('excludes a game last touched before the window', async () => {
    // The point of the window: an abandoned table is not "in progress".
    await seedGame({ ageMs: 30 * 60_000, seats: [seat(0, 'Ada')] })
    expect(await loadActivityStats(ACTIVE_WINDOW_MS, NOW)).toEqual({
      activeGames: 0,
      activePlayers: 0,
    })
  })

  test('excludes a finished game even when it was just touched', async () => {
    await seedGame({ phase: 'over', seats: [seat(0, 'Ada'), seat(1, 'Brunel')] })
    expect(await loadActivityStats(ACTIVE_WINDOW_MS, NOW)).toEqual({
      activeGames: 0,
      activePlayers: 0,
    })
  })

  test('honours a custom window', async () => {
    await seedGame({ ageMs: 20 * 60_000, seats: [seat(0, 'Ada')] })
    // Outside the 5m default, inside a 60m window — same row, same instant.
    expect(await loadActivityStats(ACTIVE_WINDOW_MS, NOW)).toEqual({
      activeGames: 0,
      activePlayers: 0,
    })
    expect(await loadActivityStats(60 * 60_000, NOW)).toEqual({
      activeGames: 1,
      activePlayers: 1,
    })
  })
})
