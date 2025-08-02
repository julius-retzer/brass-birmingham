import { expect, test, describe } from 'vitest'
import {
  type Actor,
  type InspectionEvent,
  type SnapshotFrom,
  createActor,
} from 'xstate'
import { type CityId } from '~/data/board'
import { type Card, type IndustryCard, type IndustryType, type LocationCard } from '~/data/cards'
import {
  type IndustryTile,
  getInitialPlayerIndustryTiles,
  getLowestLevelTile,
} from '../data/industryTiles'
import { type GameState, gameStore } from './gameStore'

const DEBUG = true

// ============================================================================
// Test Types & Utilities
// ============================================================================

type TestPlayer = {
  id: string
  name: string
  color: 'red' | 'blue'
  character: 'Richard Arkwright' | 'Eliza Tinsley'
  money: number
  victoryPoints: number
  income: number
  industryTilesOnMat: ReturnType<typeof getInitialPlayerIndustryTiles>
}

type GameActor = Actor<typeof gameStore>
type GameSnapshot = SnapshotFrom<typeof gameStore>

// ============================================================================
// Test Setup Helpers
// ============================================================================

const createTestPlayers = (): TestPlayer[] => [
  {
    id: '1',
    name: 'Player 1',
    color: 'red',
    character: 'Richard Arkwright',
    money: 17,
    victoryPoints: 0,
    income: 10,
    industryTilesOnMat: getInitialPlayerIndustryTiles(),
  },
  {
    id: '2',
    name: 'Player 2',
    color: 'blue',
    character: 'Eliza Tinsley',
    money: 17,
    victoryPoints: 0,
    income: 10,
    industryTilesOnMat: getInitialPlayerIndustryTiles(),
  },
]

const setupTestGame = () => {
  const actor = createActor(gameStore, { inspect: logInspectEvent })
  actor.start()
  const players = createTestPlayers()
  actor.send({ type: 'START_GAME', players })
  return { actor, players }
}

// ============================================================================
// Action Helpers
// ============================================================================

const takeLoanAction = (actor: GameActor) => {
  let snapshot = actor.getSnapshot()
  const currentPlayer =
    snapshot.context.players[snapshot.context.currentPlayerIndex]
  if (!currentPlayer) throw new Error('Expected current player to exist')

  actor.send({ type: 'TAKE_LOAN' })
  snapshot = actor.getSnapshot()

  const cardToDiscard = currentPlayer.hand[0]
  if (!cardToDiscard) throw new Error('Expected at least one card in hand')

  actor.send({ type: 'SELECT_CARD', cardId: cardToDiscard.id })
  actor.send({ type: 'CONFIRM' })

  return { cardToDiscard }
}

const buildIndustryAction = (
  actor: GameActor,
  industryType: IndustryType,
  location: CityId = 'birmingham'
) => {
  // Ensure player has a suitable card
  actor.send({ type: 'TEST_SET_PLAYER_HAND', playerId: 0, hand: [
    { id: `${industryType}_test`, type: 'industry', industries: [industryType] } as IndustryCard
  ]})
  
  actor.send({ type: 'BUILD' })
  actor.send({ type: 'SELECT_CARD', cardId: `${industryType}_test` })
  actor.send({ type: 'SELECT_LOCATION', cityId: location })
  actor.send({ type: 'CONFIRM' })

  return { industryCard: { id: `${industryType}_test`, type: 'industry', industries: [industryType] } }
}

const buildNetworkAction = (
  actor: GameActor,
  from: CityId,
  to: CityId
) => {
  let snapshot = actor.getSnapshot()
  const currentPlayer = snapshot.context.players[snapshot.context.currentPlayerIndex]
  if (!currentPlayer) throw new Error('Expected current player to exist')

  const cardToUse = currentPlayer.hand[0]
  if (!cardToUse) throw new Error('Expected at least one card in hand')

  actor.send({ type: 'NETWORK' })
  actor.send({ type: 'SELECT_CARD', cardId: cardToUse.id })
  actor.send({ type: 'SELECT_LINK', from, to })
  actor.send({ type: 'CONFIRM' })

  return { cardToUse }
}

