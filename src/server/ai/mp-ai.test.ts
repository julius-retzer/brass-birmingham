// The AI opponent through the REAL multiplayer service: an AI seat is
// claimed at creation, acts as a normal server-driven player when its turn
// comes, logs a public rationale per move, and counts its spend.
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { actInGame, createGame, getGameView, releaseSeat } from '../mp/game'
import { loadGame } from '../mp/store'
import { ensureTestSchema } from '../../test/db-schema'

// The store is DB-backed (Neon/Postgres); set DATABASE_URL to a dev branch.
// A full AI turn is many sequential engine steps, each persisted over the
// network, so raise the global 5s per-test timeout for this file.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

beforeAll(async () => {
  process.env.BB_AI_MOCK = '1'
  await ensureTestSchema()
})

afterAll(() => {
  delete process.env.BB_AI_MOCK
})

type Ctx = {
  players: Array<{ money: number; hand: Array<{ id: string }>; name: string }>
  currentPlayerIndex: number
  round: number
}
const ctxOf = (snapshot: unknown) => (snapshot as { context: Ctx }).context

async function waitFor<T>(
  probe: () => Promise<T | null>,
  timeoutMs = 4000,
): Promise<T> {
  const start = Date.now()
  for (;;) {
    const result = await probe()
    if (result !== null) return result
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out')
    await new Promise((r) => setTimeout(r, 25))
  }
}

async function aiGame() {
  const host = await createGame('Ada', 2, ['apprentice'])
  // With every seat claimed at creation the engine starts immediately; the
  // AI runner may already be taking the first turn — wait for Ada's turn.
  const record = await waitFor(async () => {
    const g = await loadGame(host.token)
    if (!g || g.phase !== 'playing' || g.snapshot === null) return null
    return ctxOf(g.snapshot).currentPlayerIndex === 0 ? g : null
  })
  return { host, record }
}

describe('multiplayer with an AI opponent', () => {
  test('creating a game vs an AI starts immediately with the AI seated', async () => {
    const { host } = await aiGame()
    const view = await getGameView(host.token, 0, host.seatSecret)
    expect(view?.phase).toBe('playing')
    expect(view?.seats[1]).toMatchObject({
      kind: 'ai',
      claimed: true,
      name: 'The Apprentice',
    })
    expect(view?.seats[1]?.aiTier?.model).toBe('claude-haiku-4-5')
    expect(view?.seats[0]?.kind).toBe('human')
    expect(view?.ai).toBeTruthy()
  })

  test('after the human acts, the AI takes its whole turn on its own', async () => {
    const { host } = await aiGame()
    let view = await getGameView(host.token, 0, host.seatSecret)
    const round = ctxOf(view!.snapshot).round

    // Ada plays a loan (TAKE_LOAN → card → CONFIRM ends her 1-action turn)
    expect(
      (await actInGame(host.token, 0, host.seatSecret, { type: 'TAKE_LOAN' }))
        .ok,
    ).toBe(true)
    view = await getGameView(host.token, 0, host.seatSecret)
    const card = ctxOf(view!.snapshot).players[0]!.hand[0]!
    expect(
      (
        await actInGame(host.token, 0, host.seatSecret, {
          type: 'SELECT_CARD',
          cardId: card.id,
        })
      ).ok,
    ).toBe(true)
    expect(
      (await actInGame(host.token, 0, host.seatSecret, { type: 'CONFIRM' })).ok,
    ).toBe(true)

    // The AI turn runs in the background; wait until play returns to Ada.
    // A full AI turn is many sequential engine steps, each persisted over the
    // network to Neon, so allow generous headroom vs the old instant file I/O.
    const settled = await waitFor(async () => {
      const g = await loadGame(host.token)
      if (!g || g.snapshot === null) return null
      const ctx = ctxOf(g.snapshot)
      return ctx.currentPlayerIndex === 0 && ctx.round > round ? g : null
    }, 25_000)

    // The AI acted: its move log is public, rationales included.
    const ai = settled.ai!
    expect(ai.log.length).toBeGreaterThan(0)
    expect(ai.log.every((e) => e.seatId === 1)).toBe(true)
    const rationales = ai.log.filter((e) => e.rationale !== null)
    expect(rationales.length).toBeGreaterThan(0)
    expect(rationales[0]!.rationale).toBe('Mock rationale.')
    // the mock provider was consulted but costs nothing
    expect(ai.usage.calls).toBeGreaterThan(0)
    expect(ai.usage.costUsd).toBe(0)

    // ...and the human's view carries the same AI block over the wire.
    const view2 = await getGameView(host.token, 0, host.seatSecret)
    expect(view2?.ai?.log.length).toBeGreaterThan(0)
    expect(view2?.ai?.usage.calls).toBe(ai.usage.calls)
  })

  test('AI seats cannot be released', async () => {
    const { host } = await aiGame()
    await expect(releaseSeat(host.token, host.seatSecret, 1)).rejects.toThrow(
      /AI seats/,
    )
  })

  test('humans cannot act for the AI seat', async () => {
    const { host } = await aiGame()
    const res = await actInGame(host.token, 1, host.seatSecret, {
      type: 'PASS',
    })
    expect(res.ok).toBe(false)
  })

  test('without a server key (and no mock), creating an AI game refuses clearly', async () => {
    const savedMock = process.env.BB_AI_MOCK
    const savedKey = process.env.ANTHROPIC_API_KEY
    delete process.env.BB_AI_MOCK
    delete process.env.ANTHROPIC_API_KEY
    try {
      await expect(createGame('Ada', 2, ['foreman'])).rejects.toThrow(
        /ANTHROPIC_API_KEY/,
      )
    } finally {
      if (savedMock !== undefined) process.env.BB_AI_MOCK = savedMock
      if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey
    }
  })
})
