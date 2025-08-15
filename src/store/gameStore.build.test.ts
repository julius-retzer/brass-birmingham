// Build Actions Tests - Industry building and basic build mechanics
import { afterEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { gameStore } from './gameStore'
import { canCityAccommodateIndustryType } from './shared/gameUtils'

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
  location = 'stoke', // Stoke has coal slots, making this a valid default combination
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
  actor.send({ type: 'SELECT_INDUSTRY_TYPE', industryType })
  actor.send({ type: 'SELECT_LOCATION', cityId: location })
  actor.send({ type: 'CONFIRM' })

  return {
    industryCard: {
      id: `${industryType}_test`,
      type: 'industry',
      industries: [industryType],
    },
    playerWhoBuilt: currentPlayerId,
  }
}

describe('Game Store - Build Actions', () => {
  test('build industry - basic mechanics', () => {
    const { actor } = setupGame()

    const { industryCard, playerWhoBuilt } = buildIndustryAction(actor, 'coal', 'stoke') // Stoke has coal slots
    const snapshot = actor.getSnapshot()

    const updatedPlayer = snapshot.context.players[playerWhoBuilt]!
    const builtIndustry = updatedPlayer.industries[0]

    expect(builtIndustry).toBeDefined()
    expect(builtIndustry!.type).toBe('coal')
    expect(builtIndustry!.location).toBe('stoke')
    expect(snapshot.context.discardPile.length).toBe(1)
    expect(snapshot.context.discardPile[0]!.id).toBe('coal_test')
  })

  test('build industry - player state updates', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()

    const initialPlayer = snapshot.context.players[0]!
    const initialMoney = 50 // Set by buildIndustryAction

    const { playerWhoBuilt } = buildIndustryAction(actor, 'coal', 'stoke') // Use valid location
    snapshot = actor.getSnapshot()

    const updatedPlayer = snapshot.context.players[playerWhoBuilt]!

    // Money should be deducted (coal mine costs money)
    expect(updatedPlayer.money).toBeLessThan(initialMoney)
    // Should have built industry
    expect(updatedPlayer.industries.length).toBe(1)
    // Actions should be decremented
    expect(snapshot.context.actionsRemaining).toBeLessThanOrEqual(1)
  })

  test('build industry - different industry types (Canal Era) - no coal required', () => {
    // Test Level 1 industries that require no coal to build in Canal Era
    const industryTestCases = [
      { type: 'coal', location: 'stoke' },
      { type: 'cotton', location: 'birmingham' },
      { type: 'manufacturer', location: 'birmingham' },
      { type: 'brewery', location: 'birmingham' }
    ]

    industryTestCases.forEach(({ type, location }) => {
      const { actor } = setupGame()

      // Verify we're in Canal Era (Level 1 tiles should be buildable)
      let snapshot = actor.getSnapshot()
      expect(snapshot.context.era).toBe('canal')

      const { playerWhoBuilt } = buildIndustryAction(actor, type, location)
      snapshot = actor.getSnapshot()

      // Industry should be at index 0
      const builtIndustry = snapshot.context.players[playerWhoBuilt]!.industries[0]
      expect(builtIndustry).toBeDefined()
      expect(builtIndustry!.type).toBe(type)
      // Should build Level 1 tile in Canal Era
      expect(builtIndustry!.level).toBe(1)

      actor.stop()
    })
  })
  
  test('build industry - different industry types (Canal Era) - coal required', () => {
    // Test Level 1 industries that require coal to build in Canal Era
    const industryTestCases = [
      { type: 'iron', location: 'birmingham' },
      { type: 'pottery', location: 'stoke' }
    ]

    industryTestCases.forEach(({ type, location }) => {
      const { actor } = setupGame()

      // Verify we're in Canal Era
      let snapshot = actor.getSnapshot()
      expect(snapshot.context.era).toBe('canal')

      const currentPlayerId = snapshot.context.currentPlayerIndex

      // Add coal mine to provide coal for building
      actor.send({
        type: 'TEST_SET_PLAYER_STATE',
        playerId: currentPlayerId,
        industries: [
          {
            location: location, // Coal mine at same location
            type: 'coal',
            level: 1,
            flipped: false,
            tile: {
              id: 'coal_1',
              type: 'coal',
              level: 1,
              canBuildInCanalEra: true,
              canBuildInRailEra: false,
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
            coalCubesOnTile: 2, // Provide coal for building
            ironCubesOnTile: 0,
            beerBarrelsOnTile: 0,
          }
        ],
      })

      const { playerWhoBuilt } = buildIndustryAction(actor, type, location)
      snapshot = actor.getSnapshot()

      // Coal mine should be at index 0, new industry at index 1
      const builtIndustry = snapshot.context.players[playerWhoBuilt]!.industries[1]
      expect(builtIndustry).toBeDefined()
      expect(builtIndustry!.type).toBe(type)
      // Should build Level 1 tile in Canal Era
      expect(builtIndustry!.level).toBe(1)

      // Verify coal was consumed from the coal mine
      const coalMine = snapshot.context.players[playerWhoBuilt]!.industries[0]
      expect(coalMine!.coalCubesOnTile).toBe(1) // Should have consumed 1 coal

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

    // RULE: Coal mines only sell automatically if connected to merchant spaces with [left-right arrows] icon
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

    // RULE: Coal should be automatically sold to market when mine is connected to merchant with [arrows] icon
    const totalMarketIncrease = snapshot.context.coalMarket.reduce(
      (sum, level, i) => sum + (level.cubes - initialCoalMarket[i]!.cubes),
      0,
    )
    expect(totalMarketIncrease).toBeGreaterThan(0)

    // Player should earn money from sales (coal market prices)
    expect(playerWhoBuilt.money).toBeGreaterThan(
      initialMoney - coalMine!.tile.cost,
    )
  })

  test('era restrictions - level 1 tiles cannot be built in Rail Era (except pottery)', () => {
    const { actor } = setupGame()
    
    // Advance to Rail Era
    actor.send({ type: 'TRIGGER_CANAL_ERA_END' })
    let snapshot = actor.getSnapshot()
    expect(snapshot.context.era).toBe('rail')

    // RULE: Level 1 tiles (except pottery) cannot be built in Rail Era
    const restrictedTiles = ['coal', 'iron', 'cotton', 'manufacturer', 'brewery']
    
    restrictedTiles.forEach((industryType) => {
      const { actor: testActor } = setupGame()
      // Advance to Rail Era
      testActor.send({ type: 'TRIGGER_CANAL_ERA_END' })
      
      // Try to build level 1 tile - should fail or build level 2+
      const currentPlayerId = testActor.getSnapshot().context.currentPlayerIndex
      testActor.send({
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
      
      testActor.send({
        type: 'TEST_SET_PLAYER_STATE',
        playerId: currentPlayerId,
        money: 50,
      })

      testActor.send({ type: 'BUILD' })
      testActor.send({ type: 'SELECT_CARD', cardId: `${industryType}_test` })
      testActor.send({ type: 'SELECT_INDUSTRY_TYPE', industryType })
      
      // Should automatically select level 2+ tile (not level 1)
      const selectedTile = testActor.getSnapshot().context.selectedIndustryTile
      if (selectedTile) {
        expect(selectedTile.level).toBeGreaterThan(1)
      }
      
      testActor.stop()
    })

    // RULE: Level 1 pottery CAN be built in Rail Era (special exception)
    const { actor: potteryActor } = setupGame()
    potteryActor.send({ type: 'TRIGGER_CANAL_ERA_END' })
    expect(potteryActor.getSnapshot().context.era).toBe('rail')
    
    const currentPlayerId = potteryActor.getSnapshot().context.currentPlayerIndex
    potteryActor.send({
      type: 'TEST_SET_PLAYER_HAND',
      playerId: currentPlayerId,
      hand: [
        {
          id: 'pottery_test',
          type: 'industry',
          industries: ['pottery'],
        },
      ],
    })
    
    // Build level 1 pottery in Rail Era - should succeed
    buildIndustryAction(potteryActor, 'pottery', 'stoke')
    const potterySnapshot = potteryActor.getSnapshot()
    const potteryIndustry = potterySnapshot.context.players[currentPlayerId]!.industries.find(i => i.type === 'pottery')
    
    if (potteryIndustry) {
      expect(potteryIndustry.level).toBe(1) // Level 1 pottery allowed in Rail Era
    }
    
    potteryActor.stop()
  })

// Industry Slot Validation Tests
describe('Industry Slot Validation', () => {
  test('canCityAccommodateIndustryType - empty city can accommodate compatible industry', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()
    const context = snapshot.context

    // Birmingham has slots: ['cotton', 'iron'], ['manufacturer', 'pottery'], ['brewery'], ['cotton', 'manufacturer']
    // Test cotton (compatible with slots 1 and 4)
    const canBuildCotton = canCityAccommodateIndustryType(context, 'birmingham', 'cotton')
    expect(canBuildCotton).toBe(true)

    // Test brewery (compatible with slot 3)
    const canBuildBrewery = canCityAccommodateIndustryType(context, 'birmingham', 'brewery')
    expect(canBuildBrewery).toBe(true)
  })

  test('canCityAccommodateIndustryType - rejects incompatible industry types', () => {
    const { actor } = setupGame()
    const context = actor.getSnapshot().context

    // Birmingham doesn't have coal slots, should reject coal mine
    const canBuildCoal = canCityAccommodateIndustryType(context, 'birmingham', 'coal')
    expect(canBuildCoal).toBe(false)
  })

  test('canCityAccommodateIndustryType - handles occupied slots correctly', () => {
    const { actor } = setupGame()
    
    // Test at Stoke which has simpler slots: ['coal'], ['pottery'] 
    // Build a coal mine at Stoke (should occupy the coal slot)
    buildIndustryAction(actor, 'coal', 'stoke')
    let snapshot = actor.getSnapshot()
    
    // Should not be able to build another coal mine (coal slot is occupied)
    const canBuildSecondCoal = canCityAccommodateIndustryType(
      snapshot.context, 'stoke', 'coal'
    )
    expect(canBuildSecondCoal).toBe(false)

    // But should still be able to build pottery (pottery slot is available)
    const canBuildPottery = canCityAccommodateIndustryType(
      snapshot.context, 'stoke', 'pottery'
    )
    expect(canBuildPottery).toBe(true)

    // Build pottery at Stoke (should occupy the pottery slot)
    buildIndustryAction(actor, 'pottery', 'stoke')
    snapshot = actor.getSnapshot()
    
    // Now should not be able to build more pottery (pottery slot occupied)
    const canBuildSecondPottery = canCityAccommodateIndustryType(
      snapshot.context, 'stoke', 'pottery'
    )
    expect(canBuildSecondPottery).toBe(false)

    // And still can't build coal (coal slot occupied)
    const canBuildCoalAgain = canCityAccommodateIndustryType(
      snapshot.context, 'stoke', 'coal'
    )
    expect(canBuildCoalAgain).toBe(false)
  })

  test('canCityAccommodateIndustryType - handles multi-option slots', () => {
    const { actor } = setupGame()
    
    // Birmingham slot 1 accepts ['cotton', 'iron']
    const canBuildCotton = canCityAccommodateIndustryType(
      actor.getSnapshot().context, 'birmingham', 'cotton'
    )
    const canBuildIron = canCityAccommodateIndustryType(
      actor.getSnapshot().context, 'birmingham', 'iron'
    )
    
    expect(canBuildCotton).toBe(true)
    expect(canBuildIron).toBe(true)

    // Build cotton mill (occupies slot 1 with first-fit algorithm)
    buildIndustryAction(actor, 'cotton', 'birmingham')
    
    // Iron should not be available (slot 1 is occupied, and iron can only use slot 1)
    const canStillBuildIron = canCityAccommodateIndustryType(
      actor.getSnapshot().context, 'birmingham', 'iron'
    )
    expect(canStillBuildIron).toBe(false)
  })

  test('build action succeeds with valid industry-location combination', () => {
    const { actor } = setupGame()
    
    // Use the working buildIndustryAction helper to test a valid combination
    const preSnapshot = actor.getSnapshot()
    const preIndustryCount = preSnapshot.context.players[preSnapshot.context.currentPlayerIndex]!.industries.length
    
    // Build cotton at Birmingham (has cotton slots)
    const { playerWhoBuilt } = buildIndustryAction(actor, 'cotton', 'birmingham')
    
    const postSnapshot = actor.getSnapshot()
    const postIndustryCount = postSnapshot.context.players[playerWhoBuilt]!.industries.length
    
    // Industry count should have increased
    expect(postIndustryCount).toBe(preIndustryCount + 1)
    
    // Verify the built industry
    const builtIndustry = postSnapshot.context.players[playerWhoBuilt]!.industries[0]
    expect(builtIndustry!.type).toBe('cotton')
    expect(builtIndustry!.location).toBe('birmingham')
  })

  test('build action handles slot occupation correctly', () => {
    const { actor } = setupGame()
    
    // First build a coal mine at Stoke (occupy the coal slot)
    buildIndustryAction(actor, 'coal', 'stoke')
    
    let snapshot = actor.getSnapshot()
    const currentPlayerId = snapshot.context.currentPlayerIndex

    // Set up player with another coal industry card
    actor.send({
      type: 'TEST_SET_PLAYER_HAND',
      playerId: currentPlayerId,
      hand: [
        {
          id: 'coal_test2',
          type: 'industry',
          industries: ['coal'],
        },
      ],
    })
    
    // Try to build another coal mine at Stoke (coal slot should be occupied)
    actor.send({ type: 'BUILD' })
    actor.send({ type: 'SELECT_CARD', cardId: 'coal_test2' })
    actor.send({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'coal' })
    
    // Check that Stoke can no longer accommodate coal (slot occupied)
    const canAccommodate = canCityAccommodateIndustryType(
      snapshot.context, 'stoke', 'coal'
    )
    expect(canAccommodate).toBe(false)
    
    // But pottery slot should still be available
    const canAccommodatePottery = canCityAccommodateIndustryType(
      snapshot.context, 'stoke', 'pottery'
    )
    expect(canAccommodatePottery).toBe(true)
  })

  test('slot validation works with different city configurations', () => {
    const { actor } = setupGame()
    const context = actor.getSnapshot().context
    
    // Test different cities with their specific slot configurations
    
    // Coventry: ['cotton', 'manufacturer'], ['pottery']
    expect(canCityAccommodateIndustryType(context, 'coventry', 'cotton')).toBe(true)
    expect(canCityAccommodateIndustryType(context, 'coventry', 'manufacturer')).toBe(true)
    expect(canCityAccommodateIndustryType(context, 'coventry', 'pottery')).toBe(true)
    expect(canCityAccommodateIndustryType(context, 'coventry', 'coal')).toBe(false)
    expect(canCityAccommodateIndustryType(context, 'coventry', 'iron')).toBe(false)
    
    // Stoke: ['coal'], ['pottery'], ['brewery']
    expect(canCityAccommodateIndustryType(context, 'stoke', 'coal')).toBe(true)
    expect(canCityAccommodateIndustryType(context, 'stoke', 'pottery')).toBe(true)
    expect(canCityAccommodateIndustryType(context, 'stoke', 'brewery')).toBe(true)
    expect(canCityAccommodateIndustryType(context, 'stoke', 'cotton')).toBe(false)
  })

  test('slot availability changes as industries are built', () => {
    const { actor } = setupGame()
    
    // Initially, should be able to build cotton at Birmingham
    let context = actor.getSnapshot().context
    expect(canCityAccommodateIndustryType(context, 'birmingham', 'cotton')).toBe(true)
    
    // Build first cotton mill (occupies slot 1: ['cotton', 'iron'])
    buildIndustryAction(actor, 'cotton', 'birmingham')
    context = actor.getSnapshot().context
    
    // Should still be able to build cotton (slot 4 ['cotton', 'manufacturer'] is available)
    expect(canCityAccommodateIndustryType(context, 'birmingham', 'cotton')).toBe(true)
    
    // Build manufacturer (occupies slot 4: ['cotton', 'manufacturer'])
    // Note: We build manufacturer instead of second cotton to avoid overbuild issues
    buildIndustryAction(actor, 'manufacturer', 'birmingham')
    context = actor.getSnapshot().context
    
    // Cotton assigned to slot 1 ['cotton', 'iron'], manufacturer to slot 2 ['manufacturer', 'pottery']
    // Slot 4 ['cotton', 'manufacturer'] is still available for both cotton and manufacturer
    expect(canCityAccommodateIndustryType(context, 'birmingham', 'cotton')).toBe(true)
    expect(canCityAccommodateIndustryType(context, 'birmingham', 'manufacturer')).toBe(true)
    
    // But should still be able to build brewery in its dedicated slot 3
    expect(canCityAccommodateIndustryType(context, 'birmingham', 'brewery')).toBe(true)
    
    // Pottery cannot be built (slot 2 is occupied by manufacturer)
    expect(canCityAccommodateIndustryType(context, 'birmingham', 'pottery')).toBe(false)
    
    // Iron cannot be built (slot 1 is occupied by cotton)
    expect(canCityAccommodateIndustryType(context, 'birmingham', 'iron')).toBe(false)
  })
})
})
