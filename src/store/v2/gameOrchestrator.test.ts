// Game Orchestrator Tests - Backward compatibility with separated actors
import { afterEach, describe, expect, test } from 'vitest'
import { GameOrchestratorWrapper } from './gameOrchestrator'

// Track orchestrators for cleanup
let activeOrchestrators: GameOrchestratorWrapper[] = []

afterEach(() => {
  activeOrchestrators.forEach((orchestrator) => {
    try {
      orchestrator.stop()
    } catch {
      // Ignore cleanup errors
    }
  })
  activeOrchestrators = []
})

const setupGame = () => {
  const orchestrator = new GameOrchestratorWrapper()
  activeOrchestrators.push(orchestrator)
  orchestrator.start()

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

  orchestrator.send({ type: 'START_GAME', players })
  return { orchestrator, players }
}

describe('Game Orchestrator - Backward Compatibility', () => {
  test('maintains gameStore interface', () => {
    const { orchestrator } = setupGame()
    const snapshot = orchestrator.getSnapshot()
    
    // Should have all the expected state fields
    expect(snapshot.context).toBeDefined()
    expect(snapshot.context.players).toBeDefined()
    expect(snapshot.context.currentPlayerIndex).toBeDefined()
    expect(snapshot.context.era).toBe('canal')
    expect(snapshot.context.round).toBe(1)
    
    // Should have UI state fields (merged from UI actor)
    expect(snapshot.context.selectedCard).toBe(null)
    expect(snapshot.context.selectedLocation).toBe(null)
    expect(snapshot.context.selectedIndustryTile).toBe(null)
    expect(snapshot.context.lastError).toBe(null)
  })
  
  test('handles card selection through both actors', () => {
    const { orchestrator } = setupGame()
    
    // Start a build action
    orchestrator.send({ type: 'BUILD' })
    let snapshot = orchestrator.getSnapshot()
    
    // Select a card
    const card = snapshot.context.players[0]!.hand[0]!
    orchestrator.send({ type: 'SELECT_CARD', cardId: card.id })
    snapshot = orchestrator.getSnapshot()
    
    // Card should be selected in the combined state
    expect(snapshot.context.selectedCard?.id).toBe(card.id)
    
    // UI actor should also have the selection
    const uiActor = orchestrator.getUIActor()
    expect(uiActor?.getSnapshot().context.selectedCard?.id).toBe(card.id)
  })
  
  test('clears UI selections on cancel', () => {
    const { orchestrator } = setupGame()
    
    // Start build and select card
    orchestrator.send({ type: 'BUILD' })
    const card = orchestrator.getSnapshot().context.players[0]!.hand[0]!
    orchestrator.send({ type: 'SELECT_CARD', cardId: card.id })
    
    let snapshot = orchestrator.getSnapshot()
    expect(snapshot.context.selectedCard).not.toBeNull()
    
    // Cancel should clear selections
    orchestrator.send({ type: 'CANCEL' })
    snapshot = orchestrator.getSnapshot()
    
    // UI selections should be cleared
    expect(snapshot.context.selectedCard).toBeNull()
    
    // Verify UI actor is also cleared
    const uiActor = orchestrator.getUIActor()
    expect(uiActor?.getSnapshot().context.selectedCard).toBeNull()
  })
  
  test('handles location selection', () => {
    const { orchestrator } = setupGame()
    
    orchestrator.send({ type: 'BUILD' })
    orchestrator.send({ type: 'SELECT_LOCATION', cityId: 'birmingham' })
    
    const snapshot = orchestrator.getSnapshot()
    expect(snapshot.context.selectedLocation).toBe('birmingham')
    
    // Verify UI actor has the selection
    const uiActor = orchestrator.getUIActor()
    expect(uiActor?.getSnapshot().context.selectedLocation).toBe('birmingham')
  })
  
  test('handles industry type selection', () => {
    const { orchestrator } = setupGame()
    
    orchestrator.send({ type: 'BUILD' })
    orchestrator.send({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'coal' })
    
    const snapshot = orchestrator.getSnapshot()
    // Note: selectedIndustryType is not in GameState, only in UIState
    // But it should be accessible through the UI actor
    const uiActor = orchestrator.getUIActor()
    expect(uiActor?.getSnapshot().context.selectedIndustryType).toBe('coal')
  })
  
  test('handles network link selection', () => {
    const { orchestrator } = setupGame()
    
    orchestrator.send({ type: 'NETWORK' })
    orchestrator.send({ type: 'SELECT_LINK', from: 'birmingham', to: 'coventry' })
    
    const snapshot = orchestrator.getSnapshot()
    expect(snapshot.context.selectedLink).toEqual({ from: 'birmingham', to: 'coventry' })
    
    // Second link for double rail
    orchestrator.send({ type: 'SELECT_SECOND_LINK', from: 'coventry', to: 'nuneaton' })
    const snapshot2 = orchestrator.getSnapshot()
    expect(snapshot2.context.selectedSecondLink).toEqual({ from: 'coventry', to: 'nuneaton' })
  })
  
  test('handles develop tile selection', () => {
    const { orchestrator } = setupGame()
    
    orchestrator.send({ type: 'DEVELOP' })
    orchestrator.send({ type: 'SELECT_TILES_FOR_DEVELOP', industryTypes: ['coal', 'iron'] })
    
    const snapshot = orchestrator.getSnapshot()
    expect(snapshot.context.selectedTilesForDevelop).toEqual(['coal', 'iron'])
    
    // Verify UI actor has the selections
    const uiActor = orchestrator.getUIActor()
    expect(uiActor?.getSnapshot().context.selectedTilesForDevelop).toEqual(['coal', 'iron'])
  })
  
  test('handles error state', () => {
    const { orchestrator } = setupGame()
    
    orchestrator.send({ type: 'SET_ERROR', message: 'Test error', context: 'build' })
    
    const snapshot = orchestrator.getSnapshot()
    expect(snapshot.context.lastError).toBe('Test error')
    expect(snapshot.context.errorContext).toBe('build')
    
    // Clear error
    orchestrator.send({ type: 'CLEAR_ERROR' })
    const snapshot2 = orchestrator.getSnapshot()
    expect(snapshot2.context.lastError).toBeNull()
    expect(snapshot2.context.errorContext).toBeNull()
  })
  
  test('game logic still works normally', () => {
    const { orchestrator } = setupGame()
    
    // Take loan action
    let snapshot = orchestrator.getSnapshot()
    const initialMoney = snapshot.context.players[0]!.money
    const initialIncome = snapshot.context.players[0]!.income
    const cardToDiscard = snapshot.context.players[0]!.hand[0]!
    
    orchestrator.send({ type: 'TAKE_LOAN' })
    orchestrator.send({ type: 'SELECT_CARD', cardId: cardToDiscard.id })
    orchestrator.send({ type: 'CONFIRM' })
    
    snapshot = orchestrator.getSnapshot()
    const updatedPlayer = snapshot.context.players[0]!
    
    // Verify loan effects
    expect(updatedPlayer.money).toBe(initialMoney + 30) // +£30
    expect(updatedPlayer.income).toBe(Math.max(-10, initialIncome - 3)) // -3 income
    
    // UI selections should be cleared after confirm
    expect(snapshot.context.selectedCard).toBeNull()
  })
  
  test('test events work correctly', () => {
    const { orchestrator } = setupGame()
    
    // Test setting player state
    orchestrator.send({ 
      type: 'TEST_SET_PLAYER_STATE', 
      playerId: 0, 
      money: 100,
      income: 20 
    })
    
    const snapshot = orchestrator.getSnapshot()
    expect(snapshot.context.players[0]!.money).toBe(100)
    expect(snapshot.context.players[0]!.income).toBe(20)
    
    // Test era change
    orchestrator.send({ type: 'TEST_SET_ERA', era: 'rail' })
    const snapshot2 = orchestrator.getSnapshot()
    expect(snapshot2.context.era).toBe('rail')
  })
})

