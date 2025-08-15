// Industry Slot Utility Functions Tests
import { describe, expect, test } from 'vitest'
import { canCityAccommodateIndustryType } from './gameUtils'
import type { GameState } from '../gameStore'
import type { IndustryType } from '../../data/cards'
import type { CityId } from '../../data/board'

// Helper to create minimal game state for testing
const createTestGameState = (industries: Array<{
  location: CityId
  type: IndustryType
  level: number
  playerId: string
}> = []): GameState => {
  const players = [
    {
      id: '1',
      name: 'Player 1',
      color: 'red' as const,
      character: 'Richard Arkwright' as const,
      money: 17,
      victoryPoints: 0,
      income: 10,
      hand: [],
      industryTilesOnMat: {} as any,
      links: [],
      industries: industries
        .filter(i => i.playerId === '1')
        .map(i => ({
          location: i.location,
          type: i.type,
          level: i.level,
          flipped: false,
          tile: {} as any,
          coalCubesOnTile: 0,
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0,
        }))
    },
    {
      id: '2',
      name: 'Player 2',
      color: 'blue' as const,
      character: 'Eliza Tinsley' as const,
      money: 17,
      victoryPoints: 0,
      income: 10,
      hand: [],
      industryTilesOnMat: {} as any,
      links: [],
      industries: industries
        .filter(i => i.playerId === '2')
        .map(i => ({
          location: i.location,
          type: i.type,
          level: i.level,
          flipped: false,
          tile: {} as any,
          coalCubesOnTile: 0,
          ironCubesOnTile: 0,
          beerBarrelsOnTile: 0,
        }))
    }
  ]

  return {
    players,
    currentPlayerIndex: 0,
    era: 'canal',
    round: 1,
    actionsRemaining: 2,
    resources: { coal: 24, iron: 10, beer: 24 },
    coalMarket: [],
    ironMarket: [],
    logs: [],
    drawPile: [],
    discardPile: [],
    wildLocationPile: [],
    wildIndustryPile: [],
    selectedCard: null,
    selectedCardsForScout: [],
    spentMoney: 0,
    playerSpending: {},
    turnOrder: [],
    isFinalRound: false,
    selectedLink: null,
    selectedSecondLink: null,
    selectedLocation: null,
    selectedIndustryTile: null,
    selectedTilesForDevelop: [],
    merchants: []
  } as GameState
}

