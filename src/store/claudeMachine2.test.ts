import { createActor } from 'xstate'
import { describe, it, expect } from 'vitest'
import { brassBirminghamMachine } from './claudeMachine2'

describe.skip('Brass Birmingham Machine', () => {
  it('should initialize the game with the correct number of players', () => {
    const actor = createActor(brassBirminghamMachine)
    actor.start()

    actor.send({
      type: 'START_GAME',
      playerCount: 3,
      playerNames: ['Player 1', 'Player 2', 'Player 3'],
    })

    const { players } = actor.getSnapshot().context

    expect(players.length).toBe(3)
    expect(players[0]?.name).toBe('Player 1')
    expect(players[0]?.actionsRemaining).toBe(1) // First round has 1 action
  })

  it('should handle player actions and turn transitions', () => {
    const actor = createActor(brassBirminghamMachine)
    actor.start()

    // Start a 2-player game
    actor.send({
      type: 'START_GAME',
      playerCount: 2,
      playerNames: ['Player 1', 'Player 2'],
    })

    // Use our test event to advance the round
    actor.send({ type: 'TEST_ADVANCE_ROUND' })

    const snapshot = actor.getSnapshot()
    expect(snapshot.context.round).toBe(2)
    expect(snapshot.context.players[0]?.actionsRemaining).toBe(2)
    expect(snapshot.context.players[1]?.actionsRemaining).toBe(2)
  })

  it('should transition to rail era', () => {
    const actor = createActor(brassBirminghamMachine)
    actor.start()

    // Start a 2-player game
    actor.send({
      type: 'START_GAME',
      playerCount: 2,
      playerNames: ['Player 1', 'Player 2'],
    })

    // Use our test event to transition to rail era
    actor.send({ type: 'TEST_TRANSITION_TO_RAIL' })

    // Get the new snapshot after sending the event
    const snapshot = actor.getSnapshot()

    // Should have transitioned to Rail era
    expect(snapshot.context.era).toBe('rail')
    expect(snapshot.context.round).toBe(1)
  })

  it('should declare a winner at the end of the game', () => {
    const actor = createActor(brassBirminghamMachine)
    actor.start()

    // Start a 2-player game with predefined victory points
    actor.send({
      type: 'START_GAME',
      playerCount: 2,
      playerNames: ['Player 1', 'Player 2'],
    })

    // We need an event to set victory points
    actor.send({
      type: 'SET_VICTORY_POINTS',
      playerScores: [
        { playerId: '0', points: 50 },
        { playerId: '1', points: 75 },
      ],
    })

    // Use our test event to end the game
    actor.send({ type: 'TEST_END_GAME' })

    // Get the new snapshot after sending the event
    const snapshot = actor.getSnapshot()

    // Game should be over with player 1 as winner
    expect(snapshot.context.gameOver).toBe(true)
    expect(snapshot.context.winner).toBe('1') // Player 2's ID
  })
})
