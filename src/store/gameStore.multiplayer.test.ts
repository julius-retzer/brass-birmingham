// Multiplayer service tests: server authority, seat security, and — most
// importantly — that a seat's view NEVER contains another player's cards.
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { afterAll, describe, expect, test } from 'vitest'
import {
  actInGame,
  createGame,
  getGameView,
  joinGame,
  releaseSeat,
} from '../server/mp/game'
import { loadGame } from '../server/mp/store'

const createdTokens: string[] = []

afterAll(async () => {
  await Promise.all(
    createdTokens.map((t) =>
      fs
        .unlink(path.join(process.cwd(), '.bb-games', `${t}.json`))
        .catch(() => {}),
    ),
  )
})

async function freshGame() {
  const host = await createGame('Ada', 2)
  createdTokens.push(host.token)
  const guest = await joinGame(host.token, 'Brunel')
  return { host, guest }
}

type Ctx = {
  players: Array<{ hand: Array<{ id: string }>; name: string }>
  drawPile: Array<{ id: string }>
  currentPlayerIndex: number
}
const ctxOf = (view: { snapshot: unknown }) =>
  (view.snapshot as { context: Ctx }).context

describe('multiplayer: lifecycle and authority', () => {
  test('create → join fills seats and starts the engine', async () => {
    const { host, guest } = await freshGame()
    const view = await getGameView(host.token, 0, host.seatSecret)
    expect(view?.phase).toBe('playing')
    expect(view?.you).toBe(0)
    expect(view?.seats.map((s) => s.name)).toEqual(['Ada', 'Brunel'])
    expect(guest.seatId).toBe(1)
    // durability: the record round-trips through the file store
    const record = await loadGame(host.token)
    expect(record?.phase).toBe('playing')
    expect(record?.snapshot).toBeTruthy()
  })

  test('acting requires the right secret, the right turn, a whitelisted event', async () => {
    const { host, guest } = await freshGame()
    const view = await getGameView(host.token, 0, host.seatSecret)
    const current = ctxOf(view!).currentPlayerIndex

    // wrong secret
    expect(
      await actInGame(host.token, 0, 'not-the-secret-aaaaaaaa', {
        type: 'PASS',
      }),
    ).toEqual({ ok: false, error: 'Not your seat' })

    // not your turn (the seat that is NOT current tries to act)
    const wrongSeat = current === 0 ? 1 : 0
    const wrongCreds = wrongSeat === 0 ? host : { ...guest, token: host.token }
    expect(
      (
        await actInGame(host.token, wrongSeat, wrongCreds.seatSecret, {
          type: 'PASS',
        })
      ).ok,
    ).toBe(false)

    // TEST_* events are not accepted off the wire
    const rightCreds = current === 0 ? host : guest
    const res = await actInGame(host.token, current, rightCreds.seatSecret, {
      type: 'TEST_SET_PLAYER_HAND',
      playerId: 0,
      hand: [],
    })
    expect(res.ok).toBe(false)
    expect((res as { error: string }).error).toMatch(/not allowed/)
  })

  test('a legal action executes on the engine, persists, and bumps the version', async () => {
    const { host, guest } = await freshGame()
    let view = await getGameView(host.token, 0, host.seatSecret)
    const v0 = view!.version
    const current = ctxOf(view!).currentPlayerIndex
    const creds = current === 0 ? host : guest

    // Loan through the full flow: TAKE_LOAN → SELECT_CARD → CONFIRM
    expect(
      (
        await actInGame(host.token, current, creds.seatSecret, {
          type: 'TAKE_LOAN',
        })
      ).ok,
    ).toBe(true)
    view = await getGameView(host.token, current, creds.seatSecret)
    const ownHand = ctxOf(view!).players[current]!.hand
    expect(
      (
        await actInGame(host.token, current, creds.seatSecret, {
          type: 'SELECT_CARD',
          cardId: ownHand[0]!.id,
        })
      ).ok,
    ).toBe(true)
    expect(
      (
        await actInGame(host.token, current, creds.seatSecret, {
          type: 'CONFIRM',
        })
      ).ok,
    ).toBe(true)

    view = await getGameView(host.token, current, creds.seatSecret)
    expect(view!.version).toBeGreaterThan(v0)
    const money = (
      view!.snapshot as { context: { players: Array<{ money: number }> } }
    ).context.players[current]!.money
    expect(money).toBe(47) // £17 + £30 loan
  })

  test('host can release a seat; a new player reclaims it', async () => {
    const { host } = await freshGame()
    await expect(
      releaseSeat(host.token, 'wrong-secret-aaaaaaaa', 1),
    ).rejects.toThrow(/host/)
    await releaseSeat(host.token, host.seatSecret, 1)
    const rejoined = await joinGame(host.token, 'Watt')
    expect(rejoined.seatId).toBe(1)
    const view = await getGameView(host.token, 1, rejoined.seatSecret)
    expect(view?.you).toBe(1)
    expect(view?.snapshot).toBeTruthy()
  })
})