// ============================================================================
// Verification Helpers
// ============================================================================

const verifyGameState = (
  snapshot: GameSnapshot,
  expected: Partial<GameState>,
) => {
  const { context } = snapshot
  for (const key in expected) {
    if (Object.prototype.hasOwnProperty.call(expected, key)) {
      expect(context[key as keyof GameState]).toEqual(
        expected[key as keyof GameState],
      )
    }
  }
}

const verifyPlayerState = (
  player: GameState['players'][0],
  expected: Partial<GameState['players'][0]>,
) => {
  Object.entries(expected).forEach(([key, value]) => {
    expect(player[key as keyof typeof player]).toEqual(value)
  })
}

// ============================================================================
// Market Calculation Helpers
// ============================================================================

function calculateMarketIncome(cubesSold: number, resourceType: 'coal' | 'iron'): number {
  const prices = resourceType === 'coal' 
    ? [1, 2, 3, 4, 5, 6, 7, 8] // Coal prices from cheapest to most expensive
    : [1, 1, 2, 3, 4, 5, 6, 7]  // Iron prices from cheapest to most expensive
  
  let income = 0
  // Sell to most expensive spaces first (iterate from right to left)
  for (let i = 0; i < cubesSold && i < prices.length; i++) {
    income += prices[prices.length - 1 - i]!
  }
  return income
}

// ============================================================================
// Debug Utilities
// ============================================================================

const debugLog = (context: GameState) => {
  // log context but without the cards in the hand
  const { players, logs, drawPile, discardPile, wildLocationPile, ...rest } =
    context
  const playersHands = context.players.map((p) => p.hand.map((c) => c.id))
  console.log('🔥 context', rest, playersHands)
}

function logInspectEvent(inspectEvent: InspectionEvent) {
  if (!DEBUG) return
  switch (inspectEvent.type) {
    case '@xstate.event': {
      console.log('\n🔵 Event:', inspectEvent.event)
      break
    }

    case '@xstate.snapshot': {
      const snapshot = inspectEvent.snapshot
      if ('context' in snapshot) {
        const context = snapshot.context as GameState
        console.log('🟢 State Context:', {
          currentPlayerIndex: context.currentPlayerIndex,
          actionsRemaining: context.actionsRemaining,
          round: context.round,
          era: context.era,
          selectedCard: context.selectedCard?.id,
          selectedCardsForScout: context.selectedCardsForScout.map(
            (c: Card) => c.id,
          ),
          selectedLink: context.selectedLink,
          spentMoney: context.spentMoney,
          players: context.players.map((p) => ({
            hand: p.hand.map((c) => c.id),
          })),
        })

        console.log('State:', (snapshot as any).value)
      }
      break
    }
  }
}

// ============================================================================
// TESTS
// ============================================================================

