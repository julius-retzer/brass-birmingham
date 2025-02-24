import { describe, test, expect } from 'vitest'
import { createActor } from 'xstate'
import { gameStorePoc } from './gameStorePoc'

describe('Game Store POC', () => {
  test('basic game flow', () => {
    // Create and start the game actor
    const gameActor = createActor(gameStorePoc)
    gameActor.start()

    // Initial state should be 'setup'
    expect(gameActor.getSnapshot().value).toBe('setup')

    // Start game with two players
    gameActor.send({
      type: 'START_GAME',
      players: [
        { id: '1', name: 'Player 1', money: 30 },
        { id: '2', name: 'Player 2', money: 30 },
      ],
    })

    // Should be in playing state
    let snapshot = gameActor.getSnapshot()
    expect(snapshot.value).toBe('playing')
    expect(snapshot.context.players).toHaveLength(2)
    expect(snapshot.context.currentPlayerIndex).toBe(0)
    expect(snapshot.context.round).toBe(1)
    expect(snapshot.context.logs).toEqual(['Game started'])

    // Player 1 takes an action
    gameActor.send({ type: 'TAKE_ACTION' })
    snapshot = gameActor.getSnapshot()
    expect(snapshot.context.logs).toContain('Player 1 took an action')
    expect(snapshot.context.currentPlayerIndex).toBe(1) // Moved to Player 2

    // Player 2 takes an action
    gameActor.send({ type: 'TAKE_ACTION' })
    snapshot = gameActor.getSnapshot()
    expect(snapshot.context.logs).toContain('Player 2 took an action')
    expect(snapshot.context.currentPlayerIndex).toBe(0) // Back to Player 1
    expect(snapshot.context.round).toBe(2) // Advanced to next round

    // Play until game over (round > 5)
    for (let i = 0; i < 8; i++) {
      gameActor.send({ type: 'TAKE_ACTION' })
    }

    // Should be in gameOver state
    snapshot = gameActor.getSnapshot()
    expect(snapshot.value).toBe('gameOver')
    expect(snapshot.context.logs).toContain('Game Over!')
  })

  test('invalid game start', () => {
    const gameActor = createActor(gameStorePoc)
    gameActor.start()

    // Try to start with only one player
    gameActor.send({
      type: 'START_GAME',
      players: [{ id: '1', name: 'Player 1', money: 30 }],
    })

    // Should still be in setup state
    const snapshot = gameActor.getSnapshot()
    expect(snapshot.value).toBe('setup')
    expect(snapshot.context.players).toHaveLength(0)
  })

  test.only('player actions', () => {
    const gameActor = createActor(gameStorePoc)
    gameActor.start()

    // Start game
    gameActor.send({
      type: 'START_GAME',
    })

    // Take actions and end turns
    gameActor.send({ type: 'TAKE_ACTION' })
    gameActor.send({ type: 'END_TURN' })
    gameActor.send({ type: 'TAKE_ACTION' })
    gameActor.send({ type: 'END_TURN' })

    const snapshot = gameActor.getSnapshot()
    expect(snapshot.context.round).toBe(2)
    // expect(snapshot.context.logs).toHaveLength(3) // Game started + 2 actions
  })
})
