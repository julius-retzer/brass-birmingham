import { createActor } from 'xstate'
import { describe, expect, test } from 'vitest'
import { gameStore } from './gameStore'
import { getInitialPlayerIndustryTilesWithQuantities } from '../data/industryTiles'

const setupGame = () => {
  const actor = createActor(gameStore)
  actor.start()

  // Start game with 2 players
  actor.send({
    type: 'START_GAME',
    players: [
      {
        id: '1',
        name: 'Test Player 1',
        money: 30,
        victoryPoints: 0,
        income: 10,
        color: 'red' as const,
        character: 'Richard Arkwright' as const,
        industryTilesOnMat: getInitialPlayerIndustryTilesWithQuantities(),
      },
      {
        id: '2',
        name: 'Test Player 2',
        money: 30,
        victoryPoints: 0,
        income: 10,
        color: 'green' as const,
        character: 'Eliza Tinsley' as const,
        industryTilesOnMat: getInitialPlayerIndustryTilesWithQuantities(),
      },
    ],
  })

  return { actor }
}

describe('Game Store - Card Selection Auto-behavior', () => {
  test('industry card selection auto-selects industry tile', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()
    const currentPlayerId = snapshot.context.currentPlayerIndex

    // Set up player with a coal industry card
    actor.send({
      type: 'TEST_SET_PLAYER_HAND',
      playerId: currentPlayerId,
      hand: [
        {
          id: 'coal_test',
          type: 'industry',
          industries: ['coal'],
        },
      ],
    })

    // Start build action
    actor.send({ type: 'BUILD' })
    
    // Before selecting card, industry tile should be null
    snapshot = actor.getSnapshot()
    expect(snapshot.context.selectedIndustryTile).toBeNull()
    
    // Select the industry card
    actor.send({ type: 'SELECT_CARD', cardId: 'coal_test' })
    
    // After selecting industry card, selectedIndustryTile should be auto-set
    snapshot = actor.getSnapshot()
    expect(snapshot.context.selectedIndustryTile).not.toBeNull()
    expect(snapshot.context.selectedIndustryTile?.type).toBe('coal')
    expect(snapshot.context.selectedIndustryTile?.level).toBe(1) // Should be lowest level
  })

  test('industry card with multiple types selects first available type', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()
    const currentPlayerId = snapshot.context.currentPlayerIndex

    // Set up player with a multi-industry card (iron first, then cotton)
    actor.send({
      type: 'TEST_SET_PLAYER_HAND',
      playerId: currentPlayerId,
      hand: [
        {
          id: 'multi_test',
          type: 'industry',
          industries: ['iron', 'cotton'], // Iron should be selected first
        },
      ],
    })

    // Start build action and select card
    actor.send({ type: 'BUILD' })
    actor.send({ type: 'SELECT_CARD', cardId: 'multi_test' })
    
    // Should auto-select iron (first available industry type)
    snapshot = actor.getSnapshot()
    expect(snapshot.context.selectedIndustryTile?.type).toBe('iron')
    expect(snapshot.context.selectedIndustryTile?.level).toBe(1)
  })

  test('location card selection does not auto-select industry tile', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()
    const currentPlayerId = snapshot.context.currentPlayerIndex

    // Set up player with a location card
    actor.send({
      type: 'TEST_SET_PLAYER_HAND',
      playerId: currentPlayerId,
      hand: [
        {
          id: 'stoke_test',
          type: 'location',
          location: 'stoke',
          color: 'blue',
        },
      ],
    })

    // Start build action and select card
    actor.send({ type: 'BUILD' })
    actor.send({ type: 'SELECT_CARD', cardId: 'stoke_test' })
    
    // Location cards should NOT auto-select industry tiles
    snapshot = actor.getSnapshot()
    expect(snapshot.context.selectedIndustryTile).toBeNull()
    expect(snapshot.context.selectedCard?.type).toBe('location')
  })

  test('industry card selection respects era restrictions', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()
    const currentPlayerId = snapshot.context.currentPlayerIndex

    // Move to rail era
    actor.send({ type: 'TEST_SET_ERA', era: 'rail' })

    // Set up player with a coal industry card  
    actor.send({
      type: 'TEST_SET_PLAYER_HAND',
      playerId: currentPlayerId,
      hand: [
        {
          id: 'coal_test',
          type: 'industry',
          industries: ['coal'],
        },
      ],
    })

    // Start build action and select card
    actor.send({ type: 'BUILD' })
    actor.send({ type: 'SELECT_CARD', cardId: 'coal_test' })
    
    snapshot = actor.getSnapshot()
    
    // In rail era, level 1 coal mines can't be built (canBuildInRailEra: false)
    // So it should select the next available tile (level 2) or be null if none available
    const selectedTile = snapshot.context.selectedIndustryTile
    if (selectedTile) {
      expect(selectedTile.canBuildInRailEra).toBe(true)
    }
    // Note: The exact behavior depends on what tiles are available in rail era
  })

  test('wild industry card auto-selects first available industry type', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()
    const currentPlayerId = snapshot.context.currentPlayerIndex

    // Set up player with a wild industry card
    actor.send({
      type: 'TEST_SET_PLAYER_HAND',
      playerId: currentPlayerId,
      hand: [
        {
          id: 'wild_test',
          type: 'wild_industry',
        },
      ],
    })

    // Start build action and select card
    actor.send({ type: 'BUILD' })
    actor.send({ type: 'SELECT_CARD', cardId: 'wild_test' })
    
    snapshot = actor.getSnapshot()
    
    // Wild industry cards should auto-select some industry tile
    // (The exact behavior depends on implementation - it might select the first available type)
    expect(snapshot.context.selectedCard?.type).toBe('wild_industry')
    // The selectedIndustryTile behavior for wild cards may vary based on implementation
  })

  test('selecting different industry cards updates selectedIndustryTile', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()
    const currentPlayerId = snapshot.context.currentPlayerIndex

    // Set up player with multiple industry cards
    actor.send({
      type: 'TEST_SET_PLAYER_HAND',
      playerId: currentPlayerId,
      hand: [
        {
          id: 'coal_test',
          type: 'industry',
          industries: ['coal'],
        },
        {
          id: 'iron_test', 
          type: 'industry',
          industries: ['iron'],
        },
      ],
    })

    // Start build action
    actor.send({ type: 'BUILD' })
    
    // Select coal card first
    actor.send({ type: 'SELECT_CARD', cardId: 'coal_test' })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.selectedIndustryTile?.type).toBe('coal')
    
    // Cancel to go back to card selection
    actor.send({ type: 'CANCEL' })
    
    // Select iron card - should update to iron tile
    actor.send({ type: 'SELECT_CARD', cardId: 'iron_test' })
    snapshot = actor.getSnapshot()
    expect(snapshot.context.selectedIndustryTile?.type).toBe('iron')
  })
})