describe('canCityAccommodateIndustryType', () => {
  
  test('returns true for compatible industry in empty city', () => {
    const gameState = createTestGameState()
    
    // Birmingham has slots: ['cotton', 'iron'], ['manufacturer', 'pottery'], ['brewery'], ['cotton', 'manufacturer']
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'cotton')).toBe(true)
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'iron')).toBe(true)
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'manufacturer')).toBe(true)
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'pottery')).toBe(true)
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'brewery')).toBe(true)
  })

  test('returns false for incompatible industry in empty city', () => {
    const gameState = createTestGameState()
    
    // Birmingham doesn't have coal slots
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'coal')).toBe(false)
  })

  test('returns false for city with no defined slots', () => {
    const gameState = createTestGameState()
    
    // Merchant cities have no industry slots
    expect(canCityAccommodateIndustryType(gameState, 'warrington', 'cotton')).toBe(false)
    expect(canCityAccommodateIndustryType(gameState, 'gloucester', 'brewery')).toBe(false)
  })

  test('handles single-option slots correctly', () => {
    const gameState = createTestGameState()
    
    // Stoke has ['coal'], ['pottery'] - single option slots
    expect(canCityAccommodateIndustryType(gameState, 'stoke', 'coal')).toBe(true)
    expect(canCityAccommodateIndustryType(gameState, 'stoke', 'pottery')).toBe(true)
    expect(canCityAccommodateIndustryType(gameState, 'stoke', 'cotton')).toBe(false)
  })

  test('handles multi-option slots correctly', () => {
    const gameState = createTestGameState()
    
    // Birmingham slot 1: ['cotton', 'iron'] - both should be available
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'cotton')).toBe(true)
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'iron')).toBe(true)
    
    // Coventry slot 1: ['cotton', 'manufacturer'] - both should be available
    expect(canCityAccommodateIndustryType(gameState, 'coventry', 'cotton')).toBe(true)
    expect(canCityAccommodateIndustryType(gameState, 'coventry', 'manufacturer')).toBe(true)
  })

  test('correctly handles occupied single-option slots', () => {
    const gameState = createTestGameState([
      { location: 'stoke', type: 'coal', level: 1, playerId: '1' }
    ])
    
    // Coal slot is occupied, pottery slot should still be available
    expect(canCityAccommodateIndustryType(gameState, 'stoke', 'coal')).toBe(false)
    expect(canCityAccommodateIndustryType(gameState, 'stoke', 'pottery')).toBe(true)
  })

  test('correctly handles occupied multi-option slots', () => {
    const gameState = createTestGameState([
      { location: 'birmingham', type: 'cotton', level: 1, playerId: '1' }
    ])
    
    // First cotton slot occupied, but cotton can also use slot 4
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'cotton')).toBe(true)
    // Iron can only use slot 1, which is occupied
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'iron')).toBe(false)
    // Other slots should be unaffected
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'manufacturer')).toBe(true)
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'brewery')).toBe(true)
  })

  test('handles multiple occupied slots correctly', () => {
    const gameState = createTestGameState([
      { location: 'birmingham', type: 'cotton', level: 1, playerId: '1' },
      { location: 'birmingham', type: 'manufacturer', level: 1, playerId: '2' },
      { location: 'birmingham', type: 'brewery', level: 1, playerId: '1' }
    ])
    
    // Cotton: slot 1 occupied by cotton, but slot 4 is still available  
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'cotton')).toBe(true)
    // Iron: only slot 1 available, but occupied by cotton
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'iron')).toBe(false)
    // Manufacturer: slot 2 occupied by manufacturer, but slot 4 is still available
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'manufacturer')).toBe(true)
    // Pottery: can use slot 2, but it's occupied by manufacturer
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'pottery')).toBe(false)
    // Brewery: slot 3 occupied by brewery
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'brewery')).toBe(false)
  })

  test('handles industries from different players', () => {
    const gameState = createTestGameState([
      { location: 'birmingham', type: 'cotton', level: 1, playerId: '1' },
      { location: 'birmingham', type: 'manufacturer', level: 2, playerId: '2' }
    ])
    
    // Both players have industries, first-fit algorithm assigns cotton to slot 1, manufacturer to slot 2
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'cotton')).toBe(true) // slot 4 still available for cotton
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'manufacturer')).toBe(true) // slot 4 still available for manufacturer  
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'pottery')).toBe(false) // slot 2 occupied by manufacturer
  })

  test('handles all slots filled scenario', () => {
    const gameState = createTestGameState([
      { location: 'birmingham', type: 'cotton', level: 1, playerId: '1' },
      { location: 'birmingham', type: 'pottery', level: 1, playerId: '1' },
      { location: 'birmingham', type: 'brewery', level: 1, playerId: '2' },
      { location: 'birmingham', type: 'manufacturer', level: 1, playerId: '2' }
    ])
    
    // All slots occupied
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'cotton')).toBe(false)
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'iron')).toBe(false)
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'manufacturer')).toBe(false)
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'pottery')).toBe(false)
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'brewery')).toBe(false)
  })

  test('handles complex slot assignment scenarios', () => {
    // Birmingham slots: ['cotton', 'iron'], ['manufacturer', 'pottery'], ['brewery'], ['cotton', 'manufacturer']
    // Build: cotton (uses slot 1), pottery (uses slot 2)
    const gameState = createTestGameState([
      { location: 'birmingham', type: 'cotton', level: 1, playerId: '1' },
      { location: 'birmingham', type: 'pottery', level: 1, playerId: '1' }
    ])
    
    // Cotton: slot 1 occupied, but slot 4 available
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'cotton')).toBe(true)
    // Iron: only slot 1, but occupied by cotton
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'iron')).toBe(false)
    // Manufacturer: slot 2 occupied by pottery, but slot 4 available
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'manufacturer')).toBe(true)
    // Pottery: slot 2 occupied
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'pottery')).toBe(false)
    // Brewery: slot 3 available
    expect(canCityAccommodateIndustryType(gameState, 'birmingham', 'brewery')).toBe(true)
  })

  test('works with different city configurations', () => {
    const gameState = createTestGameState()
    
    // Test various cities with their specific slot configurations
    
    // Dudley: ['coal'], ['iron'], ['brewery']
    expect(canCityAccommodateIndustryType(gameState, 'dudley', 'coal')).toBe(true)
    expect(canCityAccommodateIndustryType(gameState, 'dudley', 'iron')).toBe(true)
    expect(canCityAccommodateIndustryType(gameState, 'dudley', 'brewery')).toBe(true)
    expect(canCityAccommodateIndustryType(gameState, 'dudley', 'manufacturer')).toBe(false)
    expect(canCityAccommodateIndustryType(gameState, 'dudley', 'cotton')).toBe(false)
    
    // Wolverhampton: ['coal'], ['iron'], ['manufacturer']
    expect(canCityAccommodateIndustryType(gameState, 'wolverhampton', 'coal')).toBe(true)
    expect(canCityAccommodateIndustryType(gameState, 'wolverhampton', 'iron')).toBe(true)
    expect(canCityAccommodateIndustryType(gameState, 'wolverhampton', 'manufacturer')).toBe(true)
    expect(canCityAccommodateIndustryType(gameState, 'wolverhampton', 'brewery')).toBe(false)
    
    // Burton: ['brewery'], ['brewery']
    expect(canCityAccommodateIndustryType(gameState, 'burton', 'brewery')).toBe(true)
    expect(canCityAccommodateIndustryType(gameState, 'burton', 'cotton')).toBe(false)
  })

  test('handles edge case with empty slot arrays', () => {
    const gameState = createTestGameState()
    
    // This tests the fallback for cities not defined in cityIndustrySlots
    // Should return false for any industry type
    expect(canCityAccommodateIndustryType(gameState, 'nonexistent' as CityId, 'cotton')).toBe(false)
  })
})