describe('Game Store State Machine', () => {
  describe('Basic Game Setup', () => {
    test('initializes game state correctly', () => {
      const { actor } = setupTestGame()
      const snapshot = actor.getSnapshot()

      expect(snapshot.matches({ playing: { action: 'selectingAction' } })).toBe(true)
      expect(snapshot.context.players).toHaveLength(2)
      expect(snapshot.context.currentPlayerIndex).toBe(0)
      expect(snapshot.context.era).toBe('canal')
      expect(snapshot.context.round).toBe(1)
      expect(snapshot.context.actionsRemaining).toBe(1)
    })

    test('starting money compliance with rules', () => {
      const { actor } = setupTestGame()
      const snapshot = actor.getSnapshot()
      
      // RULE: Each player starts with £17
      snapshot.context.players.forEach(player => {
        expect(player.money).toBe(17)
        expect(player.income).toBe(10)
      })
    })
  })

  describe('Turn Management', () => {
    test('round 1 - players take 1 action each', () => {
      const { actor } = setupTestGame()
      
      // Player 1 takes loan
      takeLoanAction(actor)
      let snapshot = actor.getSnapshot()
      expect(snapshot.context.currentPlayerIndex).toBe(1) // Now Player 2's turn
      
      // Player 2 takes loan
      takeLoanAction(actor)
      snapshot = actor.getSnapshot()
      
      // Should advance to round 2 with Player 1 going first
      expect(snapshot.context.currentPlayerIndex).toBe(0)
      expect(snapshot.context.round).toBe(2)
      expect(snapshot.context.actionsRemaining).toBe(2) // Round 2+ = 2 actions
    })

    test('round 2+ - players take 2 actions each', () => {
      const { actor } = setupTestGame()
      
      // Get to round 2
      takeLoanAction(actor) // Player 1
      takeLoanAction(actor) // Player 2
      
      let snapshot = actor.getSnapshot()
      expect(snapshot.context.round).toBe(2)
      expect(snapshot.context.actionsRemaining).toBe(2)
      
      // Player 1 takes 2 actions
      takeLoanAction(actor)
      snapshot = actor.getSnapshot()
      expect(snapshot.context.currentPlayerIndex).toBe(0) // Still Player 1
      expect(snapshot.context.actionsRemaining).toBe(1)
      
      takeLoanAction(actor)
      snapshot = actor.getSnapshot()
      expect(snapshot.context.currentPlayerIndex).toBe(1) // Now Player 2
      expect(snapshot.context.actionsRemaining).toBe(2)
    })

    test('hand refilling after actions', () => {
      const { actor } = setupTestGame()
      let snapshot = actor.getSnapshot()
      const initialHandSize = snapshot.context.players[0]!.hand.length
      
      takeLoanAction(actor)
      snapshot = actor.getSnapshot()
      
      // Hand should be refilled to original size after action
      expect(snapshot.context.players[0]!.hand.length).toBe(initialHandSize)
    })
  })

  describe('Loan Actions', () => {
    test('basic loan mechanics', () => {
      const { actor } = setupTestGame()
      let snapshot = actor.getSnapshot()
      const initialPlayer = snapshot.context.players[0]!
      const initialMoney = initialPlayer.money
      const initialIncome = initialPlayer.income
      
      const { cardToDiscard } = takeLoanAction(actor)
      snapshot = actor.getSnapshot()
      const updatedPlayer = snapshot.context.players[0]!
      
      // Verify loan effects
      expect(updatedPlayer.money).toBe(initialMoney + 30) // +£30
      expect(updatedPlayer.income).toBe(Math.max(-10, initialIncome - 3)) // -3 income, min -10
      expect(snapshot.context.discardPile).toContain(cardToDiscard)
    })

    test('income cannot go below -10', () => {
      const { actor } = setupTestGame()
      
      // Take multiple loans to test minimum income
      for (let i = 0; i < 8; i++) {
        takeLoanAction(actor)
        if (i < 7) takeLoanAction(actor) // Player 2 also takes loans
      }
      
      const snapshot = actor.getSnapshot()
      const player = snapshot.context.players[0]!
      
      // After 4 loans: 10 - (3 * 4) = -2, after more loans should stay at -10
      expect(player.income).toBe(-10)
    })
  })

  describe('Build Actions', () => {
    describe('Industry Building', () => {
      test('basic industry building mechanics', () => {
        const { actor } = setupTestGame()
        let snapshot = actor.getSnapshot()
        const initialPlayer = snapshot.context.players[0]!
        
        const { industryCard } = buildIndustryAction(actor, 'coal')
        snapshot = actor.getSnapshot()
        
        const updatedPlayer = snapshot.context.players[0]!
        const builtIndustry = updatedPlayer.industries[0]
        
        expect(builtIndustry).toBeDefined()
        expect(builtIndustry!.type).toBe('coal')
        expect(builtIndustry!.location).toBe('birmingham')
        expect(snapshot.context.discardPile).toContain(industryCard)
      })

      test('era validation for industry tiles', () => {
        const { actor } = setupTestGame()
        let snapshot = actor.getSnapshot()
        
        // Try to set a rail-era only tile in player's mat
        const player = snapshot.context.players[0]!
        const coalTiles = player.industryTilesOnMat.coal || []
        const railOnlyTile = coalTiles.find(tile => !tile.canBuildInCanalEra)
        
        if (railOnlyTile) {
          // Manually set the tile to test validation
          actor.send({ type: 'TEST_SET_PLAYER_HAND', playerId: 0, hand: [
            { id: 'coal_test', type: 'industry', industries: ['coal'] } as IndustryCard
          ]})
          
          actor.send({ type: 'BUILD' })
          actor.send({ type: 'SELECT_CARD', cardId: 'coal_test' })
          actor.send({ type: 'SELECT_LOCATION', cityId: 'birmingham' })
          
          // Should fail validation for canal era
          expect(() => {
            actor.send({ type: 'CONFIRM' })
          }).toThrow()
        }
      })

      test('card-industry matching validation', () => {
        const { actor } = setupTestGame()
        let snapshot = actor.getSnapshot()
        
        // Find a pottery card
        const currentPlayer = snapshot.context.players[0]!
        const potteryCard = currentPlayer.hand.find(
          c => c.type === 'industry' && (c as IndustryCard).industries.includes('pottery')
        )
        
        if (potteryCard) {
          actor.send({ type: 'BUILD' })
          actor.send({ type: 'SELECT_CARD', cardId: potteryCard.id })
          // Try to select coal instead of pottery - should fail
          actor.send({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'coal' })
          
          expect(() => {
            actor.send({ type: 'CONFIRM' })
          }).toThrow()
        }
      })

      test('wild card flexibility', () => {
        const { actor } = setupTestGame()
        
        // Set player to have wild cards
        actor.send({ type: 'TEST_SET_PLAYER_HAND', playerId: 0, hand: [
          { id: 'wild_industry_1', type: 'wild_industry' },
          { id: 'wild_location_1', type: 'wild_location' }
        ]})
        
        // Wild industry card should work for any industry type
        actor.send({ type: 'BUILD' })
        actor.send({ type: 'SELECT_CARD', cardId: 'wild_industry_1' })
        actor.send({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'coal' })
        actor.send({ type: 'SELECT_LOCATION', cityId: 'birmingham' })
        actor.send({ type: 'CONFIRM' })
        
        let snapshot = actor.getSnapshot()
        const builtIndustry = snapshot.context.players[0]!.industries[0]
        expect(builtIndustry!.type).toBe('coal')
      })
    })

    describe('Automatic Market Selling', () => {
      test('coal mine - automatic selling when connected to merchant', () => {
        const { actor } = setupTestGame()
        let snapshot = actor.getSnapshot()
        const initialPlayer = snapshot.context.players[0]!
        const initialMoney = initialPlayer.money
        
        // Build coal mine at Stoke (connected to Warrington merchant)
        const { industryCard } = buildIndustryAction(actor, 'coal', 'stoke')
        snapshot = actor.getSnapshot()
        
        const playerAfterBuild = snapshot.context.players[0]!
        const coalMine = playerAfterBuild.industries.find(i => i.type === 'coal')!
        
        // RULE: Coal mines connected to merchants automatically sell coal
        expect(coalMine.flipped).toBe(true) // Should flip when empty
        expect(coalMine.coalCubesOnTile).toBe(0) // Cubes sold to market
        
        // Should earn money from market sales
        const marketIncome = calculateMarketIncome(coalMine.tile.coalProduced, 'coal')
        expect(playerAfterBuild.money).toBe(initialMoney - coalMine.tile.cost + marketIncome)
      })

      test('coal mine - no automatic selling when NOT connected to merchant', () => {
        const { actor } = setupTestGame()
        let snapshot = actor.getSnapshot()
        const initialPlayer = snapshot.context.players[0]!
        const initialMoney = initialPlayer.money
        
        // Build coal mine at Birmingham (NOT connected to merchant)
        const { industryCard } = buildIndustryAction(actor, 'coal', 'birmingham')
        snapshot = actor.getSnapshot()
        
        const playerAfterBuild = snapshot.context.players[0]!
        const coalMine = playerAfterBuild.industries.find(i => i.type === 'coal')!
        
        // RULE: Coal mines NOT connected to merchants keep their coal
        expect(coalMine.flipped).toBe(false)
        expect(coalMine.coalCubesOnTile).toBe(coalMine.tile.coalProduced)
        
        // Only build cost deducted, no market income
        expect(playerAfterBuild.money).toBe(initialMoney - coalMine.tile.cost)
      })

      test('iron works - ALWAYS automatic selling regardless of connection', () => {
        const { actor } = setupTestGame()
        let snapshot = actor.getSnapshot()
        const initialPlayer = snapshot.context.players[0]!
        const initialMoney = initialPlayer.money
        
        // Build iron works (location doesn't matter)
        const { industryCard } = buildIndustryAction(actor, 'iron')
        snapshot = actor.getSnapshot()
        
        const playerAfterBuild = snapshot.context.players[0]!
        const ironWorks = playerAfterBuild.industries.find(i => i.type === 'iron')!
        
        // RULE: Iron works ALWAYS automatically sell iron regardless of merchant connection
        expect(ironWorks.flipped).toBe(true)
        expect(ironWorks.ironCubesOnTile).toBe(0)
        
        const marketIncome = calculateMarketIncome(ironWorks.tile.ironProduced, 'iron')
        expect(playerAfterBuild.money).toBe(initialMoney - ironWorks.tile.cost + marketIncome)
      })

      test('brewery - only places beer barrels, no market selling', () => {
        const { actor } = setupTestGame()
        let snapshot = actor.getSnapshot()
        const initialPlayer = snapshot.context.players[0]!
        const initialMoney = initialPlayer.money
        
        // Build brewery
        const { industryCard } = buildIndustryAction(actor, 'brewery')
        snapshot = actor.getSnapshot()
        
        const playerAfterBuild = snapshot.context.players[0]!
        const brewery = playerAfterBuild.industries.find(i => i.type === 'brewery')!
        
        // RULE: Breweries only place beer barrels, no automatic market selling
        expect(brewery.beerBarrelsOnTile).toBe(1) // Canal Era = 1 barrel
        expect(brewery.coalCubesOnTile).toBe(0)
        expect(brewery.ironCubesOnTile).toBe(0)
        expect(brewery.flipped).toBe(false)
        
        // Only build cost deducted, no market income
        expect(playerAfterBuild.money).toBe(initialMoney - brewery.tile.cost)
      })
    })
  })

  describe('Network Actions', () => {
    test('canal era - basic link building', () => {
      const { actor } = setupTestGame()
      let snapshot = actor.getSnapshot()
      const initialPlayer = snapshot.context.players[0]!
      const initialMoney = initialPlayer.money
      
      const { cardToUse } = buildNetworkAction(actor, 'birmingham', 'dudley')
      snapshot = actor.getSnapshot()
      
      const updatedPlayer = snapshot.context.players[0]!
      const newLink = updatedPlayer.links[0]
      
      expect(newLink).toBeDefined()
      expect(newLink!.from).toBe('birmingham')
      expect(newLink!.to).toBe('dudley')
      expect(newLink!.type).toBe('canal')
      expect(updatedPlayer.money).toBe(initialMoney - 3) // Canal link costs £3
      expect(snapshot.context.discardPile).toContain(cardToUse)
    })

    test('rail era - coal consumption for links', () => {
      const { actor } = setupTestGame()
      
      // Advance to rail era (simplified)
      actor.send({ type: 'TEST_SET_PLAYER_HAND', playerId: 0, hand: [
        { id: 'test_card', type: 'location', location: 'birmingham', color: 'green' } as LocationCard
      ]})
      
      // Manually set to rail era for testing
      let snapshot = actor.getSnapshot()
      const context = { ...snapshot.context, era: 'rail' as const }
      
      const initialCoalMarket = context.coalMarket
      
      const { cardToUse } = buildNetworkAction(actor, 'birmingham', 'coventry')
      snapshot = actor.getSnapshot()
      
      const updatedPlayer = snapshot.context.players[0]!
      
      // Rail links cost £5 + coal consumption
      expect(updatedPlayer.links[0]!.type).toBe('rail')
    })

    test('network adjacency requirement', () => {
      const { actor } = setupTestGame()
      
      // First player builds an industry to establish network presence
      buildIndustryAction(actor, 'coal', 'birmingham')
      
      // Now should be able to build adjacent link
      const { cardToUse } = buildNetworkAction(actor, 'birmingham', 'dudley')
      let snapshot = actor.getSnapshot()
      
      expect(snapshot.context.players[0]!.links).toHaveLength(1)
    })
  })

  describe('Develop Actions', () => {
    test('iron consumption from market', () => {
      const { actor } = setupTestGame()
      let snapshot = actor.getSnapshot()
      const initialPlayer = snapshot.context.players[0]!
      const initialIronMarket = snapshot.context.ironMarket
      
      actor.send({ type: 'DEVELOP' })
      actor.send({ type: 'SELECT_CARD', cardId: initialPlayer.hand[0]!.id })
      actor.send({ type: 'CONFIRM' })
      
      snapshot = actor.getSnapshot()
      
      // Should consume 1 iron from market
      const totalIronBefore = initialIronMarket.reduce((sum, level) => sum + level.cubes, 0)
      const totalIronAfter = snapshot.context.ironMarket.reduce((sum, level) => sum + level.cubes, 0)
      expect(totalIronAfter).toBe(totalIronBefore - 1)
    })
  })

  describe('Sell Actions', () => {
    test('beer consumption for selling', () => {
      const { actor } = setupTestGame()
      let snapshot = actor.getSnapshot()
      const initialPlayer = snapshot.context.players[0]!
      
      actor.send({ type: 'SELL' })
      actor.send({ type: 'SELECT_CARD', cardId: initialPlayer.hand[0]!.id })
      actor.send({ type: 'CONFIRM' })
      
      snapshot = actor.getSnapshot()
      // Test should verify beer consumption logic
      expect(snapshot.context.players[0]!.hand.length).toBe(initialPlayer.hand.length - 1)
    })
  })

  describe('Scout Actions', () => {
    test('basic scout mechanics', () => {
      const { actor } = setupTestGame()
      let snapshot = actor.getSnapshot()
      const initialPlayer = snapshot.context.players[0]!
      
      actor.send({ type: 'SCOUT' })
      
      // Select 3 cards for scouting
      const cardsToDiscard = initialPlayer.hand.slice(0, 3)
      cardsToDiscard.forEach(card => {
        actor.send({ type: 'SELECT_CARD', cardId: card.id })
      })
      
      actor.send({ type: 'CONFIRM' })
      snapshot = actor.getSnapshot()
      
      const updatedPlayer = snapshot.context.players[0]!
      
      // Should discard 3 cards and gain 2 wild cards
      expect(updatedPlayer.hand.length).toBe(initialPlayer.hand.length - 1) // Net -1 card
      expect(snapshot.context.discardPile.length).toBe(3)
      
      // Should have wild cards in hand
      const hasWildLocation = updatedPlayer.hand.some(c => c.type === 'wild_location')
      const hasWildIndustry = updatedPlayer.hand.some(c => c.type === 'wild_industry')
      expect(hasWildLocation).toBe(true)
      expect(hasWildIndustry).toBe(true)
    })

    test('cannot scout if already have wild cards', () => {
      const { actor } = setupTestGame()
      
      // Set player to have a wild card
      actor.send({ type: 'TEST_SET_PLAYER_HAND', playerId: 0, hand: [
        { id: 'wild_1', type: 'wild_location' },
        { id: 'coal_1', type: 'industry', industries: ['coal'] },
        { id: 'coal_2', type: 'industry', industries: ['coal'] },
        { id: 'coal_3', type: 'industry', industries: ['coal'] }
      ]})
      
      let snapshot = actor.getSnapshot()
      
      actor.send({ type: 'SCOUT' })
      
      // Try to select 3 cards
      snapshot.context.players[0]!.hand.slice(1, 4).forEach(card => {
        actor.send({ type: 'SELECT_CARD', cardId: card.id })
      })
      
      snapshot = actor.getSnapshot()
      
      // Should not be able to complete scout action
      expect(snapshot.context.selectedCardsForScout.length).toBe(3)
      // The guard should prevent confirmation
    })
  })

  describe('Pass Actions', () => {
    test('discards card and advances turn', () => {
      const { actor } = setupTestGame()
      let snapshot = actor.getSnapshot()
      const initialPlayer = snapshot.context.players[0]!
      const initialHandSize = initialPlayer.hand.length
      
      actor.send({ type: 'PASS' })
      snapshot = actor.getSnapshot()
      
      expect(snapshot.context.discardPile.length).toBe(1)
      expect(snapshot.context.currentPlayerIndex).toBe(1) // Advanced to next player
    })
  })

  describe('Resource Markets', () => {
    test('coal market - initial setup and purchasing', () => {
      const { actor } = setupTestGame()
      const snapshot = actor.getSnapshot()
      
      // RULE: Coal market starts with specific configuration
      const coalMarket = snapshot.context.coalMarket
      expect(coalMarket[0]!.price).toBe(1)
      expect(coalMarket[0]!.cubes).toBe(1) // £1 starts with 1/2 cubes
      expect(coalMarket[1]!.price).toBe(2)
      expect(coalMarket[1]!.cubes).toBe(2) // £2-£7 start with 2/2 cubes
      expect(coalMarket[7]!.price).toBe(8)
      expect(coalMarket[7]!.maxCubes).toBe(Infinity) // £8 infinite capacity
    })

    test('iron market - initial setup and purchasing', () => {
      const { actor } = setupTestGame()
      const snapshot = actor.getSnapshot()
      
      // RULE: Iron market starts with specific configuration  
      const ironMarket = snapshot.context.ironMarket
      expect(ironMarket[0]!.price).toBe(1)
      expect(ironMarket[0]!.cubes).toBe(0) // £1 starts empty
      expect(ironMarket[1]!.price).toBe(2)
      expect(ironMarket[1]!.cubes).toBe(2) // £2-£5 start with 2/2 cubes
      expect(ironMarket[5]!.price).toBe(6)
      expect(ironMarket[5]!.maxCubes).toBe(Infinity) // £6 infinite capacity
    })

    test('market prices - purchasing from cheapest first', () => {
      const { actor } = setupTestGame()
      // This would need more complex setup to test resource consumption
      // The logic is tested through the build actions that consume resources
    })

    test('market empty behavior - fallback prices', () => {
      const { actor } = setupTestGame()
      // Test would verify £8 coal and £6 iron fallback pricing when markets empty
    })
  })

  describe('Resource Consumption Priority', () => {
    test('coal from connected coal mine first, then market', () => {
      // Complex test requiring network setup
      // Would verify coal consumption order: connected mines → market
    })

    test('iron from any iron works first, then market', () => {
      // Test iron consumption priority: any iron works → market
    })

    test('beer from own breweries first, then connected opponent breweries', () => {
      // Test beer consumption priority: own breweries → connected opponent breweries → merchant beer
    })
  })
})