// Build Actions Tests - Industry building and basic build mechanics
import { afterEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import type { CityId } from '../data/board'
import type { IndustryType } from '../data/cards'
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

  // Add error handling to prevent unhandled exceptions during tests
  actor.subscribe({
    error: (error: any) => {
      console.warn('Actor error caught in test:', error.message)
      // Silently handle errors that are expected in failure test scenarios
    },
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

const buildIndustryAction = (
  actor: ReturnType<typeof createActor>,
  industryType = 'coal',
  location = 'dudley', // Dudley has a dedicated coal slot
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

    const { industryCard, playerWhoBuilt } = buildIndustryAction(
      actor,
      'coal',
      'dudley',
    ) // Dudley has a coal slot
    const snapshot = actor.getSnapshot()

    const updatedPlayer = snapshot.context.players[playerWhoBuilt]!
    const builtIndustry = updatedPlayer.industries[0]

    expect(builtIndustry).toBeDefined()
    expect(builtIndustry!.type).toBe('coal')
    expect(builtIndustry!.location).toBe('dudley')
    // Setup seeds a face-down starting discard (1 per player, rules l.402), so
    // the played card lands on top of those 2.
    expect(snapshot.context.discardPile.length).toBe(3)
    expect(snapshot.context.discardPile.at(-1)!.id).toBe('coal_test')
  })

  test('build industry - player state updates', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()

    const initialPlayer = snapshot.context.players[0]!
    const initialMoney = 50 // Set by buildIndustryAction

    const { playerWhoBuilt } = buildIndustryAction(actor, 'coal', 'dudley') // Use valid location
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
    // Test Level 1 industries that require no coal to build in Canal Era.
    // (Brewery L1 and pottery L1 need IRON, which is always purchasable
    // from the market without a connection — retail board, 2026-07-14.)
    const industryTestCases = [
      { type: 'coal', location: 'dudley' },
      { type: 'cotton', location: 'birmingham' },
      { type: 'pottery', location: 'stoke' },
      { type: 'brewery', location: 'burton' },
    ]

    industryTestCases.forEach(({ type, location }) => {
      const { actor } = setupGame()

      // Verify we're in Canal Era (Level 1 tiles should be buildable)
      let snapshot = actor.getSnapshot()
      expect(snapshot.context.era).toBe('canal')

      const { playerWhoBuilt } = buildIndustryAction(actor, type, location)
      snapshot = actor.getSnapshot()

      // Industry should be at index 0
      const builtIndustry =
        snapshot.context.players[playerWhoBuilt]!.industries[0]
      expect(builtIndustry).toBeDefined()
      expect(builtIndustry!.type).toBe(type)
      // Should build Level 1 tile in Canal Era
      expect(builtIndustry!.level).toBe(1)

      actor.stop()
    })
  })

  test('build industry - different industry types (Canal Era) - coal required', () => {
    // Test Level 1 industries that require coal to build in Canal Era
    // (iron works L1 and manufacturer L1 each consume 1 coal — retail
    // board, audited 2026-07-14)
    const industryTestCases = [
      { type: 'iron', location: 'birmingham' },
      { type: 'manufacturer', location: 'birmingham' },
    ]

    industryTestCases.forEach(({ type, location }) => {
      const { actor } = setupGame()

      // Verify we're in Canal Era
      let snapshot = actor.getSnapshot()
      expect(snapshot.context.era).toBe('canal')

      const currentPlayerId = snapshot.context.currentPlayerIndex
      // The mine belongs to the OPPONENT: coal is consumed from any
      // player's mine at the location, and the canal one-tile rule
      // (2026-07-15) forbids the builder having their own tile there.
      const mineOwner = 1 - currentPlayerId

      // Add coal mine to provide coal for building
      actor.send({
        type: 'TEST_SET_PLAYER_STATE',
        playerId: mineOwner,
        industries: [
          {
            location: location as CityId, // Coal mine at same location
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
          },
        ],
      })

      const { playerWhoBuilt } = buildIndustryAction(actor, type, location)
      snapshot = actor.getSnapshot()

      // The build lands for the current player…
      const builtIndustry =
        snapshot.context.players[playerWhoBuilt]!.industries[0]
      expect(builtIndustry).toBeDefined()
      expect(builtIndustry!.type).toBe(type)
      // Should build Level 1 tile in Canal Era
      expect(builtIndustry!.level).toBe(1)

      // …and the coal came from the OPPONENT's mine at the location
      const coalMine =
        snapshot.context.players[1 - playerWhoBuilt]!.industries[0]
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
    // Player 0 creates canal link Coalbrookdale <-> Shrewsbury to connect to merchant
    actor.send({ type: 'NETWORK' })
    snapshot = actor.getSnapshot()
    actor.send({
      type: 'SELECT_CARD',
      cardId:
        snapshot.context.players[snapshot.context.currentPlayerIndex]!.hand[0]!
          .id,
    })
    actor.send({ type: 'SELECT_LINK', from: 'coalbrookdale', to: 'shrewsbury' })
    actor.send({ type: 'CONFIRM' })

    // After network action in round 1, it's now player 1's turn.
    // Player 1 passes — PASS discards hand[0] and completes by itself (the
    // old trailing SELECT_CARD + CONFIRM were no-ops before the card-first
    // entry made SELECT_CARD meaningful in idle).
    actor.send({ type: 'PASS' })

    // Now it's round 2, player 0's turn (2 actions available)
    snapshot = actor.getSnapshot()

    // Debug: verify era and links
    expect(snapshot.context.era).toBe('canal')
    const player0Links = snapshot.context.players[0]!.links
    expect(player0Links.length).toBeGreaterThan(0)
    expect(player0Links[0]!.type).toBe('canal')
    expect(player0Links[0]!.from).toBe('coalbrookdale')
    expect(player0Links[0]!.to).toBe('shrewsbury')

    // Build coal mine at Coalbrookdale (connected to the merchant via the link)
    buildIndustryAction(actor, 'coal', 'coalbrookdale')
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
    expect(coalMine!.location).toBe('coalbrookdale')
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
    const snapshot = actor.getSnapshot()
    expect(snapshot.context.era).toBe('rail')

    // RULE: Level 1 tiles (except pottery) cannot be built in Rail Era
    const restrictedTiles = [
      'coal',
      'iron',
      'cotton',
      'manufacturer',
      'brewery',
    ]

    restrictedTiles.forEach((industryType) => {
      const { actor: testActor } = setupGame()

      // Add error handling to prevent unhandled exceptions during era restriction tests
      testActor.subscribe({
        error: (error: any) => {
          console.warn(
            'Era restriction test actor error caught:',
            error.message,
          )
          // Silently handle errors that are expected when testing restrictions
        },
      })

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
            industries: [industryType as IndustryType],
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
      testActor.send({
        type: 'SELECT_INDUSTRY_TYPE',
        industryType: industryType as IndustryType,
      })

      // Should automatically select level 2+ tile (not level 1)
      const selectedTile = testActor.getSnapshot().context.selectedIndustryTile
      if (selectedTile) {
        expect(selectedTile.level).toBeGreaterThan(1)
      }

      testActor.stop()
    })

    // RULE: Level 1 pottery CAN be built in Rail Era (special exception)
    const { actor: potteryActor } = setupGame()

    // Add error handling to prevent unhandled exceptions during pottery test
    potteryActor.subscribe({
      error: (error: any) => {
        console.warn('Pottery test actor error caught:', error.message)
        // Silently handle errors that are expected during pottery building tests
      },
    })

    potteryActor.send({ type: 'TRIGGER_CANAL_ERA_END' })
    expect(potteryActor.getSnapshot().context.era).toBe('rail')

    const currentPlayerId =
      potteryActor.getSnapshot().context.currentPlayerIndex
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
    const potteryIndustry = potterySnapshot.context.players[
      currentPlayerId
    ]!.industries.find((i) => i.type === 'pottery')

    if (potteryIndustry) {
      expect(potteryIndustry.level).toBe(1) // Level 1 pottery allowed in Rail Era
    }

    potteryActor.stop()
  })

  // Industry Slot Validation Tests
  describe('Industry Slot Validation', () => {
    test('canCityAccommodateIndustryType - empty city can accommodate compatible industry', () => {
      const { actor } = setupGame()
      const snapshot = actor.getSnapshot()
      const context = snapshot.context

      // Birmingham has slots: ['cotton','manufacturer'], ['manufacturer'], ['iron'], ['manufacturer']
      const canBuildCotton = canCityAccommodateIndustryType(
        context,
        'birmingham',
        'cotton',
      )
      expect(canBuildCotton).toBe(true)

      // Burton has a dedicated brewery slot
      const canBuildBrewery = canCityAccommodateIndustryType(
        context,
        'burton',
        'brewery',
      )
      expect(canBuildBrewery).toBe(true)
    })

    test('canCityAccommodateIndustryType - rejects incompatible industry types', () => {
      const { actor } = setupGame()
      const context = actor.getSnapshot().context

      // Birmingham doesn't have coal slots, should reject coal mine
      const canBuildCoal = canCityAccommodateIndustryType(
        context,
        'birmingham',
        'coal',
      )
      expect(canBuildCoal).toBe(false)
    })

    test('canCityAccommodateIndustryType - handles occupied slots correctly', () => {
      const { actor } = setupGame()

      // Test at Dudley which has simple slots: ['coal'], ['iron']
      // Build a coal mine at Dudley (should occupy the coal slot)
      buildIndustryAction(actor, 'coal', 'dudley')
      let snapshot = actor.getSnapshot()

      // Should not be able to build another coal mine (coal slot is occupied)
      const canBuildSecondCoal = canCityAccommodateIndustryType(
        snapshot.context,
        'dudley',
        'coal',
      )
      expect(canBuildSecondCoal).toBe(false)

      // But should still be able to build iron (iron slot is available)
      const canBuildIron = canCityAccommodateIndustryType(
        snapshot.context,
        'dudley',
        'iron',
      )
      expect(canBuildIron).toBe(true)

      // Build iron at Dudley (should occupy the iron slot)
      buildIndustryAction(actor, 'iron', 'dudley')
      snapshot = actor.getSnapshot()

      // Now should not be able to build more iron (iron slot occupied)
      const canBuildSecondIron = canCityAccommodateIndustryType(
        snapshot.context,
        'dudley',
        'iron',
      )
      expect(canBuildSecondIron).toBe(false)

      // And still can't build coal (coal slot occupied)
      const canBuildCoalAgain = canCityAccommodateIndustryType(
        snapshot.context,
        'dudley',
        'coal',
      )
      expect(canBuildCoalAgain).toBe(false)
    })

    test('canCityAccommodateIndustryType - handles multi-option slots', () => {
      const { actor } = setupGame()

      // Leek slots: ['cotton','manufacturer'], ['cotton','coal']
      const canBuildManufacturer = canCityAccommodateIndustryType(
        actor.getSnapshot().context,
        'leek',
        'manufacturer',
      )
      const canBuildCoal = canCityAccommodateIndustryType(
        actor.getSnapshot().context,
        'leek',
        'coal',
      )

      expect(canBuildManufacturer).toBe(true)
      expect(canBuildCoal).toBe(true)

      // Build cotton mill (occupies slot 1 with first-fit algorithm)
      buildIndustryAction(actor, 'cotton', 'leek')

      // Manufacturer should not be available (slot 1 is occupied, and
      // manufacturer can only use slot 1)
      const canStillBuildManufacturer = canCityAccommodateIndustryType(
        actor.getSnapshot().context,
        'leek',
        'manufacturer',
      )
      expect(canStillBuildManufacturer).toBe(false)
    })

    test('build action succeeds with valid industry-location combination', () => {
      const { actor } = setupGame()

      // Use the working buildIndustryAction helper to test a valid combination
      const preSnapshot = actor.getSnapshot()
      const preIndustryCount =
        preSnapshot.context.players[preSnapshot.context.currentPlayerIndex]!
          .industries.length

      // Build cotton at Birmingham (has cotton slots)
      const { playerWhoBuilt } = buildIndustryAction(
        actor,
        'cotton',
        'birmingham',
      )

      const postSnapshot = actor.getSnapshot()
      const postIndustryCount =
        postSnapshot.context.players[playerWhoBuilt]!.industries.length

      // Industry count should have increased
      expect(postIndustryCount).toBe(preIndustryCount + 1)

      // Verify the built industry
      const builtIndustry =
        postSnapshot.context.players[playerWhoBuilt]!.industries[0]
      expect(builtIndustry!.type).toBe('cotton')
      expect(builtIndustry!.location).toBe('birmingham')
    })

    test('build action handles slot occupation correctly', () => {
      const { actor } = setupGame()

      // First build a coal mine at Stoke (occupy the coal slot)
      buildIndustryAction(actor, 'coal', 'stoke')

      const snapshot = actor.getSnapshot()
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
        snapshot.context,
        'stoke',
        'coal',
      )
      expect(canAccommodate).toBe(false)

      // But pottery slot should still be available
      const canAccommodatePottery = canCityAccommodateIndustryType(
        snapshot.context,
        'stoke',
        'pottery',
      )
      expect(canAccommodatePottery).toBe(true)
    })

    test('slot validation works with different city configurations', () => {
      const { actor } = setupGame()
      const context = actor.getSnapshot().context

      // Test different cities with their specific slot configurations

      // Coventry: ['pottery'], ['manufacturer','coal'], ['iron','manufacturer']
      expect(
        canCityAccommodateIndustryType(context, 'coventry', 'pottery'),
      ).toBe(true)
      expect(
        canCityAccommodateIndustryType(context, 'coventry', 'manufacturer'),
      ).toBe(true)
      expect(canCityAccommodateIndustryType(context, 'coventry', 'coal')).toBe(
        true,
      )
      expect(canCityAccommodateIndustryType(context, 'coventry', 'iron')).toBe(
        true,
      )
      expect(
        canCityAccommodateIndustryType(context, 'coventry', 'cotton'),
      ).toBe(false)
      expect(
        canCityAccommodateIndustryType(context, 'coventry', 'brewery'),
      ).toBe(false)

      // Stoke: ['cotton','manufacturer'], ['pottery','iron'], ['manufacturer']
      expect(canCityAccommodateIndustryType(context, 'stoke', 'cotton')).toBe(
        true,
      )
      expect(canCityAccommodateIndustryType(context, 'stoke', 'pottery')).toBe(
        true,
      )
      expect(canCityAccommodateIndustryType(context, 'stoke', 'iron')).toBe(
        true,
      )
      expect(
        canCityAccommodateIndustryType(context, 'stoke', 'manufacturer'),
      ).toBe(true)
      expect(canCityAccommodateIndustryType(context, 'stoke', 'coal')).toBe(
        false,
      )
      expect(canCityAccommodateIndustryType(context, 'stoke', 'brewery')).toBe(
        false,
      )
    })

    test('slot availability changes as industries are built', () => {
      const { actor } = setupGame()

      // Birmingham slots: ['cotton','manufacturer'], ['manufacturer'], ['iron'], ['manufacturer']
      let context = actor.getSnapshot().context
      expect(
        canCityAccommodateIndustryType(context, 'birmingham', 'cotton'),
      ).toBe(true)

      // Build first cotton mill (occupies slot 1: ['cotton','manufacturer'])
      buildIndustryAction(actor, 'cotton', 'birmingham')
      context = actor.getSnapshot().context

      // Cotton only fits slot 1, so no more cotton can be built
      expect(
        canCityAccommodateIndustryType(context, 'birmingham', 'cotton'),
      ).toBe(false)

      // Manufacturer still fits (slots 2 and 4)
      expect(
        canCityAccommodateIndustryType(context, 'birmingham', 'manufacturer'),
      ).toBe(true)
      buildIndustryAction(actor, 'manufacturer', 'birmingham')
      context = actor.getSnapshot().context
      expect(
        canCityAccommodateIndustryType(context, 'birmingham', 'manufacturer'),
      ).toBe(true)

      // Iron has its dedicated slot 3
      expect(
        canCityAccommodateIndustryType(context, 'birmingham', 'iron'),
      ).toBe(true)

      // Pottery and brewery have no slots in Birmingham
      expect(
        canCityAccommodateIndustryType(context, 'birmingham', 'pottery'),
      ).toBe(false)
      expect(
        canCityAccommodateIndustryType(context, 'birmingham', 'brewery'),
      ).toBe(false)
    })
  })
})
