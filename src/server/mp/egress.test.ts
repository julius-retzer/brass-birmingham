// Neon-egress regression: the SSE poll re-kicks the AI turn-runner every
// ~1.2s per open tab. It MUST decide "is it an AI seat's turn?" from a cheap
// peek (phase + seats + currentPlayerIndex) and only read the full game row
// (with its 28–65KB snapshot jsonb) when it genuinely is an AI's turn.
// Before the fix, every idle tick — human-turn, finished, or no-AI games —
// read and discarded the whole snapshot, burning ~4GB of egress in ~2 days.
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { ensureTestSchema } from '../../test/db-schema'
import { isAiSeatTurn, kickAiTurns } from './game'
import { type AiPeek, type SeatRecord } from './store'

/* ---------------- pure decision (no DB) ---------------- */

const human = (seatId: number): SeatRecord => ({
  seatId,
  name: `P${seatId}`,
  color: 'red',
  character: 'Eliza Tinsley',
  claimed: true,
  secretHash: 'x',
  kind: 'human',
})

const ai = (seatId: number): SeatRecord => ({
  seatId,
  name: 'The Apprentice',
  color: 'blue',
  character: 'George Stephenson',
  claimed: true,
  secretHash: null,
  kind: 'ai',
  aiTier: 'apprentice',
})

const peek = (over: Partial<AiPeek>): AiPeek => ({
  phase: 'playing',
  version: 1,
  seats: [human(0), ai(1)],
  currentPlayerIndex: 1,
  ...over,
})

describe('isAiSeatTurn — the cheap-path decision', () => {
  test('true only when a seated AI is the current player', () => {
    expect(isAiSeatTurn(peek({ currentPlayerIndex: 1 }))).toBe(true)
  })

  test('false on a human turn (do not read the full row)', () => {
    expect(isAiSeatTurn(peek({ currentPlayerIndex: 0 }))).toBe(false)
  })

  test('false for a game with zero AI seats', () => {
    expect(
      isAiSeatTurn(
        peek({ seats: [human(0), human(1)], currentPlayerIndex: 0 }),
      ),
    ).toBe(false)
  })

  test('false when the game is finished', () => {
    expect(isAiSeatTurn(peek({ phase: 'over' }))).toBe(false)
  })

  test('false in the lobby / before a snapshot exists', () => {
    expect(
      isAiSeatTurn(peek({ phase: 'lobby', currentPlayerIndex: null })),
    ).toBe(false)
  })

  test('false when the peek is missing or the index is out of range', () => {
    expect(isAiSeatTurn(null)).toBe(false)
    expect(isAiSeatTurn(peek({ currentPlayerIndex: 5 }))).toBe(false)
  })
})

/* ---------------- empirical egress (DB-backed) ---------------- */

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

beforeAll(async () => {
  process.env.BB_AI_MOCK = '1'
  await ensureTestSchema()
})

afterAll(() => {
  delete process.env.BB_AI_MOCK
})

describe('poll-tick egress', () => {
  test('loadAiPeek omits the snapshot and is far smaller than the full row', async () => {
    const { createGame } = await import('./game')
    const store = await import('./store')
    const host = await createGame('Ada', 2, ['apprentice'])

    const peekRow = await store.loadAiPeek(host.token)
    const full = await store.loadGame(host.token)
    expect(peekRow).not.toBeNull()
    expect(full).not.toBeNull()

    // The peek carries phase + seats + the current index, and NOTHING else
    // (no snapshot jsonb — that is the whole point).
    expect(peekRow!.phase).toBe('playing')
    expect(peekRow!.seats.length).toBe(2)
    expect(peekRow!.currentPlayerIndex).toBe(
      (full!.snapshot as { context: { currentPlayerIndex: number } }).context
        .currentPlayerIndex,
    )
    expect(peekRow as unknown as { snapshot?: unknown }).not.toHaveProperty(
      'snapshot',
    )

    // Empirical wire cost: the full row is dominated by the snapshot; the peek
    // is a fraction of it. (neon-http ships jsonb as JSON text, so the
    // stringified size is the wire size.)
    const peekBytes = JSON.stringify(peekRow).length
    const fullBytes = JSON.stringify(full).length
    expect(peekBytes).toBeLessThan(2_000)
    expect(fullBytes).toBeGreaterThan(peekBytes * 4)
    console.log(
      `[egress] per-tick full-load=${fullBytes}B  cheap-peek=${peekBytes}B  ` +
        `saved=${(100 * (1 - peekBytes / fullBytes)).toFixed(1)}%`,
    )
  })

  test('kicking a no-AI game never reads the full game row', async () => {
    const store = await import('./store')
    const { createGame, joinGame } = await import('./game')
    // A 2-human game, both seats claimed but still a lobby (no auto-start).
    // Either way it has no AI seat, so the cheap peek short-circuits the kick.
    const host = await createGame('Ada', 2, [])
    await joinGame(host.token, 'Bea')
    // Let the creation/join kicks settle so the aiRunning dedup is clear.
    await new Promise((r) => setTimeout(r, 200))

    const loadGameSpy = vi.spyOn(store, 'loadGame')
    const loadAiPeekSpy = vi.spyOn(store, 'loadAiPeek')
    await kickAiTurns(host.token)

    // The cheap peek decided "not an AI's turn" — the full row was never read.
    expect(loadAiPeekSpy).toHaveBeenCalled()
    expect(loadGameSpy).not.toHaveBeenCalled()
    loadGameSpy.mockRestore()
    loadAiPeekSpy.mockRestore()
  })
})