describe('Game Orchestrator - Actor Separation', () => {
  test('UI state is isolated in UI actor', () => {
    const { orchestrator } = setupGame()
    
    const gameActor = orchestrator.getGameActor()
    const uiActor = orchestrator.getUIActor()
    
    expect(gameActor).toBeDefined()
    expect(uiActor).toBeDefined()
    
    // Game actor should NOT have UI state
    const gameState = gameActor!.getSnapshot().context
    expect('selectedCard' in gameState).toBe(false)
    expect('selectedLocation' in gameState).toBe(false)
    expect('lastError' in gameState).toBe(false)
    
    // UI actor should have UI state
    const uiState = uiActor!.getSnapshot().context
    expect('selectedCard' in uiState).toBe(true)
    expect('selectedLocation' in uiState).toBe(true)
    expect('lastError' in uiState).toBe(true)
  })
  
  test('orchestrator merges states for backward compatibility', () => {
    const { orchestrator } = setupGame()
    
    // Set some UI state
    orchestrator.send({ type: 'BUILD' })
    orchestrator.send({ type: 'SELECT_LOCATION', cityId: 'birmingham' })
    
    const snapshot = orchestrator.getSnapshot()
    
    // Combined snapshot should have both game and UI state
    expect(snapshot.context.players).toBeDefined() // Game state
    expect(snapshot.context.era).toBeDefined() // Game state
    expect(snapshot.context.selectedLocation).toBe('birmingham') // UI state
    
    // Direct actor access should show separation
    const gameState = orchestrator.getGameActor()!.getSnapshot().context
    const uiState = orchestrator.getUIActor()!.getSnapshot().context
    
    expect('players' in gameState).toBe(true)
    expect('selectedLocation' in gameState).toBe(false)
    expect('selectedLocation' in uiState).toBe(true)
  })
})