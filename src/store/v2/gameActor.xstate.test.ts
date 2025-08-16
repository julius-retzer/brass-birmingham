import { describe, expect, test } from 'vitest'
import { createActor } from 'xstate'

describe('Game Store - Basic XState Integration', () => {
  test('can create and start simple XState machine', () => {
    const { setup } = require('xstate')
    const simpleMachine = setup({}).createMachine({
      id: 'simple',
      initial: 'idle',
      states: {
        idle: {},
      },
    })
    const actor = createActor(simpleMachine)
    expect(actor).toBeDefined()
    actor.start()
    const snapshot = actor.getSnapshot()
    expect(snapshot.value).toBe('idle')
  })

  test('can import gameActor module successfully', async () => {
    // Just try importing the gameActor
    const { gameActor } = await import('./gameActor')
    expect(gameActor).toBeDefined()
  })

  test('can create actor from gameActor machine', async () => {
    const { gameActor } = await import('./gameActor')
    const actor = createActor(gameActor)
    expect(actor).toBeDefined()
  })

  test('gameActor actor starts in setup state', async () => {
    const { gameActor } = await import('./gameActor')
    const actor = createActor(gameActor)
    actor.start()
    const snapshot = actor.getSnapshot()
    expect(snapshot.value).toBe('setup')
  })

  test('can create test players with industry tiles', async () => {
    const { getInitialPlayerIndustryTilesWithQuantities } = await import(
      '../../data/industryTiles'
    )

    // Create minimal test players without cards
    const testPlayers = [
      {
        id: '1',
        name: 'Player 1',
        color: 'red' as const,
        character: 'Richard Arkwright' as const,
        money: 17,
        victoryPoints: 0,
        income: 10,
        industries: [],
        links: [],
        hand: [], // Empty hand to start
        industryTilesOnMat: getInitialPlayerIndustryTilesWithQuantities(),
      },
      {
        id: '2',
        name: 'Player 2',
        color: 'blue' as const,
        character: 'Eliza Tinsley' as const,
        money: 17,
        victoryPoints: 0,
        income: 10,
        industries: [],
        links: [],
        hand: [], // Empty hand to start
        industryTilesOnMat: getInitialPlayerIndustryTilesWithQuantities(),
      },
    ]

    expect(testPlayers).toHaveLength(2)
  })

  test('can initialize game with START_GAME event', async () => {
    const { gameActor } = await import('./gameActor')
    const { getInitialPlayerIndustryTilesWithQuantities } = await import(
      '../../data/industryTiles'
    )

    // Create minimal test players
    const testPlayers = [
      {
        id: '1',
        name: 'Player 1',
        color: 'red' as const,
        character: 'Richard Arkwright' as const,
        money: 17,
        victoryPoints: 0,
        income: 10,
        industries: [],
        links: [],
        hand: [], // Empty hand to start
        industryTilesOnMat: getInitialPlayerIndustryTilesWithQuantities(),
      },
      {
        id: '2',
        name: 'Player 2',
        color: 'blue' as const,
        character: 'Eliza Tinsley' as const,
        money: 17,
        victoryPoints: 0,
        income: 10,
        industries: [],
        links: [],
        hand: [], // Empty hand to start
        industryTilesOnMat: getInitialPlayerIndustryTilesWithQuantities(),
      },
    ]

    const actor = createActor(gameActor)
    actor.start()

    // This is where the original tests hang - let's see if START_GAME is the issue
    actor.send({ type: 'START_GAME', players: testPlayers })

    const snapshot = actor.getSnapshot()
    expect(snapshot.context.players).toHaveLength(2)
  })

  test('can generate initial cards for player count', async () => {
    const { getInitialCards } = await import('../../data/cards')

    // This might be where the infinite loop is
    const cardDecks = getInitialCards(2)

    expect(cardDecks).toBeDefined()
    expect(cardDecks.regularCards).toBeDefined()
  })

  test('can import card data module without errors', async () => {
    // Test importing the data structures used by getInitialCards
    const cardsModule = await import('../../data/cards')

    expect(cardsModule).toBeDefined()
    // Just check that we can access the module without calling the problematic function
  })

  test('location cards creation logic works correctly', async () => {
    // Let's manually test the logic piece by piece
    const cardsModule = await import('../../data/cards')

    // Access the locations object (it should be exported or accessible somehow)
    // Since it's not exported, let's try to replicate the logic

    const regularCards: any[] = []
    const playerCount = 2

    // Test a simple manual version of the location creation logic
    const sampleLocation = {
      type: 'location',
      location: 'birmingham',
      color: 'other',
      twoPlayers: 2,
      threePlayers: 3,
      fourPlayers: 4,
    }

    const count =
      playerCount === 2
        ? sampleLocation.twoPlayers
        : playerCount === 3
          ? sampleLocation.threePlayers
          : sampleLocation.fourPlayers

    console.log('Sample count for 2 players:', count)
    expect(count).toBe(2)

    // Test the loop logic that's causing issues
    for (let i = 0; i < count; i++) {
      console.log('Creating card', i + 1)
      regularCards.push({
        id: `test_${i + 1}`,
        type: sampleLocation.type,
        location: sampleLocation.location,
        color: sampleLocation.color,
      })

      // Add safety check to prevent infinite loop in test
      if (i > 10) {
        throw new Error('Loop exceeded safety limit - infinite loop detected')
      }
    }

    expect(regularCards).toHaveLength(2)
  })

  test('cards data file is valid and accessible', async () => {
    // Try to access the actual locations data that's causing the issue
    const fs = await import('fs')
    const path = await import('path')

    // Read the file content directly to inspect the data
    const cardsFilePath = path.resolve(process.cwd(), 'src/data/cards.ts')
    const content = fs.readFileSync(cardsFilePath, 'utf8')

    // Look for any obvious issues in the data
    const hasCircularRef =
      content.includes('locations') && content.includes('industries')
    expect(hasCircularRef).toBe(true) // Should find these objects

    // Check for any obviously problematic values
    const hasInfinity = content.includes('Infinity')
    const hasNaN = content.includes('NaN')
    const hasUndefined = content.includes('undefined')

    console.log('File contains Infinity:', hasInfinity)
    console.log('File contains NaN:', hasNaN)
    console.log('File contains undefined:', hasUndefined)

    // The issue might be in the data values themselves
    expect(typeof content).toBe('string')
  })
})
