import { describe, expect, test } from 'vitest'
import {
  filterGameStateForPlayer,
  reconstructGameStateFromFiltered,
} from './stateFilter'
import type { GameState } from '../store/gameStore'
import type { Card } from '../data/cards'

// Helper function to create a mock game state
function createMockGameState(): GameState {
  const player1Cards: Card[] = [
    { id: 'p1-card-1', type: 'location', location: 'birmingham' } as Card,
    { id: 'p1-card-2', type: 'industry', industries: ['coal'] } as Card,
  ]

  const player2Cards: Card[] = [
    { id: 'p2-card-1', type: 'location', location: 'coventry' } as Card,
    { id: 'p2-card-2', type: 'industry', industries: ['iron'] } as Card,
    { id: 'p2-card-3', type: 'wild_industry' } as Card,
  ]

  const drawPileCards: Card[] = [
    { id: 'draw-1', type: 'location', location: 'dudley' } as Card,
    { id: 'draw-2', type: 'industry', industries: ['brewery'] } as Card,
    { id: 'draw-3', type: 'location', location: 'stoke' } as Card,
  ]

  const discardPileCards: Card[] = [
    { id: 'discard-1', type: 'location', location: 'wolverhampton' } as Card,
    { id: 'discard-2', type: 'industry', industries: ['cotton'] } as Card,
  ]

  const wildLocationCards = [
    { id: 'wild-loc-1', type: 'wild_location' as const },
    { id: 'wild-loc-2', type: 'wild_location' as const },
  ]

  const wildIndustryCards = [
    { id: 'wild-ind-1', type: 'wild_industry' as const },
  ]

  return {
    players: [
      {
        id: '1',
        name: 'Player 1',
        color: 'red',
        character: 'Richard Arkwright',
        money: 30,
        victoryPoints: 10,
        income: 5,
        hand: player1Cards,
        industryTilesOnMat: {} as any,
        links: [],
        industries: [],
      },
      {
        id: '2',
        name: 'Player 2',
        color: 'blue',
        character: 'Eliza Tinsley',
        money: 25,
        victoryPoints: 8,
        income: 3,
        hand: player2Cards,
        industryTilesOnMat: {} as any,
        links: [],
        industries: [],
      },
    ],
    currentPlayerIndex: 0,
    era: 'canal',
    round: 1,
    actionsRemaining: 2,
    resources: { coal: 10, iron: 5, beer: 8 },
    coalMarket: [],
    ironMarket: [],
    logs: [],
    drawPile: drawPileCards,
    discardPile: discardPileCards,
    wildLocationPile: wildLocationCards,
    wildIndustryPile: wildIndustryCards,
    selectedCard: null,
    selectedCardsForScout: [],
    spentMoney: 0,
    playerSpending: {},
    turnOrder: ['1', '2'],
    isFinalRound: false,
    selectedLink: null,
    selectedSecondLink: null,
    selectedLocation: null,
    selectedIndustryTile: null,
    selectedTilesForDevelop: [],
    merchants: [],
    lastError: null,
    errorContext: null,
  }
}

