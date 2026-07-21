// The durable intent log through the REAL store: every accepted intent lands
// as one `game_intents` row written ATOMICALLY with the snapshot it produced;
// refusals leave nothing; a lost concurrent write leaves NO phantom row; and
// the logged rows replay to the exact stored final state. The offline
// full-game replay proof (two eras, mock AI) lives in replay.test.ts.
//
// Reconstructing a bug-report game: with DATABASE_URL pointed at the branch
// holding the game, run
//   BB_REPLAY_TOKEN=<token> pnpm vitest run src/server/mp/intentlog.test.ts -t 'BB_REPLAY_TOKEN'
// (see the guarded describe at the bottom), or export the rows with
//   select * from game_intents where token = '<token>' order by seq
// and feed them to `replayIntentLog` (replay.ts) offline.
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { ensureTestSchema } from '../../test/db-schema'
import {
  actInGame,
  createGame,
  getGameView,
  joinGame,
  setSeatReady,
  startGame,
} from './game'
import { normalizeSnapshotForComparison, replayIntentLog } from './replay'
import {
  type GameRecord,
  loadGame,
  loadIntentLog,
  saveGame,
  sweepStaleGames,
} from './store'

// Every test drives several sequential round-trips to a real (network) DB —
// same sizing as the other DB-backed mp suites.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

beforeAll(async () => {
  process.env.BB_AI_MOCK = '1'
  await ensureTestSchema()
})

afterAll(() => {
  delete process.env.BB_AI_MOCK
})

type Ctx = {
  players: Array<{ hand: Array<{ id: string }> }>
  currentPlayerIndex: number
}
const ctxOf = (snapshot: unknown) => (snapshot as { context: Ctx }).context

async function freshGame() {
  const host = await createGame('Ada', 2)
  const guest = await joinGame(host.token, 'Brunel')
  await setSeatReady(host.token, 0, host.seatSecret, true)
  await setSeatReady(host.token, guest.seatId, guest.seatSecret, true)
  await startGame(host.token, host.seatSecret)
  return { host, guest }
}

/** Act as whichever seat is current; returns the sent events. */
async function playLoanTurn(
  token: string,
  creds: Record<number, string>,
): Promise<Array<Record<string, unknown>>> {
  const game = await loadGame(token)
  const seat = ctxOf(game!.snapshot).currentPlayerIndex
  const secret = creds[seat]!
  const view = await getGameView(token, seat, secret)
  const cardId = ctxOf(view!.snapshot).players[seat]!.hand[0]!.id
  const events = [
    { type: 'TAKE_LOAN' },
    { type: 'SELECT_CARD', cardId },
    { type: 'CONFIRM' },
  ]
  for (const event of events) {
    const res = await actInGame(token, seat, secret, event)
    expect(res.ok).toBe(true)
  }
  return events
}

describe('intent log: append-on-accept', () => {
  test('engine start writes the setup record; each accepted intent appends exactly one row', async () => {
    const { host, guest } = await freshGame()
    const creds = { 0: host.seatSecret, 1: guest.seatSecret }

    // The host start captured the initial snapshot as the setup record.
    let rows = await loadIntentLog(host.token)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ seq: 1, kind: 'setup', seatId: null })
    const started = await loadGame(host.token)
    expect(rows[0]!.version).toBe(started!.version)
    // the captured payload IS the stored initial snapshot
    expect(rows[0]!.payload).toEqual(started!.snapshot)

    const seat = ctxOf(started!.snapshot).currentPlayerIndex
    const events = await playLoanTurn(host.token, creds)

    rows = await loadIntentLog(host.token)
    expect(rows).toHaveLength(4)
    rows.slice(1).forEach((row, i) => {
      expect(row.kind).toBe('intent')
      expect(row.seatId).toBe(seat)
      expect(row.seq).toBe(i + 2)
      // the exact event as sent, none of them an era boundary
      expect(row.payload).toEqual(events[i])
      expect(row.snapshotAfter).toBeNull()
    })
    // each row records the version its write produced — strictly ascending
    // by one from the setup record, ending at the game's current version
    const game = await loadGame(host.token)
    const base = rows[0]!.version
    expect(rows.map((r) => r.version)).toEqual([
      base,
      base + 1,
      base + 2,
      base + 3,
    ])
    expect(rows[rows.length - 1]!.version).toBe(game!.version)
  })

  test('a refused intent appends nothing', async () => {
    const { host, guest } = await freshGame()
    const before = await loadIntentLog(host.token)

    const game = await loadGame(host.token)
    const seat = ctxOf(game!.snapshot).currentPlayerIndex
    const secret = seat === 0 ? host.seatSecret : guest.seatSecret

    // guard refusal: CONFIRM with nothing staged
    const refused = await actInGame(host.token, seat, secret, {
      type: 'CONFIRM',
    })
    expect(refused.ok).toBe(false)
    // whitelist refusal: TEST_* never reaches the engine
    const forged = await actInGame(host.token, seat, secret, {
      type: 'TEST_SET_PLAYER_HAND',
      playerId: 0,
      hand: [],
    })
    expect(forged.ok).toBe(false)

    expect(await loadIntentLog(host.token)).toEqual(before)
  })

  test('AI moves are logged like human ones, attributed to the AI seat', async () => {
    // With the mock provider the AI takes its whole turn as soon as the
    // engine starts (seat order is shuffled, so wait for quiescence).
    const host = await createGame('Ada', 2, ['apprentice'])
    const start = Date.now()
    for (;;) {
      const game = await loadGame(host.token)
      if (
        game &&
        game.snapshot !== null &&
        ctxOf(game.snapshot).currentPlayerIndex === 0
      )
        break
      if (Date.now() - start > 8000) throw new Error('AI never yielded')
      await new Promise((r) => setTimeout(r, 50))
    }
    // Ada plays a loan; the AI then takes its whole turn on its own.
    await playLoanTurn(host.token, { 0: host.seatSecret })
    for (;;) {
      const game = await loadGame(host.token)
      if (ctxOf(game!.snapshot).currentPlayerIndex === 0) break
      if (Date.now() - start > 20000) throw new Error('AI turn never finished')
      await new Promise((r) => setTimeout(r, 50))
    }

    const rows = await loadIntentLog(host.token)
    expect(rows[0]!.kind).toBe('setup')
    const bySeat = new Map<number | null, number>()
    for (const row of rows.slice(1)) {
      bySeat.set(row.seatId, (bySeat.get(row.seatId) ?? 0) + 1)
    }
    expect(bySeat.get(0)).toBeGreaterThanOrEqual(3)
    expect(bySeat.get(1)).toBeGreaterThanOrEqual(1)

    // and the mixed human+AI log replays to the stored state
    const game = await loadGame(host.token)
    const replayed = replayIntentLog(rows)
    expect(normalizeSnapshotForComparison(replayed.snapshot)).toEqual(
      normalizeSnapshotForComparison(game!.snapshot),
    )
  })
})

