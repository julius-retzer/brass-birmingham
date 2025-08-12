// Build Actions Tests - Industry building and basic build mechanics
import { afterEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { gameStore } from './gameStore'

// Track actors for cleanup
let activeActors: ReturnType<typeof createActor>[] = []

afterEach(() => {
  activeActors.forEach((actor) => {
    try {
      actor.stop()
    } catch {}
  })
  activeActors = []
})

const setupGame = () => {
  const actor = createActor(gameStore)
  activeActors.push(actor)
  actor.start()

  const players = [
    {
      id: '1',
      name: 'Player 1',
      color: 'red' as const,
      character: 'Richard Arkwright' as const,
      money: 17,
      victoryPoints: 0,
      income: 10,
      industryTilesOnMat: {} as any,
    },
    {
      id: '2',
      name: 'Player 2',
      color: 'blue' as const,
      character: 'Eliza Tinsley' as const,
      money: 17,
      victoryPoints: 0,
      income: 10,
      industryTilesOnMat: {} as any,
    },
  ]

  actor.send({ type: 'START_GAME', players })
  return { actor, players }
}

const buildIndustryAction = (
  actor: ReturnType<typeof createActor>,
  industryType = 'coal',
  location = 'birmingham',
) => {
  // Get current player index and set them up with suitable card and money
  const snapshot = actor.getSnapshot()
  const currentPlayerId = snapshot.context.currentPlayerIndex

  actor.send({
    type: 'TEST_SET_PLAYER_HAND',
    playerId: currentPlayerId,
    hand: [
      {
        id: `${industryType}_test`,
        type: 'industry',
        industries: [industryType],
      },
    ],
  })

  actor.send({
    type: 'TEST_SET_PLAYER_STATE',
    playerId: currentPlayerId,
    money: 50, // Ensure enough money
  })

  actor.send({ type: 'BUILD' })
  actor.send({ type: 'SELECT_CARD', cardId: `${industryType}_test` })
  actor.send({ type: 'SELECT_LOCATION', cityId: location })
  actor.send({ type: 'CONFIRM' })

  return {
    industryCard: {
      id: `${industryType}_test`,
      type: 'industry',
      industries: [industryType],
    },
  }
}

describe('Game Store - Build Actions', () => {
  test('build industry - basic mechanics', () => {
    const { actor } = setupGame()

    const { industryCard } = buildIndustryAction(actor, 'coal')
    const snapshot = actor.getSnapshot()

    const updatedPlayer = snapshot.context.players[0]!
    const builtIndustry = updatedPlayer.industries[0]

    expect(builtIndustry).toBeDefined()
    expect(builtIndustry!.type).toBe('coal')
    expect(builtIndustry!.location).toBe('birmingham')
    expect(snapshot.context.discardPile.length).toBe(1)
    expect(snapshot.context.discardPile[0]!.id).toBe('coal_test')
  })

  test('build industry - player state updates', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()

    const initialPlayer = snapshot.context.players[0]!
    const initialMoney = 50 // Set by buildIndustryAction

    buildIndustryAction(actor, 'coal')
    snapshot = actor.getSnapshot()

    const updatedPlayer = snapshot.context.players[0]!

    // Money should be deducted (coal mine costs money)
    expect(updatedPlayer.money).toBeLessThan(initialMoney)
    // Should have built industry
    expect(updatedPlayer.industries.length).toBe(1)
    // Actions should be decremented
    expect(snapshot.context.actionsRemaining).toBeLessThanOrEqual(1)
  })

  test('build industry - different industry types', () => {
    // Test each industry type in separate games to avoid turn complexity
    const industryTypes = ['coal', 'iron', 'cotton', 'brewery']

    industryTypes.forEach((industryType) => {
      const { actor } = setupGame()

      buildIndustryAction(actor, industryType, 'birmingham')
      const snapshot = actor.getSnapshot()

      const builtIndustry = snapshot.context.players[0]!.industries[0]
      expect(builtIndustry).toBeDefined()
      expect(builtIndustry!.type).toBe(industryType)

      actor.stop()
    })
  })

  test('build validation - requires card and location', () => {
    const { actor } = setupGame()

    // Try to build without proper setup
    actor.send({ type: 'BUILD' })
    let snapshot = actor.getSnapshot()

    // Should be in building action
    expect(snapshot.matches({ playing: { action: 'building' } })).toBe(true)

    // Select card
    actor.send({
      type: 'SELECT_CARD',
      cardId: actor.getSnapshot().context.players[0]!.hand[0]!.id,
    })
    snapshot = actor.getSnapshot()

    // Should still be in building flow (industry type selection or location selection)
    expect(snapshot.matches({ playing: { action: 'building' } })).toBe(true)
  })

  test('automatic market selling - coal mine connected to merchant', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()

    const initialCoalMarket = [...snapshot.context.coalMarket]
    const initialMoney = 50

    // Player 0 creates canal link Stoke <-> Warrington to connect to merchant
    actor.send({ type: 'NETWORK' })
    snapshot = actor.getSnapshot()
    actor.send({
      type: 'SELECT_CARD',
      cardId:
        snapshot.context.players[snapshot.context.currentPlayerIndex]!.hand[0]!
          .id,
    })
    actor.send({ type: 'SELECT_LINK', from: 'stoke', to: 'warrington' })
    actor.send({ type: 'CONFIRM' })

    // After network action in round 1, it's now player 1's turn
    // Player 1 passes
    snapshot = actor.getSnapshot()
    actor.send({ type: 'PASS' })
    snapshot = actor.getSnapshot()
    const p1Card =
      snapshot.context.players[snapshot.context.currentPlayerIndex]!.hand[0]!
    actor.send({ type: 'SELECT_CARD', cardId: p1Card.id })
    actor.send({ type: 'CONFIRM' })

    // Now it's round 2, player 0's turn (2 actions available)
    snapshot = actor.getSnapshot()

    // Debug: verify era and links
    expect(snapshot.context.era).toBe('canal')
    const player0Links = snapshot.context.players[0]!.links
    expect(player0Links.length).toBeGreaterThan(0)
    expect(player0Links[0]!.type).toBe('canal')
    expect(player0Links[0]!.from).toBe('stoke')
    expect(player0Links[0]!.to).toBe('warrington')

    // Build coal mine at Stoke (should be connected to merchant via the link)
    buildIndustryAction(actor, 'coal', 'stoke')
    snapshot = actor.getSnapshot()

    // The build was done by player 1, so check player 1's industries
    const playerWhoBuilt = snapshot.context.players[1]! // Player who built (was current player)
    const coalMine = playerWhoBuilt.industries.find((i) => i.type === 'coal')

    // Verify we're back to normal action selection
    expect(snapshot.matches({ playing: { action: 'selectingAction' } })).toBe(
      true,
    )

    // First verify the coal mine was built
    expect(coalMine).toBeDefined()
    expect(coalMine!.location).toBe('stoke')
    console.log('[DEBUG] Coal mine built:', coalMine)
    console.log('[DEBUG] Coal cubes on tile:', coalMine!.coalCubesOnTile)

    // Coal should be added to market (automatic selling)
    const totalMarketIncrease = snapshot.context.coalMarket.reduce(
      (sum, level, i) => sum + (level.cubes - initialCoalMarket[i]!.cubes),
      0,
    )
    expect(totalMarketIncrease).toBeGreaterThan(0)

    // Player should earn money from sales
    expect(playerWhoBuilt.money).toBeGreaterThan(
      initialMoney - coalMine!.tile.cost,
    )
  })
})
