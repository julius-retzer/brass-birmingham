// Error Handling Tests - Recoverable error state for validation failures
import { afterEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { gameStore } from './gameStore'

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

describe('Error State System', () => {
  test('sets error state for invalid slot validation instead of throwing', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()
    
    // Initially no error
    expect(snapshot.context.lastError).toBeNull()
    expect(snapshot.context.errorContext).toBeNull()
    
    const currentPlayerId = snapshot.context.currentPlayerIndex

    // Set up player with a coal industry card (invalid for Birmingham)
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

    // Set up money
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: currentPlayerId,
      money: 50,
    })

    // Try to build coal at Birmingham (no coal slots) - this should set error state
    actor.send({ type: 'BUILD' })
    actor.send({ type: 'SELECT_CARD', cardId: 'coal_test' })
    actor.send({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'coal' })
    actor.send({ type: 'SELECT_LOCATION', cityId: 'birmingham' })
    actor.send({ type: 'CONFIRM' })
    
    snapshot = actor.getSnapshot()
    
    // Should have error state set
    expect(snapshot.context.lastError).toContain('Cannot build coal at birmingham')
    expect(snapshot.context.errorContext).toBe('build')
    
    // Should not have built the industry
    const player = snapshot.context.players[snapshot.context.currentPlayerIndex]!
    expect(player.industries.length).toBe(0)
    
    // Should still be in playing state (recoverable)
    expect(snapshot.matches('playing')).toBe(true)
  })

  test('clears error state when valid build succeeds', () => {
    const { actor } = setupGame()
    let snapshot = actor.getSnapshot()
    const currentPlayerId = snapshot.context.currentPlayerIndex

    // First trigger an error
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

    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: currentPlayerId,
      money: 50,
    })

    // Try invalid build first
    actor.send({ type: 'BUILD' })
    actor.send({ type: 'SELECT_CARD', cardId: 'coal_test' })
    actor.send({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'coal' })
    actor.send({ type: 'SELECT_LOCATION', cityId: 'birmingham' })
    actor.send({ type: 'CONFIRM' })
    
    snapshot = actor.getSnapshot()
    expect(snapshot.context.lastError).toContain('Cannot build coal at birmingham')
    
    // Now do a valid build - should clear error
    // First reset player state (similar to buildIndustryAction helper)
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
    
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: currentPlayerId,
      money: 50,
    })
    
    actor.send({ type: 'BUILD' })
    actor.send({ type: 'SELECT_CARD', cardId: 'coal_test2' })
    actor.send({ type: 'SELECT_INDUSTRY_TYPE', industryType: 'coal' })
    actor.send({ type: 'SELECT_LOCATION', cityId: 'stoke' }) // Valid location for coal
    actor.send({ type: 'CONFIRM' })
    
    snapshot = actor.getSnapshot()
    
    // Error should be cleared
    expect(snapshot.context.lastError).toBeNull()
    expect(snapshot.context.errorContext).toBeNull()
    
    // Industry should be built - check the player we set up (player 0)
    const player = snapshot.context.players[0]!
    expect(player.industries.length).toBe(1)
    expect(player.industries[0]!.type).toBe('coal')
    expect(player.industries[0]!.location).toBe('stoke')
  })

  test('can manually clear error state', () => {
    const { actor } = setupGame()
    
    // Set error manually
    actor.send({
      type: 'SET_ERROR',
      message: 'Test error',
      context: 'build'
    })
    
    let snapshot = actor.getSnapshot()
    expect(snapshot.context.lastError).toBe('Test error')
    expect(snapshot.context.errorContext).toBe('build')
    
    // Clear error
    actor.send({ type: 'CLEAR_ERROR' })
    
    snapshot = actor.getSnapshot()
    expect(snapshot.context.lastError).toBeNull()
    expect(snapshot.context.errorContext).toBeNull()
  })
})