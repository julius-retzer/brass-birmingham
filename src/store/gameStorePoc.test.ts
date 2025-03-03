import { describe, test, expect } from 'vitest'
import { createActor } from 'xstate'
import { gameStorePoc } from './gameStorePoc'

describe.skip('Game Store POC', () => {
  test.only('basic game flow', () => {
    const gameActor = createActor(gameStorePoc)
    gameActor.start()

    // Initial state should be 'setup'
    expect(gameActor.getSnapshot().value).toBe('setup')

    // Start game with two players
    gameActor.send({
      type: 'START_GAME',
      players: [{ name: 'Player 1' }, { name: 'Player 2' }],
    })

    // Should be in playing state
    let snapshot = gameActor.getSnapshot()
    expect(snapshot.value).toBe('playing')
    expect(snapshot.context.players).toHaveLength(2)
    expect(snapshot.context.currentPlayerIndex).toBe(0)
    expect(snapshot.context.round).toBe(1)

    // Player 1 takes an action
    gameActor.send({ type: 'TAKE_ACTION' })
    snapshot = gameActor.getSnapshot()
    expect(snapshot.context.currentPlayerIndex).toBe(1) // Moved to Player 2

    // Player 2 takes an action
    gameActor.send({ type: 'TAKE_ACTION' })
    snapshot = gameActor.getSnapshot()

    // expect(snapshot.context.currentPlayerIndex).toBe(0) // Back to Player 1
    // expect(snapshot.context.round).toBe(2) // Advanced to next round

    // // Play until game over (round > 5)
    // for (let i = 0; i < 8; i++) {
    //   gameActor.send({ type: 'TAKE_ACTION' })
    // }

    // // Should be in gameOver state
    // snapshot = gameActor.getSnapshot()
    // expect(snapshot.value).toBe('gameOver')
    // expect(snapshot.context.logs).toContain('Game Over!')
  })
})
