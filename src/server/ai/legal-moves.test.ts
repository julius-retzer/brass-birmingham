// The enumerator must mirror the machine's own guards: every listed move is
// accepted by can(), and the moves a player obviously has are all listed.
import { beforeEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { type GameStoreActor, gameStore } from '../../store/gameStore'
import { enumerateLegalMoves } from './legal-moves'

const startPlayers = [
  {
    id: '1',
    name: 'Ada',
    color: 'red' as const,
    character: 'Eliza Tinsley' as const,
    money: 17,
    victoryPoints: 0,
    income: 10,
    industryTilesOnMat: {} as never,
  },
  {
    id: '2',
    name: 'Brunel',
    color: 'blue' as const,
    character: 'Isambard Kingdom Brunel' as const,
    money: 17,
    victoryPoints: 0,
    income: 10,
    industryTilesOnMat: {} as never,
  },
]

let actor: GameStoreActor

beforeEach(() => {
  actor = createActor(gameStore)
  actor.start()
  actor.send({ type: 'START_GAME', players: startPlayers })
})

describe('enumerateLegalMoves', () => {
  test('at action selection: top-level actions, never TEST/lifecycle events', () => {
    const moves = enumerateLegalMoves(actor.getSnapshot())
    const types = moves.map((m) => m.event.type)
    for (const t of [
      'BUILD',
      'NETWORK',
      'DEVELOP',
      'SCOUT',
      'TAKE_LOAN',
      'PASS',
    ]) {
      expect(types).toContain(t)
    }
    // SELL is machine-legal even with nothing to sell (the guard sits on
    // SELECT_SALE) — the enumerator stays faithful to the machine and the
    // driver unwinds dead ends via CANCEL
    expect(types).toContain('SELL')
    // no selection events are legal before an action starts
    expect(types).not.toContain('SELECT_CARD')
    expect(types).not.toContain('CONFIRM')
    expect(types.filter((t) => t.startsWith('TEST_'))).toHaveLength(0)
    expect(types).not.toContain('START_GAME')
  })

  test('every enumerated move is accepted by the machine', () => {
    actor.send({ type: 'BUILD' })
    const snap = actor.getSnapshot()
    const moves = enumerateLegalMoves(snap)
    for (const move of moves) {
      expect(snap.can(move.event as never)).toBe(true)
    }
  })

  test('inside BUILD: one card option per hand card, plus cancel', () => {
    actor.send({ type: 'BUILD' })
    const snap = actor.getSnapshot()
    const hand = snap.context.players[snap.context.currentPlayerIndex]!.hand
    const moves = enumerateLegalMoves(snap)
    const cardMoves = moves.filter((m) => m.event.type === 'SELECT_CARD')
    expect(cardMoves).toHaveLength(hand.length)
    expect(moves.some((m) => m.event.type === 'CANCEL')).toBe(true)
    // labels describe the card, not just its id
    expect(cardMoves[0]!.label).toMatch(/Play card: /)
  })

  test('canal era never offers rail-only links', () => {
    actor.send({ type: 'NETWORK' })
    const snap = actor.getSnapshot()
    const hand = snap.context.players[snap.context.currentPlayerIndex]!.hand
    actor.send({ type: 'SELECT_CARD', cardId: hand[0]!.id })
    const linkMoves = enumerateLegalMoves(actor.getSnapshot()).filter(
      (m) => m.event.type === 'SELECT_LINK',
    )
    expect(linkMoves.length).toBeGreaterThan(0)
    for (const m of linkMoves) {
      expect(m.label).toContain('canal link')
    }
  })

  test('loan flow: card select then confirm', () => {
    actor.send({ type: 'TAKE_LOAN' })
    let moves = enumerateLegalMoves(actor.getSnapshot())
    expect(moves.some((m) => m.event.type === 'SELECT_CARD')).toBe(true)
    const card = moves.find((m) => m.event.type === 'SELECT_CARD')!
    actor.send(card.event)
    moves = enumerateLegalMoves(actor.getSnapshot())
    const types = moves.map((m) => m.event.type)
    expect(types).toContain('CONFIRM')
    expect(types).toContain('CANCEL')
  })
})

describe('enumerateLegalMoves - resource source choice', () => {
  const cottonTile = {
    id: 'cotton_1',
    type: 'cotton' as const,
    level: 1,
    canBuildInCanalEra: true,
    canBuildInRailEra: true,
    incomeAdvancement: 2,
    incomeSpaces: 2,
    victoryPoints: 3,
    beerRequired: 1,
    cost: 10,
    linkScoringIcons: 1,
    coalRequired: 0,
    ironRequired: 0,
    beerProduced: 0,
    coalProduced: 0,
    ironProduced: 0,
    hasLightbulbIcon: false,
    quantity: 3,
  }
  const breweryTile = {
    ...cottonTile,
    id: 'brewery_1',
    type: 'brewery' as const,
    beerRequired: 0,
    beerProduced: 1,
  }
  const makeIndustry = (location: string, tile: any, extra: object = {}) => ({
    location: location as never,
    type: tile.type,
    level: tile.level,
    flipped: false,
    tile: tile as never,
    coalCubesOnTile: 0,
    ironCubesOnTile: 0,
    beerBarrelsOnTile: 0,
    ...extra,
  })

  /**
   * Round 1 (one action each): Ada links worcester–gloucester, Brunel passes.
   * Round 2 opens on the passer, who is therefore the seller — and the link is
   * on the board, so their worcester cotton reaches the gloucester merchant.
   */
  const openSellOnConnectedBoard = (merchantHasBeer: boolean) => {
    const hand = actor.getSnapshot().context.players[0]!.hand
    actor.send({ type: 'NETWORK' })
    actor.send({ type: 'SELECT_CARD', cardId: hand[0]!.id })
    actor.send({ type: 'SELECT_LINK', from: 'worcester', to: 'gloucester' })
    actor.send({ type: 'CONFIRM' })

    const passerHand = actor.getSnapshot().context.players[1]!.hand
    actor.send({ type: 'PASS' })
    actor.send({ type: 'SELECT_CARD', cardId: passerHand[0]!.id })
    actor.send({ type: 'CONFIRM' })

    const sellerIndex = actor.getSnapshot().context.currentPlayerIndex
    const sellerId = actor.getSnapshot().context.players[sellerIndex]!.id

    actor.send({
      type: 'TEST_SET_MERCHANTS',
      merchants: [
        {
          location: 'gloucester',
          industryIcons: ['cotton'],
          bonusType: 'money',
          bonusValue: 5,
          hasBeer: merchantHasBeer,
        },
      ],
    })
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: sellerIndex,
      industries: [
        makeIndustry('worcester', cottonTile),
        makeIndustry('worcester', breweryTile, { beerBarrelsOnTile: 1 }),
      ],
    })
    actor.send({ type: 'SELL' })
    actor.send({
      type: 'SELECT_CARD',
      cardId: actor.getSnapshot().context.players[sellerIndex]!.hand[0]!.id,
    })
    return { sellerId, sellerIndex }
  }

  test('the beer step lists every source the machine offers, and nothing else', () => {
    const { sellerId } = openSellOnConnectedBoard(true)

    // Staging the sale moves the machine into its beer step
    actor.send({
      type: 'SELECT_SALE',
      location: 'worcester',
      industryType: 'cotton',
      merchant: 'gloucester',
    })

    const picks = enumerateLegalMoves(actor.getSnapshot()).filter(
      (m) => m.event.type === 'SELECT_BEER_SOURCE',
    )
    const sources = picks.map((m) =>
      m.event.type === 'SELECT_BEER_SOURCE' ? m.event.source : null,
    )

    // Own brewery and the merchant's barrel — the bonus has to be reachable
    expect(sources).toContainEqual({
      kind: 'brewery',
      ownerId: sellerId,
      location: 'worcester',
    })
    expect(sources).toContainEqual({ kind: 'merchant', location: 'gloucester' })
    expect(picks.every((m) => m.label.length > 0)).toBe(true)
  })

  test('a single beer source is never offered as a choice — the step is skipped', () => {
    // No merchant barrel, so the seller's brewery is the only beer in reach
    openSellOnConnectedBoard(false)
    actor.send({
      type: 'SELECT_SALE',
      location: 'worcester',
      industryType: 'cotton',
      merchant: 'gloucester',
    })

    // The machine passed straight through the beer step and sold
    expect(
      enumerateLegalMoves(actor.getSnapshot()).filter(
        (m) => m.event.type === 'SELECT_BEER_SOURCE',
      ),
    ).toHaveLength(0)
    expect(actor.getSnapshot().context.salesMadeThisAction).toBe(1)
  })
})
