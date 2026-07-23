// Lobby lifecycle: the weekly archive sweep (item 5), a host removing their own
// game (item 6), and the graceful "game no longer exists" join refusal (item
// 7). All three share the additive `archived` state — a game is HIDDEN, never
// deleted, so the row (and its chat + intent log) survives for analytics.
import { beforeAll, describe, expect, test, vi } from 'vitest'
import { ensureTestSchema } from '../../test/db-schema'
import {
  GAME_GONE_ERROR,
  archiveGame,
  createGame,
  joinGame,
  setSeatReady,
  startGame,
} from './game'
import {
  archiveStaleLobbies,
  loadGame,
  loadOpenLobbies,
  saveGame,
} from './store'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

beforeAll(async () => {
  await ensureTestSchema()
})

/** Backdate a game's `updatedAt` so the sweep's 7-day cutoff catches it. Goes
 *  through the version-guarded save, exactly like the real writer. */
async function backdate(token: string, daysAgo: number): Promise<void> {
  const game = (await loadGame(token))!
  game.version++
  game.updatedAt = new Date(
    Date.now() - daysAgo * 24 * 60 * 60 * 1000,
  ).toISOString()
  await saveGame(game)
}

/** A started (playing) game: create → join → ready → host start. */
async function startedGame() {
  const host = await createGame('Ada', 2)
  const guest = await joinGame(host.token, 'Brunel')
  await setSeatReady(host.token, 0, host.seatSecret, true)
  await setSeatReady(host.token, guest.seatId, guest.seatSecret, true)
  const started = await startGame(host.token, host.seatSecret)
  expect(started.ok).toBe(true)
  return host
}

describe('weekly archive sweep (item 5)', () => {
  test('a stale never-started lobby is ARCHIVED, not deleted', async () => {
    const host = await createGame('Ada', 3) // an open lobby
    await backdate(host.token, 8) // older than the 7-day TTL

    await archiveStaleLobbies() // default 7-day cutoff

    const after = await loadGame(host.token)
    expect(after).not.toBeNull() // the row SURVIVES
    expect(after!.archived).toBe(true) // …just hidden
    // and it drops off the public lobby list
    const lobbies = await loadOpenLobbies()
    expect(lobbies.find((l) => l.token === host.token)).toBeUndefined()
  })

  test('a fresh lobby and a started game are left untouched', async () => {
    const fresh = await createGame('Ada', 3) // recent — inside the TTL
    const playing = await startedGame()
    await backdate(playing.token, 30) // stale, but NOT a lobby

    await archiveStaleLobbies()

    expect((await loadGame(fresh.token))!.archived).toBe(false)
    // a game in progress is never archived by the sweep (phase !== 'lobby')
    const p = await loadGame(playing.token)
    expect(p!.archived).toBe(false)
    expect(p!.phase).toBe('playing')
  })
})

describe('host removes their own game (item 6)', () => {
  test('the host archives their lobby — row survives, drops off the list', async () => {
    const host = await createGame('Ada', 3)
    const res = await archiveGame(host.token, host.seatSecret)
    expect(res.ok).toBe(true)

    const after = await loadGame(host.token)
    expect(after).not.toBeNull() // archived, NOT deleted
    expect(after!.archived).toBe(true)
    expect(
      (await loadOpenLobbies()).find((l) => l.token === host.token),
    ).toBeUndefined()
  })

  test('a non-host seat cannot archive the game', async () => {
    const host = await createGame('Ada', 3)
    const guest = await joinGame(host.token, 'Brunel')
    const res = await archiveGame(host.token, guest.seatSecret)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/only the host/i)
    // untouched
    expect((await loadGame(host.token))!.archived).toBe(false)
  })

  test('a started game cannot be removed this way', async () => {
    const host = await startedGame()
    const res = await archiveGame(host.token, host.seatSecret)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/only a lobby/i)
  })
})

describe('graceful join of a gone game (item 7)', () => {
  test('joining an archived game reports GONE, not "no open seats"', async () => {
    const host = await createGame('Ada', 3) // has open seats
    await archiveGame(host.token, host.seatSecret)
    // Distinct signal — the UI shows a "no longer exists" dead-end, not the
    // full-table message (the game still has open seats; it is simply gone).
    await expect(joinGame(host.token, 'Latecomer')).rejects.toThrow(
      GAME_GONE_ERROR,
    )
  })
})
