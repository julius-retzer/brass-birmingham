// Game loop tests - automatic era end, game over + winner, link scoring,
// wild card routing, end-of-turn hand refill, crash resistance, overbuild
import { afterEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { gameStore } from './gameStore'
import type { GameState } from './gameStore'
import { canPlaceOrOverbuildIndustry } from './shared/gameUtils'

let activeActors: ReturnType<typeof createActor>[] = []

afterEach(() => {
  activeActors.forEach((actor) => {
    try {
      actor.stop()
    } catch {}
  })
  activeActors = []
})

const setup = () => {
  const actor = createActor(gameStore)
  activeActors.push(actor)
  actor.start()
  const players = [
    {
      id: '1',
      name: 'P1',
      color: 'red' as const,
      character: 'Richard Arkwright' as const,
      money: 17,
      victoryPoints: 0,
      income: 10,
      industryTilesOnMat: {} as any,
    },
    {
      id: '2',
      name: 'P2',
      color: 'blue' as const,
      character: 'Eliza Tinsley' as const,
      money: 17,
      victoryPoints: 0,
      income: 10,
      industryTilesOnMat: {} as any,
    },
  ]
  actor.send({ type: 'START_GAME', players })
  return { actor }
}

const passTurn = (actor: ReturnType<typeof createActor>) => {
  const s = actor.getSnapshot() as any
  const player = s.context.players[s.context.currentPlayerIndex]
  actor.send({ type: 'PASS' } as any)
  actor.send({ type: 'SELECT_CARD', cardId: player.hand[0].id } as any)
  actor.send({ type: 'CONFIRM' } as any)
}

describe('Game loop - automatic era end and game over', () => {
  test('canal era ends automatically when deck and hands are exhausted, then rail era ends in gameOver with a winner', () => {
    const { actor } = setup()
    let s = actor.getSnapshot() as any

    // Exhaust the deck and shrink hands to 1 card each
    actor.send({ type: 'TEST_SET_DRAW_PILE', drawPile: [] } as any)
    actor.send({
      type: 'TEST_SET_PLAYER_HAND',
      playerId: 0,
      hand: [s.context.players[0].hand[0]],
    } as any)
    actor.send({
      type: 'TEST_SET_PLAYER_HAND',
      playerId: 1,
      hand: [s.context.players[1].hand[0]],
    } as any)

    // Round 1 (1 action each): both players pass their last card
    passTurn(actor)
    passTurn(actor)

    // Era end should have fired automatically: scoring + canal era end
    s = actor.getSnapshot() as any
    expect(s.status).toBe('active')
    expect(s.context.era).toBe('rail')
    expect(s.context.round).toBe(1)
    expect(
      s.context.logs.some((l: any) => l.message === 'Canal Era ended'),
    ).toBe(true)
    expect(
      s.context.logs.some((l: any) => l.message === 'Rail Era started'),
    ).toBe(true)

    // The 2 discarded cards were reshuffled and dealt again. Keep passing
    // until the game ends - players with no cards are skipped automatically.
    let guard = 0
    while (!actor.getSnapshot().matches('gameOver') && guard < 20) {
      const snap = actor.getSnapshot() as any
      const current = snap.context.players[snap.context.currentPlayerIndex]
      if (current.hand.length > 0) {
        passTurn(actor)
      } else {
        break
      }
      guard++
    }

    s = actor.getSnapshot() as any
    expect(s.matches('gameOver')).toBe(true)
    expect(s.context.winners).not.toBeNull()
    expect(s.context.winners!.length).toBeGreaterThanOrEqual(1)
    expect(
      s.context.logs.some((l: any) => l.message.includes('Game Over')),
    ).toBe(true)
  })

  test('income is collected at canal era end round but not at the final round of the game', () => {
    const { actor } = setup()
    let s = actor.getSnapshot() as any

    actor.send({ type: 'TEST_SET_DRAW_PILE', drawPile: [] } as any)
    actor.send({
      type: 'TEST_SET_PLAYER_HAND',
      playerId: 0,
      hand: [s.context.players[0].hand[0]],
    } as any)
    actor.send({
      type: 'TEST_SET_PLAYER_HAND',
      playerId: 1,
      hand: [s.context.players[1].hand[0]],
    } as any)

    // Give P1 a visible income level (start is level 0 since the income
    // track audit) so the era-end collection can be asserted.
    actor.send({ type: 'TEST_SET_PLAYER_STATE', playerId: 0, income: 10 } as any)
    const moneyBefore = (actor.getSnapshot() as any).context.players[0].money

    // Complete the final canal round
    passTurn(actor)
    passTurn(actor)

    s = actor.getSnapshot() as any
    expect(s.context.era).toBe('rail')
    // Canal-final-round income (10) was still collected
    const p0 = s.context.players.find((p: any) => p.id === '1')
    expect(p0.money).toBe(moneyBefore + 10)

    // Now drive to game end and confirm no income is paid for the final round
    const moneyBeforeFinal = s.context.players.map((p: any) => p.money)
    let guard = 0
    while (!actor.getSnapshot().matches('gameOver') && guard < 20) {
      const snap = actor.getSnapshot() as any
      const current = snap.context.players[snap.context.currentPlayerIndex]
      if (current.hand.length === 0) break
      passTurn(actor)
      guard++
    }

    s = actor.getSnapshot() as any
    expect(s.matches('gameOver')).toBe(true)
    s.context.players.forEach((p: any, i: number) => {
      expect(p.money).toBe(moneyBeforeFinal[i])
    })
  })

  test('era scoring: links score per •—• icons (tiles + merchant locations)', () => {
    const { actor } = setup()

    // P0 builds a canal link zilina <-> budapest (£3)
    let s = actor.getSnapshot() as any
    actor.send({ type: 'NETWORK' } as any)
    actor.send({
      type: 'SELECT_CARD',
      cardId: s.context.players[0].hand[0].id,
    } as any)
    actor.send({
      type: 'SELECT_LINK',
      from: 'zilina',
      to: 'budapest',
    } as any)
    actor.send({ type: 'CONFIRM' } as any)

    // Give P0 a flipped cotton mill at zilina: 1 link icon + 3 VP
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 0,
      industries: [
        {
          location: 'zilina',
          type: 'cotton',
          level: 1,
          flipped: true,
          tile: {
            id: 'cotton_1',
            type: 'cotton',
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
          },
          coalCubesOnTile: 0,
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0,
        },
      ],
    } as any)

    const vpBefore = (actor.getSnapshot() as any).context.players[0]
      .victoryPoints

    actor.send({ type: 'TRIGGER_ERA_SCORING' } as any)

    s = actor.getSnapshot() as any
    const p0 = s.context.players[0]
    // Link: 1 icon at zilina (cotton tile) + 2 icons at budapest
    // (merchant location) = 3 VP. Flipped cotton scores its 3 VP.
    expect(p0.victoryPoints).toBe(vpBefore + 3 + 3)
    expect(p0.links).toHaveLength(0)
  })

  test('era scoring: unflipped industries do not score but stay on the board', () => {
    const { actor } = setup()

    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 0,
      industries: [
        {
          location: 'zilina',
          type: 'cotton',
          level: 2,
          flipped: false,
          tile: {
            id: 'cotton_2',
            type: 'cotton',
            level: 2,
            canBuildInCanalEra: true,
            canBuildInRailEra: true,
            incomeAdvancement: 2,
            incomeSpaces: 2,
            victoryPoints: 5,
            beerRequired: 1,
            cost: 14,
            linkScoringIcons: 1,
            coalRequired: 1,
            ironRequired: 0,
            beerProduced: 0,
            coalProduced: 0,
            ironProduced: 0,
            hasLightbulbIcon: false,
            quantity: 2,
          },
          coalCubesOnTile: 0,
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0,
        },
      ],
    } as any)

    actor.send({ type: 'TRIGGER_ERA_SCORING' } as any)

    const s = actor.getSnapshot() as any
    const p0 = s.context.players[0]
    // No VP for the unflipped tile, but it survives era scoring
    // (only level 1 tiles are removed, by the canal-era-end step)
    expect(p0.victoryPoints).toBe(0)
    expect(p0.industries).toHaveLength(1)
    expect(p0.industries[0].flipped).toBe(false)

    // The canal-era-end step does not remove it either (level 2)
    actor.send({ type: 'TRIGGER_CANAL_ERA_END' } as any)
    const s2 = actor.getSnapshot() as any
    expect(s2.context.players[0].industries).toHaveLength(1)
  })

  test('wild cards return to their draw areas when played, not to the discard pile', () => {
    const { actor } = setup()
    let s = actor.getSnapshot() as any

    // P0 scouts: discard 3 cards, gain 1 wild location + 1 wild industry
    const hand = s.context.players[0].hand
    actor.send({ type: 'SCOUT' } as any)
    actor.send({ type: 'SELECT_CARD', cardId: hand[0].id } as any)
    actor.send({ type: 'SELECT_CARD', cardId: hand[1].id } as any)
    actor.send({ type: 'SELECT_CARD', cardId: hand[2].id } as any)
    actor.send({ type: 'CONFIRM' } as any)

    s = actor.getSnapshot() as any
    expect(s.context.wildLocationPile).toHaveLength(1)
    expect(s.context.wildIndustryPile).toHaveLength(1)
    const p0Hand = s.context.players.find((p: any) => p.id === '1').hand
    expect(p0Hand.some((c: any) => c.type === 'wild_location')).toBe(true)

    // P1 passes to finish round 1
    passTurn(actor)

    // Round 2: P0 (tie keeps order) takes a loan using the wild location card
    s = actor.getSnapshot() as any
    expect(s.context.currentPlayerIndex).toBe(0)
    const wildCard = s.context.players[0].hand.find(
      (c: any) => c.type === 'wild_location',
    )
    const discardBefore = s.context.discardPile.length

    actor.send({ type: 'TAKE_LOAN' } as any)
    actor.send({ type: 'SELECT_CARD', cardId: wildCard.id } as any)
    actor.send({ type: 'CONFIRM' } as any)

    s = actor.getSnapshot() as any
    // The wild went back to its draw area, not to the discard pile
    expect(s.context.wildLocationPile).toHaveLength(2)
    expect(s.context.discardPile.length).toBe(discardBefore)
    expect(
      s.context.discardPile.every(
        (c: any) => c.type !== 'wild_location' && c.type !== 'wild_industry',
      ),
    ).toBe(true)
  })

  test('hand is refilled at the end of the turn, not after each action', () => {
    const { actor } = setup()

    // Round 1: both pass (1 action each)
    passTurn(actor)
    passTurn(actor)

    // Round 2: P0 has 2 actions
    let s = actor.getSnapshot() as any
    expect(s.context.actionsRemaining).toBe(2)
    const playerIndex = s.context.currentPlayerIndex

    passTurn(actor)
    s = actor.getSnapshot() as any
    // Mid-turn: card used, no refill yet
    expect(s.context.currentPlayerIndex).toBe(playerIndex)
    expect(s.context.players[playerIndex].hand).toHaveLength(7)

    passTurn(actor)
    s = actor.getSnapshot() as any
    // Turn over: hand refilled back up to 8
    expect(s.context.players[playerIndex].hand).toHaveLength(8)
  })

  test('invalid event sequences never kill the actor', () => {
    const { actor } = setup()

    // Confirm without selections across all action types
    actor.send({ type: 'SELL' } as any)
    actor.send({ type: 'CONFIRM' } as any)
    actor.send({
      type: 'SELECT_SALE',
      location: 'brno',
      industryType: 'cotton',
      merchant: 'budapest',
    } as any)
    actor.send({ type: 'CANCEL' } as any)
    actor.send({ type: 'NETWORK' } as any)
    actor.send({ type: 'CONFIRM' } as any)
    actor.send({ type: 'CANCEL' } as any)
    actor.send({ type: 'SCOUT' } as any)
    actor.send({ type: 'CONFIRM' } as any)
    actor.send({ type: 'CANCEL' } as any)
    actor.send({ type: 'BUILD' } as any)
    actor.send({ type: 'CONFIRM' } as any)
    actor.send({ type: 'SELECT_LOCATION', cityId: 'brno' } as any)
    actor.send({ type: 'CANCEL' } as any)
    actor.send({ type: 'EXECUTE_DOUBLE_NETWORK_ACTION' } as any)

    const s = actor.getSnapshot() as any
    expect(s.status).toBe('active')

    // The machine can still process a legal action afterwards
    passTurn(actor)
    expect((actor.getSnapshot() as any).status).toBe('active')
    expect((actor.getSnapshot() as any).context.currentPlayerIndex).toBe(1)
  })
})