describe('intent log: atomicity with the version-guarded save', () => {
  test('a lost concurrent write throws AND leaves no phantom log row', async () => {
    const { host } = await freshGame()
    const record = (await loadGame(host.token))!

    // Two writers race the same read-modify-write: both bump to version+1.
    const winner: GameRecord = { ...record, version: record.version + 1 }
    await saveGame(winner, {
      kind: 'intent',
      seatId: 0,
      payload: { type: 'PASS' },
    })
    const afterWinner = await loadIntentLog(host.token)

    const loser: GameRecord = { ...record, version: record.version + 1 }
    await expect(
      saveGame(loser, {
        kind: 'intent',
        seatId: 1,
        payload: { type: 'TAKE_LOAN' },
      }),
    ).rejects.toThrow(/Concurrent write/)

    // the losing save inserted NOTHING — log and snapshot cannot diverge
    expect(await loadIntentLog(host.token)).toEqual(afterWinner)
    const stored = await loadGame(host.token)
    expect(stored!.version).toBe(winner.version)
  })

  test('the sweep drops a stale game and its intent rows together', async () => {
    const { host } = await freshGame()
    const record = (await loadGame(host.token))!
    expect((await loadIntentLog(host.token)).length).toBeGreaterThan(0)

    // Backdate the game past the TTL, then sweep (bypassing the throttle by
    // moving `now` forward; the cutoff stays ~7 days in the past, so other
    // suites' fresh games are untouched).
    await saveGame({
      ...record,
      version: record.version + 1,
      updatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    })
    await sweepStaleGames(Date.now() + 2 * 60 * 60 * 1000)

    expect(await loadGame(host.token)).toBeNull()
    expect(await loadIntentLog(host.token)).toEqual([])
  })
})

describe('intent log: DB round-trip replay', () => {
  test('a played game reconstructs from its stored rows to the stored snapshot', async () => {
    const { host, guest } = await freshGame()
    const creds = { 0: host.seatSecret, 1: guest.seatSecret }

    // A few real turns through the wire seam (both seats).
    for (let turn = 0; turn < 4; turn++) {
      await playLoanTurn(host.token, creds)
    }

    const game = await loadGame(host.token)
    const rows = await loadIntentLog(host.token)
    expect(rows).toHaveLength(1 + 4 * 3)

    const replayed = replayIntentLog(rows)
    expect(replayed.steps).toBe(rows.length - 1)
    expect(replayed.version).toBe(game!.version)
    expect(normalizeSnapshotForComparison(replayed.snapshot)).toEqual(
      normalizeSnapshotForComparison(game!.snapshot),
    )
  })
})

// The bug-report tool: point DATABASE_URL at the branch holding the game and
//   BB_REPLAY_TOKEN=<token> pnpm vitest run src/server/mp/intentlog.test.ts -t 'BB_REPLAY_TOKEN'
// It replays the stored intent log through the real engine and asserts the
// reconstruction matches the stored snapshot, printing a short summary.
const REPLAY_TOKEN = process.env.BB_REPLAY_TOKEN
describe.runIf(!!REPLAY_TOKEN)('intent log: BB_REPLAY_TOKEN tool', () => {
  test('replays the game named by BB_REPLAY_TOKEN against its stored snapshot', async () => {
    const token = REPLAY_TOKEN!
    const game = await loadGame(token)
    expect(game, `game ${token} not found`).toBeTruthy()
    const rows = await loadIntentLog(token)
    expect(rows.length, 'game has no intent log').toBeGreaterThan(0)

    const replayed = replayIntentLog(rows)
    console.log(
      `[replay] ${token}: ${replayed.steps} intents replayed, ` +
        `log version ${replayed.version}, stored version ${game!.version}`,
    )
    expect(normalizeSnapshotForComparison(replayed.snapshot)).toEqual(
      normalizeSnapshotForComparison(game!.snapshot),
    )
  })
})
