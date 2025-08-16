// Pass Action Tests - player selects card to discard
import { afterEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { gameActor } from './gameActor'
import type { Card } from '../../data/cards'

let activeActors: ReturnType<typeof createActor>[] = []

afterEach(() => {
  activeActors.forEach((actor) => {
    try {
      actor.stop()
    } catch {}
  })
  activeActors = []
})

const setup = () => {
  const actor = createActor(gameActor)
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
  return { actor }
}

describe('Game Store - Pass Action', () => {
  test('pass action requires card selection', () => {
    const { actor } = setup()
    let s = actor.getSnapshot()
    
    // Start pass action
    actor.send({ type: 'PASS' })
    s = actor.getSnapshot()
    
    // Should be in passing.selectingCard state
    expect(s.matches('playing.action.passing.selectingCard')).toBe(true)
    expect(s.context.selectedCard).toBe(null)
  })

  test('pass action allows any card to be selected', () => {
    const { actor } = setup()
    let s = actor.getSnapshot()
    
    const initialHand = s.context.players[0]!.hand
    const cardToDiscard = initialHand[2]! // Select third card
    
    // Start pass action
    actor.send({ type: 'PASS' })
    s = actor.getSnapshot()
    
    // Select a card to discard
    actor.send({ type: 'SELECT_CARD', cardId: cardToDiscard.id })
    s = actor.getSnapshot()
    
    // Should be in confirmingPass state with card selected
    expect(s.matches('playing.action.passing.confirmingPass')).toBe(true)
    expect(s.context.selectedCard?.id).toBe(cardToDiscard.id)
  })

  test('pass action discards selected card and consumes one action', () => {
    const { actor } = setup()
    let s = actor.getSnapshot()
    
    const initialHand = s.context.players[0]!.hand
    const initialHandSize = initialHand.length
    const initialPlayer = s.context.currentPlayerIndex
    const cardToDiscard = initialHand[1]! // Select second card
    
    // Start pass action
    actor.send({ type: 'PASS' })
    
    // Select card to discard
    actor.send({ type: 'SELECT_CARD', cardId: cardToDiscard.id })
    
    // Confirm pass
    actor.send({ type: 'CONFIRM' })
    s = actor.getSnapshot()
    
    // Card should be discarded from the original hand (but hand is refilled to 8 cards)
    const finalHand = s.context.players[initialPlayer]!.hand
    expect(finalHand.length).toBe(initialHandSize) // Hand refilled to starting size
    expect(finalHand.find(c => c.id === cardToDiscard.id)).toBeUndefined()
    
    // Card should be in discard pile
    expect(s.context.discardPile.find(c => c.id === cardToDiscard.id)).toBeDefined()
    
    // In first round, after 1 action, should move to next player with 1 action
    // Current player should have changed to next player
    expect(s.context.currentPlayerIndex).toBe((initialPlayer + 1) % 2)
    expect(s.context.actionsRemaining).toBe(1) // Next player's turn in first round
    
    // Should be back to action selection for next player
    expect(s.matches('playing.action.selectingAction')).toBe(true)
  })

  test('pass action can be cancelled from card selection', () => {
    const { actor } = setup()
    let s = actor.getSnapshot()
    
    // Start pass action
    actor.send({ type: 'PASS' })
    s = actor.getSnapshot()
    expect(s.matches('playing.action.passing.selectingCard')).toBe(true)
    
    // Cancel pass action
    actor.send({ type: 'CANCEL' })
    s = actor.getSnapshot()
    
    // Should return to selecting action
    expect(s.matches('playing.action.selectingAction')).toBe(true)
    expect(s.context.selectedCard).toBe(null)
  })

  test('pass action can be cancelled from confirmation', () => {
    const { actor } = setup()
    let s = actor.getSnapshot()
    
    const cardToDiscard = s.context.players[0]!.hand[0]!
    
    // Start pass action and select card
    actor.send({ type: 'PASS' })
    actor.send({ type: 'SELECT_CARD', cardId: cardToDiscard.id })
    s = actor.getSnapshot()
    expect(s.matches('playing.action.passing.confirmingPass')).toBe(true)
    
    // Cancel from confirmation
    actor.send({ type: 'CANCEL' })
    s = actor.getSnapshot()
    
    // Should return to card selection
    expect(s.matches('playing.action.passing.selectingCard')).toBe(true)
    expect(s.context.selectedCard).toBe(null)
  })

  test('pass action creates proper log entry', () => {
    const { actor } = setup()
    let s = actor.getSnapshot()
    
    const cardToDiscard = s.context.players[0]!.hand[0]!
    const initialLogCount = s.context.logs.length
    
    // Execute pass action
    actor.send({ type: 'PASS' })
    actor.send({ type: 'SELECT_CARD', cardId: cardToDiscard.id })
    actor.send({ type: 'CONFIRM' })
    s = actor.getSnapshot()
    
    // Should have new log entry
    expect(s.context.logs.length).toBeGreaterThan(initialLogCount)
    
    const passLog = s.context.logs[s.context.logs.length - 1]
    expect(passLog?.message).toContain('passed')
    expect(passLog?.message).toContain('discarded')
    expect(passLog?.type).toBe('action')
  })

  test('pass action with no cards in hand should fail gracefully', () => {
    const { actor } = setup()
    
    // Set player to have no cards
    actor.send({ type: 'TEST_SET_PLAYER_HAND', playerId: 0, hand: [] })
    let s = actor.getSnapshot()
    
    // Try to pass
    actor.send({ type: 'PASS' })
    s = actor.getSnapshot()
    
    // Should either prevent the action or handle gracefully
    // The exact behavior depends on implementation - should not crash
    expect(s.context.lastError).toBeNull() // No error should be set initially
  })

  test('wild cards go back to their draw areas when discarded in pass', () => {
    const { actor } = setup()
    
    // Add wild cards to player hand
    const wildLocationCard: Card = {
      id: 'wild-loc-1',
      type: 'wild_location',
    }
    const wildIndustryCard: Card = {
      id: 'wild-ind-1', 
      type: 'wild_industry',
    }
    
    let s = actor.getSnapshot()
    const currentHand = s.context.players[0]!.hand
    const newHand = [...currentHand, wildLocationCard, wildIndustryCard]
    
    actor.send({ type: 'TEST_SET_PLAYER_HAND', playerId: 0, hand: newHand })
    s = actor.getSnapshot()
    
    const initialWildLocationPileSize = s.context.wildLocationPile.length
    const initialWildIndustryPileSize = s.context.wildIndustryPile.length
    
    // Pass with wild location card
    actor.send({ type: 'PASS' })
    actor.send({ type: 'SELECT_CARD', cardId: wildLocationCard.id })
    actor.send({ type: 'CONFIRM' })
    s = actor.getSnapshot()
    
    // Wild location card should go back to wild location pile, not discard pile
    expect(s.context.wildLocationPile.length).toBe(initialWildLocationPileSize + 1)
    expect(s.context.discardPile.find(c => c.id === wildLocationCard.id)).toBeUndefined()
    expect(s.context.wildLocationPile.find(c => c.id === wildLocationCard.id)).toBeDefined()
  })
})