describe('Overbuild in a full city', () => {
  const coalTile = (level: number) =>
    ({
      id: `coal_${level}`,
      type: 'coal',
      level,
      linkScoringIcons: 1,
    }) as any

  const makeContext = (industries: any[], opponentIndustries: any[] = []) =>
    ({
      players: [
        { id: '1', industries },
        { id: '2', industries: opponentIndustries },
      ],
      currentPlayerIndex: 0,
      coalMarket: [{ price: 1, cubes: 1, maxCubes: 2 }],
      ironMarket: [{ price: 1, cubes: 1, maxCubes: 2 }],
    }) as unknown as GameState

  test('own tile in a full single-slot city can be overbuilt with a higher level', () => {
    // Dudley has a single coal slot, occupied by our level 1 mine
    const context = makeContext([
      {
        location: 'karvina',
        type: 'coal',
        level: 1,
        flipped: false,
        tile: coalTile(1),
        coalCubesOnTile: 0,
        ironCubesOnTile: 0,
        beerBarrelsOnTile: 0,
      },
    ])

    expect(canPlaceOrOverbuildIndustry(context, 'karvina', 'coal', 2)).toBe(true)
    // Same or lower level is not a legal overbuild
    expect(canPlaceOrOverbuildIndustry(context, 'karvina', 'coal', 1)).toBe(
      false,
    )
  })

  test("opponent's tile in a full city cannot be overbuilt while coal cubes exist", () => {
    const context = makeContext(
      [],
      [
        {
          location: 'karvina',
          type: 'coal',
          level: 1,
          flipped: false,
          tile: coalTile(1),
          coalCubesOnTile: 0,
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0,
        },
      ],
    )

    // Coal cubes exist in the market, so opponent overbuild is illegal
    expect(canPlaceOrOverbuildIndustry(context, 'karvina', 'coal', 2)).toBe(
      false,
    )
  })
})
