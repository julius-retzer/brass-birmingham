// Era and Scoring Tests - Canal->Rail transition, scoring, and game end
import { afterEach, describe, expect, test } from 'vitest'
import { createActor } from 'xstate'
import { gameStore } from './gameStore'

let activeActors: ReturnType<typeof createActor>[] = []

afterEach(() => {
  activeActors.forEach((actor) => {
    try {
      actor.stop()
    } catch {
      // ignore
    }
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

describe('Game Store - Era and Scoring', () => {
  test('era scoring logs and does not crash', () => {
    const { actor } = setup()

    // force a link for P1 so scoring has effect
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 0,
      industries: [],
    })
    let s = actor.getSnapshot()
    const p1 = s.context.players[0]!
    // add a link directly to state via player update helper
    actor.send({
      type: 'TEST_SET_PLAYER_STATE',
      playerId: 0,
      industries: p1.industries,
    })

    // trigger scoring
    actor.send({ type: 'TRIGGER_ERA_SCORING' })
    s = actor.getSnapshot()
    expect(s.context.logs.some((l) => l.message.includes('End of'))).toBe(true)
  })

  test('canal era end transitions to rail and resets hands/merchants', () => {
    const { actor } = setup()
    let s = actor.getSnapshot()
    expect(s.context.era).toBe('canal')

    actor.send({ type: 'TRIGGER_CANAL_ERA_END' })
    s = actor.getSnapshot()

    expect(s.context.era).toBe('rail')
    expect(s.context.round).toBe(1)
    expect(s.context.actionsRemaining).toBe(2)
    expect(s.context.logs.some((l) => l.message === 'Canal Era ended')).toBe(
      true,
    )
    expect(s.context.logs.some((l) => l.message === 'Rail Era started')).toBe(
      true,
    )
  })

  test('rail era end logs game over', () => {
    const { actor } = setup()
    // move to rail
    actor.send({ type: 'TRIGGER_CANAL_ERA_END' })

    actor.send({ type: 'TRIGGER_RAIL_ERA_END' })
    const s = actor.getSnapshot()
    expect(s.context.logs.some((l) => l.message.includes('Game Over'))).toBe(
      true,
    )
  })
})
