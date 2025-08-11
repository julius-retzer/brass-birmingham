// Game Actions Tests - Loan, Pass, and basic actions
import { describe, expect, test, afterEach } from 'vitest'
import { createActor } from 'xstate'
import { gameStore } from './gameStore'

// Track actors for cleanup
let activeActors: ReturnType<typeof createActor>[] = []

afterEach(() => {
  activeActors.forEach(actor => {
    try { actor.stop() } catch {}
  })
  activeActors = []
})

const setupGame = () => {
  const actor = createActor(gameStore)
  activeActors.push(actor)
  actor.start()
  
  const players = [
    { id: '1', name: 'Player 1', color: 'red' as const, character: 'Richard Arkwright' as const },
    { id: '2', name: 'Player 2', color: 'blue' as const, character: 'Eliza Tinsley' as const }
  ]
  
  actor.send({ type: 'START_GAME', players })
  return { actor, players }
}

const takeLoanAction = (actor: ReturnType<typeof createActor>) => {
  let snapshot = actor.getSnapshot()
  const currentPlayer = snapshot.context.players[snapshot.context.currentPlayerIndex]
  const cardToDiscard = currentPlayer.hand[0]
  
  actor.send({ type: 'TAKE_LOAN' })
  actor.send({ type: 'SELECT_CARD', cardId: cardToDiscard?.id })
  actor.send({ type: 'CONFIRM' })
  
  return { cardToDiscard }
}

describe('Game Store - Actions', () => {
  test('loan action - basic mechanics', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()
    
    const initialPlayer = snapshot.context.players[0]!
    const initialMoney = initialPlayer.money
    const initialIncome = initialPlayer.income
    const initialHandSize = initialPlayer.hand.length
    
    const { cardToDiscard } = takeLoanAction(actor)
    snapshot = actor.getSnapshot()
    
    const updatedPlayer = snapshot.context.players[0]!
    
    // Verify loan effects
    expect(updatedPlayer.money).toBe(initialMoney + 30) // +£30
    expect(updatedPlayer.income).toBe(Math.max(-10, initialIncome - 3)) // -3 income, min -10
    expect(updatedPlayer.hand.length).toBe(initialHandSize) // Hand refilled
    expect(snapshot.context.discardPile).toContainEqual(cardToDiscard)
  })

  test('loan action - income cannot go below -10', () => {
    const { actor } = setupGame()
    
    // Take multiple loans to test minimum income
    for (let i = 0; i < 8; i++) {
      takeLoanAction(actor)
      if (i < 7) takeLoanAction(actor) // Player 2 also takes loans
    }
    
    const snapshot = actor.getSnapshot()
    const player = snapshot.context.players[0]!
    
    // After multiple loans: income should be capped at -10
    expect(player.income).toBe(-10)
  })

  test('pass action - basic mechanics', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()
    
    const currentPlayer = snapshot.context.players[snapshot.context.currentPlayerIndex]
    const cardToDiscard = currentPlayer.hand[0]
    
    actor.send({ type: 'PASS' })
    actor.send({ type: 'SELECT_CARD', cardId: cardToDiscard?.id })
    actor.send({ type: 'CONFIRM' })
    
    snapshot = actor.getSnapshot()
    
    expect(snapshot.context.discardPile).toContainEqual(cardToDiscard)
    expect(snapshot.context.currentPlayerIndex).toBe(1) // Advanced to next player
  })

  test('turn progression - round 1 has 1 action each', () => {
    const { actor } = setupGame()
    
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

  test('turn progression - round 2+ has 2 actions each', () => {
    const { actor } = setupGame()
    
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
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()
    const initialHandSize = snapshot.context.players[0]!.hand.length
    
    takeLoanAction(actor)
    snapshot = actor.getSnapshot()
    
    // Hand should be refilled to original size after action
    expect(snapshot.context.players[0]!.hand.length).toBe(initialHandSize)
  })
})