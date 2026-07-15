// Undo (first action of the turn) is snapshot-based: the shell restores
// the persisted snapshot taken when the turn began. These tests pin the
// contract that restore is ATOMIC — money, markets, hands, mats and the
// board all come back exactly, and the game continues normally after.
import { describe, expect, it } from 'vitest'
import { createActor } from 'xstate'
import { gameStore } from './gameStore'

const PLAYERS = [
  { id: '1', name: 'P1', color: 'red', character: 'A' },
  { id: '2', name: 'P2', color: 'blue', character: 'B' },
].map((p) => ({
  ...p,
  money: 30,
  victoryPoints: 0,
  income: 0,
  industryTilesOnMat: {},
}))

type AnyCtx = {
  players: Array<{
    money: number
    income: number
    incomeSpace: number
    hand: Array<{ id: string }>
    industries: unknown[]
    industryTilesOnMat: Record<
      string,
      Array<{ quantityAvailable: number; tile: { id: string } }>
    >
  }>
  coalMarket: unknown
  ironMarket: unknown
  discardPile: unknown[]
  actionsRemaining: number
}

const ctxOf = (a: ReturnType<typeof createActor>) =>
  (a.getSnapshot() as unknown as { context: AnyCtx }).context

const start = () => {
  const a = createActor(gameStore)
  a.start()
  a.send({ type: 'START_GAME', players: PLAYERS } as never)
  a.send({
    type: 'TEST_SET_PLAYER_HAND',
    playerId: 0,
    hand: [
      { id: 'c1', type: 'location', location: 'stone', color: 'other' },
      { id: 'c2', type: 'location', location: 'dudley', color: 'other' },
    ],
  } as never)
  return a
}

describe('undo — snapshot restore is atomic', () => {
  it('a build (money + market sale + mat + hand + board) reverts in full', () => {
    const a = start()
    const anchor = a.getPersistedSnapshot()
    const before = structuredClone(ctxOf(a))

    // Brewery at stone: pays the tile AND buys 1 iron from the market
    // (always purchasable) — touches money, the iron market, the mat, the
    // hand and the board at once.
    a.send({ type: 'BUILD' } as never)
    a.send({ type: 'SELECT_CARD', cardId: 'c1' } as never)
    a.send({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'brewery' } as never)
    a.send({ type: 'CONFIRM' } as never)

    const after = ctxOf(a)
    expect(after.players[0]!.industries).toHaveLength(1) // it really built
    expect(after.players[0]!.money).not.toBe(before.players[0]!.money)
    a.stop()

    // The shell's undo: a fresh actor from the anchor snapshot.
    const restored = createActor(gameStore, { snapshot: anchor as never })
    restored.start()
    const r = ctxOf(restored)
    expect(r.players).toStrictEqual(before.players)
    expect(r.coalMarket).toStrictEqual(before.coalMarket)
    expect(r.ironMarket).toStrictEqual(before.ironMarket)
    expect(r.discardPile).toStrictEqual(before.discardPile)
    expect(r.actionsRemaining).toBe(before.actionsRemaining)
    restored.stop()
  })

  it('a loan (money + income level + marker) reverts in full, and the game continues', () => {
    const a = start()
    // reach round 2 so the player has TWO actions (undo's home turf)
    a.send({ type: 'PASS' } as never)
    a.send({ type: 'PASS' } as never)
    a.send({
      type: 'TEST_SET_PLAYER_HAND',
      playerId: 0,
      hand: [
        { id: 'c3', type: 'location', location: 'stone', color: 'other' },
        { id: 'c4', type: 'location', location: 'leek', color: 'other' },
      ],
    } as never)
    const anchor = a.getPersistedSnapshot()
    const before = structuredClone(ctxOf(a))

    a.send({ type: 'TAKE_LOAN' } as never)
    a.send({ type: 'SELECT_CARD', cardId: 'c3' } as never)
    a.send({ type: 'CONFIRM' } as never)
    const loaned = ctxOf(a)
    expect(loaned.players[0]!.money).toBe(before.players[0]!.money + 30)
    expect(loaned.players[0]!.income).toBe(before.players[0]!.income - 3)
    a.stop()

    const restored = createActor(gameStore, { snapshot: anchor as never })
    restored.start()
    const r = ctxOf(restored)
    expect(r.players[0]!.money).toBe(before.players[0]!.money)
    expect(r.players[0]!.income).toBe(before.players[0]!.income)
    expect(r.players[0]!.incomeSpace).toBe(before.players[0]!.incomeSpace)
    expect(r.players[0]!.hand.map((c) => c.id)).toStrictEqual(['c3', 'c4'])
    expect(r.actionsRemaining).toBe(2)

    // …and the restored game is fully playable: redo a different action.
    restored.send({ type: 'TAKE_LOAN' } as never)
    restored.send({ type: 'SELECT_CARD', cardId: 'c4' } as never)
    restored.send({ type: 'CONFIRM' } as never)
    expect(ctxOf(restored).players[0]!.money).toBe(
      before.players[0]!.money + 30,
    )
    restored.stop()
  })
})