describe('filterGameStateForPlayer', () => {
  test('should hide opponent hands when filtering for player 1', () => {
    const mockState = createMockGameState()
    const filtered = filterGameStateForPlayer(mockState, 0) // Player 1 (index 0)

    // Player 1 should see their own hand
    expect(filtered.players[0]?.hand).toBeDefined()
    expect(filtered.players[0]?.hand).toHaveLength(2)
    expect(filtered.players[0]?.hand?.[0]?.id).toBe('p1-card-1')
    expect(filtered.players[0]?.handCount).toBe(2)

    // Player 2's hand should be hidden
    expect(filtered.players[1]?.hand).toBeUndefined()
    expect(filtered.players[1]?.handCount).toBe(3) // But count is visible
  })

  test('should hide opponent hands when filtering for player 2', () => {
    const mockState = createMockGameState()
    const filtered = filterGameStateForPlayer(mockState, 1) // Player 2 (index 1)

    // Player 1's hand should be hidden
    expect(filtered.players[0]?.hand).toBeUndefined()
    expect(filtered.players[0]?.handCount).toBe(2)

    // Player 2 should see their own hand
    expect(filtered.players[1]?.hand).toBeDefined()
    expect(filtered.players[1]?.hand).toHaveLength(3)
    expect(filtered.players[1]?.hand?.[0]?.id).toBe('p2-card-1')
    expect(filtered.players[1]?.handCount).toBe(3)
  })

  test('should hide draw pile contents and only show count', () => {
    const mockState = createMockGameState()
    const filtered = filterGameStateForPlayer(mockState, 0)

    // Draw pile should not exist in filtered state
    expect((filtered as any).drawPile).toBeUndefined()

    // Only count should be available
    expect(filtered.drawPileCount).toBe(3)
  })

  test('should show only top discard card', () => {
    const mockState = createMockGameState()
    const filtered = filterGameStateForPlayer(mockState, 0)

    // Full discard pile should not exist
    expect((filtered as any).discardPile).toBeUndefined()

    // Only top card should be visible
    expect(filtered.topDiscardCard).toBeDefined()
    expect(filtered.topDiscardCard?.id).toBe('discard-2') // Last card in discard pile
  })

  test('should handle empty discard pile', () => {
    const mockState = createMockGameState()
    mockState.discardPile = []
    const filtered = filterGameStateForPlayer(mockState, 0)

    expect(filtered.topDiscardCard).toBeNull()
  })

  test('should hide wild card piles and only show counts', () => {
    const mockState = createMockGameState()
    const filtered = filterGameStateForPlayer(mockState, 0)

    // Wild card piles should not exist
    expect((filtered as any).wildLocationPile).toBeUndefined()
    expect((filtered as any).wildIndustryPile).toBeUndefined()

    // Only counts should be available
    expect(filtered.wildLocationCount).toBe(2)
    expect(filtered.wildIndustryCount).toBe(1)
  })

  test('should preserve all public game state', () => {
    const mockState = createMockGameState()
    const filtered = filterGameStateForPlayer(mockState, 0)

    // Check that public information is preserved
    expect(filtered.currentPlayerIndex).toBe(0)
    expect(filtered.era).toBe('canal')
    expect(filtered.round).toBe(1)
    expect(filtered.actionsRemaining).toBe(2)
    expect(filtered.resources).toEqual({ coal: 10, iron: 5, beer: 8 })
    expect(filtered.spentMoney).toBe(0)
    expect(filtered.turnOrder).toEqual(['1', '2'])
    expect(filtered.isFinalRound).toBe(false)
  })

  test('should preserve player public information', () => {
    const mockState = createMockGameState()
    const filtered = filterGameStateForPlayer(mockState, 0)

    // Check that public player info is preserved for both players
    expect(filtered.players[0]?.name).toBe('Player 1')
    expect(filtered.players[0]?.money).toBe(30)
    expect(filtered.players[0]?.victoryPoints).toBe(10)
    expect(filtered.players[0]?.income).toBe(5)

    expect(filtered.players[1]?.name).toBe('Player 2')
    expect(filtered.players[1]?.money).toBe(25)
    expect(filtered.players[1]?.victoryPoints).toBe(8)
    expect(filtered.players[1]?.income).toBe(3)
  })
})

describe('reconstructGameStateFromFiltered', () => {
  test('should reconstruct state with player hand intact', () => {
    const mockState = createMockGameState()
    const filtered = filterGameStateForPlayer(mockState, 0)
    const reconstructed = reconstructGameStateFromFiltered(filtered, 0)

    // Player 1's hand should be reconstructed correctly
    expect(reconstructed.players[0]?.hand).toHaveLength(2)
    expect(reconstructed.players[0]?.hand[0]?.id).toBe('p1-card-1')

    // Player 2's hand should be empty (hidden)
    expect(reconstructed.players[1]?.hand).toHaveLength(0)
  })

  test('should create placeholder arrays for hidden information', () => {
    const mockState = createMockGameState()
    const filtered = filterGameStateForPlayer(mockState, 0)
    const reconstructed = reconstructGameStateFromFiltered(filtered, 0)

    // Draw pile should be empty placeholder
    expect(reconstructed.drawPile).toBeDefined()
    expect(reconstructed.drawPile).toHaveLength(0)

    // Discard pile should only have top card if it existed
    expect(reconstructed.discardPile).toBeDefined()
    expect(reconstructed.discardPile).toHaveLength(1)
    expect(reconstructed.discardPile[0]?.id).toBe('discard-2')

    // Wild card piles should be empty placeholders
    expect(reconstructed.wildLocationPile).toBeDefined()
    expect(reconstructed.wildLocationPile).toHaveLength(0)
    expect(reconstructed.wildIndustryPile).toBeDefined()
    expect(reconstructed.wildIndustryPile).toHaveLength(0)
  })

  test('should handle empty discard pile in reconstruction', () => {
    const mockState = createMockGameState()
    mockState.discardPile = []
    const filtered = filterGameStateForPlayer(mockState, 0)
    const reconstructed = reconstructGameStateFromFiltered(filtered, 0)

    expect(reconstructed.discardPile).toHaveLength(0)
  })

  test('should preserve all other game state properties', () => {
    const mockState = createMockGameState()
    const filtered = filterGameStateForPlayer(mockState, 0)
    const reconstructed = reconstructGameStateFromFiltered(filtered, 0)

    expect(reconstructed.currentPlayerIndex).toBe(0)
    expect(reconstructed.era).toBe('canal')
    expect(reconstructed.round).toBe(1)
    expect(reconstructed.actionsRemaining).toBe(2)
    expect(reconstructed.resources).toEqual({ coal: 10, iron: 5, beer: 8 })
    expect(reconstructed.players[0]?.money).toBe(30)
    expect(reconstructed.players[1]?.money).toBe(25)
  })
})