describe('multiplayer: hidden information never crosses the wire', () => {
  test("a seat's view redacts other hands, the draw pile, and foreign selections", async () => {
    const { host, guest } = await freshGame()

    const hostView = await getGameView(host.token, 0, host.seatSecret)
    const guestView = await getGameView(host.token, 1, guest.seatSecret)
    const hostCtx = ctxOf(hostView!)
    const guestCtx = ctxOf(guestView!)

    // own hands are real
    expect(
      hostCtx.players[0]!.hand.every((c) => !c.id.startsWith('hidden-')),
    ).toBe(true)
    expect(
      guestCtx.players[1]!.hand.every((c) => !c.id.startsWith('hidden-')),
    ).toBe(true)
    // foreign hands are placeholders of the SAME LENGTH (guards need counts)
    expect(
      hostCtx.players[1]!.hand.every((c) => c.id.startsWith('hidden-')),
    ).toBe(true)
    expect(
      guestCtx.players[0]!.hand.every((c) => c.id.startsWith('hidden-')),
    ).toBe(true)
    expect(guestCtx.players[0]!.hand).toHaveLength(
      hostCtx.players[0]!.hand.length,
    )
    // the draw pile is never shipped (only its size)
    expect(guestCtx.drawPile.every((c) => c.id.startsWith('hidden-'))).toBe(
      true,
    )

    // Wire-level: walk the exact payload the guest receives and assert every
    // card in a hidden zone (foreign hands, draw pile, foreign selections)
    // is a placeholder. NOTE a naive string-contains check false-positives:
    // industry CARD ids share the id namespace with the public industry
    // TILE definitions on every player mat (e.g. "brewery_3").
    const wire = JSON.parse(JSON.stringify(guestView)) as {
      snapshot: { context: Ctx & { selectedCard: { id: string } | null } }
    }
    const wireCtx = wire.snapshot.context
    const hiddenZones = [
      ...wireCtx.players.flatMap((p, i) => (i === 1 ? [] : p.hand)),
      ...wireCtx.drawPile,
      ...(wireCtx.selectedCard ? [wireCtx.selectedCard] : []),
    ]
    expect(hiddenZones.length).toBeGreaterThan(0)
    for (const card of hiddenZones) {
      expect(card.id).toMatch(/^hidden-/)
    }
    // and host's real hand ids appear nowhere among any card zone of the view
    const allCardZones = [
      ...wireCtx.players.flatMap((p) => p.hand),
      ...wireCtx.drawPile,
    ].map((c) => c.id)
    for (const card of hostCtx.players[0]!.hand) {
      expect(allCardZones.filter((id) => id === card.id)).toHaveLength(0)
    }
  })

  test('unauthenticated view exposes lobby facts only — never a snapshot', async () => {
    const { host } = await freshGame()
    const anon = await getGameView(host.token, null, null)
    expect(anon?.you).toBeNull()
    expect(anon?.snapshot).toBeNull()
    expect(anon?.seats.length).toBe(2)
    const badSecret = await getGameView(host.token, 0, 'guessed-secret-aaaa')
    expect(badSecret?.you).toBeNull()
    expect(badSecret?.snapshot).toBeNull()
  })
})
