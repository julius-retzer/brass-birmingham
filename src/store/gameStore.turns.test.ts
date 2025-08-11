// Turn Order and Rounds Tests - actions remaining, next player, income collection
import { afterEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { gameStore } from './gameStore'

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
  const actor = createActor(gameStore)
  activeActors.push(actor)
  actor.start()
  const players = [
    {
      id: '1',
      name: 'P1',
      color: 'red' as const,
      character: 'Richard Arkwright' as const,
    },
    {
      id: '2',
      name: 'P2',
      color: 'blue' as const,
      character: 'Eliza Tinsley' as const,
    },
  ]
  actor.send({ type: 'START_GAME', players })
  return { actor }
}

describe('Game Store - Turn Order and Rounds', () => {
  test('first round starts with 1 action; after action, remains at 0 and advances player', () => {
    const { actor } = setup()
    let s = actor.getSnapshot()
    expect(s.context.round).toBe(1)
    expect(s.context.actionsRemaining).toBe(1)
    expect(s.context.currentPlayerIndex).toBe(0)

    // Take a PASS action which goes through actionComplete/nextPlayer
    const cardId = s.context.players[0]!.hand[0]!.id
    actor.send({ type: 'PASS' })
    actor.send({ type: 'SELECT_CARD', cardId })
    actor.send({ type: 'CONFIRM' })

    s = actor.getSnapshot()
    expect(s.context.currentPlayerIndex).toBe(1)
    // In first round, next player will have 1 action
    expect(s.context.actionsRemaining).toBe(1)
  })

  test('end of round collects income and resets actions for next round', () => {
    const { actor } = setup()
    // Force players to spend to affect ordering; also set income so we can observe logging
    actor.send({ type: 'TEST_SET_PLAYER_STATE', playerId: 0, income: 2 })
    actor.send({ type: 'TEST_SET_PLAYER_STATE', playerId: 1, income: 1 })

    // Player 1 passes to consume their action
    let s = actor.getSnapshot()
    actor.send({ type: 'PASS' })
    actor.send({
      type: 'SELECT_CARD',
      cardId: s.context.players[0]!.hand[0]!.id,
    })
    actor.send({ type: 'CONFIRM' })

    // Player 2 passes to complete the round
    s = actor.getSnapshot()
    actor.send({ type: 'PASS' })
    actor.send({
      type: 'SELECT_CARD',
      cardId: s.context.players[1]!.hand[0]!.id,
    })
    actor.send({ type: 'CONFIRM' })

    s = actor.getSnapshot()
    // Round should advance to at least 2
    expect(s.context.round).toBeGreaterThanOrEqual(2)
    // Actions for new round should be 2 (per isFirstRound logic after round 1)
    expect(s.context.actionsRemaining).toBe(2)
    // Logs should include income collection entries
    expect(s.context.logs.some((l) => l.message.includes('collected £'))).toBe(
      true,
    )
  })
})
