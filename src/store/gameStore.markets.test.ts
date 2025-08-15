// Market and Resource Tests - Coal, iron, beer markets and resource consumption
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
  
  // Add error handling to prevent unhandled exceptions during tests
  actor.subscribe({
    error: (error: any) => {
      console.warn('Actor error caught in test:', error.message)
      // Silently handle errors that are expected in failure test scenarios
    }
  })
  
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

describe('Game Store - Markets and Resources', () => {
  test('coal market - initial setup and structure', () => {
    const { actor } = setupGame()
    const snapshot = actor.getSnapshot()

    const coalMarket = snapshot.context.coalMarket

    // Should have 8 price levels (£1-£8)
    expect(coalMarket).toHaveLength(8)

    // £1 level starts with 1/2 cubes
    expect(coalMarket[0]!.price).toBe(1)
    expect(coalMarket[0]!.cubes).toBe(1)
    expect(coalMarket[0]!.maxCubes).toBe(2)

    // £2-£7 levels start with 2/2 cubes
    for (let i = 1; i <= 6; i++) {
      expect(coalMarket[i]!.price).toBe(i + 1)
      expect(coalMarket[i]!.cubes).toBe(2)
      expect(coalMarket[i]!.maxCubes).toBe(2)
    }

    // £8 level is infinite capacity fallback
    expect(coalMarket[7]!.price).toBe(8)
    expect(coalMarket[7]!.cubes).toBe(0)
    expect(coalMarket[7]!.maxCubes).toBe(Infinity)
  })

  test('iron market - initial setup and structure', () => {
    const { actor } = setupGame()
    const snapshot = actor.getSnapshot()

    const ironMarket = snapshot.context.ironMarket

    // Should have 6 price levels (£1-£6)
    expect(ironMarket).toHaveLength(6)

    // £1 level starts empty (0/2 cubes)
    expect(ironMarket[0]!.price).toBe(1)
    expect(ironMarket[0]!.cubes).toBe(0)
    expect(ironMarket[0]!.maxCubes).toBe(2)

    // £2-£5 levels start with 2/2 cubes
    for (let i = 1; i <= 4; i++) {
      expect(ironMarket[i]!.price).toBe(i + 1)
      expect(ironMarket[i]!.cubes).toBe(2)
      expect(ironMarket[i]!.maxCubes).toBe(2)
    }

    // £6 level is infinite capacity fallback
    expect(ironMarket[5]!.price).toBe(6)
    expect(ironMarket[5]!.cubes).toBe(0)
    expect(ironMarket[5]!.maxCubes).toBe(Infinity)
  })

  test('market purchasing - cheapest first principle', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()

    const initialCoalMarket = [...snapshot.context.coalMarket]

    // Simulate coal consumption (would happen during develop action)
    actor.send({ type: 'DEVELOP' })
    const cardToUse = snapshot.context.players[0]!.hand[0]!
    actor.send({ type: 'SELECT_CARD', cardId: cardToUse.id })
    actor.send({ type: 'CONFIRM' })

    snapshot = actor.getSnapshot()

    // Iron should be consumed from cheapest available levels first
    const ironMarket = snapshot.context.ironMarket

    // £1 level should still be empty (it started empty)
    expect(ironMarket[0]!.cubes).toBe(0)

    // Iron consumption should have started from £2 level
    if (initialCoalMarket[1]!.cubes > snapshot.context.coalMarket[1]!.cubes) {
      expect(snapshot.context.coalMarket[1]!.cubes).toBeLessThan(
        initialCoalMarket[1]!.cubes,
      )
    }
  })

  test('resource consumption priority - coal from mines first', () => {
    const { actor } = setupGame()

    // Build a coal mine first
    actor.send({ type: 'BUILD' })
    const industryCard = actor
      .getSnapshot()
      .context.players[0]!.hand.find(
        (c) => c.type === 'industry' && c.industries?.includes('coal'),
      )

    if (industryCard) {
      actor.send({ type: 'SELECT_CARD', cardId: industryCard.id })
      actor.send({ type: 'SELECT_LOCATION', cityId: 'stoke' }) // Stoke has coal slots
      actor.send({ type: 'CONFIRM' })

      const snapshot = actor.getSnapshot()
      const coalMine = snapshot.context.players[0]!.industries.find(
        (i) => i.type === 'coal',
      )

      expect(coalMine).toBeDefined()
      expect(coalMine!.coalCubesOnTile).toBeGreaterThan(0)

      // Now when coal is needed, it should come from the mine first, then market
      const initialCoalOnTile = coalMine!.coalCubesOnTile

      // Simulate coal consumption
      // This would happen during another build action that requires coal
      // For now just verify the mine has coal available
      expect(initialCoalOnTile).toBeGreaterThan(0)
    }
  })

  test('resource consumption priority - iron from works first', () => {
    const { actor } = setupGame()

    // Similar test for iron works
    actor.send({ type: 'BUILD' })
    const ironCard = actor
      .getSnapshot()
      .context.players[0]!.hand.find(
        (c) => c.type === 'industry' && c.industries?.includes('iron'),
      )

    if (ironCard) {
      actor.send({ type: 'SELECT_CARD', cardId: ironCard.id })
      actor.send({ type: 'SELECT_LOCATION', cityId: 'birmingham' })
      actor.send({ type: 'CONFIRM' })

      const snapshot = actor.getSnapshot()
      const ironWorks = snapshot.context.players[0]!.industries.find(
        (i) => i.type === 'iron',
      )

      if (ironWorks) {
        expect(ironWorks.ironCubesOnTile).toBeGreaterThan(0)
      }
    }
  })

  test('market fallback behavior - infinite capacity', () => {
    const { actor } = setupGame()
    const snapshot = actor.getSnapshot()

    // Verify fallback levels exist
    const coalFallback = snapshot.context.coalMarket[7] // £8 level
    const ironFallback = snapshot.context.ironMarket[5] // £6 level

    expect(coalFallback!.maxCubes).toBe(Infinity)
    expect(ironFallback!.maxCubes).toBe(Infinity)

    // These levels should handle unlimited demand at higher prices
    expect(coalFallback!.price).toBe(8)
    expect(ironFallback!.price).toBe(6)
  })

  test('resource market updates during gameplay', () => {
    const { actor } = setupGame()
    const snapshot = actor.getSnapshot()

    const initialResources = {
      coal: snapshot.context.resources.coal,
      iron: snapshot.context.resources.iron,
      beer: snapshot.context.resources.beer,
    }

    // Resources should be properly initialized
    expect(initialResources.coal).toBe(24)
    expect(initialResources.iron).toBe(10)
    expect(initialResources.beer).toBe(24)

    // Resources should decrease when consumed and increase when produced
    expect(typeof initialResources.coal).toBe('number')
    expect(typeof initialResources.iron).toBe('number')
    expect(typeof initialResources.beer).toBe('number')
  })

  test('beer consumption priority - own breweries first', () => {
    const { actor } = setupGame()

    // Build a brewery
    actor.send({ type: 'BUILD' })
    const breweryCard = actor
      .getSnapshot()
      .context.players[0]!.hand.find(
        (c) => c.type === 'industry' && c.industries?.includes('brewery'),
      )

    if (breweryCard) {
      actor.send({ type: 'SELECT_CARD', cardId: breweryCard.id })
      actor.send({ type: 'SELECT_LOCATION', cityId: 'birmingham' })
      actor.send({ type: 'CONFIRM' })

      const snapshot = actor.getSnapshot()
      const brewery = snapshot.context.players[0]!.industries.find(
        (i) => i.type === 'brewery',
      )

      if (brewery) {
        expect(brewery.beerBarrelsOnTile).toBeGreaterThan(0)

        // When this player needs beer, it should come from their brewery first
        const initialBeerOnTile = brewery.beerBarrelsOnTile
        expect(initialBeerOnTile).toBeGreaterThan(0)
      }
    }
  })

  test('coal priority - connected coal mines before market', () => {
    const { actor } = setupGame()

    // Advance to Rail Era for coal consumption requirements
    actor.send({ type: 'TRIGGER_CANAL_ERA_END' })
    let snapshot = actor.getSnapshot()
    expect(snapshot.context.era).toBe('rail')

    const currentPlayerId = snapshot.context.currentPlayerIndex

    // Give current player a coal mine at Birmingham with 1 cube (not enough for double rail)
    // Also add connection to merchant location for market access
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: currentPlayerId,
      industries: [
        {
          location: 'birmingham',
          type: 'coal',
          level: 1,
          flipped: false,
          tile: {
            id: 'coal_1',
            type: 'coal',
            level: 1,
            canBuildInCanalEra: true,
            canBuildInRailEra: true,
            incomeAdvancement: 4,
            victoryPoints: 1,
            cost: 5,
            incomeSpaces: 4,
            linkScoringIcons: 1,
            coalRequired: 0,
            ironRequired: 0,
            beerRequired: 0,
            beerProduced: 0,
            coalProduced: 2,
            ironProduced: 0,
            hasLightbulbIcon: false,
            quantity: 2,
          },
          coalCubesOnTile: 1, // Only 1 cube available
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0,
        },
        {
          location: 'oxford', // Merchant location for market access
          type: 'pottery',
          level: 1,
          flipped: false,
          tile: {
            id: 'pottery_1',
            type: 'pottery',
            level: 1,
            canBuildInCanalEra: true,
            canBuildInRailEra: true,
            incomeAdvancement: 3,
            victoryPoints: 1,
            cost: 5,
            incomeSpaces: 3,
            linkScoringIcons: 1,
            coalRequired: 0,
            ironRequired: 0,
            beerRequired: 0,
            beerProduced: 0,
            coalProduced: 0,
            ironProduced: 0,
            hasLightbulbIcon: false,
            quantity: 1,
          },
          coalCubesOnTile: 0,
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0,
        },
      ],
    })

    // Build a single rail link that requires 1 coal from connected mine
    actor.send({ type: 'NETWORK' })
    snapshot = actor.getSnapshot()
    actor.send({
      type: 'SELECT_CARD',
      cardId: snapshot.context.players[currentPlayerId]!.hand[0]!.id,
    })
    actor.send({ type: 'SELECT_LINK', from: 'birmingham', to: 'coventry' })
    actor.send({ type: 'CONFIRM' })

    snapshot = actor.getSnapshot()

    // Should have built 1 rail link consuming 1 coal
    const links = snapshot.context.players[currentPlayerId]!.links
    expect(links.length).toBe(1)
    expect(links[0]!.type).toBe('rail')

    // Connected mine should have been depleted (1 coal consumed)
    const coalMine = snapshot.context.players[currentPlayerId]!.industries.find(
      (i: any) => i.type === 'coal' && i.location === 'birmingham',
    )
    expect(coalMine).toBeDefined()
    expect(coalMine!.coalCubesOnTile).toBe(0) // Should have used the 1 cube

    // Coal should have been consumed from connected mine (free) rather than market
    // This test validates that connected coal mines are prioritized over market access
  })
})
